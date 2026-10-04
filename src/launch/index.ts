/**
 * @peddles/sdk/launch — build a Peddles launch transaction, non-custodially.
 *
 * Pure builders ported from the web app's launch forms and held identical by
 * test: the same salt miner, plan, input and call assembly the forms sign, so
 * the REST API, the CLI, the widget and an AI agent all produce EXACTLY the bytes
 * a creator would have signed in the app.
 *
 * Nothing here holds a key or sends a transaction. Every function returns data
 * (`to`, `data`, `value`) for something else to sign. Every address, decimal,
 * tick and fee is read from the active chain through the `PublicClient` you pass
 * in; nothing is a constant.
 */
export {
  ADDRESS_SUFFIX,
  ZERO_SALT,
  boundSalt,
  LAUNCH_SALT_DOMAIN,
  HANDLE_SALT_DOMAIN,
  domainBoundSalt,
  launchSalt,
  handleSalt,
  applySaltBindings,
  orchestratorBindings,
  handleQuoteBindings,
  handleStockBindings,
  create2Address,
  hasSuffix,
  randomSalt,
  mineSalt,
  MiningAbortedError,
  MiningExhaustedError,
} from './salt.js';
export type { MineParams, MinedSalt, SaltBinding } from './salt.js';

export { MIN_TICK, MAX_TICK, Q96, getSqrtPriceAtTick, amountForLiquidity, liquidityForAmount, startSqrtPrice } from './tickMath.js';
export type { LiquidityQuote } from './tickMath.js';

export {
  BPS,
  TAX_MIN_BPS,
  TAX_MAX_BPS,
  BASE_BPS,
  PLATFORM_BASE_BPS,
  CREATOR_BASE_BPS,
  EXCESS_MIN_BPS,
  EXCESS_MAX_BPS,
  validateFeeTerms,
  feeSplitRate,
  parseTaxPercent,
  formatTaxPercent,
  formatRatePercent,
} from './feeTerms.js';
export type { FeeTerms, FeeTermsIssue, FeeSplitRate } from './feeTerms.js';

export { launchAddressesFor, launchAddressesFromRecord } from './addresses.js';
export type { LaunchAddresses } from './addresses.js';

export { VARIANT_ASSET, BPS_DENOMINATOR, resolveTerms, readLaunchVariants, variantForType } from './variants.js';
export type { VariantAllocation, LaunchTypeShape, ResolvedTerms, LaunchVariant, LaunchTypeName } from './variants.js';

export { SUPPLY_UNITS, LAUNCH_COIN_DECIMALS, buildWethLaunchPlan } from './wethPlan.js';
export type { WethLaunchPlan, WethPlanArgs } from './wethPlan.js';

export {
  assetParamsV1Components,
  EMPTY_WETH_METADATA,
  buildInitCalls,
  wethLaunchTermsIssue,
  buildWethLaunchInput,
  buildWethLaunchCall,
  encodeWethLaunchCall,
  orchestratorLaunchFeeAbi,
  readOrchestratorLaunchFee,
} from './wethCall.js';
export type { WethMetadata, WethLaunchArgs, WethLaunchInput, WethLaunchCall, UnsignedLaunchTx, OrchestratorLaunchFee } from './wethCall.js';

export {
  stockLaunchTermsIssue,
  buildStockLaunchCall,
  encodeStockLaunchCall,
  encodeStockApproval,
  erc20ApprovalAbi,
  readStockAllowance,
  readStockLaunchFee,
  readStockMiningInputs,
  predictStockCoin,
  readStockQuotes,
  isQuoteAllowed,
} from './stockCall.js';
export type { StockLaunchArgs, StockLaunchCall, StockLaunchFee, StockMiningInputs, StockQuote } from './stockCall.js';

export { LAUNCH_REVERT_REASONS, REVERTED_ON_CHAIN, revertDataOf, revertIdentifier, explainLaunchRevert, decodeLaunchRevert } from './revert.js';
export type { DecodedLaunchRevert } from './revert.js';

export {
  launchOrchestratorAbi,
  stockLaunchpadLaunchAbi,
  handleLauncherLaunchAbi,
  liquidityExecutorLaunchAbi,
  tokenMetadataAbi,
  launchErrorsAbi,
  snowballFactoryAbi,
  snowballVaultAbi,
} from './abi.generated.js';

export {
  snowballTerms,
  snowballFeeTerms,
  snowballMinSpend,
  clogFloorAtOpen,
  buildSnowballStockLaunch,
  buildSnowballQuoteLaunch,
  encodeSnowballLaunch,
  predictSnowballVault,
  predictSnowballStockToken,
  predictSnowballQuoteToken,
  prepareSnowballQuotePlan,
  readSnowballVault,
} from './snowball.js';
export type {
  SnowballSplit,
  SnowballTermsResult,
  SnowballTermsRefusal,
  SnowballContractCall,
  SnowballStockLaunchArgs,
  SnowballStockLaunchCall,
  SnowballQuoteLaunchArgs,
  SnowballQuoteLaunchCall,
  SnowballQuotePlan,
  SnowballVaultState,
} from './snowball.js';
export { SNOWBALL_FACTORIES, snowballFactoryFor, requireSnowballFactory, SnowballUnavailableError } from '../deployments.js';

export { predictLaunchToken, predictHandleQuoteToken, predictHandleStockToken } from './handle.js';
