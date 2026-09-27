import type { ReadClient } from './client.js';
import type { Address } from 'viem';
import { clogVaultAbi, clogVaultFactoryAbi, erc20Abi, factoryAbi } from './abis.js';
import { addressOf } from './deployments.js';

/**
 * The Clog launch type, read from the chain.
 *
 * A clog withholds a share of a launch's supply in a `PeddlesClogVault` and
 * sells it into that launch's own pool a capped slice at a time. The proceeds
 * (native) STAY IN THE VAULT until the creator calls `withdrawProceeds`, and a
 * creator-set release floor bounds the price a release may sell at. It funds marketing without the creator putting up
 * capital — and it only ever extracts from volume that actually arrived, since
 * a sale into an empty book returns nothing and reverts.
 */

/** A launch type's declared economics. Write-once at variant registration. */
export interface VariantAllocation {
  readonly liquidityBps: number;
  readonly airdropBps: number;
  readonly vestingBps: number;
  readonly burnBps: number;
  readonly clogBps: number;
  /** Per-release cap, in bps OF TOTAL SUPPLY — not of the allocation. */
  readonly clogSliceBps: number;
  readonly clogMinIntervalSeconds: bigint;
}

/** One clog vault's live state. */
export interface ClogState {
  readonly vault: Address;
  readonly token: Address;
  readonly creator: Address;
  readonly router: Address;
  /** Raw units still held, i.e. not yet sold. */
  readonly held: bigint;
  /** Raw units sold to date, across every release. */
  readonly totalSold: bigint;
  /** Max raw units one release may sell. */
  readonly sliceCap: bigint;
  readonly minIntervalSeconds: bigint;
  /** What `release` would sell right now. */
  readonly nextSlice: bigint;
  /** Unix seconds at which `release` stops reverting `TooSoon`. */
  readonly readyAt: bigint;
  /** Native proceeds held by the vault, owed to the creator (`withdrawProceeds`). */
  readonly proceedsOwed: bigint;
  /** The creator's minimum release price, 1e18-scaled quote per token; 0 = none. */
  readonly releaseFloorX18: bigint;
}

/**
 * Read a launch type's allocation.
 *
 * `registerVariant` is write-once, so this is the deal a creator and every
 * buyer of their token accepted — it cannot be changed under them afterwards.
 * Read it rather than assuming: the shares differ per launch type, and a clog
 * type is not 100% liquidity.
 */
export async function getVariantAllocation(
  client: ReadClient,
  chainId: number,
  variant: number,
): Promise<VariantAllocation> {
  const a = (await client.readContract({
    address: addressOf(chainId, 'PeddlesFactoryV20'),
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

  return {
    liquidityBps: a.liquidityBps,
    airdropBps: a.airdropBps,
    vestingBps: a.vestingBps,
    burnBps: a.burnBps,
    clogBps: a.clogBps,
    clogSliceBps: a.clogSliceBps,
    clogMinIntervalSeconds: a.clogMinInterval,
  };
}

/** The clog vault a launch's orchestrator created for `token`, or null. */
export async function getClogVault(
  client: ReadClient,
  chainId: number,
  token: Address,
): Promise<Address | null> {
  const vault = (await client.readContract({
    address: addressOf(chainId, 'PeddlesClogVaultFactory'),
    abi: clogVaultFactoryAbi,
    functionName: 'vaultOf',
    args: [addressOf(chainId, 'PeddlesLaunchOrchestratorV20'), token],
  })) as Address;
  return /^0x0{40}$/i.test(vault) ? null : vault;
}

/** Everything about one clog vault, in a single multicall. */
export async function getClogState(client: ReadClient, vault: Address): Promise<ClogState> {
  const base = { address: vault, abi: clogVaultAbi } as const;
  const [token, creator, router, sliceCap, minInterval, totalSold, preview, releaseFloorX18] = await client.multicall({
    allowFailure: false,
    contracts: [
      { ...base, functionName: 'token' },
      { ...base, functionName: 'creator' },
      { ...base, functionName: 'router' },
      { ...base, functionName: 'sliceCap' },
      { ...base, functionName: 'minInterval' },
      { ...base, functionName: 'totalSold' },
      { ...base, functionName: 'previewRelease' },
      { ...base, functionName: 'releaseFloorX18' },
    ],
  });

  const [held, proceedsOwed] = await Promise.all([
    client.readContract({ address: token as Address, abi: erc20Abi, functionName: 'balanceOf', args: [vault] }) as Promise<bigint>,
    client.getBalance({ address: vault }),
  ]);

  const [nextSlice, readyAt] = preview as readonly [bigint, bigint];

  return {
    vault,
    token: token as Address,
    creator: creator as Address,
    router: router as Address,
    held,
    totalSold: totalSold as bigint,
    sliceCap: sliceCap as bigint,
    minIntervalSeconds: minInterval as bigint,
    nextSlice,
    readyAt,
    proceedsOwed,
    releaseFloorX18: releaseFloorX18 as bigint,
  };
}

/**
 * What share of INFLOWS a clog routes to the creator, given its share of supply.
 *
 * THESE ARE NOT THE SAME NUMBER, and the second is the one that matters to a
 * buyer. The allocation is a share of supply, but it is sold into the pool the
 * buyer is buying from, so it captures a much larger share of the money coming
 * in. Surface it wherever the allocation is shown: a launch page that says "5%"
 * and stops has told the buyer the smaller of two true numbers.
 *
 * The model (exact, bigint, documented in `clogInflow.ts`) lives in its own
 * import-free module and is re-exported here.
 */
export {
  CLOG_MODEL_FLOW_MULTIPLE,
  CLOG_TABLE_SLICE_BPS,
  clogShareOfInflows,
  clogShareOfInflowsFromBps,
  clogInflowShareBps,
  inflowShareBps,
} from './clogInflow.js';
export type { ShareOfInflows, ClogModelInput } from './clogInflow.js';

/** True when `release` would not revert `TooSoon`. */
export function isReleaseReady(state: ClogState, nowSeconds: bigint): boolean {
  return nowSeconds >= state.readyAt;
}
