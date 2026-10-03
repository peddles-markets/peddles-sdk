import type { Address, Hex } from 'viem';
import type { ReadClient } from '../client.js';
import { handleLauncherLaunchAbi, launchOrchestratorAbi } from './abi.generated.js';

/**
 * Creator-bound address predictions — one chain read each (owner, 2026-10-01: a launch's predicted
 * address is bound to the creator's wallet on every launch path, on every chain).
 *
 *   WETH/USDC/WBNB and Clog launches  → `predictLaunchToken(orchestrator, creator, variant, salt)`
 *   handle launch, quote leg          → `predictHandleQuoteToken(handleLauncher, wallet, variant, salt)`
 *   handle launch, stock leg          → `predictHandleStockToken(handleLauncher, wallet, salt, name, symbol)`
 *   stock launch, direct              → `predictStockCoin` (stockCall.ts; already creator-bound)
 *
 * `creator` / `wallet` is the account that SENDS the launch transaction. The same salt from any
 * other account predicts — and deploys — a different address. Each read throws on failure, and an
 * orchestrator or launcher without these functions is the pre-2026-10-01 unbound build: the read
 * reverts and the caller must disable the launch rather than fall back to the factory's address.
 */
export async function predictLaunchToken(
  client: ReadClient,
  orchestrator: Address,
  creator: Address,
  variant: number,
  salt: Hex,
): Promise<Address> {
  return (await client.readContract({
    address: orchestrator,
    abi: launchOrchestratorAbi,
    functionName: 'predictLaunchToken',
    args: [creator, variant, salt],
  })) as Address;
}

export async function predictHandleQuoteToken(
  client: ReadClient,
  handleLauncher: Address,
  wallet: Address,
  variant: number,
  salt: Hex,
): Promise<Address> {
  return (await client.readContract({
    address: handleLauncher,
    abi: handleLauncherLaunchAbi,
    functionName: 'predictQuoteToken',
    args: [wallet, variant, salt],
  })) as Address;
}

export async function predictHandleStockToken(
  client: ReadClient,
  handleLauncher: Address,
  wallet: Address,
  salt: Hex,
  name: string,
  symbol: string,
): Promise<Address> {
  return (await client.readContract({
    address: handleLauncher,
    abi: handleLauncherLaunchAbi,
    functionName: 'predictStockToken',
    args: [wallet, salt, name, symbol],
  })) as Address;
}
