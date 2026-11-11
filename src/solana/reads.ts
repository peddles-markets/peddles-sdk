import {
  TOKEN_2022_PROGRAM,
  TOKEN_PROGRAM,
  anchorAccountDiscriminator,
  base58Encode,
  readU16LE,
  readU64LE,
} from './codec.js';

export { anchorAccountDiscriminator };

/**
 * Decoding what the chain answers: pure. Ported from `apps/web/src/features/launch/solana/reads.ts`. `QuoteConfig` and `Config` are from
 * `solana/programs/peddles-launch/src/state.rs`, the mint layout from `peddles_fees::mint`, and the
 * transfer-fee and scaled-UI extensions from the real mainnet bytes in
 * `solana/crates/peddles-fees/tests/fixtures/`, which the tests decode.
 */

function hasDiscriminator(data: Uint8Array, name: string): boolean {
  const want = anchorAccountDiscriminator(name);
  return data.length >= 8 && want.every((b, i) => data[i] === b);
}

function readU128LE(data: Uint8Array, at: number): bigint | null {
  const low = readU64LE(data, at);
  const high = readU64LE(data, at + 8);
  return low === null || high === null ? null : (high << 64n) | low;
}

export interface LaunchConfig {
  readonly platformWallet: string;
  readonly launchFeeLamports: bigint;
}

/** `Config`: 8 discriminator, 5 × 32 keys (the platform wallet last), the fee. */
export function decodeConfig(data: Uint8Array): LaunchConfig | null {
  if (!hasDiscriminator(data, 'Config')) return null;
  const launchFeeLamports = readU64LE(data, 168);
  if (launchFeeLamports === null) return null;
  return { platformWallet: base58Encode(data.subarray(136, 168)), launchFeeLamports };
}

export interface QuoteConfigRead {
  readonly mint: string;
  readonly tokenProgram: string;
  readonly decimals: number;
  readonly badge: string;
  readonly enabled: boolean;
  readonly minSqrtPrice: bigint;
  readonly maxSqrtPrice: bigint;
}

/** `QuoteConfig`, in field order. */
export function decodeQuoteConfig(data: Uint8Array): QuoteConfigRead | null {
  if (!hasDiscriminator(data, 'QuoteConfig')) return null;
  const minSqrtPrice = readU128LE(data, 106);
  const maxSqrtPrice = readU128LE(data, 122);
  if (minSqrtPrice === null || maxSqrtPrice === null) return null;
  return {
    mint: base58Encode(data.subarray(8, 40)),
    tokenProgram: base58Encode(data.subarray(40, 72)),
    decimals: data[72]!,
    badge: base58Encode(data.subarray(73, 105)),
    enabled: data[105] !== 0,
    minSqrtPrice,
    maxSqrtPrice,
  };
}

export interface MintFacts {
  readonly tokenProgram: string;
  readonly decimals: number;
  readonly paused: boolean;
  readonly defaultStateFrozen: boolean;
  readonly transferHookSet: boolean;
  /** The transfer fee in force at `epoch`, in basis points; 0 when the mint has none. */
  readonly transferFeeBps: number;
  /**
   * The display multiplier in force at `nowSeconds`, as an exact WAD. The chain stores an f64, and it
   * only ever scales a figure a person reads or types: the split runs on raw units.
   */
  readonly multiplierWad: bigint;
}

const WAD = 10n ** 18n;
const EXT_TRANSFER_FEE = 1;
const EXT_DEFAULT_ACCOUNT_STATE = 6;
const EXT_TRANSFER_HOOK = 14;
const EXT_SCALED_UI = 25;
const EXT_PAUSABLE = 26;
const ACCOUNT_STATE_INITIALIZED = 1;

function multiplierToWad(value: number): bigint | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  const [whole, fraction = ''] = value.toFixed(18).split('.');
  return BigInt(whole!) * WAD + BigInt(fraction.padEnd(18, '0'));
}

