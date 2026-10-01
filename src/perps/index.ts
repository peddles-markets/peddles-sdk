/**
 * @peddles/sdk/perps — the Peddles perp launchpad (`PeddlesPerpFactory`).
 *
 * A perp market is a launched token whose Uniswap v4 pool runs through `PeddlesPerpHook`, which
 * adds leveraged longs and shorts against the pool's own liquidity. One `create` call deploys the
 * token, mines-in the hook, seeds the curve and (optionally) makes the creator's first buy.
 *
 * WHAT THIS MODULE DOES, AND WHAT IT LEAVES TO YOU:
 *
 *   - `perpContracts(chainId)`   the factory, hook deployer and treasury for a chain — or a throw.
 *   - `readPerpBase(...)`        whether a base asset is allowed, and its curve, read LIVE.
 *   - `isValidPerpHookAddress`   the factory's own hook-address check, pure.
 *   - `predictPerpHook/Token`    the two CREATE2 addresses, derived locally.
 *   - `buildPerpCreate(...)`     the exact `{ to, data, value }` for `create`.
 *
 * MINING THE HOOK SALT IS YOUR JOB. Uniswap v4 reads a hook's permissions from the low 14 bits of
 * its address, so `hookSalt` must be searched until `predictPerpHook(...)` passes
 * `isValidPerpHookAddress` — about 16,384 keccak attempts on average, a second or two. The recipe:
 *
 *   1. tokenInitCodeHash = factory.tokenInitCodeHash(name, symbol, tokenUri)   (read)
 *      token             = predictPerpToken(factory, tokenSalt, tokenInitCodeHash)
 *      confirm with factory.predictToken(tokenSalt, name, symbol, tokenUri)
 *   2. hookInitCodeHash  = factory.hookInitCodeHash(token)                      (read)
 *   3. loop: salt → predictPerpHook(hookDeployer, salt, hookInitCodeHash) until
 *      isValidPerpHookAddress(address); start from a CSPRNG salt, not zero.
 *      confirm with factory.predictHook(salt, token)
 *   4. buildPerpCreate({ ..., tokenSalt, hookSalt }) → simulate → sign.
 *
 * Run the loop off the UI thread. The Peddles app does it in a Web Worker
 * (`apps/web/src/features/perps/launch/perpMine.worker.ts` over `perpSalt.ts#mineHookSalt`): a
 * preallocated `0xff ‖ deployer ‖ salt ‖ initCodeHash` buffer, only the salt bytes incremented, one
 * keccak per attempt, the low two bytes of the digest compared against the mask.
 *
 * Neither salt is bound to the sender. Anyone who copies a pending `create` and lands first takes
 * the addresses; the original then reverts and pays only gas.
 *
 * `create` is NOT payable — the factory charges no launch fee — and a seed buy is pulled from the
 * signer with `transferFrom`, so it needs an exact ERC-20 approval of `seedBuyBase` to the factory
 * first. Every amount is a `bigint` in the base asset's own base units.
 */
import type { Address, Hex } from 'viem';
import { encodeFunctionData, getAddress, getContractAddress, isAddress } from 'viem';
import type { ReadClient } from '../client.js';
import { isKnownChain, UnknownChainError } from '../deployments.js';
import { PERP_DEPLOYMENTS, type PerpChainId } from '../deployments.generated.js';
import { perpErrorsAbi, perpFactoryAbi, perpHookErrorsAbi, v4HooksErrorsAbi } from './abi.generated.js';

export { perpErrorsAbi, perpFactoryAbi, perpHookErrorsAbi, v4HooksErrorsAbi, PERP_DEPLOYMENTS };
export type { PerpChainId };

/* ------------------------------------------------------------------------------ addresses */

/** One chain's perp launchpad. */
export interface PerpContracts {
  readonly chainId: number;
  readonly factory: Address;
  /** The contract that runs the hook's CREATE2 — the `from` of every hook address. */
  readonly hookDeployer: Address;
  /** The fee registry (`PeddlesPerpTreasury`) every market routes its spot fees through. */
  readonly treasury: Address;
  /** SSTORE2 pointer holding the hook's creation code. */
  readonly hookCodePointer: Address;
  /**
   * Bases the deploy whitelisted, by symbol. CANDIDATES ONLY — whether one is allowed, and on
   * what curve, is `readPerpBase`'s answer, never this list's.
   */
  readonly baseCandidates: Readonly<Record<string, Address>>;
}

