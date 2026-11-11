import { GULLY_DEPLOYMENTS, type GullyChainId } from './deployments.generated.js';

export { GULLY_DEPLOYMENTS };
export type { GullyChainId };

/** The Peddles core on a Gully Core chain, as the deploy record names it. */
export interface GullyDeployment {
  readonly chainId: number;
  readonly launchpad: `0x${string}`;
  readonly tokenFactory: `0x${string}`;
  readonly registry: `0x${string}`;
  readonly feeHook: `0x${string}`;
  readonly swapRouter: `0x${string}`;
  readonly clogFactory: `0x${string}`;
  readonly rewardsFactory: `0x${string}`;
  /** The ERC-20 every launch quotes in and pays its launch fee in (DAI on Anubis). */
  readonly quoteToken: `0x${string}`;
  readonly firstBlock: number;
  /** The launchpad's immutable LP fee, in pips (1e-6). */
  readonly fee: number;
  readonly tickSpacing: number;
  /** Holder rewards release over this many seconds; an early seller leaves the unpaid part. */
  readonly rewardStreamSeconds: number;
}

/** Thrown for a chain with no Peddles Gully core. Never falls back to another chain or venue. */
export class GullyUnavailableError extends Error {
  constructor(readonly chainId: number) {
    super(`No Peddles Gully launchpad is deployed on chain ${chainId}.`);
    this.name = 'GullyUnavailableError';
  }
}

/** Whether `chainId` launches on Gully Core (Anubis, 6714) rather than Uniswap v4. */
export function isGullyChain(chainId: number): chainId is GullyChainId {
  return Object.prototype.hasOwnProperty.call(GULLY_DEPLOYMENTS, chainId);
}

/** The Gully core on `chainId`; throws `GullyUnavailableError` where there is none. */
export function gullyDeploymentFor(chainId: number): GullyDeployment {
  if (!isGullyChain(chainId)) throw new GullyUnavailableError(chainId);
  const d = GULLY_DEPLOYMENTS[chainId];
  return {
    chainId,
    launchpad: d.PeddlesGullyLaunchpad,
    tokenFactory: d.PeddlesFactoryV20,
    registry: d.PeddlesVaultRegistry,
    feeHook: d.PeddlesPancakeFeeHook,
    swapRouter: d.PeddlesGullySwapRouter,
    clogFactory: d.PeddlesGullyClogVaultFactory,
    rewardsFactory: d.PeddlesGullyStreamingRewardsFactory,
    quoteToken: d.quoteToken,
    firstBlock: d.firstBlock,
    fee: d.fee,
    tickSpacing: d.tickSpacing,
    rewardStreamSeconds: d.rewardStreamSeconds,
  };
}
