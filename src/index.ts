import type { ReadClient } from './client.js';
/**
 * @peddles/sdk — read and build against Peddles launches.
 *
 * ONE PACKAGE, SIX ENTRY POINTS. Take only what you import:
 *
 *   @peddles/sdk               this file — chain resolution, launch reads, pool terms
 *   @peddles/sdk/abis          ABI fragments alone, no runtime
 *   @peddles/sdk/clog          the Clog launch type
 *   @peddles/sdk/deployments   the address book
 *   @peddles/sdk/launch        launch calldata builders, salts, revert decoding
 *   @peddles/sdk/perps         the perp launchpad (PeddlesPerpFactory)
 *
 * `viem` is a PEER dependency, not a bundled one: an integrator already has a
 * client, and two copies of viem in a bundle is both bloat and a source of
 * "instance is not a PublicClient" errors that are miserable to diagnose.
 *
 * WHAT IS DELIBERATELY ABSENT. This package exposes reads and calldata, not
 * infrastructure. `ContractService`, `WalletService` and the log-source used by
 * the indexer stay internal to the monorepo: publishing them would freeze this
 * project's internals as public API and commit it to supporting them.
 */
import type { Address, Hex } from 'viem';
import { encodeAbiParameters, getContractAddress, keccak256 } from 'viem';
import { erc20Abi, factoryAbi } from './abis.js';
import { addressOf, deploymentFor, isKnownChain, UnknownChainError } from './deployments.js';

export {
  DEPLOYMENTS,
  LAUNCH_SALT_BINDINGS,
  addressOf,
  deploymentFor,
  isKnownChain,
  launchSaltBindingFor,
  UnknownChainError,
  UnknownContractError,
  SNOWBALL_FACTORIES,
  snowballFactoryFor,
  requireSnowballFactory,
  SnowballUnavailableError,
} from './deployments.js';
export { snowballTerms, snowballFeeTerms, snowballMinSpend, readSnowballVault } from './launch/snowball.js';
export type { SnowballSplit, SnowballTermsResult, SnowballTermsRefusal, SnowballVaultState } from './launch/snowball.js';
export { snowballFactoryAbi, snowballVaultAbi } from './launch/abi.generated.js';
export type { KnownChainId, ContractName } from './deployments.js';
export type { ReadClient } from './client.js';

export {
  getVariantAllocation,
  getClogVault,
  getClogState,
  inflowShareBps,
  isReleaseReady,
  CLOG_MODEL_FLOW_MULTIPLE,
  CLOG_TABLE_SLICE_BPS,
  clogShareOfInflows,
  clogShareOfInflowsFromBps,
  clogInflowShareBps,
} from './clog.js';
export type { VariantAllocation, ClogState, ShareOfInflows, ClogModelInput } from './clog.js';

export {
  factoryAbi,
  clogVaultAbi,
  clogVaultFactoryAbi,
  erc20Abi,
  tokenV20Abi,
  feeHookAbi,
  stockLaunchpadAbi,
  holderRewardsAbi,
  nftFactoryAbi,
  nftCollectionAbi,
  nftFeeDistributorFactoryAbi,
  nftFeeDistributorAbi,
  nftBondingGraduationOrchestratorAbi,
  nftStockGraduationOrchestratorAbi,
  liquidityExecutorAbi,
} from './abis.js';

export {
  relayParamsHash,
  stockGraduationOptInRequest,
  graduateToStockWithTermsRequest,
  graduateAndBuyRequest,
  predictDistributor,
  getHolderCommitment,
  getDistributorState,
  holderClaimable,
} from './artDex.js';
export type { RelayParams, StockTermsLaunch, HolderCommitment, DistributorState, HolderClaimable } from './artDex.js';

export { getPoolTerms, PoolTermsUnavailableError } from './feeTerms.js';
export type { PoolTerms, PoolTermsFailure } from './feeTerms.js';

export {
  feeSplit,
  PLATFORM_FEE_BPS,
  CREATOR_FEE_BPS,
  MIN_CREATOR_TAX_BPS,
  MAX_CREATOR_TAX_BPS,
  MAX_FEE_AMOUNT,
} from './feeSplit.js';
export type { FeeSplit } from './feeSplit.js';

/** A launched token, as the chain describes it. */
export interface TokenInfo {
  readonly address: Address;
  readonly name: string;
  readonly symbol: string;
  readonly decimals: number;
  readonly totalSupply: bigint;
}

/**
 * Identity and supply, read from the token itself.
 *
 * `decimals` travels with `totalSupply` on purpose. Every amount this SDK
 * returns is a raw `bigint` in base units and MUST be formatted against its own
 * decimals — never assume 18, and never route a token amount through a JS
 * `number`, which loses precision above 2^53 and will silently mis-price a
 * large-supply token.
 */