/** Thrown for a chain the SDK knows but which has no live perp launchpad. */
export class PerpsUnavailableError extends Error {
  readonly chainId: number;
  constructor(chainId: number) {
    super(
      `Peddles perps are not deployed on chain ${chainId}. ` +
        `Chains with perps: ${Object.keys(PERP_DEPLOYMENTS).join(', ')}.`,
    );
    this.name = 'PerpsUnavailableError';
    this.chainId = chainId;
  }
}

export function hasPerps(chainId: number): chainId is PerpChainId {
  return Object.prototype.hasOwnProperty.call(PERP_DEPLOYMENTS, chainId);
}

/** Chains this build ships a perp launchpad for. */
export function perpChains(): number[] {
  return Object.keys(PERP_DEPLOYMENTS).map(Number);
}

/**
 * The perp contracts for one chain. FAILS CLOSED: an unknown chain throws `UnknownChainError`,
 * a known chain without perps throws `PerpsUnavailableError` — never another chain's addresses.
 */
export function perpContracts(chainId: number): PerpContracts {
  if (!isKnownChain(chainId)) throw new UnknownChainError(chainId);
  if (!hasPerps(chainId)) throw new PerpsUnavailableError(chainId);
  const d = PERP_DEPLOYMENTS[chainId];
  return {
    chainId,
    factory: d.PeddlesPerpFactory,
    hookDeployer: d.PeddlesPerpHookDeployer,
    treasury: d.PeddlesPerpTreasury,
    hookCodePointer: d.hookCodePointer,
    baseCandidates: d.baseCandidates,
  };
}

/* ------------------------------------------------------------------------------ live reads */

/** A base asset's launch policy, as the factory reports it. */
export interface PerpBase {
  readonly base: Address;
  /** Launches on this base are accepted. `create` reverts `NotWhitelisted` otherwise. */
  readonly allowed: boolean;
  /** The curve's virtual base reserve `V`, in the base asset's base units. */
  readonly v: bigint;
  /** The band width `W`, in the base asset's base units. */
  readonly tickWidth: bigint;
}

/**
 * `factory.bases(base)` — read live. The creator has no curve choice: every market on a base is
 * launched on exactly these values, so read them before offering the base.
 */
export async function readPerpBase(client: ReadClient, chainId: number, base: Address): Promise<PerpBase> {
  const { factory } = perpContracts(chainId);
  const [allowed, v, tickWidth] = (await client.readContract({
    address: factory,
    abi: perpFactoryAbi,
    functionName: 'bases',
    args: [base],
  })) as readonly [boolean, bigint, bigint];
  return { base: getAddress(base), allowed, v, tickWidth };
}

/* ------------------------------------------------------------------------------ hook address */

/**
 * The v4 hook permission bits a perp hook carries — `Hooks.*_FLAG` in v4-core, exactly the set
 * `PeddlesPerpHook.getHookPermissions()` turns on. Identical on every chain.
 */
export const PERP_HOOK_FLAG = {
  BEFORE_INITIALIZE: 1 << 13,
  BEFORE_ADD_LIQUIDITY: 1 << 11,
  BEFORE_REMOVE_LIQUIDITY: 1 << 9,
  BEFORE_SWAP: 1 << 7,
  AFTER_SWAP: 1 << 6,
  BEFORE_SWAP_RETURNS_DELTA: 1 << 3,
  AFTER_SWAP_RETURNS_DELTA: 1 << 2,
} as const;

/** `PeddlesPerpFactory.FLAG_MASK` — v4's 14 permission bits. */
export const PERP_HOOK_FLAG_MASK = 0x3fff;

/** `PeddlesPerpFactory.FLAGS` — 0x2ACC. */
export const PERP_HOOK_FLAGS = Object.values(PERP_HOOK_FLAG).reduce((all, bit) => all | bit, 0);

/**
 * `uint160(hook) & FLAG_MASK == FLAGS` — the factory's own `BadHookAddr` check, pure. Anything
 * that is not a 20-byte hex address is `false`.
 */
export function isValidPerpHookAddress(address: string): boolean {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return false;
  const low = parseInt(address.slice(-4), 16);
  return (low & PERP_HOOK_FLAG_MASK) === PERP_HOOK_FLAGS;
}

const BYTES32 = /^0x[0-9a-fA-F]{64}$/;

