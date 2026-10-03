import type { ReadClient } from '../client.js';
import { factoryAbi } from '../abis.js';
import { launchOrchestratorAbi, liquidityExecutorLaunchAbi } from './abi.generated.js';
import type { LaunchAddresses } from './addresses.js';
import { liquidityForAmount, getSqrtPriceAtTick } from './tickMath.js';
import { VARIANT_ASSET } from './variants.js';

/**
 * The WETH-type launch plan — everything `PeddlesLaunchOrchestratorV20.launch`
 * needs, derived from LIVE chain reads. A pure port of the web app's
 * `buildWethLaunchPlan` (`features/launch/useWethLaunch.ts`).
 *
 * The orchestrator takes `sqrtPriceX96`, `tickLower`, `tickUpper` and
 * `liquidity` as INPUTS and mints exactly the position they describe, so every
 * one of them is derived from reads:
 *   - fee tier, tick spacing, pool manager, position manager, hook and quote
 *     token come from `PeddlesV4LiquidityExecutor`
 *   - the tick range comes from the executor's `defaultSingleSidedTicks` for THIS
 *     token's predicted address
 *   - the start tick is recovered from that range and the spacing
 *   - the liquidity is the largest that fits the POOLED share of the 1e9 supply
 *   - the allocation is the launch type's own (orchestrator defaults for type 0,
 *     the registered split for any other)
 *
 * Any failed read throws. There is no fallback: a launch assembled from stale
 * pool parameters is a launch that burns a creator's gas.
 */

/** Every Peddles launch is exactly one billion tokens; the orchestrator enforces it. */
export const SUPPLY_UNITS = 1_000_000_000n;
/** Every Peddles token launches at 18 decimals. Not a creator choice. */
export const LAUNCH_COIN_DECIMALS = 18;

export interface WethLaunchPlan {
  readonly predictedToken: `0x${string}`;
  readonly quoteToken: `0x${string}`;
  readonly tokenIsCurrency0: boolean;
  readonly tickLower: number;
  readonly tickUpper: number;
  readonly startTick: number;
  readonly sqrtPriceX96: bigint;
  readonly liquidity: bigint;
  /** Total supply in base units — 1e9 × 10^18. */
  readonly totalSupply: bigint;
  /** The liquidity share of it, in base units — what the position is sized to hold. */
  readonly pooledSupply: bigint;
  readonly poolFeePpm: number;
  readonly tickSpacing: number;
  readonly hook: `0x${string}`;
  readonly poolManager: `0x${string}`;
  readonly positionManager: `0x${string}`;
  readonly liquidityManager: `0x${string}`;
  readonly airdropPublisher: `0x${string}`;
  readonly allocationBps: {
    readonly liquidity: number;
    readonly airdrop: number;
    readonly vesting: number;
    readonly burn: number;
    readonly clog: number;
  };
  /** The clog terms, when this launch type has one. `null` on a plain launch. */
  readonly clog: {
    readonly bps: number;
    readonly sliceBps: number;
    readonly minIntervalSeconds: number;
  } | null;
  /** The launch TYPE this plan was built for; the input builder cannot assemble another. */
  readonly variant: number;
}

export interface WethPlanArgs {
  readonly salt: `0x${string}`;
  /**
   * The account that will SEND the launch (`msg.sender` at the orchestrator; for a handle launch,
   * the handle launcher, with `salt` = `handleSalt(wallet, salt)`). Since 2026-10-01 the
   * orchestrator binds the salt to it, so the predicted address is a function of
   * (creator, variant, salt). REQUIRED: there is no creator-less address.
   */
  readonly creator: `0x${string}`;
  /** The locally mined address this salt must produce; the factory must agree or the plan fails closed. */
  readonly expectedToken?: `0x${string}` | null;
  /** The factory's variant id, as the creator chose it. REQUIRED — there is no default type. */
  readonly variant: number;
  /**
   * How the chain's orchestrator derives the address. Leave it unset: it is then taken from
   * `addresses.saltBinding`, which `launchAddressesFor` / `launchAddressesFromRecord` read from the
   * chain's own record, and is `'creator'` when the addresses carry none (the bound orchestrator:
   * `predictLaunchToken(creator, variant, salt)`). `'none'` is ONLY for a chain whose deployment
   * record has not been promoted to the bound orchestrator yet (no `launchSaltBinding` in
   * `deployments/<chainId>.json`): the address is then the factory's raw-salt
   * `getPeddlesAddress(variant, orchestrator, salt)`, and anyone who sees the salt can take it.
   * Decide it from the chain's record, never from a chain id.
   */
  readonly saltBinding?: 'creator' | 'none';
}

