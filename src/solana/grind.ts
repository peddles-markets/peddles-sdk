import { SHA256_IV as IV, addressBytes, base58Encode, isOnCurve, sha256Compress as compress, sha256Expand as expand, utf8Encode } from './codec.js';
import { randomInt32Pair, yieldToEventLoop } from './platform.js';

/**
 * Finding a coin address ending `PEDL`.
 *
 * The program's coin mint is the PDA `[b"coin", salt]` (`launch.rs`), so what is ground is an 8-byte
 * SALT. There is no keypair and nothing secret: the salt goes in the instruction in the clear, and
 * only the program can create the account (design §3.2, the recommended option).
 *
 * THE BUDGET. Design §3.2: "one SHA-256 plus an on-curve check per try (ESTIMATE: tens of seconds of
 * CPU per address)". A base58 ending of four characters is 1 in 58⁴ ≈ 11.3M, and only bump 255 is
 * tried, which is off the curve about half the time, so the mean is ≈ 22.6M tries. Anchor's `bump`
 * is the canonical one, and 255 is canonical whenever it is off the curve. The curve check is a
 * bigint affair, so it runs on a suffix hit only.
 *
 * SHA-256 is the codec's own compression function, driven directly, because a try is two
 * compressions and the general hash, with its buffers, is several times slower. Ported from
 * `apps/web/src/features/launch/solana/grind.ts`; the web's browser worker becomes `grindPedlSalt`.
 */

/** 58⁴ and `PEDL` as base58 digits: the same numbers as `peddles_fees::suffix`. */
const SUFFIX_MODULUS = 11_316_496;
export const PEDL_SUFFIX_VALUE = 4_336_911;

/** The address's value modulo a power of 58: the last characters of its base58 form. */
function suffixValue(bytes: Uint8Array, modulus: number): number {
  let remainder = 0;
  // remainder < 2^24, so one byte at a time stays inside a double's exact range.
  for (const byte of bytes) remainder = (remainder * 256 + byte) % modulus;
  return remainder;
}

export function endsWithPedl(bytes: Uint8Array): boolean {
  return suffixValue(bytes, SUFFIX_MODULUS) === PEDL_SUFFIX_VALUE;
}

/**
 * `sha256("coin" ‖ [creator] ‖ salt ‖ 0xff ‖ program ‖ "ProgramDerivedAddress")`, two blocks either way.
 * A launch now uses the unbound mint `[b"coin", salt]`; a Pre-Launch binds it to the creator with
 * `[b"coin", creator, salt]`, so a reserved address is useless to anyone else.
 */
const PDA_BUMP = 255;
const SEED = utf8Encode('coin');
const MARKER = utf8Encode('ProgramDerivedAddress');

export class CoinSaltHasher {
  private readonly first = new Int32Array(64);
  private readonly second = new Int32Array(64);
  private readonly state = new Int32Array(8);
  /** The block word the salt starts at. A creator's 32 bytes keep it word-aligned. */
  private readonly saltWord: number;

  constructor(program: Uint8Array, creator: Uint8Array | null = null) {
    const prefix = SEED.length + (creator ? 32 : 0);
    const length = prefix + 8 + 1 + 32 + MARKER.length;
    const message = new Uint8Array(128);
    message.set(SEED, 0);
    if (creator) message.set(creator, SEED.length);
    message[prefix + 8] = PDA_BUMP;
    message.set(program, prefix + 9);
    message.set(MARKER, prefix + 41);
    message[length] = 0x80;
    const view = new DataView(message.buffer);
    view.setUint32(124, length * 8);
    this.saltWord = prefix / 4;
    for (let t = 0; t < 16; t++) {
      this.first[t] = view.getInt32(t * 4);
      this.second[t] = view.getInt32(64 + t * 4);
    }
    expand(this.second);
  }

  /** The hash's words for this salt, in `state`. Allocates nothing. */
  hash(saltHigh: number, saltLow: number): Int32Array {
    const { first, second, state, saltWord } = this;
    first[saltWord] = saltHigh;
    first[saltWord + 1] = saltLow;
    expand(first);
    state.set(IV);
    compress(state, first);
    compress(state, second);
    return state;
  }
}

function wordsToBytes(words: Int32Array): Uint8Array {
  const out = new Uint8Array(32);
  const view = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) view.setInt32(i * 4, words[i]!);
  return out;
}

export function saltBytes(high: number, low: number): Uint8Array {
  const out = new Uint8Array(8);
  const view = new DataView(out.buffer);
  view.setInt32(0, high);
  view.setInt32(4, low);
  return out;
}

