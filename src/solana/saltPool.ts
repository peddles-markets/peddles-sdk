import { addressBytes } from './codec.js';
import { PEDDLES_SOLANA_LAUNCH_PROGRAM_ID } from './constants.js';
import { endsWithPedl, type GrindHit } from './grind.js';
import { deriveCoinMint } from './instruction.js';
import { platformFetch, type FetchLike } from './platform.js';

/**
 * The Peddles API keeps a pool of pre-ground `PEDL` salts (`POST /api/v1/solana-launch/salt`, public,
 * rate-limited per IP). Its answer is believed only as far as it can be recomputed: the mint is
 * derived here from the salt and the program id, so a wrong or tampered answer cannot change where a
 * coin lands. Ported from `apps/web/src/features/launch/solana/saltPool.ts`.
 */

export const PEDDLES_API_URL = 'https://api.peddles.xyz';
const SALT_PATH = '/api/v1/solana-launch/salt';

export interface PooledHit {
  readonly hit: GrindHit;
  /** Epoch milliseconds the API holds this salt for you. */
  readonly expiresAt: number;
}

/** The API's answer, checked. Null for anything else, an empty pool included. */
export function readPooledSalt(body: unknown, programId: string = PEDDLES_SOLANA_LAUNCH_PROGRAM_ID): PooledHit | null {
  const data = (body as { data?: { salt?: unknown; mint?: unknown; reservedUntil?: unknown } } | null)?.data;
  if (!data || typeof data.salt !== 'string' || !/^[0-9a-f]{16}$/.test(data.salt)) return null;
  const expiresAt = typeof data.reservedUntil === 'string' ? Date.parse(data.reservedUntil) : Number.NaN;
  if (Number.isNaN(expiresAt)) return null;
  const salt = Uint8Array.from(data.salt.match(/../g)!.map((pair) => Number.parseInt(pair, 16)));
  const address = deriveCoinMint(programId, salt);
  const bytes = addressBytes(address);
  if (address !== data.mint || !bytes || !endsWithPedl(bytes)) return null;
  return { hit: { salt, address }, expiresAt };
}

/**
 * One unbound salt from the API's pool, or null: the pool is empty or off, or the API is down. Then
 * grind one (`grindPedlSalt`). A pooled salt is never bound to a creator (`boundToCreator: false`).
 */
export async function takePooledSalt(
  options: { readonly programId?: string; readonly apiUrl?: string; readonly fetch?: FetchLike } = {},
): Promise<PooledHit | null> {
  const programId = options.programId ?? PEDDLES_SOLANA_LAUNCH_PROGRAM_ID;
  const base = (options.apiUrl ?? PEDDLES_API_URL).replace(/\/+$/, '');
  try {
    const doFetch = options.fetch ?? platformFetch();
    const response = await doFetch(`${base}${SALT_PATH}`, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ programId }),
    });
    return response.ok ? readPooledSalt(await response.json(), programId) : null;
  } catch {
    return null;
  }
}
