/**
 * `@peddles/sdk/solana`: build a Peddles Solana launch, read and check it.
 *
 * No dependency at all, not even `viem` or `@solana/web3.js`: every byte is built here (the same code
 * as the Peddles web form, held equal by a parity test). Reads go over a node the caller chooses: a
 * URL, a `@solana/web3.js` `Connection`, or a request function. Nothing here holds a key or signs.
 *
 *   const salt = (await takePooledSalt())?.hit.salt ?? (await grindPedlSalt({ programId, maxTries: 200_000_000 }))?.salt;
 *   const launch = await prepareSolanaLaunch({ rpc, creator, quoteMint, name, symbol, uri, rateBps: 200, excessToCreatorBps: 5000, salt });
 *   if (launch.ok) wallet.signTransaction(VersionedTransaction.deserialize(launch.transaction));
 */

export {
  PEDDLES_SOLANA_LAUNCH_PROGRAM_ID,
  PEDDLES_SOLANA_LAUNCH_LOOKUP_TABLE,
  METEORA_DAMM_V2,
  METEORA_POOL_AUTHORITY,
  METEORA_EVENT_AUTHORITY,
  METAPLEX_TOKEN_METADATA,
  SOLANA_MIN_RATE_BPS,
  SOLANA_MAX_RATE_BPS,
  SOLANA_COIN_DECIMALS,
  SOLANA_COIN_SUPPLY_RAW,
  SOLANA_LAUNCH_QUOTES,
} from './constants.js';
export type { SolanaQuote, SolanaQuoteFamily } from './constants.js';

export {
  ATA_PROGRAM,
  ADDRESS_LOOKUP_TABLE_PROGRAM,
  COMPUTE_BUDGET_PROGRAM,
  SYSTEM_PROGRAM,
  TOKEN_PROGRAM,
  TOKEN_2022_PROGRAM,
  WSOL_MINT,
  addressBytes,
  anchorAccountDiscriminator,
  anchorDiscriminator,
  associatedTokenAddress,
  base58Decode,
  base58Encode,
  base64Decode,
  base64Encode,
  isOnCurve,
  programAddress,
} from './codec.js';

export {
  LAUNCH_COMPUTE_UNITS,
  MAX_COMPUTE_UNITS,
  MAX_NAME_BYTES,
  MAX_SOCIAL_CHARS,
  MAX_SYMBOL_BYTES,
  MAX_TRANSACTION_BYTES,
  MAX_URI_BYTES,
  buildLaunchTransaction,
  compileV0Transaction,
  computeBudgetInstructions,
  deriveCoinMint,
  deriveLaunchAddresses,
  encodeLaunchData,
  launchAccounts,
  launchInstruction,
  launchMetadataDocument,
  peddlesMetadataFields,
  socialLink,
  wrapSolInstructions,
} from './instruction.js';
export type {
  AccountMeta,
  BuiltLaunch,
  Instruction,
  LaunchAccountInputs,
  LaunchAddresses,
  LaunchParams,
  LaunchSocials,
  LaunchTransactionInput,
  LookupTable,
} from './instruction.js';

export {
  decodeConfig,
  decodeLookupTable,
  decodeMint,
  decodeQuoteConfig,
  decodeTokenAccountAmount,
  displayToRaw,
  mintRefusal,
  quoteOffered,
  rawToDisplay,
} from './reads.js';
export type { LaunchConfig, MintFacts, QuoteConfigRead, QuoteRead } from './reads.js';

export {
  getAccounts,
  getEpoch,
  getLatestBlockhash,
  getRecentPriorityFees,
  getRentLamportsPerByte,
  simulateTransaction,
  solanaRpc,
} from './rpc.js';
export type { RpcAccount, SimulationResult, SolanaRpcRequest, SolanaRpcSource } from './rpc.js';

export {
  MAX_PRIORITY_MICRO_LAMPORTS,
  MAX_SQRT_PRICE,
  SOLANA_FLOOR_BPS,
  SOLANA_OPENING_TERMS,
  deltaAmountAUp,
  feeSchedule,
  firstBuyMaxQuote,
  firstBuyMinCoins,
  firstBuyOpening,
  firstBuyQuoteNeeded,
  formatSharePercent,
  launchDepositsLamports,
  liquidityForExactSupply,
  openingMarketCapRaw,
  openingSqrtPrice,
  parseRatePercent,
  priorityBid,
  rateInRange,
  tokenAccountRentLamports,
  volumeSplit,
} from './terms.js';
export type { FirstBuyOpening, OpeningTaxTerms, VolumeSplit } from './terms.js';

export { CoinSaltHasher, PEDL_SUFFIX_VALUE, endsWithPedl, grindChunk, grindPedlSalt, saltBytes } from './grind.js';
export type { GrindChunk, GrindHit, GrindOptions } from './grind.js';

export { PEDDLES_API_URL, readPooledSalt, takePooledSalt } from './saltPool.js';
export type { PooledHit } from './saltPool.js';

export {
  SOLANA_SYMBOL_RE,
  checkSolanaQuote,
  meteoraBadgeAddress,
  openingMarketCapUsdE18,
  parseDecimalUnits,
  prepareSolanaLaunch,
  quoteUsdPerWholeRawE18,
  readLaunchChainState,
  solanaLaunchTerms,
} from './launch.js';
export type {
  LaunchChainState,
  PrepareSolanaLaunchInput,
  PreparedSolanaLaunch,
  QuoteBadgeRead,
  SolanaLaunchTerms,
  SolanaLaunchTermsInput,
  SolanaQuoteCheck,
} from './launch.js';

export {
  FEE_DENOMINATOR,
  LAUNCH_RECORD_LEN,
  baseFeeNumeratorAt,
  configAddress,
  decodeConfigPaused,
  decodeHolderClaim,
  decodeLaunchRecord,
  decodeMeteoraPool,
  decodeMeteoraPosition,
  decodeMetadata,
  feeNumeratorToBps,
  holderClaimAddress,
  launchRecordAddress,
  marketCapQuoteRaw,
  metadataAddress,
  positionShareBps,
  verifyHolderProof,
} from './launchRead.js';
export type { LaunchRecordRead, MeteoraPoolRead, MeteoraPositionRead, MetadataRead } from './launchRead.js';

export { peddlesCreatorAddress, verifyPeddlesMint } from '../solanaVerify.js';
export type { GetSolanaAccount, PeddlesMintCheck, SolanaAccountRead } from '../solanaVerify.js';
