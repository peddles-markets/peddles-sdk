import { decodeErrorResult, encodeFunctionData, getAddress, keccak256, toBytes, type Address, type Hex } from 'viem';
import type { ReadClient } from '../client.js';
import { boundSalt, create2Address, domainBoundSalt, randomSalt } from '../launch/salt.js';
import { gullyErrorsAbi, gullyLaunchpadAbi, gullyQuoteTokenAbi, gullyTokenFactoryAbi, gullyTokenMetadataAbi } from './abi.js';
import { gullyDeploymentFor, type GullyDeployment } from './deployments.js';

/**
 * A launch on `PeddlesGullyLaunchpad` (Gully Core, Anubis 6714), non-custodially: reads, the exact
 * DAI approval and the launch call. A pure port of the web app's `features/launch/gullyLaunch.ts`
 * and `gullyLaunchCall.ts`, held byte-identical by test.
 *
 * ── PAYMENT ─────────────────────────────────────────────────────────────────
 * NO TRANSACTION CARRIES NATIVE VALUE ON ANUBIS. Gas there is DAI, and the launch fee and the first
 * buy are the DAI ERC-20 (`quoteToken`, the native gas token's ERC-20 face), pulled by the launchpad
 * with `transferFrom`. So a creator first approves EXACTLY fee + first buy to the launchpad, then
 * launches: two signatures when the allowance is short, one when it is not. The approval is never
 * unlimited, and every transaction here has `value: 0n`.
 *
 * The fee is READ FROM THE CHAIN (`launchFee()`, 2 DAI when this was written), never shipped, and
 * read again right before signing: the owner can retune it at once, up to the immutable cap.
 *
 * Traders also pay Gully's own protocol fee on top of the launch's terms (0.30% each way when this
 * was written; Gully can raise it to 0.40%). Holder rewards stream over one hour on Anubis: a holder
 * who sells before the stream ends leaves the unpaid part to the holders who stay.
 */

/** An unsigned transaction: the bytes a wallet, the CLI or an agent signs. Never carries value here. */
export interface GullyUnsignedTx {
  readonly to: Address;
  readonly data: Hex;
  /** Always 0n: native value cannot move on Anubis. */
  readonly value: 0n;
}

/** A refusal: the one sentence for why nothing can be built. */
export class GullyLaunchRefusedError extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = 'GullyLaunchRefusedError';
  }
}

// ── launch types ─────────────────────────────────────────────────────────────────────────────────

/** The two launch types the Gully launchpad takes: the plain coin and Drip. */
export const GULLY_VARIANT = { plain: 0, drip: 1 } as const;
export type GullyVariantId = (typeof GULLY_VARIANT)[keyof typeof GULLY_VARIANT];

export interface GullyAllocation {
  readonly liquidityBps: number;
  readonly airdropBps: number;
  readonly vestingBps: number;
  readonly burnBps: number;
  readonly clogBps: number;
  readonly clogSliceBps: number;
  readonly clogMinInterval: bigint;
}

const NOT_OPEN = 'This launch type is not open on this chain.';

/**
 * Whether the launchpad will take this type, by the same rules `_launch` enforces, and the one
 * sentence when it will not. `supported` null is an unread registry: nothing is offered.
 */
export function gullyVariantRefusal(
  variant: GullyVariantId,
  supported: boolean | null,
  allocation: GullyAllocation | null,
): string | null {
  if (supported === null || allocation === null) return 'This launch type could not be read on this chain.';
  if (!supported) return NOT_OPEN;
  if (allocation.airdropBps !== 0 || allocation.vestingBps !== 0 || allocation.burnBps !== 0) return NOT_OPEN;
  if (allocation.liquidityBps + allocation.clogBps !== 10_000 || allocation.liquidityBps === 0) return NOT_OPEN;
  // The type picked and the registry must agree on the shape, or the creator gets another type.
  if (variant === GULLY_VARIANT.plain && allocation.clogBps !== 0) return NOT_OPEN;
  if (variant === GULLY_VARIANT.drip && allocation.clogBps === 0) return NOT_OPEN;
  return null;
}

