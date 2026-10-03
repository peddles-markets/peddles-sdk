import type { Address } from 'viem';
import { addressOf, deploymentFor, launchSaltBindingFor } from '../deployments.js';

/**
 * The addresses a launch builder needs, per chain. INJECTED, never assumed:
 * every consumer resolves them from the active chain's deployment artifact —
 * the SDK's own address book (`launchAddressesFor`) or any artifact keyed by
 * contract name (`launchAddressesFromRecord`, what the API and the CLI use).
 *
 * `clogVaultFactory` is nullable and that is the point: a deployment made before
 * the Clog launch type existed has no such contract, and a clog type is then
 * refused rather than launched without its vault.
 */
export interface LaunchAddresses {
  readonly factory: Address;
  readonly orchestrator: Address;
  readonly liquidityExecutor: Address;
  readonly feeHook: Address;
  readonly stockLaunchpad: Address;
  readonly clogVaultFactory: Address | null;
  /**
   * How this chain's orchestrator derives a WETH-type launch's address: `'creator'` (bound to the
   * sending wallet) or `'none'` (the raw salt — a chain not yet on the creator-bound orchestrator).
   * From the chain's own record, never from a chain id. `buildWethLaunchPlan` follows it.
   */
  readonly saltBinding?: 'creator' | 'none';
}

const ZERO = /^0x0{40}$/i;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

function required(record: Readonly<Record<string, unknown>>, name: string): Address {
  const value = record[name];
  if (typeof value !== 'string' || !ADDRESS.test(value) || ZERO.test(value)) {
    throw new Error(`Launch addresses: ${name} is missing from the deployment record.`);
  }
  return value as Address;
}

/** From a deployment artifact keyed by contract name (`contracts/deployments/<chainId>.json`). */
export function launchAddressesFromRecord(record: Readonly<Record<string, unknown>>): LaunchAddresses {
  const clog = record['PeddlesClogVaultFactory'];
  return {
    factory: required(record, 'PeddlesFactoryV20'),
    orchestrator: required(record, 'PeddlesLaunchOrchestratorV20'),
    liquidityExecutor: required(record, 'PeddlesV4LiquidityExecutor'),
    feeHook: required(record, 'PeddlesFeeHook'),
    stockLaunchpad: required(record, 'PeddlesStockLaunchpad'),
    clogVaultFactory: typeof clog === 'string' && ADDRESS.test(clog) && !ZERO.test(clog) ? (clog as Address) : null,
    saltBinding: saltBindingOf(record['launchSaltBinding']),
  };
}

/** A record's `launchSaltBinding`: `'creator'`, or absent on a chain not yet promoted. Anything else is refused. */
function saltBindingOf(value: unknown): 'creator' | 'none' {
  if (value === undefined || value === null) return 'none';
  if (value !== 'creator') throw new Error(`Launch addresses: launchSaltBinding must be "creator" or absent (got ${JSON.stringify(value)}).`);
  return 'creator';
}

/** From the SDK's shipped address book. Throws `UnknownChainError` for a chain it has none for. */
export function launchAddressesFor(chainId: number): LaunchAddresses {
  const book = deploymentFor(chainId);
  return {
    factory: addressOf(chainId, 'PeddlesFactoryV20'),
    orchestrator: addressOf(chainId, 'PeddlesLaunchOrchestratorV20'),
    liquidityExecutor: addressOf(chainId, 'PeddlesV4LiquidityExecutor'),
    feeHook: addressOf(chainId, 'PeddlesFeeHook'),
    stockLaunchpad: addressOf(chainId, 'PeddlesStockLaunchpad'),
    clogVaultFactory: launchAddressesFromRecord(book).clogVaultFactory,
    saltBinding: launchSaltBindingFor(chainId),
  };
}