export async function buildWethLaunchPlan(
  client: ReadClient,
  addresses: LaunchAddresses,
  args: WethPlanArgs,
): Promise<WethLaunchPlan> {
  const { orchestrator, factory, liquidityExecutor } = addresses;
  const variant = args.variant;
  const saltBinding = args.saltBinding ?? addresses.saltBinding ?? 'creator';

  const config = await client.multicall({
    allowFailure: false,
    contracts: [
      { address: liquidityExecutor, abi: liquidityExecutorLaunchAbi, functionName: 'quoteToken' },
      { address: liquidityExecutor, abi: liquidityExecutorLaunchAbi, functionName: 'poolManager' },
      { address: liquidityExecutor, abi: liquidityExecutorLaunchAbi, functionName: 'positionManager' },
      { address: liquidityExecutor, abi: liquidityExecutorLaunchAbi, functionName: 'hook' },
      { address: liquidityExecutor, abi: liquidityExecutorLaunchAbi, functionName: 'fee' },
      { address: liquidityExecutor, abi: liquidityExecutorLaunchAbi, functionName: 'tickSpacing' },
      { address: orchestrator, abi: launchOrchestratorAbi, functionName: 'airdropPublisher' },
      { address: orchestrator, abi: launchOrchestratorAbi, functionName: 'defaultLiquidityBps' },
      { address: orchestrator, abi: launchOrchestratorAbi, functionName: 'defaultAirdropBps' },
      { address: orchestrator, abi: launchOrchestratorAbi, functionName: 'defaultVestingBps' },
      { address: orchestrator, abi: launchOrchestratorAbi, functionName: 'defaultBurnBps' },
      // Creator-bound: the orchestrator's own prediction for THIS sender (never the factory's raw-salt
      // address) — unless the chain's record says its orchestrator predates the binding.
      saltBinding === 'none'
        ? { address: factory, abi: factoryAbi, functionName: 'getPeddlesAddress', args: [variant, orchestrator, args.salt] }
        : { address: orchestrator, abi: launchOrchestratorAbi, functionName: 'predictLaunchToken', args: [args.creator, variant, args.salt] },
      { address: factory, abi: factoryAbi, functionName: 'isVariantSupported', args: [variant] },
      { address: orchestrator, abi: launchOrchestratorAbi, functionName: 'feeHook' },
    ],
  });

  const [
    quoteToken,
    poolManager,
    positionManager,
    hook,
    fee,
    tickSpacing,
    airdropPublisher,
    liquidityBps,
    airdropBps,
    vestingBps,
    burnBps,
    predictedToken,
    variantSupported,
    orchestratorHook,
  ] = config as unknown as [
    `0x${string}`,
    `0x${string}`,
    `0x${string}`,
    `0x${string}`,
    number,
    number,
    `0x${string}`,
    number,
    number,
    number,
    number,
    `0x${string}`,
    boolean,
    `0x${string}`,
  ];

  if (!variantSupported) {
    throw new Error('This launch type is not open for new launches, so launching is disabled.');
  }
  // Every launch pool is hooked by the fee hook, and the orchestrator refuses an executor pointed
  // anywhere else. Checked here so a repointed contract refuses with a reason instead of reverting.
  const expected = addresses.feeHook.toLowerCase();
  if (hook.toLowerCase() !== expected || orchestratorHook.toLowerCase() !== expected) {
    throw new Error(
      'The launch contracts on this network are not wired to the trading-fee contract this build expects, so launching is disabled.',
    );
  }
  if (args.expectedToken && predictedToken.toLowerCase() !== args.expectedToken.toLowerCase()) {
    throw new Error(
      'The launch contract predicts a different address for this launch than the one reserved for it. Launching is disabled rather than sending it somewhere else.',
    );
  }

  let alloc = {
    liquidity: Number(liquidityBps),
    airdrop: Number(airdropBps),
    vesting: Number(vestingBps),
    burn: Number(burnBps),
    clog: 0,
  };
  let clogTerms: WethLaunchPlan['clog'] = null;

  if (variant !== VARIANT_ASSET) {
    const declared = (await client.readContract({
      address: factory,
      abi: factoryAbi,
      functionName: 'variantAllocation',
      args: [variant],
    })) as {
      liquidityBps: number;
      airdropBps: number;
      vestingBps: number;
      burnBps: number;
      clogBps: number;
      clogSliceBps: number;
      clogMinInterval: bigint;
    };
    alloc = {
      liquidity: Number(declared.liquidityBps),
      airdrop: Number(declared.airdropBps),
      vesting: Number(declared.vestingBps),
      burn: Number(declared.burnBps),
      clog: Number(declared.clogBps),
    };
    if (alloc.clog > 0) {
      clogTerms = {
        bps: Number(declared.clogBps),
        sliceBps: Number(declared.clogSliceBps),
        minIntervalSeconds: Number(declared.clogMinInterval),
      };
      if (!addresses.clogVaultFactory) {
        throw new Error(
          'This launch type withholds supply into a clog vault, and no clog vault factory is deployed on this chain. Launching is disabled rather than launching without it.',
        );
      }
    }
  }

  if (alloc.airdrop !== 0 || alloc.burn !== 0 || alloc.vesting !== 0) {
    throw new Error(
      `This launch type allocates ${alloc.liquidity}/${alloc.airdrop}/${alloc.vesting}/${alloc.burn}/${alloc.clog} bps (liquidity/airdrop/vesting/burn/clog). Launching is disabled until it matches what this build would state.`,
    );
  }
  if (alloc.liquidity + alloc.clog !== 10_000) {
    throw new Error(`This launch type's allocation sums to ${alloc.liquidity + alloc.clog} bps, not 10000. Launching is disabled.`);
  }

  const [tickLower, tickUpper] = (await client.readContract({
    address: liquidityExecutor,
    abi: liquidityExecutorLaunchAbi,
    functionName: 'defaultSingleSidedTicks',
    args: [predictedToken],
  })) as readonly [number, number];

  const tokenIsCurrency0 = BigInt(predictedToken) < BigInt(quoteToken);
  const spacing = Number(tickSpacing);
  // Exactly the harness's derivation: the start price sits one spacing outside the single-sided
  // range, on the side the token does not occupy.
  const startTick = tokenIsCurrency0 ? Number(tickLower) - spacing : Number(tickUpper) + spacing;
  const sqrtPriceX96 = getSqrtPriceAtTick(startTick);

  const totalSupply = SUPPLY_UNITS * 10n ** BigInt(LAUNCH_COIN_DECIMALS);
  // The position holds the LIQUIDITY share, not the whole supply: on a clog type the rest is minted
  // to the clog vault, and a position sized to the whole supply reverts every clog launch.
  const pooledSupply = (totalSupply * BigInt(alloc.liquidity)) / 10_000n;
  const quote = liquidityForAmount(tokenIsCurrency0, Number(tickLower), Number(tickUpper), pooledSupply);
  if (!quote) {
    throw new Error(
      'No single-sided position fits the pooled supply at the executor’s current tick range, so the pool parameters for this launch cannot be derived.',
    );
  }

  return {
    predictedToken,
    quoteToken,
    tokenIsCurrency0,
    tickLower: Number(tickLower),
    tickUpper: Number(tickUpper),
    startTick,
    sqrtPriceX96,
    liquidity: quote.liquidity,
    totalSupply,
    pooledSupply,
    poolFeePpm: Number(fee),
    tickSpacing: spacing,
    hook,
    poolManager,
    positionManager,
    liquidityManager: liquidityExecutor,
    airdropPublisher,
    allocationBps: { ...alloc },
    clog: clogTerms,
    variant,
  };
}
