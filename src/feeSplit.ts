/**
 * How one charged fee divides — the exact arithmetic `PeddlesFeeHook._book` runs.
 *
 * IMPORT-FREE on purpose, like `clogInflow.ts`: it is pure bigint maths with no
 * runtime, so a UI, an indexer or a test can use it without pulling in viem.
 *
 * THE MODEL (fixed at launch, never changed afterwards):
 *
 *   creatorTaxBps       the ALL-IN rate a trader pays, 100..1000 (1%..10%)
 *   excessToCreatorBps  the creator's share of everything ABOVE the two fixed
 *                       0.50% legs, 0..10000; the rest of that excess is holders'
 *
 *   platform    = fee × 50 / creatorTaxBps                       (floored)
 *   creatorBase = fee × 50 / creatorTaxBps                       (floored)
 *   excess      = fee − platform − creatorBase
 *   creator     = creatorBase + excess × excessToCreatorBps / 10000   (floored)
 *   holders     = fee − platform − creator                      (the remainder)
 *
 * Every floor lands its dust with holders, so `platform + creator + holders`
 * equals `fee` exactly; at `excessToCreatorBps == 10000` the holder leg is 0.
 *
 * `fee` is what the hook CHARGED, in the pool's quote asset. It is not the trade
 * size: the hook charges `gross × creatorTaxBps / 10000` (floored) on an exact-in
 * trade and grosses up an exact-out one. During a pool's opening window the hook
 * uses a different, fixed split (½ liquidity / ¼ creator / ¼ platform) that this
 * function does not model.
 */

/** `PeddlesFeeHook.PLATFORM_FEE_BPS`. */
export const PLATFORM_FEE_BPS = 50;
/** `PeddlesFeeHook.CREATOR_FEE_BPS`. */
export const CREATOR_FEE_BPS = 50;
/** `PeddlesFeeHook.MIN_CREATOR_TAX_BPS` — the two fixed legs added together. */
export const MIN_CREATOR_TAX_BPS = PLATFORM_FEE_BPS + CREATOR_FEE_BPS;
/** `PeddlesFeeHook.MAX_CREATOR_TAX_BPS`. */
export const MAX_CREATOR_TAX_BPS = 1000;
/** Basis-point denominator. */
export const BPS = 10_000;
/** `PeddlesFeeHook.MAX_FEE_AMOUNT` — the largest fee one accrual can represent (int128 max). */
export const MAX_FEE_AMOUNT = (1n << 127n) - 1n;

/** One fee, divided. Base units of the pool's quote asset. */
export interface FeeSplit {
  readonly platform: bigint;
  readonly creator: bigint;
  readonly holders: bigint;
}

function assertBps(label: string, value: number, min: number, max: number): void {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new RangeError(`${label} must be an integer in [${min}, ${max}], got ${String(value)}`);
  }
}

/**
 * Divide a charged fee between platform, creator and holders.
 *
 * Throws `RangeError` for terms `registerPool` would refuse, and for a fee the
 * hook would not charge at all (negative, or above `MAX_FEE_AMOUNT`). Returning a
 * split for either would describe a charge that cannot happen.
 */
export function feeSplit(creatorTaxBps: number, excessToCreatorBps: number, fee: bigint): FeeSplit {
  assertBps('creatorTaxBps', creatorTaxBps, MIN_CREATOR_TAX_BPS, MAX_CREATOR_TAX_BPS);
  assertBps('excessToCreatorBps', excessToCreatorBps, 0, BPS);
  if (typeof fee !== 'bigint') throw new TypeError('fee must be a bigint in base units');
  if (fee < 0n) throw new RangeError(`fee must not be negative, got ${fee}`);
  if (fee > MAX_FEE_AMOUNT) throw new RangeError(`fee ${fee} exceeds MAX_FEE_AMOUNT; the hook charges nothing`);

  const total = BigInt(creatorTaxBps);
  const platform = (fee * BigInt(PLATFORM_FEE_BPS)) / total;
  const creatorBase = (fee * BigInt(CREATOR_FEE_BPS)) / total;
  const excess = fee - platform - creatorBase;
  const creator = creatorBase + (excess * BigInt(excessToCreatorBps)) / BigInt(BPS);
  const holders = fee - platform - creator;
  return { platform, creator, holders };
}