// ── metadata and the launch call ─────────────────────────────────────────────────────────────────

/** On-chain metadata the launchpad allows: `updateContractURI` and `updateExtraMetadata` only. */
export interface GullyMetadata {
  readonly image: string;
  readonly website: string;
  readonly x: string;
  readonly telegram: string;
  /**
   * Optional `contractURI` (e.g. an `ipfs://` JSON). Written FIRST when present. The web form does
   * not write it; the 2026-11-10 test launches did. Omit it for calldata identical to the web's.
   */
  readonly contractURI?: string;
}

/** The metadata writes, empty fields omitted (an empty entry would be a permanent false claim). */
export function gullyMetadataCalls(metadata: GullyMetadata): `0x${string}`[] {
  const calls: `0x${string}`[] = [];
  const uri = metadata.contractURI?.trim() ?? '';
  if (uri.length > 0) {
    calls.push(encodeFunctionData({ abi: gullyTokenMetadataAbi, functionName: 'updateContractURI', args: [uri] }));
  }
  const entries: readonly [string, string][] = [
    ['image', metadata.image],
    ['website', metadata.website],
    ['x', metadata.x],
    ['telegram', metadata.telegram],
  ];
  for (const [key, value] of entries) {
    const v = value.trim();
    if (v.length === 0) continue;
    calls.push(encodeFunctionData({ abi: gullyTokenMetadataAbi, functionName: 'updateExtraMetadata', args: [key, v] }));
  }
  return calls;
}

export interface GullyLaunchArgs {
  readonly variant: GullyVariantId;
  readonly salt: `0x${string}`;
  readonly name: string;
  readonly symbol: string;
  readonly metadata: GullyMetadata;
  /** The pool's all-in trading fee, bps, 100..1000. Fixed for the life of the pool. */
  readonly creatorTaxBps: bigint;
  /** The creator's share of the fee above the fixed 1.00%, bps, 0..10000; the rest goes to holders. */
  readonly excessToCreatorBps: bigint;
  /** DAI base units spent on the first buy; 0n launches without one. */
  readonly firstBuy: bigint;
  /** Floor on the first buy, in the coin's base units; must be 0n with no first buy. */
  readonly minTokensOut: bigint;
}

export interface GullyLaunchInput {
  readonly variant: number;
  readonly salt: `0x${string}`;
  readonly name: string;
  readonly symbol: string;
  readonly metadataCalls: readonly `0x${string}`[];
  readonly creatorTaxBps: number;
  readonly excessToCreatorBps: number;
}

export type GullyLaunchRequest =
  | { ok: true; functionName: 'launch'; args: readonly [GullyLaunchInput] }
  | { ok: true; functionName: 'launchAndBuy'; args: readonly [GullyLaunchInput, bigint, bigint] }
  | { ok: false; reason: string };

const SALT = /^0x[0-9a-fA-F]{64}$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/**
 * The launch call, or the reason there is none. With a first buy it is `launchAndBuy` (atomic: the
 * buy pays the pool's own rate, never the opening fee); without, `launch`.
 */
export function gullyLaunchRequest(a: GullyLaunchArgs): GullyLaunchRequest {
  if (a.variant !== GULLY_VARIANT.plain && a.variant !== GULLY_VARIANT.drip) return { ok: false, reason: NOT_OPEN };
  if (!SALT.test(a.salt)) return { ok: false, reason: 'The launch salt is not valid.' };
  if (a.name.trim().length === 0 || a.symbol.trim().length === 0) return { ok: false, reason: 'A name and a ticker are needed.' };
  if (a.creatorTaxBps < 100n || a.creatorTaxBps > 1_000n) return { ok: false, reason: 'The trading fee must be between 1% and 10%.' };
  if (a.excessToCreatorBps < 0n || a.excessToCreatorBps > 10_000n) return { ok: false, reason: 'The fee split is not valid.' };
  if (a.firstBuy < 0n || a.minTokensOut < 0n) return { ok: false, reason: 'The first buy is not valid.' };
  if (a.firstBuy === 0n && a.minTokensOut !== 0n) return { ok: false, reason: 'The first buy is not valid.' };
  const input: GullyLaunchInput = {
    variant: a.variant,
    salt: a.salt,
    name: a.name.trim(),
    symbol: a.symbol.trim(),
    metadataCalls: gullyMetadataCalls(a.metadata),
    creatorTaxBps: Number(a.creatorTaxBps),
    excessToCreatorBps: Number(a.excessToCreatorBps),
  };
  if (a.firstBuy === 0n) return { ok: true, functionName: 'launch', args: [input] };
  return { ok: true, functionName: 'launchAndBuy', args: [input, a.firstBuy, a.minTokensOut] };
}

