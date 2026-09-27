/**
 * What share of the money buyers put in a clog routes to the creator.
 *
 * A clog allocation is a share of SUPPLY, but it is sold into the pool buyers are
 * buying from, so it captures a far larger share of the money coming in. That
 * second number is the one a buyer is accepting, and it must be stated wherever
 * the allocation is. This module derives it; nothing here is a lookup table.
 *
 * Pure: no imports, bigint only, no floating point at any step. Every step is
 * exact rational arithmetic, so the result is a fraction `num / den`; the only
 * rounding is in `clogInflowShareBps`, once, at the end.
 *
 * SINGLE SOURCE OF TRUTH. `apps/web/src/features/launch/clogInflow.ts` carries a
 * copy (the web app does not depend on this package). `__tests__/clogInflow.test.ts`
 * imports that copy and holds the two to identical fractions over a grid, so a
 * change to one without the other fails the SDK's tests.
 *
 * ── THE MODEL ───────────────────────────────────────────────────────────────
 * Pure buy flow — nobody but the clog ever sells. That is the most favourable
 * case for the design: any real selling makes the clog sell into a weaker pool.
 *
 *   The pool. A Peddles launch opens a single-sided position from the launch
 *   price upward holding the liquidity share `x0 = supply - clog`. For such a
 *   position, token reserve `x` and quote `y` satisfy
 *
 *       x · (y + x0·p0) = x0² · p0          (a constant product, k)
 *
 *   i.e. constant product against a virtual quote reserve `x0·p0`. Write
 *   `q = y + x0·p0`, so `q0 = x0·p0` and `k = x0·q0`.
 *
 *   One round. Buyers spend `B` (a buy never changes k):   q  ←  q + B
 *   then the clog sells `s = min(slice, remaining)` tokens:
 *
 *       q  ←  k · q / (k + s · q)           (x ← x + s,  q = k / x)
 *
 *   Rounds repeat until the clog is empty. After `n` rounds buyers have put in
 *   `n·B`, and the pool holds `q_n − q0` of it; everything else was paid out to
 *   the creator. So, exactly:
 *
 *       share of inflows  =  1 − (q_n − q0) / (n · B)
 *
 *   Buy flow per round — THE ONE ASSUMPTION. `B = flowMultiple × slice × p0`:
 *   buyers spend between releases `flowMultiple` times what a slice was worth at
 *   the launch price. Default `CLOG_MODEL_FLOW_MULTIPLE` (100).
 *
 *   p0 cancels. Measuring quote in units of `p0` makes every term an integer
 *   count of tokens (`q0 = x0`, `k = x0²`, `B = flowMultiple × slice`), so the
 *   result depends only on (supply, clog, slice) and the flow multiple — never
 *   on the launch price, which is why it can be stated before the pool exists.
 *
 *   The floor. A single-sided position holds no quote below its launch price, so
 *   a release can never take the price under `p0`. If a round's sale would, the
 *   model does not apply and the functions return null rather than a number from
 *   a pool that cannot exist. At flowMultiple = 100 this cannot happen anywhere
 *   in the range the factory accepts (clog ≤ `PeddlesFactoryV20.CLOG_BPS_MAX`,
 *   25%): a round starts at `q ≥ q0`, its buys take at least `x0·B / (x0 + B)`
 *   tokens out of the pool, and a sale `s ≤ clog` fits back under the floor
 *   whenever `99·x0 ≥ 100·s` — true for every `x0 ≥ 75%` and `s ≤ 25%`.
 *
 * ── REFERENCE ───────────────────────────────────────────────────────────────
 * With slices of 1% of supply (`CLOG_TABLE_SLICE_BPS`) and flowMultiple = 100
 * this reproduces the policy table in CLAUDE.md at its 0.1% resolution
 * (5% → 16.5%, 10% → 37.1%, 15% → 54.6%, 25% → 75.0%). A launch type's real
 * slice is smaller — the live Sepolia Clog type sells 5% in 0.25% slices, which
 * is ≈14.2% — so pass the slice the chain reports, never the table's.
 */

/**
 * Buyer spend between two clog releases, as a multiple of what one slice was
 * worth at the launch price. The one assumption in the model; see the header.
 */
export const CLOG_MODEL_FLOW_MULTIPLE = 100n;

/** The slice (1% of supply) at which the model reproduces the CLAUDE.md policy table. */
export const CLOG_TABLE_SLICE_BPS = 100n;

/** More rounds than any registrable launch type can need (25% in 1-unit slices of 10,000). */
const MAX_ROUNDS = 100_000n;

const BPS = 10_000n;

export interface ShareOfInflows {
  /**
   * Share of all buyer money paid out to the creator, as `num / den` (0 ≤ share < 1).
   * Not reduced to lowest terms — compare two shares by cross-multiplying.
   */
  readonly num: bigint;
  readonly den: bigint;
  /** How many releases it takes to sell the whole clog. */
  readonly releases: bigint;
}

export interface ClogModelInput {
  /** Total supply, in any unit — basis points (10000) or raw token units. */
  readonly supply: bigint;
  /** The clog allocation, in the same unit. */
  readonly clog: bigint;
  /** The most one release sells, in the same unit. */
  readonly slice: bigint;
  /** Defaults to `CLOG_MODEL_FLOW_MULTIPLE`. */
  readonly flowMultiple?: bigint;
}

