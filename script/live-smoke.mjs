#!/usr/bin/env node
/**
 * Live smoke test of the BUILT SDK (`dist/`) against real chains — the check that the address book
 * is a fact about the chain, not a file. Read-only: no key, no transaction.
 *
 *   npm run build && node script/live-smoke.mjs
 *   RPC_8453=https://… RPC_11155111=https://… node script/live-smoke.mjs   # your own endpoints
 *
 * For every chain the SDK ships: every named contract has code, the launch addresses resolve, the
 * launch types answer, and the stock launchpad's fee reads. Exits 1 on the first chain that fails.
 */
import { createPublicClient, http, parseAbi } from 'viem';
import { base, sepolia } from 'viem/chains';
import {
  DEPLOYMENTS,
  supportedChains,
  addressOf,
  isVariantSupported,
  feeHookAbi,
} from '../dist/index.js';
import { launchAddressesFor } from '../dist/launch/index.js';

const VIEM_CHAINS = { 8453: base, 11155111: sepolia };
const DEFAULT_RPC = { 8453: 'https://mainnet.base.org', 11155111: 'https://ethereum-sepolia-rpc.publicnode.com' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failed = 0;
for (const chainId of supportedChains()) {
  const rpc = process.env[`RPC_${chainId}`] ?? DEFAULT_RPC[chainId];
  if (!rpc) {
    console.log(`chain ${chainId}: no RPC configured (set RPC_${chainId}) — skipped`);
    continue;
  }
  const client = createPublicClient({ chain: VIEM_CHAINS[chainId], transport: http(rpc) });
  const onChain = await client.getChainId();
  if (onChain !== chainId) {
    console.log(`chain ${chainId}: RPC answers chain ${onChain} — FAIL`);
    failed++;
    continue;
  }
  const book = DEPLOYMENTS[chainId];
  let missing = 0;
  for (const [name, address] of Object.entries(book)) {
    const code = await client.getCode({ address });
    if (!code || code === '0x') {
      console.log(`  ✗ ${name} ${address} has NO code`);
      missing++;
    }
    await sleep(120); // public endpoints rate-limit bursts
  }
  const launch = launchAddressesFor(chainId);
  const variants = [];
  for (const v of [0, 1]) variants.push(`${v}:${await isVariantSupported(client, chainId, v)}`);
  const launchFee = await client.readContract({ address: addressOf(chainId, 'PeddlesStockLaunchpad'), abi: parseAbi(['function launchFee() view returns (uint256)']), functionName: 'launchFee' });
  const platformBps = await client
    .readContract({ address: launch.feeHook, abi: feeHookAbi, functionName: 'PLATFORM_FEE_BPS' })
    .catch(() => 'n/a');
  const ok = missing === 0;
  if (!ok) failed++;
  console.log(
    `${ok ? '✓' : '✗'} chain ${chainId}: ${Object.keys(book).length} contracts, ${missing} without code · ` +
      `factory ${launch.factory} · variants ${variants.join(' ')} · launchFee ${launchFee} wei · platform ${platformBps} bps`,
  );
}
process.exit(failed ? 1 : 0);