/** Encode an accepted `gullyLaunchRequest` against a launchpad. */
export function encodeGullyLaunchCall(
  request: Extract<GullyLaunchRequest, { ok: true }>,
  launchpad: Address,
): GullyUnsignedTx {
  const data =
    request.functionName === 'launchAndBuy'
      ? encodeFunctionData({ abi: gullyLaunchpadAbi, functionName: 'launchAndBuy', args: request.args })
      : encodeFunctionData({ abi: gullyLaunchpadAbi, functionName: 'launch', args: request.args });
  return { to: launchpad, data, value: 0n };
}

/**
 * The launch transaction on `chainId`'s launchpad, from the address book. Throws
 * `GullyLaunchRefusedError` with the sentence when the terms are refused, and `GullyUnavailableError`
 * on a chain with no Gully core. With a first buy, set `minTokensOut` from a simulation of this same
 * launch (`gullyFirstBuyFloorFor`); a first buy is refused with no floor.
 */
export function buildGullyLaunchTx(chainId: number, args: GullyLaunchArgs): GullyUnsignedTx & { functionName: 'launch' | 'launchAndBuy' } {
  const { launchpad } = gullyDeploymentFor(chainId);
  const request = gullyLaunchRequest(args);
  if (!request.ok) throw new GullyLaunchRefusedError(request.reason);
  if (request.functionName === 'launchAndBuy' && args.minTokensOut === 0n) {
    throw new GullyLaunchRefusedError('A first buy needs a floor from a simulation of this launch. Nothing was built.');
  }
  return { ...encodeGullyLaunchCall(request, launchpad), functionName: request.functionName };
}

// ── the approval ─────────────────────────────────────────────────────────────────────────────────

export type GullyLaunchStep =
  | { readonly kind: 'approve'; readonly token: `0x${string}`; readonly spender: `0x${string}`; readonly amount: bigint }
  | { readonly kind: 'launch'; readonly withFirstBuy: boolean };

/**
 * The transactions a Gully launch needs, in order. `allowance` is the creator's current DAI
 * allowance to the launchpad, read from the chain; null means it could not be read, and then
 * nothing is planned. The approval is the exact total, fee plus first buy.
 */
export function gullyLaunchPlan(p: {
  readonly quoteToken: `0x${string}`;
  readonly launchpad: `0x${string}`;
  readonly launchFee: bigint;
  readonly firstBuy: bigint;
  readonly allowance: bigint | null;
  readonly balance: bigint | null;
}): { ok: true; steps: GullyLaunchStep[]; total: bigint } | { ok: false; reason: string } {
  if (p.launchFee < 0n || p.firstBuy < 0n) return { ok: false, reason: 'The amounts are not valid.' };
  if (p.allowance === null || p.balance === null) return { ok: false, reason: 'Your DAI balance could not be read. Nothing was sent.' };
  const total = p.launchFee + p.firstBuy;
  if (p.balance < total) return { ok: false, reason: 'Not enough DAI for the launch fee and the first buy.' };
  const steps: GullyLaunchStep[] = [];
  if (total > 0n && p.allowance < total) {
    steps.push({ kind: 'approve', token: p.quoteToken, spender: p.launchpad, amount: total });
  }
  steps.push({ kind: 'launch', withFirstBuy: p.firstBuy > 0n });
  return { ok: true, steps, total };
}

