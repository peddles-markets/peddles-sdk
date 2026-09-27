import type { ReadClient } from '../client.js';
import { encodeFunctionData } from 'viem';
import type { Abi, Address, Hex } from 'viem';
import { erc20Abi } from '../abis.js';
import { stockLaunchpadLaunchAbi } from './abi.generated.js';
import { validateFeeTerms, type FeeTerms } from './feeTerms.js';
import type { UnsignedLaunchTx } from './wethCall.js';

/**
 * The stock-paired launch call — `PeddlesStockLaunchpad.createCoin` (two
 * overloads) or `createCoinAndBuy`. A pure port of the web app's
 * `buildStockLaunchCall` (`features/launch/useStockLaunch.ts`), held identical by test.
 *
 *   dev buy, any salt         → createCoinAndBuy(name, symbol, quote, tax, excess, salt, quoteIn, minOut)
 *   no dev buy, vanity salt   → createCoin(name, symbol, quote, tax, excess, salt)
 *   no dev buy, no salt       → createCoin(name, symbol, quote, tax, excess)      (auto-salt)
 *
 * Every entrypoint is payable and requires `msg.value >= launchFee`. The fee is
 * READ LIVE (`readStockLaunchFee`) and attached exactly; a dev buy pulls the
 * quote asset through `transferFrom`, so the launchpad must be approved first.
 */

export interface StockLaunchArgs {
  readonly name: string;
  readonly symbol: string;
  readonly quote: `0x${string}`;
  /** null → the auto-salt overload. */
  readonly salt: `0x${string}` | null;
  /** Quote base units to spend on the dev buy. 0n → no dev buy. */
  readonly quoteIn: bigint;
  /** Slippage floor for the dev buy, in the launched token's base units. */
  readonly minTokensOut: bigint;
  /** The creator's permanent fee terms. `null` is refused, never defaulted. */
  readonly feeTerms: FeeTerms | null;
}

export type StockLaunchCall =
  | {
      readonly kind: 'buy';
      readonly functionName: 'createCoinAndBuy';
      readonly args: readonly [string, string, `0x${string}`, number, number, `0x${string}`, bigint, bigint];
    }
  | {
      readonly kind: 'salt';
      readonly functionName: 'createCoin';
      readonly args: readonly [string, string, `0x${string}`, number, number, `0x${string}`];
    }
  | {
      readonly kind: 'auto';
      readonly functionName: 'createCoin';
      readonly args: readonly [string, string, `0x${string}`, number, number];
    };

/** Why these terms cannot ride in a launch, or null when they can. */
export function stockLaunchTermsIssue(feeTerms: FeeTerms | null): string | null {
  if (feeTerms === null) return 'Choose the trading fee for this token before launching.';
  if (validateFeeTerms(feeTerms) !== null) return 'The trading fee or its split is outside the range a launch can set.';
  return null;
}

export function buildStockLaunchCall({ name, symbol, quote, salt, quoteIn, minTokensOut, feeTerms }: StockLaunchArgs): StockLaunchCall {
  const issue = stockLaunchTermsIssue(feeTerms);
  if (issue !== null) throw new Error(issue);
  if (feeTerms === null) throw new Error('Choose the trading fee for this token before launching.');
  if (quoteIn < 0n || minTokensOut < 0n) throw new Error('A dev-buy amount cannot be negative.');

  // uint16 on-chain; both are bounded (at most 10000) by `validateFeeTerms`, so the conversion is exact.
  const tax = Number(feeTerms.taxBps);
  const excess = Number(feeTerms.excessToCreatorBps);
  if (quoteIn > 0n) {
    return { kind: 'buy', functionName: 'createCoinAndBuy', args: [name, symbol, quote, tax, excess, salt ?? `0x${'00'.repeat(32)}`, quoteIn, minTokensOut] };
  }
  if (minTokensOut !== 0n) throw new Error('Set a dev-buy amount, or clear the minimum.');
  if (salt !== null) {
    return { kind: 'salt', functionName: 'createCoin', args: [name, symbol, quote, tax, excess, salt] };
  }
  return { kind: 'auto', functionName: 'createCoin', args: [name, symbol, quote, tax, excess] };
}

/** The calldata of a stock launch call. `launchFeeWei` is the live `launchFee()`, attached exactly. */
export function encodeStockLaunchCall(call: StockLaunchCall, launchpad: `0x${string}`, launchFeeWei: bigint): UnsignedLaunchTx {
  // viem selects the `createCoin` overload by argument count (5 or 6).
  const data = encodeFunctionData({ abi: stockLaunchpadLaunchAbi as Abi, functionName: call.functionName, args: call.args as unknown as unknown[] });
  return { to: launchpad, data, value: launchFeeWei };
}

/** ERC-20 `approve` / `allowance` — the standard shapes; the SDK's read-only `erc20Abi` carries neither. */
export const erc20ApprovalAbi = [
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'value', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
  },
] as const;

/** The ERC-20 approval a dev buy needs: EXACTLY `quoteIn`, never unlimited. */
export function encodeStockApproval(quote: `0x${string}`, launchpad: `0x${string}`, quoteIn: bigint): UnsignedLaunchTx {
  return { to: quote, data: encodeFunctionData({ abi: erc20ApprovalAbi, functionName: 'approve', args: [launchpad, quoteIn] }), value: 0n };
}

/** The launchpad's current allowance on `quote` from `owner`. */
export async function readStockAllowance(client: ReadClient, quote: Address, owner: Address, launchpad: Address): Promise<bigint> {
  return (await client.readContract({ address: quote, abi: erc20ApprovalAbi, functionName: 'allowance', args: [owner, launchpad] })) as bigint;
}

