import type { ReadClient } from './client.js';
import type { Address, Hex } from 'viem';
import { encodeAbiParameters, keccak256 } from 'viem';
import {
  nftBondingGraduationOrchestratorAbi,
  nftCollectionAbi,
  nftFactoryAbi,
  nftFeeDistributorAbi,
  nftFeeDistributorFactoryAbi,
  nftStockGraduationOrchestratorAbi,
} from './abis.js';

/**
 * Art->DEX: a Peddles NFT collection launches ONE coin, paired to WETH or a tokenised stock, and may
 * commit — permanently — a share of the creator's fee streams to its NFT holders.
 *
 * The commitment is the collection's write-once `holderRewards` binding to its canonical
 * `PeddlesNftFeeDistributor` (made by `PeddlesNftFeeDistributorFactory`), plus the `holderShareBps`
 * the creator passes at launch (0..10000). Nobody can change either afterwards.
 *
 * Addresses are parameters here rather than looked up from `DEPLOYMENTS`: the distributor factory ships
 * with the Art->DEX deployment, and an address book that predates it has no entry to look up.
 */

const ZERO = /^0x0{40}$/i;
const BPS = 10_000;

/** Bps bound shared by every holder-share argument. Throws rather than letting the chain revert. */
function assertBps(name: string, v: number): void {
  if (!Number.isInteger(v) || v < 0 || v > BPS) throw new RangeError(`${name} must be an integer 0..10000, got ${v}`);
}

/* ------------------------------ relayed stock launch consent ------------------------------ */

export interface RelayParams {
  readonly chainId: number;
  /** The PeddlesNftStockGraduationOrchestrator the consent is for. */
  readonly orchestrator: Address;
  readonly collection: Address;
  readonly name: string;
  readonly symbol: string;
  readonly quote: Address;
  readonly holderShareBps: number;
}

/**
 * `relayParamsHash` computed off chain — `keccak256(abi.encode(chainid, orchestrator, collection, name,
 * symbol, quote, holderShareBps))`, exactly as the orchestrator hashes it. The collection owner signs
 * `setStockGraduationOptIn(collection, hash)`; a relay whose parameters hash to anything else reverts.
 * Chain id and orchestrator are part of it, so consent never carries across chains or deployments.
 */
export function relayParamsHash(p: RelayParams): Hex {
  assertBps('holderShareBps', p.holderShareBps);
  return keccak256(
    encodeAbiParameters(
      [{ type: 'uint256' }, { type: 'address' }, { type: 'address' }, { type: 'string' }, { type: 'string' }, { type: 'address' }, { type: 'uint16' }],
      [BigInt(p.chainId), p.orchestrator, p.collection, p.name, p.symbol, p.quote, p.holderShareBps],
    ),
  );
}

/** Request for `setStockGraduationOptIn(collection, relayParamsHash(p))` (collection owner only). Zero revokes. */
export function stockGraduationOptInRequest(p: RelayParams) {
  return {
    address: p.orchestrator,
    abi: nftStockGraduationOrchestratorAbi,
    functionName: 'setStockGraduationOptIn',
    args: [p.collection, relayParamsHash(p)],
  } as const;
}

/* ------------------------------ launch requests ------------------------------ */

export interface StockTermsLaunch {
  readonly orchestrator: Address;
  readonly collection: Address;
  readonly name: string;
  readonly symbol: string;
  readonly quote: Address;
  /** All-in pool tax, bps (100..1000). Permanent. */
  readonly creatorTaxBps: number;
  /** Creator's share of the tax above 1.00%, bps. Permanent. */
  readonly excessToCreatorBps: number;
  /** Share of the creator streams paid to NFT holders, bps. 0 unless the collection is committed. Permanent. */
  readonly holderShareBps: number;
  /** Quote base units for the in-launch dev buy (0 = none); pulled from the caller, so approve first. */
  readonly devBuyQuoteIn: bigint;
  readonly minTokensOut: bigint;
  /** The launchpad's native launch fee, forwarded as msg.value. */
  readonly launchFee: bigint;
}

/** Request for `graduateToStockWithTerms` (collection owner only). */
export function graduateToStockWithTermsRequest(l: StockTermsLaunch) {
  assertBps('holderShareBps', l.holderShareBps);
  assertBps('excessToCreatorBps', l.excessToCreatorBps);
  return {
    address: l.orchestrator,
    abi: nftStockGraduationOrchestratorAbi,
    functionName: 'graduateToStockWithTerms',
    args: [
      {
        collection: l.collection,
        name: l.name,
        symbol: l.symbol,
        quote: l.quote,
        creatorTaxBps: l.creatorTaxBps,
        excessToCreatorBps: l.excessToCreatorBps,
        holderShareBps: l.holderShareBps,
        devBuyQuoteIn: l.devBuyQuoteIn,
        minTokensOut: l.minTokensOut,
      },
    ],
    value: l.launchFee,
  } as const;
}

/**
 * Request for `graduateAndBuy(input, holderShareBps, devBuyValue, minTokensOut)` — the ONLY WETH-path
 * entry since 94d6564 (`graduate` was removed). A plain launch is `holderShareBps = 0, devBuyValue = 0,
 * minTokensOut = 0`. `value` must cover the orchestrator's `launchFee()` (read it live —
 * `readOrchestratorLaunchFee` in `@peddles/sdk/launch`) `+ input.factoryValue + devBuyValue`; a relay of
 * a committed graduation carries exactly `launchFee()` (`RELAY_FEE_ONLY`).
 *
 * `input` is the orchestrator's `GraduateInput` tuple, built by the launch kit exactly as for any V20
 * launch; this helper only positions the Art->DEX arguments around it.
 */
