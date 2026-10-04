import { decodeErrorResult, isHex } from 'viem';
import type { Hex } from 'viem';
import { launchErrorsAbi } from './abi.generated.js';
import { TAX_MAX_BPS, TAX_MIN_BPS, formatTaxPercent } from './feeTerms.js';

/**
 * Turn a launch revert into a sentence someone can act on — a port of the web
 * app's `features/launch/txReason.ts`, minus the wallet-specific cases.
 *
 * Every entry maps to a real `require` string or custom error in `contracts/src/`.
 * The table is keyed by the contract's own identifier, so a renamed error stops
 * matching and falls through to the honest generic case. An unrecognised revert
 * returns `raw: null` — a confident wrong reason is worse than "the contract
 * rejected this", because the user acts on it.
 */

const TAX_MIN = formatTaxPercent(TAX_MIN_BPS);
const TAX_MAX = formatTaxPercent(TAX_MAX_BPS);

export const LAUNCH_REVERT_REASONS: Readonly<Record<string, string>> = {
  // ---- PeddlesStockLaunchpad -------------------------------------------------
  POOL_PRICE_MISMATCH:
    'A Uniswap pool for this exact token address and quote already exists at a different price, so the launch cannot initialise it. Prepare again — a fresh salt moves the token to an unused address.',
  QUOTE_NOT_ALLOWED: 'The launchpad does not allow this quote asset. Pick one from the list — anything else fails.',
  LAUNCH_FEE_REQUIRED:
    'The transaction did not carry the launchpad’s launch fee. The fee is read live before signing, so it changed between the quote and the signature — prepare again.',
  NoDevBuy: 'A minimum-tokens-out was set with a dev-buy amount of zero. Either enter an amount to spend, or clear the slippage floor.',
  NoSwapRouter: 'The launchpad has no swap router configured, so it cannot perform a dev buy. Launch without a dev buy, then buy once the pool is live.',
  DevBuySlippage: 'The dev buy would have returned fewer tokens than your minimum. Lower the minimum-tokens-out, or reduce the amount you are spending.',
  QuotePullFailed: 'The quote token could not be pulled from your wallet. Check the approval covers the full dev-buy amount and that your balance still holds it.',
  QuoteApproveFailed: 'The launchpad could not approve the swap router to spend the quote asset. Try a smaller dev buy or launch without one.',
  QuoteRefundFailed: 'The unspent part of the dev buy could not be returned. Nothing was launched.',
  TICK_RANGE: 'The opening price configured for this quote asset is outside the range a pool can hold.',
  TickRange: 'The opening price configured for this quote asset is outside the range a pool can hold.',
  TickLow: 'The opening price configured for this quote asset is outside the range a pool can hold.',
  TickHigh: 'The opening price configured for this quote asset is outside the range a pool can hold.',
  TICK_SPACING: 'The opening price configured for this quote asset is not one this pool can open at.',
  ZERO_QUOTE: 'No quote asset was selected.',
  POOL_INIT_FAILED: 'The pool could not be opened with these settings.',
  HolderRewardsBinding: 'The token’s holder rewards could not be connected during the launch, so nothing launched.',
  ZERO_FEE_HOOK: 'The launchpad has no fee hook, so it cannot open a pool. Nothing launched.',
  UNKNOWN_COIN: 'This token was not launched through this launchpad.',

  // ---- Launched tokens ------------------------------------------------------
  NotifyGasTooLow: 'The transaction ran out of gas for this token’s reward update, so nothing moved. Try again and let your wallet estimate the gas.',

  // ---- PeddlesFeeHook ---------------------------------------------------------
  FeeBelowFloor: `The trading fee is below the ${TAX_MIN}% minimum. Choose a fee between ${TAX_MIN}% and ${TAX_MAX}%.`,
  FeeAboveCap: `The trading fee is above the ${TAX_MAX}% maximum, or the split is outside all to holders and all to you. Choose a fee between ${TAX_MIN}% and ${TAX_MAX}%.`,
  AlreadyRegistered: 'A pool for this token and quote is already set up, so this launch cannot open it.',
  NotRegistered: 'This pool has no Peddles trading fee set up.',

  // ---- PeddlesV4SwapRouter ------------------------------------------------------
  FeeStackingForbidden: 'This pool already charges its trading fee, so the router refuses to add a second fee on top.',
  Slippage: 'The buy would return fewer tokens than your minimum, so it would fail. Lower the minimum or the amount.',

  // ---- PeddlesLaunchOrchestratorV20 (WETH path) ------------------------------
  UNSUPPORTED_VARIANT: 'Peddles does not support this kind of token on this network.',
  CREATOR_MISMATCH: 'The launch was built for a different creator address than the wallet that signed it. Prepare it again for the signing wallet.',
  BAD_FACTORY_VALUE: 'The transaction carried less value than the launch declared.',
  BAD_DEV_BUY_VALUE: 'The transaction carried less value than the first buy. Nothing launched.',
  NO_DEV_BUY: 'A minimum was set with no first buy. Enter an amount to spend, or clear the minimum.',
  NO_SWAP_ROUTER: 'The launch has no swap router to make the first buy through. Launch without a first buy, then buy once the pool is live.',
  DEV_BUY_SLIPPAGE: 'The first buy would return fewer tokens than your minimum, so nothing launched. Lower the minimum or the amount.',
  SUPPLY_MUST_BE_ONE_BILLION: 'Every Peddles launch is exactly 1,000,000,000 tokens. The supply this launch declared does not match.',
  BPS_SUM: 'The allocation legs do not sum to 100%.',
  NO_LAUNCH_BURN: 'Peddles refuses any launch that burns supply.',
  BAD_LIQUIDITY_INPUT: 'The pool settings this launch worked out were rejected. Prepare again so they are recalculated from the current on-chain configuration.',
  BAD_POOL_PARAMS: 'The pool price or liquidity did not match what the launch expects. Prepare again to recalculate them.',
  TOKEN_PREDICTION_MISMATCH: 'The token did not deploy at the address Peddles previewed. Nothing launched; prepare again with a fresh salt.',
  CLOG_NOT_ON_GRADUATION: 'A collection cannot launch a coin that holds supply back.',

  // ---- PeddlesClogVault ---------------------------------------------------------
  FloorUnset: 'The creator has not set a minimum price, so only the creator can sell the next slice.',
  TooSoon: 'The next slice cannot be sold yet. Try again once the interval has passed.',
  NotCreator: 'Only this coin’s creator can do this.',

  // ---- PeddlesSnowballFactory --------------------------------------------------
  NoSnowball: 'A Snowball launch needs a burn share, a liquidity share, or both.',
  VaultShareBelowCreatorLeg: 'Burn, liquidity and creator together must be at least 0.50% of volume.',
  TaxOutOfBand: `The total trading tax must be between ${TAX_MIN}% and ${TAX_MAX}%.`,
  TermsMismatch: 'The launch’s trading fee does not match its Snowball split. Prepare it again from the split.',
  CreatorMustBeVault: 'The launch was built for a different creator than this wallet’s Snowball vault. Prepare it again for the signing wallet and salt.',
  PredictionMismatch: 'The token did not deploy at the address Peddles previewed. Nothing launched; prepare again with a fresh salt.',
  ClogFloorRequired: 'A Snowball launch of a type that holds supply back needs a release floor. Prepare it again.',
  ZeroMinSpend: 'The Snowball vault’s minimum spend cannot be zero.',
  WrongHook: 'The launch contracts on this network are not wired to the trading-fee contract the Snowball factory expects. Nothing launched.',

  // ---- shared ---------------------------------------------------------------
  REENTRANT: 'The contract rejected a nested call for safety. Nothing moved.',
  Reentrant: 'The contract rejected a nested call for safety. Nothing moved.',
  ReentrantCall: 'The contract rejected a nested call for safety. Nothing moved.',
  NOT_OWNER: 'Your wallet is not the owner of this contract.',
  NotOwner: 'Your wallet is not the owner of this contract.',
  Unauthorized: 'Your wallet is not authorised to make this call.',
  ZERO_ADDRESS: 'A required address was zero.',
  ZeroAddress: 'A required address was zero.',
  REFUND_FAILED: 'The excess amount could not be refunded, so the whole transaction failed.',
  RefundFailed: 'The excess amount could not be refunded, so the whole transaction failed.',
  ALLOWANCE: 'The approval on the quote asset does not cover this amount.',
  BALANCE: 'Your balance of the quote asset is lower than the amount this call needs.',
};

