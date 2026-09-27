/**
 * Uniswap v4 tick maths, in `bigint` — a pure port of the web app's
 * `features/launch/tickMath.ts`.
 *
 * The WETH-type launch (`PeddlesLaunchOrchestratorV20.launch`) makes the CALLER do
 * the pool maths: `LaunchInput` carries `sqrtPriceX96`, `tickLower`, `tickUpper`
 * and `liquidity`, and the executor mints exactly the position those describe.
 * Get `liquidity` one wei too high and `modifyLiquidities` reverts.
 *
 *   - `getSqrtPriceAtTick`  ← `StockTickMath.getSqrtPriceAtTick`
 *   - `liquidityForAmount`  ← `_liquidityFor` / `_amountForLiquidity` (VerifyLive.s.sol),
 *                             Uniswap's `getLiquidityForAmount0/1` plus the round-down
 *                             shave the mint's round-UP demands.
 *
 * `number` appears nowhere below the tick index itself (`int24`). Every price and
 * amount is `bigint`.
 */

export const MIN_TICK = -887272;
export const MAX_TICK = 887272;
export const Q96 = 1n << 96n;

const UINT256_MAX = (1n << 256n) - 1n;
const UINT160_MAX = (1n << 160n) - 1n;
const UINT128_MAX = (1n << 128n) - 1n;

/** The exact magic-constant ladder from `StockTickMath`, in bit order. */
const RATIOS: readonly [bigint, bigint][] = [
  [0x2n, 0xfff97272373d413259a46990580e213an],
  [0x4n, 0xfff2e50f5f656932ef12357cf3c7fdccn],
  [0x8n, 0xffe5caca7e10e4e61c3624eaa0941cd0n],
  [0x10n, 0xffcb9843d60f6159c9db58835c926644n],
  [0x20n, 0xff973b41fa98c081472e6896dfb254c0n],
  [0x40n, 0xff2ea16466c96a3843ec78b326b52861n],
  [0x80n, 0xfe5dee046a99a2a811c461f1969c3053n],
  [0x100n, 0xfcbe86c7900a88aedcffc83b479aa3a4n],
  [0x200n, 0xf987a7253ac413176f2b074cf7815e54n],
  [0x400n, 0xf3392b0822b70005940c7a398e4b70f3n],
  [0x800n, 0xe7159475a2c29b7443b29c7fa6e889d9n],
  [0x1000n, 0xd097f3bdfd2022b8845ad8f792aa5825n],
  [0x2000n, 0xa9f746462d870fdf8a65dc1f90e061e5n],
  [0x4000n, 0x70d869a156d2a1b890bb3df62baf32f7n],
  [0x8000n, 0x31be135f97d08fd981231505542fcfa6n],
  [0x10000n, 0x9aa508b5b7a84e1c677de54f3e99bc9n],
  [0x20000n, 0x5d6af8dedb81196699c329225ee604n],
  [0x40000n, 0x2216e584f5fa1ea926041bedfe98n],
  [0x80000n, 0x48a170391f7dc42444e8fa2n],
];

/** `sqrt(1.0001^tick) * 2^96`, identical to the on-chain implementation. Throws on an out-of-range tick. */
export function getSqrtPriceAtTick(tick: number): bigint {
  if (!Number.isInteger(tick)) throw new Error(`tick must be an integer, got ${tick}`);
  const absTick = BigInt(Math.abs(tick));
  if (absTick > BigInt(MAX_TICK)) throw new Error(`tick ${tick} is outside the v4 range`);

  let price =
    (absTick & 0x1n) !== 0n
      ? 0xfffcb933bd6fad37aa2d162d1a594001n
      : 0x100000000000000000000000000000000n;

  for (const [bit, ratio] of RATIOS) {
    if ((absTick & bit) !== 0n) price = (price * ratio) >> 128n;
  }

  if (tick > 0) price = UINT256_MAX / price;

  const sqrtPriceX96 = (price >> 32n) + ((price & 0xffffffffn) === 0n ? 0n : 1n);
  if (sqrtPriceX96 > UINT160_MAX) throw new Error('sqrtPriceX96 overflowed uint160');
  return sqrtPriceX96;
}

function mulDivUp(a: bigint, b: bigint, denominator: bigint): bigint {
  const product = a * b;
  return product / denominator + (product % denominator === 0n ? 0n : 1n);
}

/** Token amount a position of `liquidity` over [sqrtA, sqrtB] costs, rounded UP — how the mint charges. */
export function amountForLiquidity(
  tokenIsCurrency0: boolean,
  sqrtA: bigint,
  sqrtB: bigint,
  liquidity: bigint,
): bigint {
  if (tokenIsCurrency0) {
    const numerator = mulDivUp(liquidity << 96n, sqrtB - sqrtA, sqrtB);
    return numerator / sqrtA + (numerator % sqrtA === 0n ? 0n : 1n);
  }
  return mulDivUp(liquidity, sqrtB - sqrtA, Q96);
}

export interface LiquidityQuote {
  readonly liquidity: bigint;
  readonly sqrtLower: bigint;
  readonly sqrtUpper: bigint;
  /** What the mint will actually pull, rounded up. Always <= the allocation. */
  readonly amountUsed: bigint;
}

/**
 * The largest liquidity whose rounded-up token requirement still fits `amount`.
 * Returns `null` when no liquidity fits — the caller must then refuse the launch, never guess.
 */
export function liquidityForAmount(
  tokenIsCurrency0: boolean,
  tickLower: number,
  tickUpper: number,
  amount: bigint,
): LiquidityQuote | null {
  if (amount <= 0n) return null;

  const sqrtLower = getSqrtPriceAtTick(tickLower);
  const sqrtUpper = getSqrtPriceAtTick(tickUpper);
  if (sqrtUpper <= sqrtLower) return null;

  let liquidity = tokenIsCurrency0
    ? (amount * ((sqrtLower * sqrtUpper) / Q96)) / (sqrtUpper - sqrtLower)
    : (amount * Q96) / (sqrtUpper - sqrtLower);

  if (liquidity > UINT128_MAX) liquidity = UINT128_MAX;

  for (
    let i = 0;
    i < 512 && liquidity > 0n && amountForLiquidity(tokenIsCurrency0, sqrtLower, sqrtUpper, liquidity) > amount;
    i += 1
  ) {
    liquidity -= 1n;
  }

  if (liquidity === 0n) return null;
  const amountUsed = amountForLiquidity(tokenIsCurrency0, sqrtLower, sqrtUpper, liquidity);
  if (amountUsed > amount) return null;

  return { liquidity, sqrtLower, sqrtUpper, amountUsed };
}

/** `sqrtPriceX96` for a token/quote pair at `startTick`, mirroring `startSqrtPriceFor`. */
export function startSqrtPrice(startTick: number, tokenIsCurrency0: boolean): bigint {
  return getSqrtPriceAtTick(tokenIsCurrency0 ? startTick : -startTick);
}
