import {
  TransactionNotFoundError,
  TransactionReceiptNotFoundError,
  parseEventLogs,
  type Log,
  type PublicClient,
} from 'viem';
import { gullyLaunchpadAbi } from './abi.js';
import { gullyDeploymentFor } from './deployments.js';
import { GULLY_VARIANT, type GullyVariantId } from './launch.js';

/**
 * Settling a Gully launch that has been handed to a wallet — a pure port of the web app's pending
 * record (`features/launch/gullyLaunchCall.ts`) and its settle loop (`useGullyLaunch.ts`).
 *
 * The coin's address is `predictLaunchToken(creator, variant, salt)`: the VARIANT is part of it, so a
 * record pins all three. A retry reuses the record's salt only for the same variant and creator, which
 * then targets the same coin address, which the factory cannot create twice: a retry never makes a
 * second coin. A record with a transaction hash is an UNKNOWN outcome until the chain settles it.
 */

export interface PendingGullyLaunch {
  readonly salt: `0x${string}`;
  readonly hash: `0x${string}` | null;
  readonly variant: GullyVariantId;
  readonly creator: `0x${string}`;
}

/** Any synchronous key-value store (`localStorage`, a Map wrapper, a file-backed shim). */
export interface GullyKeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const HEX32 = /^0x[0-9a-fA-F]{64}$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/** The store key of a chain's pending launch — the same key the web app uses. */
export function gullyPendingLaunchKey(chainId: number): string {
  return `peddles.gully-launch.${chainId}`;
}

/** The chain's pending launch, or null when there is none or the stored value is not one. */
export function readGullyPendingLaunch(store: GullyKeyValueStore | null, chainId: number): PendingGullyLaunch | null {
  if (!store) return null;
  try {
    const raw = store.getItem(gullyPendingLaunchKey(chainId));
    if (!raw) return null;
    const v = JSON.parse(raw) as { salt?: unknown; hash?: unknown; variant?: unknown; creator?: unknown };
    if (typeof v.salt !== 'string' || !HEX32.test(v.salt)) return null;
    if (v.variant !== GULLY_VARIANT.plain && v.variant !== GULLY_VARIANT.drip) return null;
    if (typeof v.creator !== 'string' || !ADDRESS.test(v.creator)) return null;
    const hash = typeof v.hash === 'string' && HEX32.test(v.hash) ? (v.hash as `0x${string}`) : null;
    return { salt: v.salt as `0x${string}`, hash, variant: v.variant, creator: v.creator as `0x${string}` };
  } catch {
    return null;
  }
}

/** Pin a launch BEFORE it is sent (hash null), and again with its hash once the wallet returns one. */
export function writeGullyPendingLaunch(store: GullyKeyValueStore | null, chainId: number, pending: PendingGullyLaunch): void {
  try {
    store?.setItem(gullyPendingLaunchKey(chainId), JSON.stringify(pending));
  } catch {
    // Blocked storage: the caller's in-memory salt still holds.
  }
}

export function clearGullyPendingLaunch(store: GullyKeyValueStore | null, chainId: number): void {
  try {
    store?.removeItem(gullyPendingLaunchKey(chainId));
  } catch {
    // Nothing to clear.
  }
}

export const GULLY_UNKNOWN_OUTCOME = 'Not confirmed yet. Check the transaction before trying again.';
export const GULLY_OTHER_PENDING =
  'Your last launch on this chain is not settled. Finish it on the form you started it on, from the same wallet.';
export const GULLY_NO_LAUNCH_IN_TX = 'The transaction confirmed but carries no launch from this launchpad. Open it on the explorer.';
export const GULLY_LAUNCH_REVERTED = 'The launch was mined but reverted. Gas was spent; the DAI did not move.';
export const GULLY_LAUNCH_DROPPED = 'Your last launch was never mined. Try again: it launches the same coin.';

/**
 * Whether a launch of `variant` by `creator` may go ahead given this chain's pending record, and with
 * which salt. A record with a hash blocks every launch on the chain; a record without one pins its salt
 * to the same variant and creator.
 */
export function gullyPendingLaunchGate(
  record: PendingGullyLaunch | null,
  variant: GullyVariantId,
  creator: `0x${string}` | null,
): { ok: true; salt: `0x${string}` | null } | { ok: false; reason: string } {
  if (!record) return { ok: true, salt: null };
  if (record.hash !== null) return { ok: false, reason: GULLY_UNKNOWN_OUTCOME };
  if (record.variant !== variant) return { ok: false, reason: GULLY_OTHER_PENDING };
  if (creator !== null && creator.toLowerCase() !== record.creator.toLowerCase()) return { ok: false, reason: GULLY_OTHER_PENDING };
  return { ok: true, salt: record.salt };
}

