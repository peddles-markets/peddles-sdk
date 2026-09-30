import type { ReadClient } from '../client.js';
import { factoryAbi } from '../abis.js';
import { launchOrchestratorAbi } from './abi.generated.js';
import type { LaunchAddresses } from './addresses.js';

/**
 * The launch types the factory will take a WETH-type launch for, READ FROM THE
 * CHAIN. A port of the web's `useLaunchVariants` + `variantTerms`.
 *
 * The factory's registry is keyed by a uint8 with no enumerator, so the whole
 * id space is read in ONE multicall (`variantInfo(1..255)`, batching off). Type 0
 * is the built-in type; it is never registered and launches against the
 * orchestrator's own owner-set defaults, so that is what is read for it.
 *
 * FAIL CLOSED: any failed read makes the whole list unavailable (the multicall
 * throws). A partial list is not offered.
 */

/** The factory's permanently reserved asset variant. */
export const VARIANT_ASSET = 0;

export const BPS_DENOMINATOR = 10_000n;

export interface VariantAllocation {
  readonly liquidityBps: bigint;
  readonly airdropBps: bigint;
  readonly vestingBps: bigint;
  readonly burnBps: bigint;
  readonly clogBps: bigint;
  /** Per-release cap, in bps of TOTAL supply. */
  readonly clogSliceBps: bigint;
  readonly clogMinIntervalSeconds: bigint;
}

export type LaunchTypeShape = 'full-liquidity' | 'clog';

export type ResolvedTerms =
  | { readonly ok: true; readonly shape: LaunchTypeShape; readonly allocation: VariantAllocation }
  | { readonly ok: false; readonly reason: string };

/** Can this split be launched and described? Mirrors what the contracts refuse. */
export function resolveTerms(allocation: VariantAllocation): ResolvedTerms {
  const { liquidityBps, airdropBps, vestingBps, burnBps, clogBps, clogSliceBps, clogMinIntervalSeconds } = allocation;
  const sum = liquidityBps + airdropBps + vestingBps + burnBps + clogBps;
  if (sum !== BPS_DENOMINATOR) {
    return { ok: false, reason: 'This launch type’s split does not add up to the whole supply, so it cannot launch.' };
  }
  if (liquidityBps <= 0n) {
    return { ok: false, reason: 'This launch type puts nothing into the pool, so it cannot launch.' };
  }
  if (airdropBps !== 0n || vestingBps !== 0n || burnBps !== 0n) {
    return { ok: false, reason: 'This launch type airdrops, vests or burns supply, which Peddles does not offer.' };
  }
  if (clogBps > 0n && (clogSliceBps <= 0n || clogMinIntervalSeconds <= 0n)) {
    return { ok: false, reason: 'This launch type holds supply back with no limit on how it is sold, so it cannot launch.' };
  }
  return { ok: true, shape: clogBps > 0n ? 'clog' : 'full-liquidity', allocation };
}

/** A launch type, as the chain describes it. */
export interface LaunchVariant {
  /** The factory's uint8 id. Carried into the launch; never shown as a name. */
  readonly id: number;
  /** Retired types stay registered but take no new launches. */
  readonly enabled: boolean;
  readonly allocation: VariantAllocation;
  readonly terms: ResolvedTerms;
  /** Null when this type can be launched on this chain right now. */
  readonly refusal: string | null;
}

const ZERO = '0x0000000000000000000000000000000000000000';
/** Registrable ids are 1..255; 0 is reserved for the built-in type. */
const REGISTRABLE_IDS = Array.from({ length: 255 }, (_, i) => i + 1);

interface RawAllocation {
  readonly liquidityBps: number;
  readonly airdropBps: number;
  readonly vestingBps: number;
  readonly burnBps: number;
  readonly clogBps: number;
  readonly clogSliceBps: number;
  readonly clogMinInterval: bigint;
}

function toAllocation(raw: RawAllocation): VariantAllocation {
  return {
    liquidityBps: BigInt(raw.liquidityBps),
    airdropBps: BigInt(raw.airdropBps),
    vestingBps: BigInt(raw.vestingBps),
    burnBps: BigInt(raw.burnBps),
    clogBps: BigInt(raw.clogBps),
    clogSliceBps: BigInt(raw.clogSliceBps),
    clogMinIntervalSeconds: BigInt(raw.clogMinInterval),
  };
}