/**
 * The DAI approval to `chainId`'s launchpad for EXACTLY `launchFee + firstBuy`. The amount is computed
 * here from its two parts, so it cannot be an unlimited allowance; a zero total needs no approval and
 * is refused. `launchFee` must be the value just read from the chain (`readGullyLaunchTerms`).
 */
export function buildGullyApproveTx(
  chainId: number,
  amounts: { readonly launchFee: bigint; readonly firstBuy: bigint },
): GullyUnsignedTx & { amount: bigint } {
  const { launchpad, quoteToken } = gullyDeploymentFor(chainId);
  if (amounts.launchFee < 0n || amounts.firstBuy < 0n) throw new GullyLaunchRefusedError('The amounts are not valid.');
  const amount = amounts.launchFee + amounts.firstBuy;
  if (amount === 0n) throw new GullyLaunchRefusedError('Nothing to approve: the launch fee and the first buy are both zero.');
  const data = encodeFunctionData({ abi: gullyQuoteTokenAbi, functionName: 'approve', args: [launchpad, amount] });
  return { to: quoteToken, data, value: 0n, amount };
}

// ── the first-buy floor and the fee check ────────────────────────────────────────────────────────

/** First-buy slippage: the floor is the simulated amount less this, in bps. */
export const GULLY_FIRST_BUY_SLIPPAGE_BPS = 100n;

/**
 * The floor for the first buy from a simulation of the same launch. Nobody can trade the pool before
 * the launch transaction creates it, and its address is bound to the creator's salt, so the only
 * drift is the launchpad's own opening price, which its owner can move only through a timed proposal.
 */
export function gullyFirstBuyFloor(simulatedOut: bigint, slippageBps: bigint = GULLY_FIRST_BUY_SLIPPAGE_BPS): bigint {
  if (simulatedOut <= 0n) return 0n;
  if (slippageBps < 0n || slippageBps >= 10_000n) throw new Error('bad slippage');
  return (simulatedOut * (10_000n - slippageBps)) / 10_000n;
}

/**
 * The floor for a first buy, or the refusal. A buy whose simulation returns nothing, or so little that
 * the 1% margin rounds the floor to zero, would be signed with no floor at all: it is refused.
 */
export function gullyFirstBuyFloorFor(
  firstBuy: bigint,
  simulatedOut: bigint,
): { ok: true; floor: bigint } | { ok: false; reason: string } {
  if (firstBuy === 0n) return { ok: true, floor: 0n };
  const floor = simulatedOut > 0n ? gullyFirstBuyFloor(simulatedOut) : 0n;
  if (floor === 0n) return { ok: false, reason: 'The first buy is too small to buy anything. Nothing was launched.' };
  return { ok: true, floor };
}

/**
 * The launch fee read at signing time against the one the creator was shown. The owner can retune it
 * at once, up to the cap, so a fee that moved is never approved or paid unseen.
 */
export function gullyLaunchFeeRefusal(freshFee: bigint, expectedFee: bigint | null): string | null {
  if (expectedFee === null) return 'The launch fee has not been read yet. Nothing was sent.';
  return freshFee === expectedFee ? null : 'The launch fee changed. Check the new amount. Nothing was sent.';
}

// ── salts and the predicted address ──────────────────────────────────────────────────────────────

/** `keccak256("PEDDLES_GULLY_LAUNCH_SALT")` — `PeddlesGullyLaunchpad.LAUNCH_SALT_DOMAIN`. */
export const GULLY_LAUNCH_SALT_DOMAIN: `0x${string}` = keccak256(toBytes('PEDDLES_GULLY_LAUNCH_SALT'));

/** `PeddlesGullyLaunchpad.launchSalt(creator, salt)`: the salt the launchpad hands the factory. */
export function gullyLaunchSalt(creator: `0x${string}`, salt: `0x${string}`): `0x${string}` {
  return domainBoundSalt(GULLY_LAUNCH_SALT_DOMAIN, creator, salt);
}

/**
 * A fresh launch salt from the platform CSPRNG. Gully launches are not mined to a suffix: the
 * address is bound to the creator by `launchSalt`, and unguessable because the salt is random.
 */