export async function getTokenInfo(client: ReadClient, token: Address): Promise<TokenInfo> {
  const base = { address: token, abi: erc20Abi } as const;
  const [name, symbol, decimals, totalSupply] = await client.multicall({
    allowFailure: false,
    contracts: [
      { ...base, functionName: 'name' },
      { ...base, functionName: 'symbol' },
      { ...base, functionName: 'decimals' },
      { ...base, functionName: 'totalSupply' },
    ],
  });
  return {
    address: token,
    name: name as string,
    symbol: symbol as string,
    decimals: decimals as number,
    totalSupply: totalSupply as bigint,
  };
}

/**
 * Whether a launch type can be launched on this chain right now.
 *
 * Ask before offering one. A variant with no code registered, or one an owner
 * has retired, reports false — and a UI that offers it anyway sends a creator
 * into a transaction that cannot succeed.
 */
export async function isVariantSupported(
  client: ReadClient,
  chainId: number,
  variant: number,
): Promise<boolean> {
  return (await client.readContract({
    address: addressOf(chainId, 'PeddlesFactoryV20'),
    abi: factoryAbi,
    functionName: 'isVariantSupported',
    args: [variant],
  })) as boolean;
}

/** Everything `PeddlesFactoryV20` hashes into a token's CREATE2 address. */
export interface TokenAddressInput {
  readonly factory: Address;
  readonly variant: number;
  /** The launcher that calls the factory (e.g. the orchestrator), not the end user. */
  readonly sender: Address;
  readonly salt: Hex;
  /** keccak256 of the variant's creation code, as the factory reports it. */
  readonly creationCodeHash: Hex;
}

/**
 * The CREATE2 address, computed locally — the exact formula the factory uses:
 *
 *   boundSalt = keccak256(abi.encode(uint8 variant, address sender, bytes32 salt))
 *   address   = keccak256(0xff ‖ factory ‖ boundSalt ‖ creationCodeHash)[12:]
 *
 * `creationCodeHash` is deliberately an input, not a constant shipped here. For
 * the plain token it is the factory's immutable `TOKEN_CREATION_CODE_HASH`
 * (keccak256 of `type(PeddlesTokenV20).creationCode` in the build that
 * deployed it), and for a registered variant the hash stored at registration.
 * Any recompile moves it, so the deployed factory is the only reliable source —
 * read it with `predictTokenAddress`, or pass one you read yourself.
 */
export function computeTokenAddress(input: TokenAddressInput): Address {
  const boundSalt = keccak256(
    encodeAbiParameters(
      [{ type: 'uint8' }, { type: 'address' }, { type: 'bytes32' }],
      [input.variant, input.sender, input.salt],
    ),
  );
  return getContractAddress({
    opcode: 'CREATE2',
    from: input.factory,
    salt: boundSalt,
    bytecodeHash: input.creationCodeHash,
  });
}

/**
 * The CREATE2 address a launch will deploy to, before it is launched.
 *
 * THE VARIANT IS PART OF THE ADDRESS: the factory binds
 * `keccak256(abi.encode(variant, sender, salt))`, so the same salt under two
 * launch types produces two different addresses. Passing the wrong variant here
 * yields an address the factory will never deploy to.
 *
 * The creation-code hash is read from the deployed factory (`variantInfo`, which
 * returns `TOKEN_CREATION_CODE_HASH` for the plain token), never assumed. An
 * unknown variant throws, as `getPeddlesAddress` does; a retired one still
 * resolves, so an address quoted before retirement stays recoverable.
 */
export async function predictTokenAddress(
  client: ReadClient,
  chainId: number,
  variant: number,
  sender: Address,
  salt: Hex,
): Promise<Address> {
  const factory = addressOf(chainId, 'PeddlesFactoryV20');
  const [, creationCodeHash] = (await client.readContract({
    address: factory,
    abi: factoryAbi,
    functionName: 'variantInfo',
    args: [variant],
  })) as readonly [Address, Hex, boolean];
  if (/^0x0{64}$/i.test(creationCodeHash)) {
    throw new Error(`PeddlesFactoryV20 on chain ${chainId} has no launch type ${variant}.`);
  }
  return computeTokenAddress({ factory, variant, sender, salt, creationCodeHash });
}

/** Chains this build ships an address book for. */
export function supportedChains(): number[] {
  return Object.keys(DEPLOYMENTS_KEYS).map(Number);
}

// Imported lazily-shaped to keep the public surface honest: `supportedChains`
// reads the same generated map every other entry point does.
import { DEPLOYMENTS as DEPLOYMENTS_KEYS } from './deployments.generated.js';