function assertBytes32(name: string, value: string): asserts value is Hex {
  if (!BYTES32.test(value)) throw new Error(`${name} must be 32 bytes of hex (0x + 64 digits).`);
}

/**
 * The hook address `create` will deploy for `hookSalt`: the HOOK DEPLOYER's CREATE2 (not the
 * factory's). `hookInitCodeHash` is `factory.hookInitCodeHash(token)` — read it, never assume it.
 */
export function predictPerpHook(hookDeployer: Address, hookSalt: Hex, hookInitCodeHash: Hex): Address {
  assertBytes32('hookSalt', hookSalt);
  assertBytes32('hookInitCodeHash', hookInitCodeHash);
  return getContractAddress({ opcode: 'CREATE2', from: hookDeployer, salt: hookSalt, bytecodeHash: hookInitCodeHash });
}

/**
 * The token address `create` will deploy for `tokenSalt`: the FACTORY's CREATE2.
 * `tokenInitCodeHash` is `factory.tokenInitCodeHash(name, symbol, tokenUri)`.
 */
export function predictPerpToken(factory: Address, tokenSalt: Hex, tokenInitCodeHash: Hex): Address {
  assertBytes32('tokenSalt', tokenSalt);
  assertBytes32('tokenInitCodeHash', tokenInitCodeHash);
  return getContractAddress({ opcode: 'CREATE2', from: factory, salt: tokenSalt, bytecodeHash: tokenInitCodeHash });
}

/* ------------------------------------------------------------------------------ create */

export interface PerpCreateParams {
  readonly chainId: number;
  /** Permanent. Non-empty — the factory reverts `BadParams` otherwise. */
  readonly name: string;
  /** Permanent. Non-empty. */
  readonly symbol: string;
  /** IPFS URI of the metadata document. Permanent. */
  readonly tokenUri: string;
  /** The base asset. Must be `allowed` per `readPerpBase` at send time. */
  readonly base: Address;
  readonly tokenSalt: Hex;
  /** A MINED salt — see the module doc. Checked against the hook-address rule only if you pass `hookAddress`. */
  readonly hookSalt: Hex;
  /** Optional creator first buy, in the base asset's base units. `0n` for none. */
  readonly seedBuyBase: bigint;
  /**
   * Optional: the hook address you mined for `hookSalt` (from `predictPerpHook`). When given, a
   * value that does not carry the permission bits is refused here instead of reverting on chain.
   */
  readonly hookAddress?: Address;
}

/** A transaction request for the user's wallet. */
export interface PerpCreateCall {
  readonly to: Address;
  readonly data: Hex;
  /** Always `0n`: `create` is not payable. */
  readonly value: bigint;
}

/**
 * The exact `{ to, data, value }` for `PeddlesPerpFactory.create` on `chainId`. Pure — no reads.
 *
 * Refuses (throws) what the factory would refuse and what cannot be encoded honestly: an unknown
 * or perp-less chain, an empty name or symbol, a malformed base or salt, a negative or non-bigint
 * seed buy, and a supplied `hookAddress` that fails `isValidPerpHookAddress`. It does NOT prove the
 * base is allowed or the salt is mined — simulate the call before asking anyone to sign it.
 */
export function buildPerpCreate(params: PerpCreateParams): PerpCreateCall {
  const { factory } = perpContracts(params.chainId);
  if (params.name.length === 0 || params.symbol.length === 0) throw new Error('name and symbol must be non-empty.');
  if (!isAddress(params.base, { strict: false })) throw new Error('base must be an address.');
  assertBytes32('tokenSalt', params.tokenSalt);
  assertBytes32('hookSalt', params.hookSalt);
  if (typeof params.seedBuyBase !== 'bigint') throw new Error('seedBuyBase must be a bigint in base units.');
  if (params.seedBuyBase < 0n) throw new Error('seedBuyBase must not be negative.');
  if (params.hookAddress !== undefined && !isValidPerpHookAddress(params.hookAddress)) {
    throw new Error('hookAddress does not carry the perp hook permission bits — mine another hookSalt.');
  }
  const data = encodeFunctionData({
    abi: perpFactoryAbi,
    functionName: 'create',
    args: [
      {
        name: params.name,
        symbol: params.symbol,
        tokenUri: params.tokenUri,
        base: getAddress(params.base),
        tokenSalt: params.tokenSalt,
        hookSalt: params.hookSalt,
        seedBuyBase: params.seedBuyBase,
      },
    ],
  });
  return { to: factory, data, value: 0n };
}
