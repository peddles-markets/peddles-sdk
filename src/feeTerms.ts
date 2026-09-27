import type { ReadClient } from './client.js';
import type { Address, Hex } from 'viem';
import { feeHookAbi, liquidityExecutorAbi, stockLaunchpadAbi } from './abis.js';
import { addressOf } from './deployments.js';

/**
 * A launch pool's permanent terms, read from `PeddlesFeeHook`.
 *
 * Every launch pool — stock-paired, WETH-paired, Clog, and both NFT graduations —
 * is registered with the hook once, at launch, and nothing can change these
 * afterwards. What a buyer pays is `creatorTaxBps`; `excessToCreatorBps` decides
 * who receives the part above the fixed 1% (creator vs holders).
 */
export interface PoolTerms {
  readonly poolId: Hex;
  readonly token: Address;
  /** The asset the tax is charged in, and the asset holder rewards pay out in. */
  readonly quote: Address;
  readonly creator: Address;
  /** All-in tax a trader pays, in bps (100..1000). Excludes any opening-window premium. */
  readonly creatorTaxBps: number;
  /** Creator's share of the tax above the fixed 1%, in bps (0..10000). The rest goes to holders. */
  readonly excessToCreatorBps: number;
  /** The pool's `PeddlesHolderRewards` distributor. */
  readonly rewards: Address;
}

/** Why `getPoolTerms` could not answer. It never substitutes a default. */
export type PoolTermsFailure = 'legacy-fee-hook' | 'not-registered' | 'ambiguous';

export class PoolTermsUnavailableError extends Error {
  readonly reason: PoolTermsFailure;
  constructor(reason: PoolTermsFailure, message: string) {
    super(message);
    this.name = 'PoolTermsUnavailableError';
    this.reason = reason;
  }
}

const ZERO_ID = /^0x0{64}$/i;

interface RawPoolConfig {
  quote: Address;
  creatorTaxBps: number;
  excessToCreatorBps: number;
  registered: boolean;
  token: Address;
  creator: Address;
  rewards: Address;
}

/**
 * The launch terms of `token`'s pool on `chainId`.
 *
 * FINDING THE POOL. The hook is keyed by pool id, not by token, so the id comes
 * from the contract that created the pool: `PeddlesStockLaunchpad.coins(token)`
 * for stock-paired coins (including NFT stock graduations), and
 * `PeddlesV4LiquidityExecutor.poolIdFor(token)` for WETH-paired ones. The hook's
 * own record must then name this token and be registered — anything else throws.
 *
 * FAILS CLOSED, the same as the address book:
 *   - a deployment whose hook predates the fixed-terms model throws
 *     (`legacy-fee-hook`) — its third config field meant something else, so
 *     decoding it with this ABI would return a plausible, wrong number;
 *   - a token with no registered launch pool throws (`not-registered`).
 */
export async function getPoolTerms(client: ReadClient, chainId: number, token: Address): Promise<PoolTerms> {
  const hook = addressOf(chainId, 'PeddlesFeeHook');
  const launchpad = addressOf(chainId, 'PeddlesStockLaunchpad');
  const executor = addressOf(chainId, 'PeddlesV4LiquidityExecutor');

  const [factory, coin, wethPoolId] = await client.multicall({
    allowFailure: true,
    contracts: [
      { address: hook, abi: feeHookAbi, functionName: 'holderRewardsFactory' },
      { address: launchpad, abi: stockLaunchpadAbi, functionName: 'coins', args: [token] },
      { address: executor, abi: liquidityExecutorAbi, functionName: 'poolIdFor', args: [token] },
    ],
  });

  // `holderRewardsFactory` exists only on the fixed-terms hook. A hook that does not
  // answer it is the previous model, not a transient failure to be guessed around.
  if (factory.status !== 'success' || /^0x0{40}$/i.test(factory.result as string)) {
    throw new PoolTermsUnavailableError(
      'legacy-fee-hook',
      `PeddlesFeeHook ${hook} on chain ${chainId} does not expose holderRewardsFactory(); ` +
        `this deployment predates fixed launch terms, so they cannot be read from it.`,
    );
  }

  const candidates: Hex[] = [];
  if (coin.status === 'success') {
    const poolId = (coin.result as readonly unknown[])[2] as Hex;
    if (!ZERO_ID.test(poolId)) candidates.push(poolId);
  }
  if (wethPoolId.status === 'success' && !ZERO_ID.test(wethPoolId.result as Hex)) {
    candidates.push(wethPoolId.result as Hex);
  }

  const configs =
    candidates.length === 0
      ? []
      : await client.multicall({
          allowFailure: false,
          contracts: candidates.map(
            (poolId) => ({ address: hook, abi: feeHookAbi, functionName: 'poolConfig', args: [poolId] }) as const,
          ),
        });

  const matches = candidates
    .map((poolId, i) => ({ poolId, config: configs[i] as unknown as RawPoolConfig }))
    .filter(({ config }) => config.registered && config.token.toLowerCase() === token.toLowerCase());

  if (matches.length === 0) {
    throw new PoolTermsUnavailableError(
      'not-registered',
      `No registered Peddles launch pool for ${token} on chain ${chainId}.`,
    );
  }
  if (matches.length > 1) {
    throw new PoolTermsUnavailableError(
      'ambiguous',
      `${token} has more than one registered launch pool on chain ${chainId}; refusing to pick one.`,
    );
  }

  const { poolId, config } = matches[0] as { poolId: Hex; config: RawPoolConfig };
  return {
    poolId,
    token: config.token,
    quote: config.quote,
    creator: config.creator,
    creatorTaxBps: Number(config.creatorTaxBps),
    excessToCreatorBps: Number(config.excessToCreatorBps),
    rewards: config.rewards,
  };
}