export function randomGullySalt(): `0x${string}` {
  return randomSalt();
}

/**
 * The coin address computed locally — the factory's formula over the launchpad's binding:
 *   factory.getPeddlesAddress(variant, launchpad, launchSalt(creator, salt))
 * THE VARIANT IS PART OF THE ADDRESS. `creationCodeHash` is the factory's `variantInfo(variant)`
 * answer, read from the chain, never shipped.
 */
export function computeGullyLaunchToken(p: {
  readonly tokenFactory: `0x${string}`;
  readonly launchpad: `0x${string}`;
  readonly creator: `0x${string}`;
  readonly variant: GullyVariantId;
  readonly salt: `0x${string}`;
  readonly creationCodeHash: `0x${string}`;
}): Address {
  const bound = boundSalt(p.variant, p.launchpad, gullyLaunchSalt(p.creator, p.salt));
  return getAddress(create2Address(p.tokenFactory, bound, p.creationCodeHash));
}

/** The coin address a launch will deploy to, read from the launchpad itself (`predictLaunchToken`). */
export async function predictGullyLaunchToken(
  client: ReadClient,
  chainId: number,
  creator: `0x${string}`,
  variant: GullyVariantId,
  salt: `0x${string}`,
): Promise<Address> {
  if (!ADDRESS.test(creator)) throw new GullyLaunchRefusedError('The creator address is not valid.');
  if (!SALT.test(salt)) throw new GullyLaunchRefusedError('The launch salt is not valid.');
  const { launchpad } = gullyDeploymentFor(chainId);
  return (await client.readContract({
    address: launchpad,
    abi: gullyLaunchpadAbi,
    functionName: 'predictLaunchToken',
    args: [creator, variant, salt],
  })) as Address;
}

// ── reads ────────────────────────────────────────────────────────────────────────────────────────

/** What a launch of one type costs and whether it is open, read live from the chain. */
export interface GullyLaunchTerms {
  readonly deployment: GullyDeployment;
  /** The launch fee in quote-token base units (DAI, 18 decimals), read live. */
  readonly launchFee: bigint;
  /** The immutable cap the owner can never raise the fee above. */
  readonly maxLaunchFee: bigint;
  readonly quoteToken: Address;
  readonly supported: boolean;
  readonly allocation: GullyAllocation;
  /** One sentence when this type is not open here; null when it is. */
  readonly variantRefusal: string | null;
}

/**
 * Read the launch terms. `readContract` in parallel, not `multicall`: a chain need not have
 * Multicall3, and Anubis's presigned Multicall3 deployment never landed. Throws when a read fails or
 * when the launchpad's fee or quote token is not the one the address book names: a disagreement is
 * never signed.
 */
export async function readGullyLaunchTerms(client: ReadClient, chainId: number, variant: GullyVariantId): Promise<GullyLaunchTerms> {
  const d = gullyDeploymentFor(chainId);
  const lp = { address: d.launchpad, abi: gullyLaunchpadAbi } as const;
  const tf = { address: d.tokenFactory, abi: gullyTokenFactoryAbi } as const;
  const [launchFee, maxLaunchFee, feeToken, quoteToken, tokenFactory, supported, allocation] = await Promise.all([
    client.readContract({ ...lp, functionName: 'launchFee' }) as Promise<bigint>,
    client.readContract({ ...lp, functionName: 'maxLaunchFee' }) as Promise<bigint>,
    client.readContract({ ...lp, functionName: 'feeToken' }) as Promise<Address>,
    client.readContract({ ...lp, functionName: 'quoteToken' }) as Promise<Address>,
    client.readContract({ ...lp, functionName: 'tokenFactory' }) as Promise<Address>,
    client.readContract({ ...tf, functionName: 'isVariantSupported', args: [variant] }) as Promise<boolean>,
    client.readContract({ ...tf, functionName: 'variantAllocation', args: [variant] }) as Promise<GullyAllocation>,
  ]);
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  if (!same(feeToken, d.quoteToken) || !same(quoteToken, d.quoteToken)) {
    throw new GullyLaunchRefusedError('The launchpad does not take the quote token this SDK expects, so nothing is built.');
  }
  if (!same(tokenFactory, d.tokenFactory)) {
    throw new GullyLaunchRefusedError('The launchpad names a different token factory than this SDK expects, so nothing is built.');
  }
  if (launchFee > maxLaunchFee) throw new GullyLaunchRefusedError('The launch fee read is above its own cap, so nothing is built.');
  return {
    deployment: d,
    launchFee,
    maxLaunchFee,
    quoteToken,
    supported,
    allocation,
    variantRefusal: gullyVariantRefusal(variant, supported, allocation),
  };
}

