import { METAPLEX_TOKEN_METADATA } from './constants.js';
import { addressBytes, anchorAccountDiscriminator, base58Encode, programAddress, readU16LE, readU64LE, sha256, utf8Decode } from './codec.js';

/**
 * A launched Solana coin, as the chain has it: pure decoders, no I/O. Ported from
 * `apps/web/src/features/launch/solana/launchRead.ts`.
 *
 * Ours: `LaunchRecord` and `HolderClaim` from `solana/programs/peddles-launch/src/state.rs` (Anchor:
 * an 8-byte discriminator, then the fields in order, no padding; 455 bytes). Meteora's pool and
 * position from damm-v2 commit `3493cd6` (`state/pool.rs`, `state/position.rs`), the same offsets
 * `apps/solana-keeper/src/layouts.ts` reads, and tested here against the real mainnet pool bytes in
 * `apps/solana-keeper/test/fixtures/mainnet.json`. Metaplex metadata from mpl-token-metadata's
 * `Metadata` (key, update authority, mint, then three Borsh strings).
 */

export const LAUNCH_RECORD_LEN = 455;
const HOLDER_CLAIM_LEN = 8 + 8 + 1;
const METEORA_POOL_LEN = 1112;
const METEORA_POSITION_LEN = 408;
/** `FEE_DENOMINATOR` in Meteora's `constants.rs`: a fee numerator over 1e9; 1 bp is 100,000. */
export const FEE_DENOMINATOR = 1_000_000_000n;

function startsWithBytes(data: Uint8Array, prefix: Uint8Array): boolean {
  if (data.length < prefix.length) return false;
  return prefix.every((b, i) => data[i] === b);
}

function key(data: Uint8Array, at: number): string {
  return base58Encode(data.subarray(at, at + 32));
}

function u128(data: Uint8Array, at: number): bigint {
  const low = readU64LE(data, at);
  const high = readU64LE(data, at + 8);
  if (low === null || high === null) throw new RangeError('u128 out of range');
  return (high << 64n) | low;
}

function u64(data: Uint8Array, at: number): bigint {
  const value = readU64LE(data, at);
  if (value === null) throw new RangeError('u64 out of range');
  return value;
}

function i64(data: Uint8Array, at: number): bigint {
  return new DataView(data.buffer, data.byteOffset, data.byteLength).getBigInt64(at, true);
}

/* ------------------------------------------------------------------ addresses */

export function launchRecordAddress(programId: string, mint: string): string | null {
  const coin = addressBytes(mint);
  return coin ? programAddress(['launch', coin], programId) : null;
}

export function metadataAddress(mint: string): string | null {
  const coin = addressBytes(mint);
  const metaplex = addressBytes(METAPLEX_TOKEN_METADATA);
  return coin && metaplex ? programAddress(['metadata', metaplex, coin], METAPLEX_TOKEN_METADATA) : null;
}

/** `[b"claim", launch, holder]`: what blocks a double claim, created at the holder's cost. */
export function holderClaimAddress(programId: string, launchRecord: string, holder: string): string | null {
  const launch = addressBytes(launchRecord);
  const who = addressBytes(holder);
  return launch && who ? programAddress(['claim', launch, who], programId) : null;
}

/** `[b"config"]`: the guardian's pause for every launch is on it. */
export function configAddress(programId: string): string | null {
  return programAddress(['config'], programId);
}

/* ------------------------------------------------------------------ our accounts */

export interface LaunchRecordRead {
  readonly coinMint: string;
  readonly quoteMint: string;
  readonly quoteTokenProgram: string;
  readonly pool: string;
  readonly position: string;
  readonly positionNftMint: string;
  readonly positionNftAccount: string;
  readonly feeVault: string;
  /** Creator of record. Write-once. */
  readonly creator: string;
  readonly rateBps: number;
  readonly excessToCreatorBps: number;
  /** Unix seconds: the pool's activation. */
  readonly activationPoint: bigint;
  /** The only term that changes. */
  readonly creatorPayout: string;
  readonly platformOwed: bigint;
  readonly creatorOwed: bigint;
  readonly holderFunded: bigint;
  readonly holderClaimed: bigint;
  readonly holderRecovered: bigint;
  readonly activeRoot: Uint8Array;
  readonly activeTotal: bigint;
  readonly activeEpoch: bigint;
  readonly lastRootAt: bigint;
  /** The guardian stopped roots and holder claims on this launch. */
  readonly paused: boolean;
}

/**
 * The record, or null when these bytes are not a launch record naming this mint. A missing or
 * foreign record means the coin is not a Peddles launch, whatever pools exist for it.
 */