function refusalFor(enabled: boolean, terms: ResolvedTerms, clogVaultReady: boolean): string | null {
  if (!enabled) return 'This launch type is not open for new launches.';
  if (!terms.ok) return terms.reason;
  if (terms.shape === 'clog' && !clogVaultReady) {
    return 'This launch type withholds supply into a clog vault, and no clog vault factory is deployed on this chain.';
  }
  return null;
}

/** Every launch type on this chain, type 0 first, then registered ids ascending. */
export async function readLaunchVariants(client: ReadClient, addresses: LaunchAddresses): Promise<readonly LaunchVariant[]> {
  const { factory, orchestrator } = addresses;
  const infos = (await client.multicall({
    allowFailure: false,
    batchSize: 0,
    contracts: REGISTRABLE_IDS.map((id) => ({ address: factory, abi: factoryAbi, functionName: 'variantInfo' as const, args: [id] as const })),
  })) as readonly (readonly [`0x${string}`, `0x${string}`, boolean])[];

  const registered = REGISTRABLE_IDS.map((id, i) => ({ id, info: infos[i]! })).filter(({ info }) => info[0] !== ZERO);

  const [defaults, allocations] = await Promise.all([
    client.multicall({
      allowFailure: false,
      contracts: [
        { address: orchestrator, abi: launchOrchestratorAbi, functionName: 'defaultLiquidityBps' },
        { address: orchestrator, abi: launchOrchestratorAbi, functionName: 'defaultAirdropBps' },
        { address: orchestrator, abi: launchOrchestratorAbi, functionName: 'defaultVestingBps' },
        { address: orchestrator, abi: launchOrchestratorAbi, functionName: 'defaultBurnBps' },
        { address: orchestrator, abi: launchOrchestratorAbi, functionName: 'clogVaultFactory' },
      ],
    }) as Promise<readonly [number, number, number, number, `0x${string}`]>,
    registered.length === 0
      ? Promise.resolve([] as readonly RawAllocation[])
      : (client.multicall({
          allowFailure: false,
          batchSize: 0,
          contracts: registered.map(({ id }) => ({ address: factory, abi: factoryAbi, functionName: 'variantAllocation' as const, args: [id] as const })),
        }) as Promise<readonly RawAllocation[]>),
  ]);

  const [liquidityBps, airdropBps, vestingBps, burnBps, clogVaultFactory] = defaults;
  const clogVaultReady = clogVaultFactory !== ZERO && addresses.clogVaultFactory !== null;

  const rows = [
    {
      id: VARIANT_ASSET,
      enabled: true,
      allocation: {
        liquidityBps: BigInt(liquidityBps),
        airdropBps: BigInt(airdropBps),
        vestingBps: BigInt(vestingBps),
        burnBps: BigInt(burnBps),
        clogBps: 0n,
        clogSliceBps: 0n,
        clogMinIntervalSeconds: 0n,
      },
    },
    ...registered.map(({ id, info }, i) => ({ id, enabled: info[2], allocation: toAllocation(allocations[i]!) })),
  ];

  return rows.map((row) => {
    const terms = resolveTerms(row.allocation);
    return { id: row.id, enabled: row.enabled, allocation: row.allocation, terms, refusal: refusalFor(row.enabled, terms, clogVaultReady) };
  });
}

/** The public launch type names the REST API, the CLI and the widget speak. */
export type LaunchTypeName = 'standard' | 'clog' | 'stock';

/**
 * The variant a public type name resolves to on this chain, or a refusal.
 * `standard` is always type 0; `clog` is the ONE enabled registered clog-shaped
 * type — two of them is ambiguous and is refused rather than picked between.
 */
export function variantForType(variants: readonly LaunchVariant[], type: 'standard' | 'clog'): { variant: LaunchVariant } | { refusal: string } {
  if (type === 'standard') {
    const v = variants.find((x) => x.id === VARIANT_ASSET);
    if (!v) return { refusal: 'The built-in launch type is not available on this chain.' };
    return v.refusal ? { refusal: v.refusal } : { variant: v };
  }
  const clogs = variants.filter((x) => x.id !== VARIANT_ASSET && x.terms.ok && x.terms.shape === 'clog' && x.enabled);
  if (clogs.length === 0) return { refusal: 'No Drip launch type is open on this chain.' };
  if (clogs.length > 1) return { refusal: 'More than one Drip launch type is open on this chain; pass the variant id explicitly.' };
  const v = clogs[0]!;
  return v.refusal ? { refusal: v.refusal } : { variant: v };
}
