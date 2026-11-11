import { SOLANA_MAX_RATE_BPS, SOLANA_MIN_RATE_BPS } from './constants.js';

/** The opening anti-sniper schedule, as the EVM first-buy step states it. */
export interface OpeningTaxTerms {
  readonly openingTaxBps: number | null;
  readonly windowBlocks: number | null;
  readonly windowSeconds: number | null;
}

/**
 * The launch's money, exact. Ports of `solana/crates/peddles-fees` (`split.rs`, `schedule.rs`,
 * `price.rs`) in `bigint`, so the form states what the program will do. No float touches an amount.
 * Ported from `apps/web/src/features/launch/solana/terms.ts` (the web's UI-only presets left out).
 */

const OPENING_FEE_NUMERATOR = 200_000_000n;
const NUMBER_OF_PERIOD = 180n;
/** `PERIOD_FREQUENCY_SECONDS` in `schedule.rs`: one period a second, so the window is 180 s. */
const PERIOD_FREQUENCY_SECONDS = 1n;

/**
 * The opening schedule in the terms the shared first-buy step states: 20% at the open, falling to
 * the creator's rate over 3 minutes, and the first buy exempt. Solana counts seconds, not blocks,
 * so there is no block count; the wall-clock length is the schedule's own.
 */
export const SOLANA_OPENING_TERMS: OpeningTaxTerms = {
  openingTaxBps: Number(OPENING_FEE_NUMERATOR / 100_000n),
  windowBlocks: null,
  windowSeconds: Number(NUMBER_OF_PERIOD * PERIOD_FREQUENCY_SECONDS),
};

/** `MAX_SQRT_PRICE` in Meteora's `constants.rs`, as `peddles_fees::price`. */
export const MAX_SQRT_PRICE = 79_226_673_521_066_979_257_578_248_091n;

/** At this rate the two fixed legs take everything Meteora leaves: nothing above it to split. */
export const SOLANA_FLOOR_BPS = SOLANA_MIN_RATE_BPS;

/** The percent text as whole basis points, or null. "1.255" is refused, never rounded. */
export function parseRatePercent(text: string): number | null {
  const m = /^(\d{1,2})(?:\.(\d{1,2}))?$/.exec(text.trim());
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
}

export function rateInRange(bps: number | null): bps is number {
  return bps !== null && bps >= SOLANA_MIN_RATE_BPS && bps <= SOLANA_MAX_RATE_BPS;
}

/** `FeeSchedule::for_rate`: option A of design §2.2. */
export function feeSchedule(rateBps: number): { readonly cliff: bigint; readonly reduction: bigint } {
  const rate = BigInt(rateBps) * 100_000n;
  const span = OPENING_FEE_NUMERATOR - rate;
  const reduction = (span + NUMBER_OF_PERIOD - 1n) / NUMBER_OF_PERIOD;
  return { cliff: rate + reduction * NUMBER_OF_PERIOD, reduction };
}

/** One leg of what traders pay, in thousandths of a percent of volume. */
export interface VolumeSplit {
  readonly meteora: bigint;
  readonly platform: bigint;
  readonly creator: bigint;
  readonly holders: bigint;
}

/**
 * Who gets what of the rate, as shares of volume (design §1.4). Meteora's fifth first, the two fixed
 * 0.50% legs, then the excess by the creator's share, with holders taking the remainder.
 */
export function volumeSplit(rateBps: number, excessToCreatorBps: number): VolumeSplit {
  const rate = BigInt(rateBps) * 10n;
  const meteora = rate / 5n;
  const fixed = 500n;
  const excess = rate - meteora - 2n * fixed;
  const creatorExcess = (excess * BigInt(excessToCreatorBps)) / 10_000n;
  return { meteora, platform: fixed, creator: fixed + creatorExcess, holders: excess - creatorExcess };
}

