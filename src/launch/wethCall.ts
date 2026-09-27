import type { ReadClient } from '../client.js';
import { encodeAbiParameters, encodeFunctionData } from 'viem';
import type { Address, ContractFunctionArgs, Hex } from 'viem';
import { launchOrchestratorAbi, tokenMetadataAbi } from './abi.generated.js';
import { validateFeeTerms, type FeeTerms } from './feeTerms.js';
import { LAUNCH_COIN_DECIMALS, type WethLaunchPlan } from './wethPlan.js';

/**
 * The WETH-type launch call — `PeddlesLaunchOrchestratorV20.launch(LaunchInput)`,
 * or `launchAndBuy(LaunchInput, devBuyValue, minTokensOut)` with a first buy.
 * A pure port of the web app's `buildWethLaunchInput` / `buildWethLaunchCall`
 * (`features/launch/useWethLaunch.ts`), held identical by test.
 *
 * ONE builder, every consumer: the web form, the REST API's `/prepare`, the CLI
 * and the widget all sign exactly these bytes. Assembling the struct twice is how
 * a form ends up simulating one transaction and sending another.
 *
 * `msg.value` is the orchestrator's `launchFee()` plus the first buy. The fee is read LIVE by the
 * caller (it is owner-tunable beneath an immutable cap) and passed in as `launchFeeWei`; the
 * orchestrator takes it off the top and reverts `LAUNCH_FEE_REQUIRED` when the value is short.
 */

/** The components of the `AssetParamsV1` struct `LaunchInput.params` carries — encoded as ONE tuple. */
export const assetParamsV1Components = [
  { name: 'version', type: 'uint8' },
  { name: 'name', type: 'string' },
  { name: 'symbol', type: 'string' },
  { name: 'initialAdmin', type: 'address' },
  { name: 'decimals', type: 'uint8' },
] as const;

/** On-chain metadata carried by `initCalls`. Only these writes are permitted. */
export interface WethMetadata {
  readonly contractUri: string;
  readonly image: string;
  readonly website: string;
  readonly x: string;
  readonly telegram: string;
}

export const EMPTY_WETH_METADATA: WethMetadata = { contractUri: '', image: '', website: '', x: '', telegram: '' };

export interface WethLaunchArgs {
  readonly name: string;
  readonly symbol: string;
  readonly salt: `0x${string}`;
  /** The wallet that will sign. The orchestrator requires `vaultInput.creator == msg.sender`. */
  readonly creator: `0x${string}`;
  /** The creator's permanent fee terms. `null` is refused, never defaulted. */
  readonly feeTerms: FeeTerms | null;
  readonly metadata: WethMetadata;
  readonly plan: WethLaunchPlan;
  /** Native wei spent on the first buy. 0n launches without one. */
  readonly devBuyWei: bigint;
  /** Slippage floor for the first buy, in the launched token's base units. 0n with no first buy. */
  readonly minTokensOut: bigint;
  /** The orchestrator's `launchFee()`, read from the chain. Never assumed. */
  readonly launchFeeWei: bigint;
}

/**
 * The metadata writes, in `initCalls` order. Empty fields are OMITTED rather than
 * written as empty strings — an `extraMetadata("x", "")` entry is a permanent
 * on-chain claim, and clearing it later costs another transaction.
 */
export function buildInitCalls(metadata: WethMetadata): readonly Hex[] {
  const calls: Hex[] = [];
  if (metadata.contractUri.trim().length > 0) {
    calls.push(encodeFunctionData({ abi: tokenMetadataAbi, functionName: 'updateContractURI', args: [metadata.contractUri.trim()] }));
  }
  const entries: readonly [string, string][] = [
    ['image', metadata.image],
    ['website', metadata.website],
    ['x', metadata.x],
    ['telegram', metadata.telegram],
  ];
  for (const [key, value] of entries) {
    if (value.trim().length === 0) continue;
    calls.push(encodeFunctionData({ abi: tokenMetadataAbi, functionName: 'updateExtraMetadata', args: [key, value.trim()] }));
  }
  return calls;
}

/** The `LaunchInput` struct, as the generated ABI types it. */
export type WethLaunchInput = ContractFunctionArgs<typeof launchOrchestratorAbi, 'payable' | 'nonpayable', 'launch'>[0];

export type WethLaunchCall =
  | {
      readonly functionName: 'launch';
      readonly input: WethLaunchInput;
      readonly args: readonly [WethLaunchInput];
      readonly value: bigint;
    }
  | {
      readonly functionName: 'launchAndBuy';
      readonly input: WethLaunchInput;
      readonly args: readonly [WethLaunchInput, bigint, bigint];
      readonly value: bigint;
    };

/** Why these terms cannot ride in a launch, or null when they can. */
export function wethLaunchTermsIssue(feeTerms: FeeTerms | null): string | null {
  if (feeTerms === null) return 'Choose the trading fee for this token before launching.';
  if (validateFeeTerms(feeTerms) !== null) return 'The trading fee or its split is outside the range a launch can set.';
  return null;
}

