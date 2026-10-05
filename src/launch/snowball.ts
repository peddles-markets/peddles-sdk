import { encodeFunctionData } from 'viem';
import type { Address, Hex } from 'viem';
import type { ReadClient } from '../client.js';
import { SnowballUnavailableError } from '../deployments.js';
import { snowballFactoryAbi, snowballHandleFactoryAbi, snowballVaultAbi } from './abi.generated.js';
import type { LaunchAddresses } from './addresses.js';
import type { FeeTerms } from './feeTerms.js';
import { buildWethLaunchInput, type UnsignedLaunchTx, type WethLaunchInput, type WethMetadata } from './wethCall.js';
import { buildWethLaunchPlan, type WethLaunchPlan } from './wethPlan.js';

/**
 * Snowball launches (docs/SNOWBALL.md). The creator fixes, in the launch transaction and FOREVER,
 * how the pool's tax is split BY VOLUME between buyback-and-burn, permanent liquidity, the creator
 * and holders, on top of the platform's fixed 0.50%. A per-token `PeddlesSnowballVault` makes the
 * launch call, so the VAULT is the creator of record; nobody (creator, Peddles, the protocol Safe)
 * can change the split or switch it off afterwards.
 *
 * `snowballTerms` is an exact mirror of `PeddlesSnowballFactory.termsFor`, held identical to the
 * web app's `features/launch/snowball.ts` by test. The builders mirror `snowballLaunch.ts`.
 *
 * Every address is passed in from the active chain (`launchAddressesFor(chainId).snowballFactory`);
 * a chain without a Snowball factory is refused with `SnowballUnavailableError`, never defaulted.
 */

const PLATFORM_LEG_BPS = 50;
const CREATOR_LEG_BPS = 50;
const MIN_TAX_BPS = 100;
const MAX_TAX_BPS = 1000;
const BPS = 10_000;

/** A split of VOLUME, in whole basis points. Its permanent, launch-time choice. */
export interface SnowballSplit {
  /** Share of volume bought back on the token's own pool and sent to 0x…dEaD. */
  readonly burnBps: number;
  /** Share of volume added to a permanent full-range position owned by the vault. */
  readonly lpBps: number;
  /** Share of volume paid to the creator's wallet. */
  readonly creatorBps: number;
  /** Share of volume paid to holders through the pool's holder-rewards distributor. */
  readonly holderBps: number;
}

/** The contract's refusal, by its own error name (`NotBps` is the SDK's: the input is not a uint16 integer). */
export type SnowballTermsRefusal = 'NotBps' | 'NoSnowball' | 'VaultShareBelowCreatorLeg' | 'TaxOutOfBand';

export type SnowballTermsResult =
  | {
      readonly ok: true;
      /** The all-in pool tax the hook registers (platform + vault share + holders). */
      readonly taxBps: number;
      readonly excessToCreatorBps: number;
      /** False when the vault's share is short by less than one hundredth of a basis point (that sliver goes to holders). */
      readonly exact: boolean;
    }
  | { readonly ok: false; readonly code: SnowballTermsRefusal; readonly reason: string };

const isBps = (n: number) => Number.isInteger(n) && n >= 0 && n <= 0xffff;

/** Exact mirror of `PeddlesSnowballFactory.termsFor`: integer basis points, the same floor, the same refusals. */
export function snowballTerms(t: SnowballSplit): SnowballTermsResult {
  if (![t.burnBps, t.lpBps, t.creatorBps, t.holderBps].every(isBps)) {
    return { ok: false, code: 'NotBps', reason: 'Each share must be a whole number of basis points.' };
  }
  const v = t.burnBps + t.lpBps + t.creatorBps;
  if (t.burnBps + t.lpBps === 0) {
    return { ok: false, code: 'NoSnowball', reason: 'A Snowball needs a burn share, a liquidity share, or both.' };
  }
  if (v < CREATOR_LEG_BPS) {
    return { ok: false, code: 'VaultShareBelowCreatorLeg', reason: 'Burn, liquidity and creator together must be at least 0.50% of volume.' };
  }
  const total = PLATFORM_LEG_BPS + v + t.holderBps;
  if (total < MIN_TAX_BPS || total > MAX_TAX_BPS) {
    return { ok: false, code: 'TaxOutOfBand', reason: 'The total trading tax must be between 1% and 10%.' };
  }
  const e = total - MIN_TAX_BPS;
  if (e === 0) return { ok: true, taxBps: total, excessToCreatorBps: 0, exact: true };
  const num = (v - CREATOR_LEG_BPS) * BPS;
  return { ok: true, taxBps: total, excessToCreatorBps: Math.floor(num / e), exact: num % e === 0 };
}