/** A mint account's facts as of this epoch and second. Null on anything that is not a mint. */
export function decodeMint(data: Uint8Array, owner: string, epoch: bigint, nowSeconds: bigint): MintFacts | null {
  if ((owner !== TOKEN_PROGRAM && owner !== TOKEN_2022_PROGRAM) || data.length < 82) return null;
  const facts = { tokenProgram: owner, decimals: data[44]!, paused: false, defaultStateFrozen: false, transferHookSet: false, transferFeeBps: 0, multiplierWad: WAD };
  if (data.length === 82) return facts;
  if (data[165] !== 1) return null;

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let at = 166;
  while (at + 4 <= data.length) {
    const type = readU16LE(data, at)!;
    const length = readU16LE(data, at + 2)!;
    if (type === 0) break;
    const start = at + 4;
    if (start + length > data.length) return null;
    if (type === EXT_DEFAULT_ACCOUNT_STATE) facts.defaultStateFrozen = data[start] !== ACCOUNT_STATE_INITIALIZED;
    if (type === EXT_PAUSABLE) facts.paused = data[start + 32] !== 0;
    if (type === EXT_TRANSFER_HOOK) facts.transferHookSet = data.subarray(start + 32, start + 64).some((b) => b !== 0);
    if (type === EXT_TRANSFER_FEE) {
      // Two authorities, the withheld amount, then older and newer: epoch, maximum, basis points.
      const newerEpoch = readU64LE(data, start + 90)!;
      facts.transferFeeBps = readU16LE(data, start + (epoch >= newerEpoch ? 106 : 88))!;
    }
    if (type === EXT_SCALED_UI) {
      // authority, multiplier, the new one's effective timestamp, the new multiplier.
      const effectiveAt = view.getBigInt64(start + 40, true);
      const wad = multiplierToWad(view.getFloat64(nowSeconds >= effectiveAt ? start + 48 : start + 32, true));
      if (wad === null) return null;
      facts.multiplierWad = wad;
    }
    at = start + length;
  }
  return facts;
}

/** Display units a person typed, scaled to raw units, floored. */
export function displayToRaw(displayUnits: bigint, multiplierWad: bigint): bigint {
  return (displayUnits * WAD) / multiplierWad;
}

/** Raw units as the person's wallet shows them. */
export function rawToDisplay(raw: bigint, multiplierWad: bigint): bigint {
  return (raw * multiplierWad) / WAD;
}

/** The balance in a token account: mint 32, owner 32, then the amount. */
export function decodeTokenAccountAmount(data: Uint8Array): bigint | null {
  return readU64LE(data, 64);
}

/** An address lookup table: a 56-byte header, then the addresses. */
export function decodeLookupTable(data: Uint8Array): readonly string[] | null {
  const HEADER = 56;
  if (data.length < HEADER || (data.length - HEADER) % 32 !== 0) return null;
  const out: string[] = [];
  for (let at = HEADER; at < data.length; at += 32) out.push(base58Encode(data.subarray(at, at + 32)));
  return out;
}

/** Why a quote cannot be launched against right now, or null. Mirrors `require_launchable`. */
export function mintRefusal(facts: MintFacts, symbol: string): string | null {
  if (facts.paused) return `${symbol} is paused by its issuer, so a pool cannot move it.`;
  if (facts.defaultStateFrozen) return `New ${symbol} accounts start frozen, so this launch would fail.`;
  if (facts.transferHookSet) return `${symbol} has a transfer hook set, so a pool cannot move it.`;
  return null;
}

/** A listed quote, as the chain has it. */
export interface QuoteRead {
  readonly config: QuoteConfigRead | null;
  readonly mint: MintFacts | null;
}

/**
 * Is this listed quote offered? Only when the program has it enabled and the mint agrees with both
 * `QuoteConfig` and the record: a stock the program has not approved does not appear and fail.
 */
export function quoteOffered(recordedDecimals: number, read: QuoteRead | undefined): boolean {
  if (!read?.config?.enabled || !read.mint) return false;
  return (
    read.mint.decimals === read.config.decimals &&
    read.mint.decimals === recordedDecimals &&
    read.mint.tokenProgram === read.config.tokenProgram
  );
}