/** "0.25%" from thousandths of a percent. */
export function formatSharePercent(milliPercent: bigint): string {
  const whole = milliPercent / 1000n;
  const fraction = (milliPercent % 1000n).toString().padStart(3, '0').replace(/0+$/, '');
  return `${whole}${fraction ? `.${fraction}` : ''}%`;
}

/* ------------------------------------------------------------------ opening price */

/**
 * The opening `sqrt_price`: the middle of the band the admin set for this quote. The band is what
 * holds the $3.5K start on chain (`QuoteConfig`), and the client takes no dollar price of its own.
 */
export function openingSqrtPrice(minSqrtPrice: bigint, maxSqrtPrice: bigint): bigint | null {
  if (minSqrtPrice <= 0n || maxSqrtPrice < minSqrtPrice) return null;
  return (minSqrtPrice + maxSqrtPrice) / 2n;
}

/** `price::delta_amount_a_up`: Meteora's opening coin amount for `liquidity`. */
export function deltaAmountAUp(sqrtPrice: bigint, liquidity: bigint): bigint | null {
  if (sqrtPrice <= 0n || MAX_SQRT_PRICE <= sqrtPrice) return null;
  const numerator = liquidity * (MAX_SQRT_PRICE - sqrtPrice);
  const denominator = sqrtPrice * MAX_SQRT_PRICE;
  return (numerator + denominator - 1n) / denominator;
}

/** `price::liquidity_for_exact_supply`, or null when no liquidity lands on the supply exactly. */
export function liquidityForExactSupply(sqrtPrice: bigint, supply: bigint): bigint | null {
  if (sqrtPrice <= 0n || MAX_SQRT_PRICE <= sqrtPrice) return null;
  const liquidity = (sqrtPrice * MAX_SQRT_PRICE * supply) / (MAX_SQRT_PRICE - sqrtPrice);
  return liquidity < 1n << 128n && deltaAmountAUp(sqrtPrice, liquidity) === supply ? liquidity : null;
}

export interface FirstBuyOpening {
  /** The creator's normal rate on the buy. */
  readonly fee: bigint;
  /** What Meteora pulls into the pool: at most the buy less the fee. */
  readonly poolQuote: bigint;
  /** What the creator keeps. */
  readonly coins: bigint;
}

/**
 * `split::first_buy_fee` + `price::first_buy_opening`. The first buy is not a swap: the pool opens
 * at √P1, the price the buy reaches, and the coins it does not pull stay with the creator. Null when
 * the buy is too small to move the price or buy a coin, or so large it leaves the range.
 */
export function firstBuyOpening(sqrtPrice: bigint, liquidity: bigint, supply: bigint, quote: bigint, rateBps: number): FirstBuyOpening | null {
  if (liquidity <= 0n || quote <= 0n) return null;
  const fee = (quote * BigInt(rateBps) + 9_999n) / 10_000n;
  const next = sqrtPrice + ((quote - fee) << 128n) / liquidity;
  if (next <= sqrtPrice || next >= MAX_SQRT_PRICE) return null;
  const pool = deltaAmountAUp(next, liquidity);
  if (pool === null || pool >= supply) return null;
  const poolQuote = (liquidity * (next - sqrtPrice) + (1n << 128n) - 1n) >> 128n;
  return { fee, poolQuote, coins: supply - pool };
}

/** The floor sent with the buy: what the form showed, less 0.1% so a rounding unit cannot brick it. */
export function firstBuyMinCoins(coins: bigint): bigint {
  return (coins * 9_990n) / 10_000n;
}

/** Raw quote the wallet needs: a transfer-fee token charges the creator on top, on each transfer. */
export function firstBuyQuoteNeeded(opening: FirstBuyOpening, transferFeeBps: number): bigint {
  const issuerFee = (amount: bigint) => (amount * BigInt(transferFeeBps) + 9_999n) / 10_000n;
  return opening.fee + opening.poolQuote + issuerFee(opening.fee) + issuerFee(opening.poolQuote);
}