/** The hook terms a split registers, as the plain launch's `FeeTerms`, or null when the contract would refuse it. */
export function snowballFeeTerms(split: SnowballSplit): FeeTerms | null {
  const r = snowballTerms(split);
  if (!r.ok) return null;
  return { taxBps: BigInt(r.taxBps), excessToCreatorBps: BigInt(r.excessToCreatorBps) };
}

/**
 * A per-vault floor on the keeper's own spends, in quote base units: `10^(decimals − 9)`, at least 1.
 * Deliberately tiny — the keeper spends only once a bucket is worth about $10 at a live price, and
 * after 7 days without a spend anyone may spend and this floor stops applying. Never zero (the
 * factory refuses zero).
 */
export function snowballMinSpend(quoteDecimals: number): bigint {
  if (!Number.isInteger(quoteDecimals) || quoteDecimals < 0 || quoteDecimals > 36) throw new Error('quote decimals out of range');
  return 10n ** BigInt(Math.max(0, quoteDecimals - 9));
}

const Q192 = 2n ** 192n;
const ONE_E18 = 10n ** 18n;

/**
 * The Clog release floor: the pool's OPENING price, in quote base units per 1e18 token base units
 * (`PeddlesClogVault.releaseFloorX18`), exact from the plan's `sqrtPriceX96`, floored toward zero.
 * The held-back supply is then never sold below where the coin opened.
 */
export function clogFloorAtOpen(sqrtPriceX96: bigint, tokenIsCurrency0: boolean): bigint {
  if (sqrtPriceX96 <= 0n) throw new Error('no opening price');
  const p2 = sqrtPriceX96 * sqrtPriceX96;
  // currency1 per currency0 = sqrtP² / 2^192.
  const floor = tokenIsCurrency0 ? (p2 * ONE_E18) / Q192 : (Q192 * ONE_E18) / p2;
  if (floor === 0n) throw new Error('opening price rounds to zero');
  return floor;
}

function requireFactory(factory: Address | null | undefined): Address {
  if (!factory) throw new SnowballUnavailableError(null);
  return factory;
}

function requireSplit(split: SnowballSplit): FeeTerms {
  const r = snowballTerms(split);
  if (!r.ok) throw new Error(`This split is outside what a Snowball launch can set: ${r.reason}`);
  return { taxBps: BigInt(r.taxBps), excessToCreatorBps: BigInt(r.excessToCreatorBps) };
}

function requireMinSpend(minSpend: bigint): void {
  if (minSpend <= 0n) throw new Error('minSpend must be at least 1 base unit (see snowballMinSpend).');
}

/** A viem-ready contract write: pass straight to `writeContract` / `simulateContract`. */
export interface SnowballContractCall<F extends 'launchStock' | 'launchQuote', A extends readonly unknown[]> {
  readonly address: Address;
  readonly abi: typeof snowballFactoryAbi;
  readonly functionName: F;
  readonly args: A;
  /** Native wei to attach. */
  readonly value: bigint;
}

export interface SnowballStockLaunchArgs {
  /** `PeddlesSnowballFactory` on the active chain (`launchAddressesFor(chainId).snowballFactory`). Null is refused. */
  readonly factory: Address | null | undefined;
  readonly name: string;
  readonly symbol: string;
  readonly quote: Address;
  /** Quote base units for the first buy (approve the FACTORY for exactly this). 0n launches without one. */
  readonly quoteIn: bigint;
  /** Slippage floor for the first buy, in the launched token's base units. 0n with no first buy. */
  readonly minTokensOut: bigint;
  readonly split: SnowballSplit;
  /** Per-vault keeper spend floor, quote base units, > 0 — `snowballMinSpend(quoteDecimals)`. */
  readonly minSpend: bigint;
  /** 32 random bytes (`randomSalt()`); the vault address depends on (sender, salt). */
  readonly salt: Hex;
  /** The STOCK LAUNCHPAD's `launchFee()`, read live (`readStockLaunchFee`). */
  readonly launchFeeWei: bigint;
}

