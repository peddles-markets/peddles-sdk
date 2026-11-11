import { base64Decode, base64Encode } from './codec.js';
import { platformFetch, type FetchLike } from './platform.js';

/**
 * The Solana JSON-RPC calls a launch needs, over whatever node the CALLER chooses. No Solana client
 * library is required: pass a URL, a `@solana/web3.js` `Connection` (its public `rpcEndpoint` is
 * used), or your own request function (to add headers, retries, a proxy, or `@solana/kit`).
 *
 * A failure always throws. A read that failed is not a value, and nothing here defaults one.
 */

/** One JSON-RPC call: resolves to `result`, throws on a transport error or an RPC `error`. */
export type SolanaRpcRequest = <T>(method: string, params: readonly unknown[]) => Promise<T>;

export type SolanaRpcSource = string | SolanaRpcRequest | { readonly rpcEndpoint: string };

/** A request function for any accepted source. `fetch` defaults to the runtime's global one. */
export function solanaRpc(source: SolanaRpcSource, fetchImpl?: FetchLike): SolanaRpcRequest {
  if (typeof source === 'function') return source;
  const url = typeof source === 'string' ? source : source.rpcEndpoint;
  if (typeof url !== 'string' || !/^https?:\/\//.test(url)) throw new Error('A Solana RPC source is a URL, a Connection, or a request function.');
  return async <T>(method: string, params: readonly unknown[]): Promise<T> => {
    const doFetch = fetchImpl ?? platformFetch();
    const response = await doFetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    if (!response.ok) throw new Error(`The Solana node answered ${response.status} to ${method}.`);
    const body = (await response.json()) as { result?: T; error?: { message?: string } };
    if (body.error || body.result === undefined) throw new Error(body.error?.message ?? `The Solana node gave no answer to ${method}.`);
    return body.result;
  };
}

export interface RpcAccount {
  readonly data: Uint8Array;
  readonly owner: string;
  readonly lamports: bigint;
}

interface RawAccount {
  readonly data: [string, string];
  readonly owner: string;
  readonly lamports: number;
}

/** `getMultipleAccounts` in pages of 100 (a node's limit), in order; null for an account that does not exist. */
export async function getAccounts(source: SolanaRpcSource, addresses: readonly string[]): Promise<readonly (RpcAccount | null)[]> {
  const rpc = solanaRpc(source);
  const pages: (readonly string[])[] = [];
  for (let i = 0; i < addresses.length; i += 100) pages.push(addresses.slice(i, i + 100));
  const results = await Promise.all(
    pages.map((page) => rpc<{ value: (RawAccount | null)[] }>('getMultipleAccounts', [page, { encoding: 'base64', commitment: 'confirmed' }])),
  );
  const out = results.flatMap((result) => result.value).map((account) => {
    if (!account) return null;
    const data = base64Decode(account.data[0]);
    if (!data) throw new Error('The Solana node returned an unreadable account.');
    // Lamports arrive as a JSON number; above 2^53 it has already lost precision, so refuse it.
    if (!Number.isSafeInteger(account.lamports)) throw new Error('The Solana node returned an unreadable balance.');
    return { data, owner: account.owner, lamports: BigInt(account.lamports) };
  });
  if (out.length !== addresses.length) throw new Error('The Solana node returned the wrong number of accounts.');
  return out;
}

export async function getEpoch(source: SolanaRpcSource): Promise<bigint> {
  const result = await solanaRpc(source)<{ epoch: number }>('getEpochInfo', [{ commitment: 'confirmed' }]);
  return BigInt(result.epoch);
}

/** Rent for an empty account, over the 128 bytes every account carries. */
export async function getRentLamportsPerByte(source: SolanaRpcSource): Promise<bigint> {
  const lamports = await solanaRpc(source)<number>('getMinimumBalanceForRentExemption', [0]);
  return BigInt(lamports) / 128n;
}

export async function getLatestBlockhash(source: SolanaRpcSource): Promise<string> {
  const result = await solanaRpc(source)<{ value: { blockhash: string } }>('getLatestBlockhash', [{ commitment: 'confirmed' }]);
  return result.value.blockhash;
}

export async function getRecentPriorityFees(source: SolanaRpcSource): Promise<readonly bigint[]> {
  const result = await solanaRpc(source)<readonly { prioritizationFee: number }[]>('getRecentPrioritizationFees', []);
  return result.map((row) => BigInt(row.prioritizationFee));
}

export interface SimulationResult {
  readonly slot: number;
  /** The runtime's error, or null when the transaction would succeed. */
  readonly err: unknown;
  readonly logs: readonly string[];
  readonly unitsConsumed: number | null;
}

/**
 * `simulateTransaction` of a serialized transaction. Unsigned by default: signature checks off and
 * the blockhash replaced, so anyone can dry-run a launch holding no key. The Peddles API's public
 * read proxy does not forward this method; use a node that does.
 */
export async function simulateTransaction(
  source: SolanaRpcSource,
  transaction: Uint8Array,
  options: { readonly sigVerify?: boolean } = {},
): Promise<SimulationResult> {
  const sigVerify = options.sigVerify ?? false;
  const result = await solanaRpc(source)<{
    context: { slot: number };
    value: { err: unknown; logs: string[] | null; unitsConsumed?: number };
  }>('simulateTransaction', [
    base64Encode(transaction),
    { encoding: 'base64', sigVerify, replaceRecentBlockhash: !sigVerify, commitment: 'confirmed' },
  ]);
  return { slot: result.context.slot, err: result.value.err, logs: result.value.logs ?? [], unitsConsumed: result.value.unitsConsumed ?? null };
}