/** The creator's DAI balance and allowance to the launchpad, read live. */
export async function readGullyWallet(
  client: ReadClient,
  chainId: number,
  owner: `0x${string}`,
): Promise<{ balance: bigint; allowance: bigint }> {
  if (!ADDRESS.test(owner)) throw new GullyLaunchRefusedError('The creator address is not valid.');
  const d = gullyDeploymentFor(chainId);
  const q = { address: d.quoteToken, abi: gullyQuoteTokenAbi } as const;
  const [balance, allowance] = await Promise.all([
    client.readContract({ ...q, functionName: 'balanceOf', args: [owner] }) as Promise<bigint>,
    client.readContract({ ...q, functionName: 'allowance', args: [owner, d.launchpad] }) as Promise<bigint>,
  ]);
  return { balance, allowance };
}

/** The unsigned transactions of a launch, in order, with what was read to plan them. */
export interface GullyLaunchTxPlan {
  readonly launchFee: bigint;
  readonly total: bigint;
  readonly balance: bigint;
  readonly allowance: bigint;
  /** The exact approval, or null when the allowance already covers fee + first buy. */
  readonly approve: (GullyUnsignedTx & { amount: bigint }) | null;
}

/**
 * Read fee, balance and allowance FRESH, check the fee is the one the creator was shown, and return the
 * exact approval the launch needs (or none). Throws `GullyLaunchRefusedError` with the sentence on any
 * refusal (unread fee, a fee that moved, a type not open, not enough DAI). The launch call itself is
 * built after the approval lands and the launch is simulated (`buildGullyLaunchTx`).
 */
export async function planGullyLaunch(
  client: ReadClient,
  chainId: number,
  p: { readonly creator: `0x${string}`; readonly variant: GullyVariantId; readonly firstBuy: bigint; readonly expectedFee: bigint | null },
): Promise<GullyLaunchTxPlan> {
  const [terms, wallet] = await Promise.all([readGullyLaunchTerms(client, chainId, p.variant), readGullyWallet(client, chainId, p.creator)]);
  if (terms.variantRefusal) throw new GullyLaunchRefusedError(terms.variantRefusal);
  const moved = gullyLaunchFeeRefusal(terms.launchFee, p.expectedFee);
  if (moved) throw new GullyLaunchRefusedError(moved);
  const plan = gullyLaunchPlan({
    quoteToken: terms.deployment.quoteToken,
    launchpad: terms.deployment.launchpad,
    launchFee: terms.launchFee,
    firstBuy: p.firstBuy,
    allowance: wallet.allowance,
    balance: wallet.balance,
  });
  if (!plan.ok) throw new GullyLaunchRefusedError(plan.reason);
  const needsApproval = plan.steps.some((s) => s.kind === 'approve');
  return {
    launchFee: terms.launchFee,
    total: plan.total,
    balance: wallet.balance,
    allowance: wallet.allowance,
    approve: needsApproval ? buildGullyApproveTx(chainId, { launchFee: terms.launchFee, firstBuy: p.firstBuy }) : null,
  };
}

/** A launch as the launchpad records it, read live. A coin it never launched reads positionId 0. */
export interface GullyLaunchRecord {
  readonly token: Address;
  readonly positionId: bigint;
  readonly poolId: Hex;
  readonly lpIsLocked: boolean;
}