export interface DecodedLaunchRevert {
  /** The contract's own error identifier (e.g. `POOL_PRICE_MISMATCH`), or null when unrecognised. */
  readonly raw: string | null;
  /** A sentence, always present. */
  readonly message: string;
}

const ERROR_STRING_SELECTOR = '0x08c379a0';
const PANIC_SELECTOR = '0x4e487b71';

/**
 * Every error in a `cause` chain, top first. DUCK-TYPED, not `instanceof BaseError`: a consumer
 * with its own copy of viem (a monorepo app, a bundler that did not dedupe) throws errors from a
 * different class object, and an `instanceof` check would silently decode nothing.
 */
function causeChain(error: unknown): readonly Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 16 && current && typeof current === 'object'; depth += 1) {
    out.push(current as Record<string, unknown>);
    current = (current as { cause?: unknown }).cause;
  }
  return out;
}

const isHexData = (value: unknown): value is Hex => typeof value === 'string' && isHex(value) && value.length >= 10;

/** The revert data hex carried anywhere in a viem error chain, or null. */
export function revertDataOf(error: unknown): Hex | null {
  for (const e of causeChain(error)) {
    if (isHexData(e['raw'])) return e['raw'];
    if (isHexData(e['data'])) return e['data'];
  }
  return null;
}