export type SnowballStockLaunchCall = SnowballContractCall<
  'launchStock',
  readonly [
    { name: string; symbol: string; quote: Address; quoteIn: bigint; minTokensOut: bigint },
    SnowballSplit,
    bigint,
    Hex,
  ]
>;

/**
 * `PeddlesSnowballFactory.launchStock(StockLaunch, SnowballTerms, minSpend, salt)`. `value` is the
 * launchpad's launch fee only; a first buy pulls the quote from the wallet through the factory.
 */
export function buildSnowballStockLaunch(a: SnowballStockLaunchArgs): SnowballStockLaunchCall {
  const address = requireFactory(a.factory);
  requireSplit(a.split);
  requireMinSpend(a.minSpend);
  if (a.quoteIn < 0n || a.minTokensOut < 0n || a.launchFeeWei < 0n) throw new Error('Amounts cannot be negative.');
  if (a.quoteIn === 0n && a.minTokensOut !== 0n) throw new Error('Set a first-buy amount, or clear the minimum.');
  const split: SnowballSplit = { burnBps: a.split.burnBps, lpBps: a.split.lpBps, creatorBps: a.split.creatorBps, holderBps: a.split.holderBps };
  return {
    address,
    abi: snowballFactoryAbi,
    functionName: 'launchStock',
    args: [{ name: a.name, symbol: a.symbol, quote: a.quote, quoteIn: a.quoteIn, minTokensOut: a.minTokensOut }, split, a.minSpend, a.salt],
    value: a.launchFeeWei,
  };
}

/** The oracle's ticket a handle launch carries (from the Peddles API's `POST /handle-launch/ticket`). */
export interface HandleLaunchTicket {
  readonly xUserId: bigint;
  readonly handleHash: Hex;
  readonly deadline: bigint;
  readonly sig: Hex;
}

export interface HandleSnowballStockLaunchCall {
  readonly address: Address;
  readonly abi: typeof snowballHandleFactoryAbi;
  readonly functionName: 'launchStock';
  readonly args: readonly [HandleLaunchTicket, ...SnowballStockLaunchCall['args']];
  readonly value: bigint;
}

/**
 * `PeddlesSnowballHandleFactory.launchStock(ticket, StockLaunch, SnowballTerms, minSpend, salt)`: a
 * Snowball launch FOR an X account — the creator share goes to that account's pot. Same arguments as
 * `buildSnowballStockLaunch` with the oracle ticket in front; `factory` is the HANDLE factory
 * (`snowballHandleFactoryFor(chainId)`). Approve the handle factory for `quoteIn`.
 */
export function buildHandleSnowballStockLaunch(ticket: HandleLaunchTicket, a: SnowballStockLaunchArgs): HandleSnowballStockLaunchCall {
  const inner = buildSnowballStockLaunch(a);
  if (ticket.xUserId <= 0n || ticket.deadline <= 0n) throw new Error('A handle launch needs a ticket from the Peddles API.');
  return {
    address: inner.address,
    abi: snowballHandleFactoryAbi,
    functionName: 'launchStock',
    args: [ticket, ...inner.args],
    value: inner.value,
  };
}