export function decodeLaunchRecord(data: Uint8Array, mint: string): LaunchRecordRead | null {
  if (data.length !== LAUNCH_RECORD_LEN || !startsWithBytes(data, anchorAccountDiscriminator('LaunchRecord'))) return null;
  if (key(data, 8) !== mint) return null;
  const paused = data[454]!;
  if (paused > 1) return null;
  return {
    coinMint: key(data, 8),
    quoteMint: key(data, 40),
    quoteTokenProgram: key(data, 72),
    pool: key(data, 104),
    position: key(data, 136),
    positionNftMint: key(data, 168),
    positionNftAccount: key(data, 200),
    feeVault: key(data, 232),
    creator: key(data, 264),
    rateBps: readU16LE(data, 296)!,
    excessToCreatorBps: readU16LE(data, 298)!,
    activationPoint: i64(data, 300),
    // 308 cliff_fee_numerator, 316 reduction_factor, 324 bump, 325 fee_vault_bump.
    creatorPayout: key(data, 326),
    platformOwed: u64(data, 358),
    creatorOwed: u64(data, 366),
    holderFunded: u64(data, 374),
    holderClaimed: u64(data, 382),
    holderRecovered: u64(data, 390),
    activeRoot: data.slice(398, 430),
    activeTotal: u64(data, 430),
    activeEpoch: u64(data, 438),
    lastRootAt: i64(data, 446),
    paused: paused === 1,
  };
}

/** `HolderClaim.claimed`: cumulative, in the units sent from the vault. Null on foreign bytes. */
export function decodeHolderClaim(data: Uint8Array): bigint | null {
  if (data.length !== HOLDER_CLAIM_LEN || !startsWithBytes(data, anchorAccountDiscriminator('HolderClaim'))) return null;
  return readU64LE(data, 8);
}

/** `Config.paused`, the last byte but one (the bump is last). Null on foreign bytes. */
export function decodeConfigPaused(data: Uint8Array): boolean | null {
  const CONFIG_LEN = 8 + 32 * 5 + 8 + 1 + 1;
  if (data.length !== CONFIG_LEN || !startsWithBytes(data, anchorAccountDiscriminator('Config'))) return null;
  const byte = data[CONFIG_LEN - 2]!;
  return byte > 1 ? null : byte === 1;
}

/* ------------------------------------------------------------------ Meteora */

/** `pool_status`: 0 enabled. Anything else and swaps are off (Meteora's `set_pool_status`). */
export const POOL_STATUS_ENABLED = 0;
/** `BaseFeeMode::FeeTimeSchedulerLinear`, what a launch opens with. Other modes are not decoded here. */
const BASE_FEE_MODE_LINEAR = 0;
const BPS_DENOMINATOR = 10_000n;

export interface MeteoraPoolRead {
  readonly tokenAMint: string;
  readonly tokenBMint: string;
  readonly tokenAVault: string;
  readonly tokenBVault: string;
  readonly liquidity: bigint;
  /** Q64.64. */
  readonly sqrtPrice: bigint;
  readonly activationPoint: bigint;
  readonly activationType: number;
  readonly poolStatus: number;
  readonly collectFeeMode: number;
  readonly baseFee: {
    readonly cliffFeeNumerator: bigint;
    readonly mode: number;
    readonly numberOfPeriod: number;
    readonly periodFrequency: bigint;
    readonly reductionFactor: bigint;
  };
  /** A volatility fee on top of the base fee. Ours is opened without one; an operator can add it. */
  readonly dynamicFeeOn: boolean;
}

export function decodeMeteoraPool(data: Uint8Array): MeteoraPoolRead | null {
  if (data.length !== METEORA_POOL_LEN || !startsWithBytes(data, anchorAccountDiscriminator('Pool'))) return null;
  // pool_fees (8..168): base fee info 32 bytes, three fee percents, padding, then the dynamic fee.
  return {
    baseFee: {
      cliffFeeNumerator: u64(data, 8),
      mode: data[16]!,
      numberOfPeriod: readU16LE(data, 22)!,
      periodFrequency: u64(data, 24),
      reductionFactor: u64(data, 32),
    },
    dynamicFeeOn: data[56] !== 0,
    tokenAMint: key(data, 168),
    tokenBMint: key(data, 200),
    tokenAVault: key(data, 232),
    tokenBVault: key(data, 264),
    // 296 whitelisted_vault, 328 partner.
    liquidity: u128(data, 360),
    sqrtPrice: u128(data, 456),
    activationPoint: u64(data, 472),
    activationType: data[480]!,
    poolStatus: data[481]!,
    collectFeeMode: data[484]!,
  };
}

/**
 * The base fee numerator in force at `now` (the pool's own activation units: seconds for ours), a
 * port of Meteora's linear time scheduler (`peddles_fees::schedule::fee_numerator_at`). Null for a mode this page does not decode: an unknown fee is
 * shown as unknown, never as the launch rate.
 */
export function baseFeeNumeratorAt(pool: MeteoraPoolRead, now: bigint): bigint | null {
  const { cliffFeeNumerator, mode, numberOfPeriod, periodFrequency, reductionFactor } = pool.baseFee;
  if (periodFrequency === 0n || numberOfPeriod === 0) return cliffFeeNumerator;
  const periods = BigInt(numberOfPeriod);
  const elapsed = now < pool.activationPoint ? periods : (now - pool.activationPoint) / periodFrequency;
  const period = elapsed < periods ? elapsed : periods;
  if (mode === BASE_FEE_MODE_LINEAR) {
    const drop = reductionFactor * period;
    return drop > cliffFeeNumerator ? 0n : cliffFeeNumerator - drop;
  }
  // Exponential and the market-cap schedulers round in Q64 fixed point; a port that is only close
  // would show a fee the pool does not charge.
  return null;
}