export interface GrindHit {
  readonly salt: Uint8Array;
  /** The coin mint this salt makes. */
  readonly address: string;
}

export interface GrindChunk {
  readonly hit: GrindHit | null;
  /** Where the next chunk starts. */
  readonly nextLow: number;
}

/**
 * `tries` salts from (`high`, `low`). `modulus`/`target` are `PEDL`'s; a test passes a shorter
 * ending. Off the curve is required: an on-curve hash is not a PDA, so that salt is passed over.
 */
export function grindChunk(input: {
  readonly hasher: CoinSaltHasher;
  readonly high: number;
  readonly low: number;
  readonly tries: number;
  readonly modulus?: number;
  readonly target?: number;
}): GrindChunk {
  const { hasher, high, tries, modulus = SUFFIX_MODULUS, target = PEDL_SUFFIX_VALUE } = input;
  // 58ⁿ is a multiple of 2ⁿ, so the low bits of the address reject most tries with no division.
  const lowBits = modulus % 16 === 0 ? 15 : modulus % 4 === 0 ? 3 : 1;
  const wanted = target & lowBits;
  let low = input.low;
  for (let i = 0; i < tries; i++) {
    const words = hasher.hash(high, low);
    const salt = low;
    low = (low + 1) | 0;
    // Words are big-endian, so the address's last byte is the low byte of the last word.
    if ((words[7]! & lowBits) !== wanted) continue;
    const bytes = wordsToBytes(words);
    if (suffixValue(bytes, modulus) !== target) continue;
    if (isOnCurve(bytes)) continue;
    return { hit: { salt: saltBytes(high, salt), address: base58Encode(bytes) }, nextLow: low };
  }
  return { hit: null, nextLow: low };
}

export function programBytes(programId: string): Uint8Array {
  const bytes = addressBytes(programId);
  if (!bytes) throw new Error('The launch program address is not valid.');
  return bytes;
}

/* ------------------------------------------------------------------ the whole search */

export interface GrindOptions {
  readonly programId: string;
  /** Bind the address to this creator: a Pre-Launch (`[b"coin", creator, salt]`). Omit for the unbound mint. */
  readonly creator?: string | null;
  /**
   * The most salts to try before giving up (resolves null). Required: the mean is about 22.6M tries
   * for `PEDL` (tens of seconds of one core), and a search must always end.
   */
  readonly maxTries: number;
  /** Stops the search between chunks: the promise rejects with the signal's reason. */
  readonly signal?: { readonly aborted: boolean; readonly reason?: unknown } | null;
  /** Salts per chunk between event-loop turns. Default 2^18. */
  readonly chunk?: number;
  /** Called after each chunk with the running total of tries. */
  readonly onProgress?: (tries: number) => void;
  /** Where to start, [high, low] as int32; random by default so two searches never walk the same salts. */
  readonly start?: readonly [number, number];
}

/**
 * Find an 8-byte salt whose coin mint PDA ends in `PEDL`. Plain async, no worker: it yields to the
 * event loop between chunks, so run it in a worker or a child process if a UI must stay smooth.
 * Resolves null when `maxTries` is spent with no hit. The API's salt pool (`takePooledSalt`) answers
 * instantly when it has one; grind only when it does not.
 */
export async function grindPedlSalt(options: GrindOptions): Promise<GrindHit | null> {
  const { maxTries } = options;
  if (!Number.isSafeInteger(maxTries) || maxTries <= 0) throw new Error('maxTries must be a positive whole number.');
  const chunk = options.chunk ?? 1 << 18;
  if (!Number.isSafeInteger(chunk) || chunk <= 0) throw new Error('chunk must be a positive whole number.');
  const hasher = new CoinSaltHasher(programBytes(options.programId), options.creator ? programBytes(options.creator) : null);
  const [high, startLow] = options.start ?? (() => {
    const random = randomInt32Pair();
    return [random[0]!, random[1]!] as const;
  })();
  if (!Number.isInteger(high) || !Number.isInteger(startLow)) throw new Error('start is two int32 values.');
  let low = startLow | 0;
  let tried = 0;
  while (tried < maxTries) {
    if (options.signal?.aborted) throw options.signal.reason ?? new Error('The salt search was aborted.');
    const tries = Math.min(chunk, maxTries - tried);
    const result = grindChunk({ hasher, high: high | 0, low, tries });
    if (result.hit) return result.hit;
    low = result.nextLow;
    tried += tries;
    options.onProgress?.(tried);
    await yieldToEventLoop();
  }
  return null;
}