/** The identifier revert data names: an `Error(string)` reason or a custom error's name. */
export function revertIdentifier(data: Hex): string | null {
  const selector = data.slice(0, 10).toLowerCase();
  try {
    if (selector === ERROR_STRING_SELECTOR) {
      const decoded = decodeErrorResult({ abi: [{ type: 'error', name: 'Error', inputs: [{ type: 'string' }] }], data });
      const reason = String(decoded.args?.[0] ?? '').trim();
      return reason.length > 0 ? reason : null;
    }
    if (selector === PANIC_SELECTOR) return 'Panic';
    const decoded = decodeErrorResult({ abi: launchErrorsAbi, data });
    return decoded.errorName;
  } catch {
    return null;
  }
}

/** The mapped sentence for a contract identifier, or null when unrecognised. */
export function explainLaunchRevert(identifier: string | null): string | null {
  if (!identifier) return null;
  return LAUNCH_REVERT_REASONS[identifier] ?? null;
}

/**
 * Decode an RPC/contract failure into `{ raw, message }`. Accepts a viem error
 * (from `simulateContract`, `call` or `sendTransaction`), any error whose cause
 * chain carries revert data, or raw revert data.
 */
export function decodeLaunchRevert(error: unknown): DecodedLaunchRevert {
  const data = isHexData(error) ? error : revertDataOf(error);
  // A viem `ContractFunctionRevertedError` already carries the reason / errorName; take it from
  // wherever in the chain it sits. An `Error(string)` reason is the identifier itself.
  let identifier: string | null = null;
  for (const e of causeChain(error)) {
    const reason = e['reason'];
    if (typeof reason === 'string' && reason.trim()) {
      identifier = reason.trim();
      break;
    }
    const nested = e['data'];
    const errorName = nested && typeof nested === 'object' ? (nested as { errorName?: unknown }).errorName : undefined;
    if (typeof errorName === 'string' && errorName !== 'Error') {
      identifier = errorName;
      break;
    }
  }
  if (identifier === null && data) identifier = revertIdentifier(data);

  const mapped = explainLaunchRevert(identifier);
  if (mapped) return { raw: identifier, message: mapped };
  if (identifier) return { raw: identifier, message: 'The contract rejected these settings.' };
  const top = causeChain(error)[0];
  const short = top && typeof top['shortMessage'] === 'string' ? (top['shortMessage'] as string) : null;
  if (short) return { raw: null, message: short };
  return { raw: null, message: error instanceof Error ? error.message : 'The transaction could not be simulated.' };
}

/** A mined-but-reverted receipt carries no reason — the node discarded it. */
export const REVERTED_ON_CHAIN =
  'The transaction was mined and the contract rejected it. Gas was spent; nothing else moved. Open it on the explorer for the failing call.';