/**
 * The share of buyer money a clog routes to the creator, as an exact fraction,
 * or null when the model does not apply (a malformed input, or a release that
 * would breach the floor). A zero clog captures nothing:
 * `{ num: 0n, den: 1n, releases: 0n }`.
 */
export function clogShareOfInflows(input: ClogModelInput): ShareOfInflows | null {
  const { supply, clog, slice } = input;
  const flowMultiple = input.flowMultiple ?? CLOG_MODEL_FLOW_MULTIPLE;

  if (supply <= 0n || clog < 0n || clog >= supply) return null;
  if (clog === 0n) return { num: 0n, den: 1n, releases: 0n };
  if (slice <= 0n || flowMultiple <= 0n) return null;

  const x0 = supply - clog;
  const k = x0 * x0; // q0 = x0 in units of p0
  const buy = flowMultiple * slice;

  // q = qn / qd, kept as an unreduced exact fraction.
  let qn = x0;
  let qd = 1n;
  let remaining = clog;
  let rounds = 0n;

  while (remaining > 0n) {
    if (rounds >= MAX_ROUNDS) return null;
    rounds += 1n;

    // Buyers spend: q ← q + B.
    qn += buy * qd;

    // The clog sells s tokens: q ← k·q / (k + s·q).
    const sold = remaining < slice ? remaining : slice;
    const nextN = k * qn;
    const nextD = k * qd + sold * qn;

    // Floor: q must not fall below q0 (= x0), i.e. nextN / nextD ≥ x0.
    if (nextN < x0 * nextD) return null;

    // Left unreduced. The fraction almost never reduces, and a gcd on numbers
    // that grow a few dozen bits per round is what makes a 2,500-round type slow.
    qn = nextN;
    qd = nextD;
    remaining -= sold;
  }

  // share = 1 − (q − q0) / (n·B) = (n·B·qd − (qn − x0·qd)) / (n·B·qd)
  const inflow = rounds * buy;
  const den = inflow * qd;
  const num = den - (qn - x0 * qd);
  return { num, den, releases: rounds };
}

/** The same model, stated in basis points of supply — the unit a launch type declares. */
export function clogShareOfInflowsFromBps(
  clogBps: bigint,
  sliceBps: bigint,
  flowMultiple: bigint = CLOG_MODEL_FLOW_MULTIPLE,
): ShareOfInflows | null {
  return clogShareOfInflows({ supply: BPS, clog: clogBps, slice: sliceBps, flowMultiple });
}

/** `num / den` scaled by `unit`, rounded half up. `num ≥ 0`, `den > 0`. */
function roundHalfUp(num: bigint, den: bigint, unit: bigint): bigint {
  return (num * unit * 2n + den) / (den * 2n);
}

/**
 * Share of inflows, in basis points, for a clog of `clogBps` of supply sold in
 * slices of `sliceBps` of supply.
 *
 * Pass the launch type's own `clogSliceBps` (from `getVariantAllocation`), not
 * the policy table's 1%: the slice moves the answer (5% in 1% slices is 1649 bps;
 * in the live 0.25% slices it is 1417 bps).
 *
 * @param clogBps      Clog allocation, bps of total supply.
 * @param sliceBps     Per-release cap, bps of total supply.
 * @param flowMultiple Buyer spend between releases, in slices at the launch
 *                     price. The model's one assumption; defaults to
 *                     `CLOG_MODEL_FLOW_MULTIPLE` (100).
 * @returns Nearest basis point, rounded half up — the only rounding in the model
 *          (use `clogShareOfInflows` for the exact fraction) — or null when the
 *          model does not apply.
 */
export function clogInflowShareBps(
  clogBps: bigint,
  sliceBps: bigint,
  flowMultiple: bigint = CLOG_MODEL_FLOW_MULTIPLE,
): bigint | null {
  const share = clogShareOfInflowsFromBps(clogBps, sliceBps, flowMultiple);
  return share === null ? null : roundHalfUp(share.num, share.den, BPS);
}

/**
 * What share of INFLOWS a clog routes to the creator, given its share of supply —
 * AT THE POLICY TABLE'S 1% SLICE AND 0.1% RESOLUTION.
 *
 * @deprecated Kept for existing callers. It answers for the CLAUDE.md table's
 * assumed slice, not for any real launch type's, so it overstates the live Sepolia
 * Clog type (5%: 1650 here vs 1417 at its real 0.25% slice). Use
 * `clogInflowShareBps(clogBps, allocation.clogSliceBps)`.
 *
 * Output is unchanged for the four table rows (500 → 1650, 1000 → 3710,
 * 1500 → 5460, 2500 → 7500). It is now derived from the model rather than looked
 * up, so any integer clog in [0, 10000) returns a value (a multiple of 10) where
 * it used to return null; non-integer or out-of-range input still returns null.
 */
export function inflowShareBps(clogBps: number): number | null {
  if (!Number.isSafeInteger(clogBps)) return null;
  const share = clogShareOfInflowsFromBps(BigInt(clogBps), CLOG_TABLE_SLICE_BPS);
  if (share === null) return null;
  // Table resolution is 0.1% = 10 bps: round once at that resolution, then restate in bps.
  return Number(roundHalfUp(share.num, share.den, BPS / 10n) * 10n);
}