/** A fee numerator in basis points, exact to two places: `{ whole, hundredths }` of a bp. */
export function feeNumeratorToBps(numerator: bigint): { readonly bps: bigint; readonly hundredths: bigint } {
  const hundredthsTotal = numerator / 1_000n;
  return { bps: hundredthsTotal / 100n, hundredths: hundredthsTotal % 100n };
}

export interface MeteoraPositionRead {
  readonly pool: string;
  readonly totalLiquidity: bigint;
  readonly permanentLockedLiquidity: bigint;
}

export function decodeMeteoraPosition(data: Uint8Array): MeteoraPositionRead | null {
  if (data.length !== METEORA_POSITION_LEN || !startsWithBytes(data, anchorAccountDiscriminator('Position'))) return null;
  const liquidityAt = 8 + 32 * 4 + 16;
  const unlocked = u128(data, liquidityAt);
  const vested = u128(data, liquidityAt + 16);
  const permanent = u128(data, liquidityAt + 32);
  return { pool: key(data, 8), totalLiquidity: unlocked + vested + permanent, permanentLockedLiquidity: permanent };
}

/** Our position's share of the pool's liquidity, in basis points, floored. Null on an empty pool. */
export function positionShareBps(position: MeteoraPositionRead, pool: MeteoraPoolRead): bigint | null {
  if (pool.liquidity === 0n) return null;
  return (position.totalLiquidity * BPS_DENOMINATOR) / pool.liquidity;
}

/**
 * The market cap in RAW quote units: supply × price, where the pool's price of one raw coin unit
 * in raw quote units is `(sqrt_price / 2^64)²`. Exact integer arithmetic, floored.
 */
export function marketCapQuoteRaw(sqrtPrice: bigint, coinSupplyRaw: bigint): bigint {
  return (coinSupplyRaw * sqrtPrice * sqrtPrice) >> 128n;
}

/* ------------------------------------------------------------------ Metaplex */

export interface MetadataRead {
  readonly updateAuthority: string;
  readonly mint: string;
  readonly name: string;
  readonly symbol: string;
  readonly uri: string;
}

const decoder = { decode: utf8Decode };

/** Metaplex `Metadata`: key 4, the update authority, the mint, then name, symbol, uri. */
export function decodeMetadata(data: Uint8Array, mint: string): MetadataRead | null {
  if (data.length < 1 + 64 + 12 || data[0] !== 4) return null;
  if (key(data, 33) !== mint) return null;
  let at = 65;
  const strings: string[] = [];
  for (let i = 0; i < 3; i++) {
    const length = data[at]! | (data[at + 1]! << 8) | (data[at + 2]! << 16) | (data[at + 3]! << 24);
    at += 4;
    if (length < 0 || at + length > data.length) return null;
    // Metaplex pads each field with NULs to its maximum; they are not part of the text.
    strings.push(decoder.decode(data.subarray(at, at + length)).replace(/\0+$/u, ''));
    at += length;
  }
  return { updateAuthority: key(data, 1), mint, name: strings[0]!, symbol: strings[1]!, uri: strings[2]! };
}

/* ------------------------------------------------------------------ merkle */

function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

function u64Bytes(value: bigint): Uint8Array {
  const out = new Uint8Array(8);
  let rest = value;
  for (let i = 0; i < 8; i++) {
    out[i] = Number(rest & 0xffn);
    rest >>= 8n;
  }
  return out;
}

function compareBytes(a: Uint8Array, b: Uint8Array): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i]! - b[i]!;
  return a.length - b.length;
}

/**
 * `peddles_fees::merkle`, as the keeper builds it: leaf = sha256(0x00 ‖ launch ‖ holder ‖ amount
 * u64 LE), node = sha256(0x01 ‖ min ‖ max). True only when the proof reaches `root`.
 */
export function verifyHolderProof(input: {
  readonly launchRecord: string;
  readonly holder: string;
  readonly cumulativeAmount: bigint;
  readonly proof: readonly Uint8Array[];
  readonly root: Uint8Array;
}): boolean {
  const launch = addressBytes(input.launchRecord);
  const holder = addressBytes(input.holder);
  if (!launch || !holder || input.proof.length > 24 || input.cumulativeAmount < 0n || input.cumulativeAmount >= 1n << 64n) return false;
  let computed = sha256(concatBytes([Uint8Array.of(0), launch, holder, u64Bytes(input.cumulativeAmount)]));
  for (const sibling of input.proof) {
    const [left, right] = compareBytes(computed, sibling) <= 0 ? [computed, sibling] : [sibling, computed];
    computed = sha256(concatBytes([Uint8Array.of(1), left, right]));
  }
  return compareBytes(computed, input.root) === 0;
}