export interface SnowballQuoteLaunchArgs {
  /** `PeddlesSnowballFactory` on the active chain. Null is refused. */
  readonly factory: Address | null | undefined;
  /** The chain's launch orchestrator (`launchAddressesFor(chainId).orchestrator`). */
  readonly orchestrator: Address;
  /** The chain record's salt binding. Snowball needs the creator-bound orchestrator; `'none'` is refused. */
  readonly saltBinding?: 'creator' | 'none';
  /** `predictSnowballVault(client, factory, sender, salt)` — the creator of record. */
  readonly vault: Address;
  readonly name: string;
  readonly symbol: string;
  readonly salt: Hex;
  readonly metadata: WethMetadata;
  /** Built for the VAULT (`prepareSnowballQuotePlan`, or `buildWethLaunchPlan` with `creator: vault`). */
  readonly plan: WethLaunchPlan;
  /** Native wei spent on the first buy. 0n launches without one. */
  readonly devBuyWei: bigint;
  readonly minTokensOut: bigint;
  /** The orchestrator's `launchFee()`, read live (`readOrchestratorLaunchFee`). */
  readonly launchFeeWei: bigint;
  readonly split: SnowballSplit;
  /** Per-vault keeper spend floor, quote base units, > 0 — `snowballMinSpend(quoteDecimals)`. */
  readonly minSpend: bigint;
}

export type SnowballQuoteLaunchCall = SnowballContractCall<
  'launchQuote',
  readonly [WethLaunchInput, bigint, bigint, bigint, SnowballSplit, bigint]
> & { readonly input: WethLaunchInput; readonly clogFloorX18: bigint };

/**
 * `PeddlesSnowballFactory.launchQuote(LaunchInput, devBuyValue, minTokensOut, clogFloorX18,
 * SnowballTerms, minSpend)` for WETH / USDC (Arc) / WBNB (BSC) and Clog launch types. The input is
 * the ordinary launch input with the two differences the factory enforces: the creator of record is
 * the VAULT, and the tax terms are `termsFor(split)`. `value` = launch fee + first buy.
 */
export function buildSnowballQuoteLaunch(a: SnowballQuoteLaunchArgs): SnowballQuoteLaunchCall {
  const address = requireFactory(a.factory);
  if ((a.saltBinding ?? 'creator') !== 'creator') {
    throw new Error('Snowball WETH-type and Clog launches need the creator-bound launch orchestrator, which this chain does not run yet.');
  }
  const feeTerms = requireSplit(a.split);
  requireMinSpend(a.minSpend);
  if (a.devBuyWei < 0n || a.minTokensOut < 0n || a.launchFeeWei < 0n) throw new Error('Amounts cannot be negative.');
  if (a.devBuyWei === 0n && a.minTokensOut !== 0n) throw new Error('Set a first-buy amount, or clear the minimum.');
  const input = buildWethLaunchInput(
    {
      name: a.name,
      symbol: a.symbol,
      salt: a.salt,
      creator: a.vault,
      feeTerms,
      metadata: a.metadata,
      plan: a.plan,
      devBuyWei: a.devBuyWei,
      minTokensOut: a.minTokensOut,
      launchFeeWei: a.launchFeeWei,
    },
    a.orchestrator,
  );
  const clogFloorX18 = a.plan.clog !== null ? clogFloorAtOpen(a.plan.sqrtPriceX96, a.plan.tokenIsCurrency0) : 0n;
  const split: SnowballSplit = { burnBps: a.split.burnBps, lpBps: a.split.lpBps, creatorBps: a.split.creatorBps, holderBps: a.split.holderBps };
  return {
    address,
    abi: snowballFactoryAbi,
    functionName: 'launchQuote',
    args: [input, a.devBuyWei, a.minTokensOut, clogFloorX18, split, a.minSpend],
    value: a.launchFeeWei + a.devBuyWei,
    input,
    clogFloorX18,
  };
}

/** The calldata of either Snowball launch call, for a wallet, the CLI or an agent to sign. */
export function encodeSnowballLaunch(call: SnowballStockLaunchCall | SnowballQuoteLaunchCall): UnsignedLaunchTx {
  const data =
    call.functionName === 'launchStock'
      ? encodeFunctionData({ abi: snowballFactoryAbi, functionName: 'launchStock', args: call.args })
      : encodeFunctionData({ abi: snowballFactoryAbi, functionName: 'launchQuote', args: call.args });
  return { to: call.address, data, value: call.value };
}

// ---------------------------------------------------------------------------------------------
// Chain reads
// ---------------------------------------------------------------------------------------------

