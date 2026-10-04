import { DEPLOYMENTS, LAUNCH_SALT_BINDINGS, type KnownChainId, type ContractName } from './deployments.generated.js';

export { DEPLOYMENTS, LAUNCH_SALT_BINDINGS };
export type { KnownChainId, ContractName };

/** Thrown when the SDK is asked about a chain it ships no address book for. */
export class UnknownChainError extends Error {
  readonly chainId: number;
  constructor(chainId: number) {
    super(
      `Peddles SDK has no deployment for chain ${chainId}. ` +
        `Known chains: ${Object.keys(DEPLOYMENTS).join(', ')}. ` +
        `Pass an explicit address map if you are pointing at a private deployment.`,
    );
    this.name = 'UnknownChainError';
    this.chainId = chainId;
  }
}

/** Thrown when a chain is known but does not carry the contract being asked for. */
export class UnknownContractError extends Error {
  constructor(chainId: number, name: string) {
    super(
      `Peddles SDK has no address for ${name} on chain ${chainId}. ` +
        `That deployment may predate the contract.`,
    );
    this.name = 'UnknownContractError';
  }
}

export function isKnownChain(chainId: number): chainId is KnownChainId {
  return Object.prototype.hasOwnProperty.call(DEPLOYMENTS, chainId);
}

/**
 * How the chain's launch orchestrator derives a WETH-type launch's address, from the chain's own
 * deployment record: `'creator'` (bound to the sending wallet) or `'none'` (the raw salt — a chain
 * not yet on the creator-bound orchestrator). Throws `UnknownChainError` for a chain with no book.
 */
export function launchSaltBindingFor(chainId: number): 'creator' | 'none' {
  if (!isKnownChain(chainId)) throw new UnknownChainError(chainId);
  return LAUNCH_SALT_BINDINGS[chainId];
}

/**
 * The address book for one chain.
 *
 * FAILS CLOSED, ALWAYS. An unknown chain throws rather than returning a default
 * or an empty map, and a missing contract throws rather than returning
 * `undefined` or the zero address. Both of those alternatives look like a
 * working call right up until a transaction is signed against nothing.
 *
 * This is not hypothetical in this codebase: every address changed in a single
 * redeploy, and one stale copy of this list had the API quoting a launchpad that
 * no longer existed — an error that surfaced as "neither leg is a launched coin"
 * rather than as a missing address.
 */
export function deploymentFor(chainId: number): Readonly<Record<string, `0x${string}`>> {
  if (!isKnownChain(chainId)) throw new UnknownChainError(chainId);
  return DEPLOYMENTS[chainId] as Readonly<Record<string, `0x${string}`>>;
}

/** One address, or a throw. Never a default, never the zero address. */
export function addressOf(chainId: number, name: string): `0x${string}` {
  const book = deploymentFor(chainId);
  // Own properties only: `book['constructor']` would otherwise return a function.
  const found = Object.prototype.hasOwnProperty.call(book, name) ? book[name] : undefined;
  if (!found || /^0x0{40}$/.test(found)) throw new UnknownContractError(chainId, name);
  return found;
}

/** Thrown when a Snowball call is asked of a chain with no `PeddlesSnowballFactory`. Fail closed. */
export class SnowballUnavailableError extends Error {
  readonly chainId: number | null;
  constructor(chainId: number | null) {
    super(
      chainId === null
        ? 'Snowball launches are not available on this chain: no PeddlesSnowballFactory is configured.'
        : `Snowball launches are not available on chain ${chainId}: it has no PeddlesSnowballFactory.`,
    );
    this.name = 'SnowballUnavailableError';
    this.chainId = chainId;
  }
}

function snowballOf(book: Readonly<Record<string, unknown>>): `0x${string}` | null {
  const v = Object.prototype.hasOwnProperty.call(book, 'PeddlesSnowballFactory') ? book['PeddlesSnowballFactory'] : undefined;
  return typeof v === 'string' && /^0x[0-9a-fA-F]{40}$/.test(v) && !/^0x0{40}$/.test(v) ? (v as `0x${string}`) : null;
}

/**
 * `PeddlesSnowballFactory` per shipped chain, `null` where it is not deployed. Derived from the
 * generated address book, never typed by hand.
 */
export const SNOWBALL_FACTORIES: Readonly<Record<KnownChainId, `0x${string}` | null>> = Object.fromEntries(
  Object.entries(DEPLOYMENTS).map(([id, book]) => [id, snowballOf(book as Readonly<Record<string, unknown>>)]),
) as Record<KnownChainId, `0x${string}` | null>;

/** The chain's Snowball factory, or `null` where it has none. Throws `UnknownChainError` for a chain with no book. */
export function snowballFactoryFor(chainId: number): `0x${string}` | null {
  if (!isKnownChain(chainId)) throw new UnknownChainError(chainId);
  return SNOWBALL_FACTORIES[chainId];
}

/** The chain's Snowball factory, or a `SnowballUnavailableError`. Never a default. */
export function requireSnowballFactory(chainId: number): `0x${string}` {
  const f = snowballFactoryFor(chainId);
  if (f === null) throw new SnowballUnavailableError(chainId);
  return f;
}