/** A failure after a hash exists is an UNKNOWN outcome, never a clean retry. */
export function gullyFailureKind(hash: `0x${string}` | null, settled: boolean): 'failed' | 'unknown' {
  return hash !== null && !settled ? 'unknown' : 'failed';
}

/** What the chain says about a pending launch, read in this order: code, receipt, transaction. */
export interface GullyPendingReads {
  readonly codeAtPredicted: boolean | null;
  readonly receipt: { readonly status: 'success' | 'reverted'; readonly token?: `0x${string}` | null } | 'none' | null;
  readonly txKnown: boolean | null;
  readonly hasHash: boolean;
}

export type GullyPendingResolution =
  | { readonly kind: 'done' }
  | { readonly kind: 'reverted' }
  | { readonly kind: 'no-launch' }
  | { readonly kind: 'dropped' }
  | { readonly kind: 'waiting' };

/**
 * Settle a pending launch from the chain's answers. Code at the predicted address is the coin, and so
 * is a receipt carrying this launchpad's launch event. Anything unread, or still pending, is waiting.
 */
export function resolveGullyPending(r: GullyPendingReads): GullyPendingResolution {
  if (r.codeAtPredicted === true) return { kind: 'done' };
  if (r.codeAtPredicted === null) return { kind: 'waiting' };
  if (!r.hasHash) return { kind: 'dropped' };
  if (r.receipt === null) return { kind: 'waiting' };
  if (r.receipt !== 'none') {
    if (r.receipt.status === 'reverted') return { kind: 'reverted' };
    return r.receipt.token ? { kind: 'done' } : { kind: 'no-launch' };
  }
  if (r.txKnown === false) return { kind: 'dropped' };
  return { kind: 'waiting' };
}

/** The launch a receipt reports, or null when it carries no `PeddlesLaunchedV20` from this launchpad for this creator. */
export function gullyLaunchedFromReceipt(
  logs: readonly Log[],
  launchpad: `0x${string}`,
  creator: `0x${string}`,
): { token: `0x${string}`; poolId: `0x${string}`; positionId: bigint } | null {
  const events = parseEventLogs({ abi: gullyLaunchpadAbi, eventName: 'PeddlesLaunchedV20', logs: logs as Log[] });
  for (const e of events) {
    if (e.address.toLowerCase() !== launchpad.toLowerCase()) continue;
    if (e.args.creator.toLowerCase() !== creator.toLowerCase()) continue;
    return { token: e.args.token, poolId: e.args.poolId, positionId: e.args.positionId };
  }
  return null;
}

/** The client a settle needs: contract reads, code, receipts and transactions. */
export type GullySettleClient = Pick<PublicClient, 'readContract' | 'getCode' | 'getTransactionReceipt' | 'getTransaction'>;

/**
 * One read of a pending launch's state on the chain, then its resolution. A read that fails is
 * unread (waiting), never a value. `token` is the coin when the chain names one.
 */
export async function settleGullyLaunch(
  client: GullySettleClient,
  chainId: number,
  rec: PendingGullyLaunch,
): Promise<{ token: `0x${string}` | null; resolution: GullyPendingResolution }> {
  const { launchpad } = gullyDeploymentFor(chainId);
  let token: `0x${string}` | null = null;
  let codeAtPredicted: boolean | null = null;
  try {
    token = (await client.readContract({
      address: launchpad,
      abi: gullyLaunchpadAbi,
      functionName: 'predictLaunchToken',
      args: [rec.creator, rec.variant, rec.salt],
    })) as `0x${string}`;
    const code = await client.getCode({ address: token });
    codeAtPredicted = code !== undefined && code !== '0x';
  } catch {
    codeAtPredicted = null;
  }
  let receipt: { status: 'success' | 'reverted'; token: `0x${string}` | null } | 'none' | null = null;
  let txKnown: boolean | null = null;
  if (rec.hash && codeAtPredicted === false) {
    try {
      const r = await client.getTransactionReceipt({ hash: rec.hash });
      const launched = r.status === 'success' ? gullyLaunchedFromReceipt(r.logs, launchpad, rec.creator) : null;
      if (launched) token = launched.token;
      receipt = { status: r.status, token: launched?.token ?? null };
    } catch (cause) {
      receipt = cause instanceof TransactionReceiptNotFoundError ? 'none' : null;
    }
    if (receipt === 'none') {
      try {
        await client.getTransaction({ hash: rec.hash });
        txKnown = true;
      } catch (cause) {
        txKnown = cause instanceof TransactionNotFoundError ? false : null;
      }
    }
  }
  const resolution = resolveGullyPending({ codeAtPredicted, receipt, txKnown, hasHash: rec.hash !== null });
  // A coin is only named when the chain settled it as done.
  return { token: resolution.kind === 'done' ? token : null, resolution };
}