/** The vault (sender, salt) deploys — the coin's creator of record. Depends only on (sender, salt), never on the split. */
export async function predictSnowballVault(client: ReadClient, factory: Address | null | undefined, sender: Address, salt: Hex): Promise<Address> {
  return (await client.readContract({ address: requireFactory(factory), abi: snowballFactoryAbi, functionName: 'predictVault', args: [sender, salt] })) as Address;
}

/** The stock-paired Snowball coin's address: `launchpad.predictCoin(vault, salt, name, symbol)`, answered by the factory. */
export async function predictSnowballStockToken(
  client: ReadClient,
  factory: Address | null | undefined,
  sender: Address,
  salt: Hex,
  name: string,
  symbol: string,
): Promise<Address> {
  return (await client.readContract({
    address: requireFactory(factory),
    abi: snowballFactoryAbi,
    functionName: 'predictStockToken',
    args: [sender, salt, name, symbol],
  })) as Address;
}

/** The WETH-type / Clog Snowball coin's address: `orchestrator.predictLaunchToken(vault, variant, salt)`, answered by the factory. */
export async function predictSnowballQuoteToken(client: ReadClient, factory: Address | null | undefined, sender: Address, variant: number, salt: Hex): Promise<Address> {
  return (await client.readContract({
    address: requireFactory(factory),
    abi: snowballFactoryAbi,
    functionName: 'predictQuoteToken',
    args: [sender, variant, salt],
  })) as Address;
}

export interface SnowballQuotePlan {
  /** The vault (sender, salt) deploys — pass as `vault` to `buildSnowballQuoteLaunch`. */
  readonly vault: Address;
  /** The ordinary WETH-type plan, built for the vault as creator of record. */
  readonly plan: WethLaunchPlan;
}

/**
 * Everything `buildSnowballQuoteLaunch` needs from the chain, with the wiring checked live: the
 * factory must point at THIS chain's orchestrator and fee hook, and its own token prediction must
 * equal the plan's. Any mismatch throws — launching is disabled rather than sent somewhere else.
 */
export async function prepareSnowballQuotePlan(
  client: ReadClient,
  addresses: LaunchAddresses,
  args: { readonly sender: Address; readonly salt: Hex; readonly variant: number },
): Promise<SnowballQuotePlan> {
  const factory = requireFactory(addresses.snowballFactory);
  if ((addresses.saltBinding ?? 'creator') !== 'creator') {
    throw new Error('Snowball WETH-type and Clog launches need the creator-bound launch orchestrator, which this chain does not run yet.');
  }
  const [orchestrator, feeHook, vault, predicted] = (await client.multicall({
    allowFailure: false,
    contracts: [
      { address: factory, abi: snowballFactoryAbi, functionName: 'orchestrator' },
      { address: factory, abi: snowballFactoryAbi, functionName: 'feeHook' },
      { address: factory, abi: snowballFactoryAbi, functionName: 'predictVault', args: [args.sender, args.salt] },
      { address: factory, abi: snowballFactoryAbi, functionName: 'predictQuoteToken', args: [args.sender, args.variant, args.salt] },
    ],
  })) as readonly [Address, Address, Address, Address];
  if (orchestrator.toLowerCase() !== addresses.orchestrator.toLowerCase() || feeHook.toLowerCase() !== addresses.feeHook.toLowerCase()) {
    throw new Error('The Snowball factory on this network is wired to a different launch orchestrator or fee hook than this address set. Launching is disabled.');
  }
  const plan = await buildWethLaunchPlan(client, addresses, { salt: args.salt, creator: vault, variant: args.variant, saltBinding: 'creator', expectedToken: predicted });
  return { vault, plan };
}

