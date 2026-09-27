/**
 * The launch fee terms — one fee model for every launch type, chosen at launch
 * and permanent. A pure port of the web app's `features/launch/feeTerms.ts`
 * (the bigint slice the builders need; the render helpers stay in the web).
 *
 *   taxBps              the all-in tax on every trade, TAX_MIN_BPS..TAX_MAX_BPS
 *   excessToCreatorBps  of everything ABOVE the first BASE_BPS, the fraction
 *                       (0..10000) that goes to the creator; the rest to holders
 *
 * Import-free, bigint only. Nothing here is a `number`.
 */

/** 100% in basis points. */
export const BPS = 10_000n;

/** The all-in tax a launch may choose, inclusive. 1.00% .. 10.00%. */
export const TAX_MIN_BPS = 100n;
export const TAX_MAX_BPS = 1_000n;

/** The first 1.00% of every tax, split evenly and never adjustable. */
export const BASE_BPS = 100n;
export const PLATFORM_BASE_BPS = 50n;
export const CREATOR_BASE_BPS = 50n;

/** `excessToCreatorBps` bounds, inclusive. */
export const EXCESS_MIN_BPS = 0n;
export const EXCESS_MAX_BPS = BPS;

export interface FeeTerms {
  readonly taxBps: bigint;
  readonly excessToCreatorBps: bigint;
}

export type FeeTermsIssue =
  | { readonly field: 'taxBps'; readonly code: 'TAX_BELOW_MIN' | 'TAX_ABOVE_MAX' }
  | { readonly field: 'excessToCreatorBps'; readonly code: 'SPLIT_OUT_OF_RANGE' };

/** The first bound a pair of terms breaks, or null when both are in range. */
export function validateFeeTerms(terms: FeeTerms): FeeTermsIssue | null {
  if (terms.taxBps < TAX_MIN_BPS) return { field: 'taxBps', code: 'TAX_BELOW_MIN' };
  if (terms.taxBps > TAX_MAX_BPS) return { field: 'taxBps', code: 'TAX_ABOVE_MAX' };
  if (terms.excessToCreatorBps < EXCESS_MIN_BPS || terms.excessToCreatorBps > EXCESS_MAX_BPS) {
    return { field: 'excessToCreatorBps', code: 'SPLIT_OUT_OF_RANGE' };
  }
  return null;
}

/** Per-trade split, each leg in units of `BPS * BPS` (= 100% of volume). Exact, no rounding. */
export interface FeeSplitRate {
  readonly platform: bigint;
  readonly creator: bigint;
  readonly holders: bigint;
  readonly total: bigint;
}

/** The exact per-trade split, or null for terms outside the bounds. */
export function feeSplitRate(terms: FeeTerms): FeeSplitRate | null {
  if (validateFeeTerms(terms) !== null) return null;
  const excess = terms.taxBps - BASE_BPS;
  const platform = PLATFORM_BASE_BPS * BPS;
  const creator = CREATOR_BASE_BPS * BPS + excess * terms.excessToCreatorBps;
  const holders = excess * (BPS - terms.excessToCreatorBps);
  return { platform, creator, holders, total: platform + creator + holders };
}

const PERCENT_RE = /^(\d{1,3})(?:\.(\d{0,2}))?$/;

/** "2.5" → 250n. At most two decimal places; anything else is null. Bounds are not checked. */
export function parseTaxPercent(text: string): bigint | null {
  const match = PERCENT_RE.exec(text.trim());
  if (!match) return null;
  const whole = BigInt(match[1]!);
  const frac = BigInt((match[2] ?? '').padEnd(2, '0'));
  return whole * 100n + frac;
}

/** 250n → "2.50". Integer bps only; the percent sign is the caller's. */
export function formatTaxPercent(bps: bigint): string {
  const sign = bps < 0n ? '-' : '';
  const abs = bps < 0n ? -bps : bps;
  return `${sign}${abs / 100n}.${(abs % 100n).toString().padStart(2, '0')}`;
}

/** A `FeeSplitRate` leg as a percent string with up to four decimals, for the render edge only. */
export function formatRatePercent(rate: bigint): string {
  // rate / (BPS*BPS) * 100 = rate / 1_000_000  →  four decimals of a percent.
  const unit = BPS * BPS / 100n / 10_000n; // one 0.0001% in rate units
  const units = rate / unit;
  const whole = units / 10_000n;
  let frac = (units % 10_000n).toString().padStart(4, '0');
  while (frac.length > 2 && frac.endsWith('0')) frac = frac.slice(0, -1);
  return `${whole}.${frac}`;
}