/** Read a launched coin's position, pool and LP lock from the launchpad. Null when it is not ours. */
export async function readGullyLaunchRecord(client: ReadClient, chainId: number, token: `0x${string}`): Promise<GullyLaunchRecord | null> {
  if (!ADDRESS.test(token)) throw new GullyLaunchRefusedError('The token address is not valid.');
  const { launchpad, quoteToken } = gullyDeploymentFor(chainId);
  if (token.toLowerCase() === quoteToken.toLowerCase()) return null;
  const lp = { address: launchpad, abi: gullyLaunchpadAbi } as const;
  const positionId = (await client.readContract({ ...lp, functionName: 'positionIdOf', args: [token] })) as bigint;
  if (positionId === 0n) return null;
  const [poolId, lpIsLocked] = await Promise.all([
    client.readContract({ ...lp, functionName: 'poolIdFor', args: [token] }) as Promise<Hex>,
    client.readContract({ ...lp, functionName: 'lpIsLocked', args: [token] }) as Promise<boolean>,
  ]);
  return { token: getAddress(token), positionId, poolId, lpIsLocked };
}

// ── fee lines ────────────────────────────────────────────────────────────────────────────────────

/** Gully packs a protocol fee as two 12-bit halves: zeroForOne low, oneForZero high, in pips. */
export function unpackGullyProtocolFee(packed: number): { zeroForOne: number; oneForZero: number } {
  if (!Number.isInteger(packed) || packed < 0 || packed > 0xffffff) throw new Error(`bad protocol fee ${packed}`);
  return { zeroForOne: packed & 0xfff, oneForZero: (packed >> 12) & 0xfff };
}

// ── reverts ──────────────────────────────────────────────────────────────────────────────────────

/** The name of a Gully custom error from its raw revert data, or null when it is not one of ours. */
export function decodeGullyErrorName(raw: Hex | undefined | null): string | null {
  if (!raw || raw.length < 10) return null;
  try {
    return decodeErrorResult({ abi: gullyErrorsAbi, data: raw }).errorName;
  } catch {
    return null;
  }
}

const GULLY_REVERTS: Readonly<Record<string, string>> = {
  TRANSFER_FROM_FAILED: 'The launchpad could not take the DAI. Check your DAI balance and the approval, then try again.',
  UNSUPPORTED_VARIANT: NOT_OPEN,
  ALLOCATION_NOT_OFFERED: NOT_OPEN,
  BPS_SUM: NOT_OPEN,
  BAD_INIT_CALL: 'One of the links could not be written to the coin.',
  TOKEN_PREDICTION_MISMATCH: 'The coin address could not be reserved. Try again.',
  CLOG_SLICE_ROUNDS_TO_ZERO: 'This Drip type cannot launch: its slice rounds to zero.',
  START_PRICE_NOT_CONFIGURED: 'The opening price is not set on this chain, so nothing can launch right now.',
  ZERO_LIQUIDITY: 'The opening position would be empty, so nothing can launch right now.',
  DEV_BUY_SHORT: 'The first buy could not be taken in full.',
  DEV_BUY_SLIPPAGE: 'The first buy would have returned less than the floor, so nothing was launched.',
  SlippageExceeded: 'The first buy would have returned less than the floor, so nothing was launched.',
  NO_DEV_BUY: 'The first buy is not valid.',
  REENTRANT: 'The launch was refused. Try again.',
  FeeAboveCap: 'The trading fee is above 10%.',
  FeeBelowFloor: 'The trading fee is below 1%.',
  AlreadyRegistered: 'This coin address is already taken. Try again.',
  NotRegistrar: 'The launchpad is not wired to its fee hook on this chain, so nothing can launch right now.',
  NotifyGasTooLow: 'The transaction ran out of gas for the reward update. Try again and let your wallet estimate the gas.',
};

/** The launchpad's and the fee hook's refusals, in words. Unknown reasons are returned as null. */
export function gullyRevertSentence(reason: string | null | undefined): string | null {
  if (!reason) return null;
  return GULLY_REVERTS[reason] ?? null;
}