/** Supply × opening price, in the quote's raw units. `sqrt_price` is Q64.64 of quote per coin. */
export function openingMarketCapRaw(sqrtPrice: bigint, supply: bigint): bigint {
  return (sqrtPrice * sqrtPrice * supply) >> 128n;
}

/**
 * The largest first buy a quote balance covers, in raw units, under the form's own rule: the buy,
 * its fee and the issuer's transfer fee on each leg leave the wallet, and one smallest unit stays
 * behind (opening the pool takes it). Null when no buy fits: too little to buy a coin, or so much
 * it leaves the band. Never above the true maximum; at most a few base units under it.
 */
export function firstBuyMaxQuote(args: {
  readonly balance: bigint;
  readonly sqrtPrice: bigint;
  readonly liquidity: bigint;
  readonly supply: bigint;
  readonly rateBps: number;
  readonly transferFeeBps: number;
}): bigint | null {
  const { balance, sqrtPrice, liquidity, supply, rateBps, transferFeeBps } = args;
  const budget = balance - 1n;
  if (budget <= 0n) return null;
  // Each unit bought costs at most 1 + the transfer fee of itself, plus rounding on two legs.
  let quote = (budget * 10_000n) / (10_000n + BigInt(transferFeeBps));
  for (let step = 0; step < 8 && quote > 0n; step += 1) {
    const opening = firstBuyOpening(sqrtPrice, liquidity, supply, quote, rateBps);
    if (opening === null) return null;
    if (firstBuyQuoteNeeded(opening, transferFeeBps) <= budget) return quote;
    quote -= 1n;
  }
  return null;
}

/* ------------------------------------------------------------------ what a launch deposits */

/** Account sizes in bytes. Meteora's measured (design §7), ours from `state.rs`, Metaplex's measured. */
// Pool, position, NFT mint, NFT account, coin vault, coin mint, metadata, record, creator coin account.
const BASE_DEPOSIT_BYTES: readonly number[] = [1112, 408, 465, 165, 165, 82, 607, 447, 165];
// Sunrise mints carry the same extension set as xStocks (read 2026-11-07), so the same account size.
const TOKEN_VAULT_BYTES = { plain: 165, xstock: 175, sunrise: 175, prestock: 187 } as const;
const ACCOUNT_OVERHEAD_BYTES = 128n;

/**
 * The rent a launch locks in permanent accounts, from the live rent rate. An estimate: the metadata
 * size moves with the name and link, and Metaplex's own fee has not been measured (design §7).
 */
export function launchDepositsLamports(family: 'wsol' | 'xstock' | 'sunrise' | 'prestock', rentLamportsPerByte: bigint): bigint {
  const vault = family === 'wsol' ? TOKEN_VAULT_BYTES.plain : TOKEN_VAULT_BYTES[family];
  return [...BASE_DEPOSIT_BYTES, vault, vault].reduce((sum, bytes) => sum + (BigInt(bytes) + ACCOUNT_OVERHEAD_BYTES) * rentLamportsPerByte, 0n);
}

/** Rent for one token account of a quote family (its extensions included), from the live rate. */
export function tokenAccountRentLamports(family: 'wsol' | 'xstock' | 'sunrise' | 'prestock', rentLamportsPerByte: bigint): bigint {
  const bytes = family === 'wsol' ? TOKEN_VAULT_BYTES.plain : TOKEN_VAULT_BYTES[family];
  return (BigInt(bytes) + ACCOUNT_OVERHEAD_BYTES) * rentLamportsPerByte;
}

/** Median-ish priority bid from recent fees, capped so it can never exceed 0.001 SOL at 500k units. */
export const MAX_PRIORITY_MICRO_LAMPORTS = 2_000_000n;
export function priorityBid(recent: readonly bigint[]): bigint {
  if (recent.length === 0) return 0n;
  const sorted = [...recent].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const bid = sorted[Math.floor(sorted.length * 0.75)]!;
  return bid > MAX_PRIORITY_MICRO_LAMPORTS ? MAX_PRIORITY_MICRO_LAMPORTS : bid;
}