/** The `LaunchInput` itself. Throws when the terms are missing or out of range. */
export function buildWethLaunchInput(args: WethLaunchArgs, orchestrator: `0x${string}`): WethLaunchInput {
  const { plan, feeTerms } = args;
  const issue = wethLaunchTermsIssue(feeTerms);
  if (issue !== null) throw new Error(issue);
  if (feeTerms === null) throw new Error('Choose the trading fee for this token before launching.');

  return {
    variant: plan.variant,
    salt: args.salt,
    // AssetParamsV1 is a DYNAMIC STRUCT, so it must be encoded as a single tuple (with the leading
    // offset word), never as a flat parameter list — the flat form reverts with EMPTY data.
    params: encodeAbiParameters(
      [{ type: 'tuple', components: assetParamsV1Components }],
      [{ version: 1, name: args.name, symbol: args.symbol, initialAdmin: orchestrator, decimals: LAUNCH_COIN_DECIMALS }],
    ),
    initCalls: [...buildInitCalls(args.metadata)],
    vaultInput: {
      // The orchestrator sets this itself and REJECTS a pre-set one, so it goes in as zero.
      token: '0x0000000000000000000000000000000000000000',
      creator: args.creator,
      // MIRRORS THE LAUNCH TYPE the plan read from the chain; the orchestrator refuses any mismatch.
      liquidityBps: plan.allocationBps.liquidity,
      airdropBps: 0,
      vestingBps: 0,
      burnBps: 0,
      vaultBps: 0,
      clogBps: plan.allocationBps.clog,
      airdropEnabled: false,
      liquidityAmount: plan.pooledSupply,
      airdropAmount: 0n,
      vestingAmount: 0n,
      burnAmount: 0n,
      vestingStart: 0n,
      vestingCliff: 5_184_000n,
      vestingDuration: 46_656_000n,
      airdropStartsAt: 0n,
      airdropEpochLength: 864_000,
      airdropEpochCount: 10,
      burnStartsAt: 0n,
      burnEpochLength: 864_000,
      firstBurnBps: 1_000,
      minVoteBps: 0,
      maxVoteBps: 2_000,
      defaultVoteBps: 1_000,
      quoteToken: plan.quoteToken,
      poolManager: plan.poolManager,
      positionManager: plan.positionManager,
      hook: plan.hook,
      liquidityManager: plan.liquidityManager,
      airdropPublisher: plan.airdropPublisher,
      fee: plan.poolFeePpm,
      tickSpacing: plan.tickSpacing,
    },
    // uint16 on-chain, bounded by `validateFeeTerms` above, so `Number` is exact.
    creatorTaxBps: Number(feeTerms.taxBps),
    excessToCreatorBps: Number(feeTerms.excessToCreatorBps),
    factoryValue: 0n,
    amountPeddles: plan.pooledSupply,
    sqrtPriceX96: plan.sqrtPriceX96,
    tickLower: plan.tickLower,
    tickUpper: plan.tickUpper,
    liquidity: plan.liquidity,
  };
}

/** Assemble the exact call for a launch. `launch` without a first buy, `launchAndBuy` with one. */
export function buildWethLaunchCall(args: WethLaunchArgs, orchestrator: `0x${string}`): WethLaunchCall {
  const input = buildWethLaunchInput(args, orchestrator);
  if (args.devBuyWei < 0n || args.minTokensOut < 0n) throw new Error('A first-buy amount cannot be negative.');
  if (args.launchFeeWei < 0n) throw new Error('The launch fee cannot be negative.');
  if (args.devBuyWei === 0n) {
    // A floor with nothing to spend is `NO_DEV_BUY` on-chain; refused here, never dropped.
    if (args.minTokensOut !== 0n) throw new Error('Set a first-buy amount, or clear the minimum.');
    return { functionName: 'launch', input, args: [input], value: args.launchFeeWei };
  }
  return {
    functionName: 'launchAndBuy',
    input,
    args: [input, args.devBuyWei, args.minTokensOut],
    value: args.launchFeeWei + args.devBuyWei,
  };
}

/** An unsigned transaction: the bytes a wallet, the CLI or an agent signs. */
export interface UnsignedLaunchTx {
  readonly to: `0x${string}`;
  readonly data: Hex;
  /** Native wei to attach. */
  readonly value: bigint;
}

/** The calldata of a WETH-type launch call. */
export function encodeWethLaunchCall(call: WethLaunchCall, orchestrator: `0x${string}`): UnsignedLaunchTx {
  const data =
    call.functionName === 'launchAndBuy'
      ? encodeFunctionData({ abi: launchOrchestratorAbi, functionName: 'launchAndBuy', args: call.args })
      : encodeFunctionData({ abi: launchOrchestratorAbi, functionName: 'launch', args: call.args });
  return { to: orchestrator, data, value: call.value };
}

/**
 * The two launch-fee reads every V20 orchestrator (`PeddlesLaunchOrchestratorV20`,
 * `PeddlesNFTBondingGraduationOrchestratorV20`) exposes since 2026-09-19. Hand-written because it
 * MIRRORS `PeddlesAtomicBaseV20` in `contracts/src/PeddlesV20.sol` ahead of the next ABI
 * regeneration; the signatures are the same ones the stock launchpad has always had.
 */
export const orchestratorLaunchFeeAbi = [
  { type: 'function', name: 'launchFee', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'maxLaunchFee', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
] as const;

export interface OrchestratorLaunchFee {
  /** Exact wei the orchestrator takes off the top of `msg.value`. */
  readonly launchFee: bigint;
  /** Immutable per-deployment ceiling — disclosure, not something to send. */
  readonly maxLaunchFee: bigint;
}

/**
 * A V20 orchestrator's launch fee, READ FROM THE CHAIN. Owner-tunable storage under an immutable
 * cap, so never a constant; a failed read throws rather than falling back to zero.
 */
export async function readOrchestratorLaunchFee(client: ReadClient, orchestrator: Address): Promise<OrchestratorLaunchFee> {
  const [launchFee, maxLaunchFee] = (await client.multicall({
    allowFailure: false,
    contracts: [
      { address: orchestrator, abi: orchestratorLaunchFeeAbi, functionName: 'launchFee' },
      { address: orchestrator, abi: orchestratorLaunchFeeAbi, functionName: 'maxLaunchFee' },
    ],
  })) as readonly [bigint, bigint];
  return { launchFee, maxLaunchFee };
}