/** One Snowball vault, read from the chain. Every amount is quote base units unless named otherwise. */
export interface SnowballVaultState {
  readonly vault: Address;
  /** The human creator (the creator share's only destination). */
  readonly creator: Address;
  readonly token: Address;
  readonly quote: Address;
  readonly poolId: Hex;
  /** The Clog vault on a Clog launch, null otherwise. */
  readonly clogVault: Address | null;
  readonly bound: boolean;
  /** The fixed split, by volume. */
  readonly terms: SnowballSplit;
  readonly taxBps: number;
  readonly excessToCreatorBps: number;
  readonly minSpend: bigint;
  readonly buckets: { readonly burn: bigint; readonly lp: bigint; readonly creator: bigint };
  /** Received by the vault but not yet booked into the buckets (booked on the next action). */
  readonly pendingIncome: bigint;
  readonly totals: {
    readonly received: bigint;
    readonly burnSpent: bigint;
    readonly lpSpent: bigint;
    readonly forwardedToCreator: bigint;
    /** Launched-token base units sent to 0x…dEaD by the vault. */
    readonly tokensBurned: bigint;
    /** Liquidity units the vault's permanent position has gained. */
    readonly liquidityAdded: bigint;
    readonly lpFeesQuote: bigint;
  };
  /** Unix seconds. */
  readonly lastBurnAt: bigint;
  readonly lastLpAt: bigint;
  readonly isBurnStale: boolean;
  readonly isLpStale: boolean;
  readonly currentSqrtPriceX96: bigint;
}

const ZERO_ADDRESS = /^0x0{40}$/i;

/** A vault's terms, buckets and lifetime totals — chain reads only, one multicall; a failed read throws. */
export async function readSnowballVault(client: ReadClient, vault: Address): Promise<SnowballVaultState> {
  const names = [
    'creator',
    'token',
    'quote',
    'poolId',
    'clogVault',
    'bound',
    'terms',
    'taxBps',
    'excessToCreatorBps',
    'minSpend',
    'burnBalance',
    'lpBalance',
    'creatorBalance',
    'pendingIncome',
    'totalReceived',
    'totalBurnSpent',
    'totalLpSpent',
    'totalForwarded',
    'totalTokensBurned',
    'totalLiquidityAdded',
    'totalLpFeesQuote',
    'lastBurnAt',
    'lastLpAt',
    'isBurnStale',
    'isLpStale',
    'currentSqrtPriceX96',
  ] as const;
  const r = (await client.multicall({
    allowFailure: false,
    contracts: names.map((functionName) => ({ address: vault, abi: snowballVaultAbi, functionName })),
  })) as readonly unknown[];
  const at = <T>(name: (typeof names)[number]) => r[names.indexOf(name)] as T;
  const terms = at<{ burnBps: number; lpBps: number; creatorBps: number; holderBps: number }>('terms');
  const clogVault = at<Address>('clogVault');
  return {
    vault,
    creator: at<Address>('creator'),
    token: at<Address>('token'),
    quote: at<Address>('quote'),
    poolId: at<Hex>('poolId'),
    clogVault: ZERO_ADDRESS.test(clogVault) ? null : clogVault,
    bound: at<boolean>('bound'),
    terms: { burnBps: Number(terms.burnBps), lpBps: Number(terms.lpBps), creatorBps: Number(terms.creatorBps), holderBps: Number(terms.holderBps) },
    taxBps: Number(at<number>('taxBps')),
    excessToCreatorBps: Number(at<number>('excessToCreatorBps')),
    minSpend: at<bigint>('minSpend'),
    buckets: { burn: at<bigint>('burnBalance'), lp: at<bigint>('lpBalance'), creator: at<bigint>('creatorBalance') },
    pendingIncome: at<bigint>('pendingIncome'),
    totals: {
      received: at<bigint>('totalReceived'),
      burnSpent: at<bigint>('totalBurnSpent'),
      lpSpent: at<bigint>('totalLpSpent'),
      forwardedToCreator: at<bigint>('totalForwarded'),
      tokensBurned: at<bigint>('totalTokensBurned'),
      liquidityAdded: at<bigint>('totalLiquidityAdded'),
      lpFeesQuote: at<bigint>('totalLpFeesQuote'),
    },
    lastBurnAt: at<bigint>('lastBurnAt'),
    lastLpAt: at<bigint>('lastLpAt'),
    isBurnStale: at<boolean>('isBurnStale'),
    isLpStale: at<boolean>('isLpStale'),
    currentSqrtPriceX96: at<bigint>('currentSqrtPriceX96'),
  };
}