export interface StockLaunchFee {
  /** Exact wei to attach to the launch call. */
  readonly launchFee: bigint;
  /** Immutable per-deployment ceiling — disclosure, not something to send. */
  readonly maxLaunchFee: bigint;
}

/** The launch fee, READ FROM THE CHAIN. Owner-tunable storage under an immutable cap; never a constant. */
export async function readStockLaunchFee(client: ReadClient, launchpad: Address): Promise<StockLaunchFee> {
  const [launchFee, maxLaunchFee] = (await client.multicall({
    allowFailure: false,
    contracts: [
      { address: launchpad, abi: stockLaunchpadLaunchAbi, functionName: 'launchFee' },
      { address: launchpad, abi: stockLaunchpadLaunchAbi, functionName: 'maxLaunchFee' },
    ],
  })) as readonly [bigint, bigint];
  return { launchFee, maxLaunchFee };
}

export interface StockMiningInputs {
  /** `COIN_VARIANT()` — the variant byte the launchpad binds into the salt. */
  readonly variant: number;
  /** `coinInitCodeHash(name, symbol)` — depends on the name and symbol, so a rename re-mines. */
  readonly initCodeHash: Hex;
}

/** What `mineSalt` needs for a stock coin: the variant and the name/symbol-dependent init code hash. */
export async function readStockMiningInputs(client: ReadClient, launchpad: Address, name: string, symbol: string): Promise<StockMiningInputs> {
  const [variant, initCodeHash] = (await client.multicall({
    allowFailure: false,
    contracts: [
      { address: launchpad, abi: stockLaunchpadLaunchAbi, functionName: 'COIN_VARIANT' },
      { address: launchpad, abi: stockLaunchpadLaunchAbi, functionName: 'coinInitCodeHash', args: [name, symbol] },
    ],
  })) as readonly [number, Hex];
  return { variant: Number(variant), initCodeHash };
}

/** The launchpad's own prediction for (creator, salt, name, symbol) — the confirmation a mined salt needs. */
export async function predictStockCoin(client: ReadClient, launchpad: Address, creator: Address, salt: Hex, name: string, symbol: string): Promise<Address> {
  return (await client.readContract({ address: launchpad, abi: stockLaunchpadLaunchAbi, functionName: 'predictCoin', args: [creator, salt, name, symbol] })) as Address;
}

/** One whitelisted quote leg, as the launchpad and its own ERC-20 describe it. */
export interface StockQuote {
  readonly address: Address;
  /** Position in `allQuotes` — append-ordered, the only recency signal the chain offers. */
  readonly registryIndex: number;
  /** On-chain symbol; `null` when the ERC-20 did not answer. Never defaulted. */
  readonly symbol: string | null;
  readonly name: string | null;
  /** On-chain decimals; `null` when unreadable. Never defaulted. */
  readonly decimals: number | null;
  /** `quoteConfig.startTick` — the launch price, set by the launchpad owner. */
  readonly startTick: number;
}

/**
 * The stock-paired launch whitelist — READ FROM THE CHAIN (`quoteCount` / `allQuotes`,
 * each gated on `quoteConfig(quote).allowed`), identity read off each ERC-20. An entry whose
 * identity cannot be read is kept and marked unresolved, never dropped or defaulted.
 */
export async function readStockQuotes(client: ReadClient, launchpad: Address): Promise<readonly StockQuote[]> {
  const count = Number(await client.readContract({ address: launchpad, abi: stockLaunchpadLaunchAbi, functionName: 'quoteCount' }));
  if (count === 0) return [];
  const addresses = (await client.multicall({
    allowFailure: false,
    contracts: Array.from({ length: count }, (_, i) => ({ address: launchpad, abi: stockLaunchpadLaunchAbi, functionName: 'allQuotes' as const, args: [BigInt(i)] as const })),
  })) as readonly Address[];
  const configs = (await client.multicall({
    allowFailure: false,
    contracts: addresses.map((quote) => ({ address: launchpad, abi: stockLaunchpadLaunchAbi, functionName: 'quoteConfig' as const, args: [quote] as const })),
  })) as readonly (readonly [boolean, boolean, number])[];
  const allowed = addresses.map((address, i) => ({ address, i, config: configs[i]! })).filter(({ config }) => config[0]);
  if (allowed.length === 0) return [];
  const identity = await client.multicall({
    allowFailure: true,
    contracts: allowed.flatMap(({ address }) => [
      { address, abi: erc20Abi, functionName: 'symbol' as const },
      { address, abi: erc20Abi, functionName: 'name' as const },
      { address, abi: erc20Abi, functionName: 'decimals' as const },
    ]),
  });
  return allowed.map(({ address, i, config }, k) => {
    const sym = identity[k * 3]!;
    const nm = identity[k * 3 + 1]!;
    const dec = identity[k * 3 + 2]!;
    return {
      address,
      registryIndex: i,
      symbol: sym.status === 'success' ? String(sym.result) : null,
      name: nm.status === 'success' ? String(nm.result) : null,
      decimals: dec.status === 'success' ? Number(dec.result) : null,
      startTick: Number(config[2]),
    };
  });
}

/** Whether the launchpad allows `quote` right now. */
export async function isQuoteAllowed(client: ReadClient, launchpad: Address, quote: Address): Promise<boolean> {
  const [allowed] = (await client.readContract({ address: launchpad, abi: stockLaunchpadLaunchAbi, functionName: 'quoteConfig', args: [quote] })) as readonly [boolean, boolean, number];
  return allowed;
}