export function graduateAndBuyRequest(p: {
  readonly orchestrator: Address;
  readonly input: unknown;
  readonly holderShareBps: number;
  readonly devBuyValue: bigint;
  readonly minTokensOut: bigint;
  readonly value: bigint;
}) {
  assertBps('holderShareBps', p.holderShareBps);
  if (p.devBuyValue > p.value) throw new RangeError('devBuyValue exceeds value');
  return {
    address: p.orchestrator,
    abi: nftBondingGraduationOrchestratorAbi,
    functionName: 'graduateAndBuy',
    args: [p.input, p.holderShareBps, p.devBuyValue, p.minTokensOut],
    value: p.value,
  } as const;
}

/* ------------------------------ reads ------------------------------ */

/** The canonical distributor address for `collection` (CREATE2; exists or not). */
export async function predictDistributor(client: ReadClient, distributorFactory: Address, collection: Address): Promise<Address> {
  return (await client.readContract({ address: distributorFactory, abi: nftFeeDistributorFactoryAbi, functionName: 'predict', args: [collection] })) as Address;
}

export interface HolderCommitment {
  /** True when the collection is bound to its canonical Peddles distributor. */
  readonly committed: boolean;
  /** The bound `holderRewards` (zero = none). */
  readonly holderRewards: Address;
  /** True when the Peddles NFT factory made this collection. */
  readonly peddlesCollection: boolean;
}

/**
 * Whether a collection's creator streams are committed to its holders — the same three reads the
 * orchestrators make: `holderRewards()`, `factory.isDistributor(d)`, `d.collection() == collection`.
 * Also reports factory provenance, which the orchestrators do NOT check.
 */
export async function getHolderCommitment(
  client: ReadClient,
  a: { nftFactory: Address; distributorFactory: Address; collection: Address },
): Promise<HolderCommitment> {
  const [holderRewards, peddlesCollection] = await Promise.all([
    client.readContract({ address: a.collection, abi: nftCollectionAbi, functionName: 'holderRewards' }) as Promise<Address>,
    client.readContract({ address: a.nftFactory, abi: nftFactoryAbi, functionName: 'isPeddlesCollection', args: [a.collection] }) as Promise<boolean>,
  ]);
  if (ZERO.test(holderRewards)) return { committed: false, holderRewards, peddlesCollection };
  const isDistributor = (await client.readContract({
    address: a.distributorFactory,
    abi: nftFeeDistributorFactoryAbi,
    functionName: 'isDistributor',
    args: [holderRewards],
  })) as boolean;
  if (!isDistributor) return { committed: false, holderRewards, peddlesCollection };
  const bound = (await client.readContract({ address: holderRewards, abi: nftFeeDistributorAbi, functionName: 'collection' })) as Address;
  return { committed: bound.toLowerCase() === a.collection.toLowerCase(), holderRewards, peddlesCollection };
}

export interface DistributorState {
  readonly distributor: Address;
  readonly collection: Address;
  /** Zero until launch. */
  readonly quote: Address;
  readonly token: Address;
  readonly holderShareBps: number;
  readonly assetsInitialized: boolean;
  readonly creatorShareOwed: { readonly quote: bigint; readonly token: bigint };
  readonly owedToHolders: { readonly quote: bigint; readonly token: bigint };
  /** False while minted pieces are unmirrored — holder distribution waits until they are synced. */
  readonly mirrorComplete: boolean;
}

export async function getDistributorState(client: ReadClient, distributor: Address): Promise<DistributorState> {
  const base = { address: distributor, abi: nftFeeDistributorAbi } as const;
  const [collection, quote, token, holderShareBps, assetsInitialized, creatorShareOwed, owedToHolders, mirrorComplete] = await client.multicall({
    allowFailure: false,
    contracts: [
      { ...base, functionName: 'collection' },
      { ...base, functionName: 'quote' },
      { ...base, functionName: 'token' },
      { ...base, functionName: 'holderShareBps' },
      { ...base, functionName: 'assetsInitialized' },
      { ...base, functionName: 'creatorShareOwed' },
      { ...base, functionName: 'owedToHolders' },
      { ...base, functionName: 'mirrorComplete' },
    ],
  });
  const [cq, ct] = creatorShareOwed as readonly [bigint, bigint];
  const [hq, ht] = owedToHolders as readonly [bigint, bigint];
  return {
    distributor,
    collection: collection as Address,
    quote: quote as Address,
    token: token as Address,
    holderShareBps: Number(holderShareBps),
    assetsInitialized: assetsInitialized as boolean,
    creatorShareOwed: { quote: cq, token: ct },
    owedToHolders: { quote: hq, token: ht },
    mirrorComplete: mirrorComplete as boolean,
  };
}

export interface HolderClaimable {
  readonly quote: bigint;
  readonly token: bigint;
  /** Shares the distributor has mirrored for the holder. */
  readonly shares: bigint;
  /** Pieces the holder holds on the collection. */
  readonly pieces: bigint;
  /** `shares != pieces`: claims under-accrue until `syncAccount(holder)` runs. */
  readonly needsSync: boolean;
}

export async function holderClaimable(client: ReadClient, distributor: Address, collection: Address, holder: Address): Promise<HolderClaimable> {
  const [pending, shares, pieces] = await client.multicall({
    allowFailure: false,
    contracts: [
      { address: distributor, abi: nftFeeDistributorAbi, functionName: 'pending', args: [holder] },
      { address: distributor, abi: nftFeeDistributorAbi, functionName: 'sharesOf', args: [holder] },
      { address: collection, abi: nftCollectionAbi, functionName: 'balanceOf', args: [holder] },
    ],
  });
  const [quote, token] = pending as readonly [bigint, bigint];
  return { quote, token, shares: shares as bigint, pieces: pieces as bigint, needsSync: (shares as bigint) !== (pieces as bigint) };
}
