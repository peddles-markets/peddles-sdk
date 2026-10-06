import type { ReadClient } from './client.js';
import { encodeAbiParameters, encodeFunctionData, getAddress, keccak256, concat, toHex } from 'viem';
import type { Address, Hex } from 'viem';
import { partnerFeeForwarderAbi } from './abis.generated.js';
import { DEPLOYMENTS, type KnownChainId } from './deployments.generated.js';
import { isKnownChain, UnknownChainError } from './deployments.js';

/**
 * PARTNER TRADES — earn on the trades your app routes (`PeddlesPartnerFeeForwarder`).
 *
 * A developer registered through the developer portal (dev.peddles.xyz) gets a VOUCHER from the
 * Peddles API: an EIP-712 signature by Peddles' partner signer over `PartnerVoucher(partner,
 * expiry)`, bound to one chain and one forwarder. A trade through the forwarder that carries the
 * voucher pays, in the same transaction:
 *
 *   - the platform fee (`feeBps` of the native leg, between the contract's `minFeeBps` and
 *     `maxFeeBps`) — `partnerShareBps` of it to the partner, the rest to Peddles;
 *   - the partner's OWN fee on top (`partnerFeeBps`, 0..`maxPartnerFeeBps`) — all of it to the
 *     partner.
 *
 * Both are taken on the gross native leg, and the trader's wallet signs the calldata that carries
 * both rates. A voucher authorises an ADDRESS, not a trade: it is reusable until `expiry`, and stops
 * working when it expires, when Peddles revokes the partner, or when the signer is rotated.
 *
 * Every amount here is a `bigint` in base units (wei for the native leg). Never a `number`.
 */

/** The EIP-712 domain name and version, exactly as `domainSeparator()` hashes them. */
export const PARTNER_VOUCHER_DOMAIN_NAME = 'PeddlesPartnerFeeForwarder';
export const PARTNER_VOUCHER_DOMAIN_VERSION = '1';

/** The EIP-712 type a voucher is signed over: `PartnerVoucher(address partner,uint256 expiry)`. */
export const PARTNER_VOUCHER_TYPES = {
  PartnerVoucher: [
    { name: 'partner', type: 'address' },
    { name: 'expiry', type: 'uint256' },
  ],
} as const;

/** `keccak256("PartnerVoucher(address partner,uint256 expiry)")` — the contract's `VOUCHER_TYPEHASH`. */
export const PARTNER_VOUCHER_TYPEHASH: Hex = keccak256(toHex('PartnerVoucher(address partner,uint256 expiry)'));

const EIP712_DOMAIN_TYPEHASH: Hex = keccak256(
  toHex('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)'),
);

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const ZERO_RE = /^0x0{40}$/;
const UINT16_MAX = 65_535;
const BPS = 10_000n;

function forwarderOf(book: Readonly<Record<string, unknown>>): Address | null {
  const v = Object.prototype.hasOwnProperty.call(book, 'PeddlesPartnerFeeForwarder') ? book['PeddlesPartnerFeeForwarder'] : undefined;
  return typeof v === 'string' && ADDRESS_RE.test(v) && !ZERO_RE.test(v) ? (v as Address) : null;
}

/**
 * `PeddlesPartnerFeeForwarder` per shipped chain, `null` where it is not deployed. Derived from the
 * generated address book, never typed by hand.
 */
export const PARTNER_FEE_FORWARDERS: Readonly<Record<KnownChainId, Address | null>> = Object.fromEntries(
  Object.entries(DEPLOYMENTS).map(([id, book]) => [id, forwarderOf(book as Readonly<Record<string, unknown>>)]),
) as Record<KnownChainId, Address | null>;

/** The chain's partner fee forwarder, or `null` where it has none. Throws `UnknownChainError` for a chain with no book. */
export function partnerFeeForwarderFor(chainId: number): Address | null {
  if (!isKnownChain(chainId)) throw new UnknownChainError(chainId);
  return PARTNER_FEE_FORWARDERS[chainId];
}

/** Thrown when a partner call is asked of a chain with no `PeddlesPartnerFeeForwarder`, or with a voucher that does not fit. */
export class PartnerUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PartnerUnavailableError';
  }
}

function requireAddress(label: string, value: string): Address {
  if (typeof value !== 'string' || !ADDRESS_RE.test(value)) throw new TypeError(`${label} is not an address: ${String(value)}`);
  return getAddress(value);
}

function requireUint(label: string, value: bigint): bigint {
  if (typeof value !== 'bigint' || value < 0n) throw new TypeError(`${label} must be a non-negative bigint`);
  return value;
}

function requireBps(label: string, value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > UINT16_MAX) throw new RangeError(`${label} must be an integer 0..${UINT16_MAX} (bps)`);
  return value;
}

/** The typed data a voucher signs — pass it to `account.signTypedData` / `hashTypedData` as is. */
export function partnerVoucherTypedData(chainId: number, forwarder: Address, partner: Address, expiry: bigint) {
  if (!Number.isInteger(chainId) || chainId <= 0) throw new RangeError(`chainId must be a positive integer`);
  return {
    domain: {
      name: PARTNER_VOUCHER_DOMAIN_NAME,
      version: PARTNER_VOUCHER_DOMAIN_VERSION,
      chainId: BigInt(chainId),
      verifyingContract: requireAddress('forwarder', forwarder),
    },
    types: PARTNER_VOUCHER_TYPES,
    primaryType: 'PartnerVoucher' as const,
    message: { partner: requireAddress('partner', partner), expiry: requireUint('expiry', expiry) },
  };
}

/** `domainSeparator()` of the forwarder at `forwarder` on `chainId`, computed the way the contract does. */
export function partnerDomainSeparator(chainId: number, forwarder: Address): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: 'bytes32' }, { type: 'bytes32' }, { type: 'bytes32' }, { type: 'uint256' }, { type: 'address' }],
      [
        EIP712_DOMAIN_TYPEHASH,
        keccak256(toHex(PARTNER_VOUCHER_DOMAIN_NAME)),
        keccak256(toHex(PARTNER_VOUCHER_DOMAIN_VERSION)),
        BigInt(chainId),
        requireAddress('forwarder', forwarder),
      ],
    ),
  );
}

/**
 * `voucherDigest(partner, expiry)`, computed the way the contract does:
 * `keccak256("\x19\x01" ‖ domainSeparator ‖ keccak256(abi.encode(VOUCHER_TYPEHASH, partner, expiry)))`.
 */
export function partnerVoucherDigest(chainId: number, forwarder: Address, partner: Address, expiry: bigint): Hex {
  const structHash = keccak256(
    encodeAbiParameters(
      [{ type: 'bytes32' }, { type: 'address' }, { type: 'uint256' }],
      [PARTNER_VOUCHER_TYPEHASH, requireAddress('partner', partner), requireUint('expiry', expiry)],
    ),
  );
  return keccak256(concat(['0x1901', partnerDomainSeparator(chainId, forwarder), structHash]));
}

/** A voucher as the Peddles API returns it (`POST /launch-api/partner/voucher`), with `expiry` as a bigint. */
export interface PartnerVoucher {
  readonly chainId: number;
  readonly forwarder: Address;
  readonly partner: Address;
  /** Last valid second (unix), inclusive. */
  readonly expiry: bigint;
  /** 65-byte signature by the forwarder's `partnerSigner`. */
  readonly signature: Hex;
}

/** The API's JSON shape (`expiry` is a decimal string there). */
export interface PartnerVoucherJson {
  readonly chainId: number;
  readonly forwarder: string;
  readonly partner: string;
  readonly expiry: string;
  readonly signature: string;
}

/** Parse the API's JSON voucher. Throws on anything malformed — never a partial voucher. */
export function parsePartnerVoucher(v: PartnerVoucherJson): PartnerVoucher {
  if (!v || typeof v !== 'object') throw new TypeError('voucher is not an object');
  if (!Number.isInteger(v.chainId) || v.chainId <= 0) throw new TypeError('voucher.chainId is not a chain id');
  if (typeof v.expiry !== 'string' || !/^[0-9]{1,78}$/.test(v.expiry)) throw new TypeError('voucher.expiry is not a decimal integer string');
  if (typeof v.signature !== 'string' || !/^0x[0-9a-fA-F]{130}$/.test(v.signature)) throw new TypeError('voucher.signature is not 65 bytes');
  return {
    chainId: v.chainId,
    forwarder: requireAddress('voucher.forwarder', v.forwarder),
    partner: requireAddress('voucher.partner', v.partner),
    expiry: BigInt(v.expiry),
    signature: v.signature as Hex,
  };
}

/** The forwarder's live terms. Read them; never assume the deploy-time values. */
export interface PartnerTerms {
  readonly forwarder: Address;
  /** The partner's share of the platform fee, in bps of that fee (1000 = 10%). Owner-settable, at most `MAX_PARTNER_SHARE_BPS`. */
  readonly partnerShareBps: number;
  /** The least platform fee a call may carry, in bps of the native leg. */
  readonly minFeeBps: number;
  /** The most platform fee a call may carry. Immutable. */
  readonly maxFeeBps: number;
  /** The most a partner may charge on top. Immutable. */
  readonly maxPartnerFeeBps: number;
  /** The key whose vouchers are honoured. */
  readonly partnerSigner: Address;
  /** Seconds after a partner's last credit before an unclaimed balance may be reclaimed to Peddles. */
  readonly claimStaleAfterSeconds: bigint;
}

export async function readPartnerTerms(client: ReadClient, forwarder: Address): Promise<PartnerTerms> {
  const base = { address: requireAddress('forwarder', forwarder), abi: partnerFeeForwarderAbi } as const;
  const [share, minFee, maxFee, maxPartner, signer, stale] = await client.multicall({
    allowFailure: false,
    contracts: [
      { ...base, functionName: 'partnerShareBps' },
      { ...base, functionName: 'minFeeBps' },
      { ...base, functionName: 'maxFeeBps' },
      { ...base, functionName: 'maxPartnerFeeBps' },
      { ...base, functionName: 'partnerSigner' },
      { ...base, functionName: 'CLAIM_STALE_AFTER' },
    ],
  });
  return {
    forwarder: base.address,
    partnerShareBps: Number(share),
    minFeeBps: Number(minFee),
    maxFeeBps: Number(maxFee),
    maxPartnerFeeBps: Number(maxPartner),
    partnerSigner: getAddress(signer as string),
    claimStaleAfterSeconds: stale as bigint,
  };
}

/** Native owed to `partner` (credited only when its in-trade payment failed), in wei. */
export async function readPartnerClaimable(client: ReadClient, forwarder: Address, partner: Address): Promise<bigint> {
  return (await client.readContract({
    address: requireAddress('forwarder', forwarder),
    abi: partnerFeeForwarderAbi,
    functionName: 'claimable',
    args: [requireAddress('partner', partner)],
  })) as bigint;
}

/** Whether a trade naming this voucher would be accepted right now (`voucherValid`, a chain read). */
export async function isPartnerVoucherValid(client: ReadClient, voucher: PartnerVoucher): Promise<boolean> {
  return (await client.readContract({
    address: voucher.forwarder,
    abi: partnerFeeForwarderAbi,
    functionName: 'voucherValid',
    args: [voucher.partner, voucher.expiry, voucher.signature],
  })) as boolean;
}

/** The money of one partner trade, as `_takeFees` books it. Every division rounds down. */
export interface PartnerFeeSplit {
  readonly platformFee: bigint;
  readonly partnerShare: bigint;
  readonly partnerFee: bigint;
  /** `platformFee - partnerShare`. */
  readonly toFeeRecipient: bigint;
  /** `partnerShare + partnerFee` — what the partner receives (paid, or credited if the payment failed). */
  readonly toPartner: bigint;
}

/**
 * The split of a trade's fees on `base` (the gross native leg: what a buyer parted with, or what a
 * sell's router paid), exactly as the contract computes it.
 */
export function partnerFeeSplit(base: bigint, feeBps: number, partnerFeeBps: number, partnerShareBps: number): PartnerFeeSplit {
  requireUint('base', base);
  const platformFee = (base * BigInt(requireBps('feeBps', feeBps))) / BPS;
  const partnerFee = (base * BigInt(requireBps('partnerFeeBps', partnerFeeBps))) / BPS;
  const partnerShare = (platformFee * BigInt(requireBps('partnerShareBps', partnerShareBps))) / BPS;
  return { platformFee, partnerShare, partnerFee, toFeeRecipient: platformFee - partnerShare, toPartner: partnerShare + partnerFee };
}

/* ------------------------------------------------------------------------------------------------
 * Calldata. Each builder returns a viem-ready request `{ address, abi, functionName, args, value? }`
 * for `walletClient.writeContract` / `publicClient.simulateContract`; `encodePartnerCall` turns any
 * of them into `{ to, data, value }`.
 * --------------------------------------------------------------------------------------------- */

/** A v4 pool key, layout-identical to the route router's `RoutePoolKey`. */
export interface PartnerPoolKey {
  readonly currency0: Address;
  readonly currency1: Address;
  readonly fee: number;
  readonly tickSpacing: number;
  readonly hooks: Address;
}

/** One route hop (`PathHop`): the pool and the swap direction. */
export interface PartnerPathHop {
  readonly key: PartnerPoolKey;
  readonly zeroForOne: boolean;
}

/** One PancakeSwap hop (`PancakeHop`). */
export interface PartnerPancakeHop {
  readonly tokenIn: Address;
  readonly tokenOut: Address;
  readonly fee: number;
}

/** What every partner trade carries besides the swap itself. */
export interface PartnerTradeTerms {
  /** The voucher from the Peddles API, for THIS chain and THIS forwarder. */
  readonly voucher: PartnerVoucher;
  /** The platform fee, bps of the native leg. Must sit within the forwarder's live `minFeeBps..maxFeeBps`. */
  readonly feeBps: number;
  /** Your own fee on top, bps of the native leg; 0..`maxPartnerFeeBps`. */
  readonly partnerFeeBps: number;
  /** Unix seconds after which the trade reverts. */
  readonly deadline: bigint;
  /**
   * The chain the trader's wallet will sign on. When given, a voucher for any other chain is
   * refused here instead of reverting `BadVoucher` on-chain.
   */
  readonly chainId?: number;
  /**
   * Live terms (`readPartnerTerms`). When given, the rates are checked against them here, so a
   * fee outside the bounds is refused before the wallet is asked to sign.
   */
  readonly terms?: Pick<PartnerTerms, 'minFeeBps' | 'maxFeeBps' | 'maxPartnerFeeBps'>;
}

function checkedTerms(t: PartnerTradeTerms) {
  const v = t.voucher;
  if (t.chainId !== undefined && t.chainId !== v.chainId) {
    throw new PartnerUnavailableError(`This voucher is for chain ${v.chainId}, not ${t.chainId}. Request one for the chain the trade is on.`);
  }
  // The voucher's domain names the forwarder; a voucher for a forwarder the address book does not
  // list (another deployment, a copied record) would revert BadVoucher — refuse it here.
  if (isKnownChain(v.chainId)) {
    const expected = PARTNER_FEE_FORWARDERS[v.chainId];
    if (!expected) throw new PartnerUnavailableError(`Chain ${v.chainId} has no PeddlesPartnerFeeForwarder.`);
    if (expected.toLowerCase() !== v.forwarder.toLowerCase()) {
      throw new PartnerUnavailableError(`The voucher names forwarder ${v.forwarder}, but chain ${v.chainId}'s is ${expected}.`);
    }
  }
  const feeBps = requireBps('feeBps', t.feeBps);
  const partnerFeeBps = requireBps('partnerFeeBps', t.partnerFeeBps);
  if (t.terms) {
    if (feeBps < t.terms.minFeeBps || feeBps > t.terms.maxFeeBps) {
      throw new RangeError(`feeBps ${feeBps} is outside the forwarder's ${t.terms.minFeeBps}..${t.terms.maxFeeBps}`);
    }
    if (partnerFeeBps > t.terms.maxPartnerFeeBps) throw new RangeError(`partnerFeeBps ${partnerFeeBps} is above the forwarder's cap ${t.terms.maxPartnerFeeBps}`);
  }
  requireUint('deadline', t.deadline);
  const partner = {
    partner: v.partner,
    partnerFeeBps,
    expiry: v.expiry,
    signature: v.signature,
  } as const;
  return { forwarder: v.forwarder, feeBps, partner };
}

function hopsOf(hops: readonly PartnerPathHop[]) {
  return hops.map((h) => ({
    key: {
      currency0: requireAddress('hop.currency0', h.key.currency0),
      currency1: requireAddress('hop.currency1', h.key.currency1),
      fee: h.key.fee,
      tickSpacing: h.key.tickSpacing,
      hooks: requireAddress('hop.hooks', h.key.hooks),
    },
    zeroForOne: h.zeroForOne,
  }));
}

function pancakeHopsOf(hops: readonly PartnerPancakeHop[]) {
  return hops.map((h) => ({ tokenIn: requireAddress('hop.tokenIn', h.tokenIn), tokenOut: requireAddress('hop.tokenOut', h.tokenOut), fee: h.fee }));
}

export interface PartnerBuyArgs extends PartnerTradeTerms {
  readonly token: Address;
  /** Native wei the trader sends; both fees are carved out of it. */
  readonly value: bigint;
  /** Floor on tokens out, in the token's base units. */
  readonly minOut: bigint;
}

export interface PartnerSellArgs extends PartnerTradeTerms {
  readonly token: Address;
  /** Exactly this much of the trader's token is sold (approve the forwarder for it first). */
  readonly amountIn: bigint;
  /** Floor on the native that reaches the trader, AFTER both fees, in wei. */
  readonly minOutNet: bigint;
}

function buyValue(value: bigint): bigint {
  if (requireUint('value', value) === 0n) throw new RangeError('value must be above zero');
  return value;
}

/** `buyV4` — a WETH-paired launch through `PeddlesV4SwapRouter`. */
export function buildPartnerBuyV4(a: PartnerBuyArgs) {
  const t = checkedTerms(a);
  return {
    address: t.forwarder,
    abi: partnerFeeForwarderAbi,
    functionName: 'buyV4' as const,
    args: [requireAddress('token', a.token), requireUint('minOut', a.minOut), t.feeBps, t.partner, a.deadline] as const,
    value: buyValue(a.value),
  };
}

/** `sellV4` — sell a WETH-paired launch for native through `PeddlesV4SwapRouter`. */
export function buildPartnerSellV4(a: PartnerSellArgs) {
  const t = checkedTerms(a);
  return {
    address: t.forwarder,
    abi: partnerFeeForwarderAbi,
    functionName: 'sellV4' as const,
    args: [requireAddress('token', a.token), requireUint('amountIn', a.amountIn), requireUint('minOutNet', a.minOutNet), t.feeBps, t.partner, a.deadline] as const,
  };
}

/** `buyRoute` — any launch type through `PeddlesRouteSwapRouter.buyWithNative` (empty hops for a WETH-paired launch). */
export function buildPartnerBuyRoute(a: PartnerBuyArgs & { readonly hops: readonly PartnerPathHop[] }) {
  const t = checkedTerms(a);
  return {
    address: t.forwarder,
    abi: partnerFeeForwarderAbi,
    functionName: 'buyRoute' as const,
    args: [requireAddress('token', a.token), hopsOf(a.hops), requireUint('minOut', a.minOut), t.feeBps, t.partner, a.deadline] as const,
    value: buyValue(a.value),
  };
}

/** `sellRoute` — any launch type through `PeddlesRouteSwapRouter.sellForNative`. */
export function buildPartnerSellRoute(a: PartnerSellArgs & { readonly hops: readonly PartnerPathHop[] }) {
  const t = checkedTerms(a);
  return {
    address: t.forwarder,
    abi: partnerFeeForwarderAbi,
    functionName: 'sellRoute' as const,
    args: [requireAddress('token', a.token), requireUint('amountIn', a.amountIn), hopsOf(a.hops), requireUint('minOutNet', a.minOutNet), t.feeBps, t.partner, a.deadline] as const,
  };
}

/** `buyExternal` — a v4 token the launchpad does not know, through `buyExternalWithNative`. */
export function buildPartnerBuyExternal(a: PartnerBuyArgs & { readonly hops: readonly PartnerPathHop[] }) {
  const t = checkedTerms(a);
  return {
    address: t.forwarder,
    abi: partnerFeeForwarderAbi,
    functionName: 'buyExternal' as const,
    args: [requireAddress('token', a.token), hopsOf(a.hops), requireUint('minOut', a.minOut), t.feeBps, t.partner, a.deadline] as const,
    value: buyValue(a.value),
  };
}

/** `sellExternal` — sell an external v4 token for native through `sellExternalForNative`. */
export function buildPartnerSellExternal(a: PartnerSellArgs & { readonly hops: readonly PartnerPathHop[] }) {
  const t = checkedTerms(a);
  return {
    address: t.forwarder,
    abi: partnerFeeForwarderAbi,
    functionName: 'sellExternal' as const,
    args: [requireAddress('token', a.token), requireUint('amountIn', a.amountIn), hopsOf(a.hops), requireUint('minOutNet', a.minOutNet), t.feeBps, t.partner, a.deadline] as const,
  };
}

/** `buyRoutePancake` — a stock-paired launch whose quote trades on PancakeSwap (BNB Smart Chain). */
export function buildPartnerBuyRoutePancake(a: PartnerBuyArgs & { readonly hops: readonly PartnerPancakeHop[] }) {
  const t = checkedTerms(a);
  return {
    address: t.forwarder,
    abi: partnerFeeForwarderAbi,
    functionName: 'buyRoutePancake' as const,
    args: [requireAddress('token', a.token), pancakeHopsOf(a.hops), requireUint('minOut', a.minOut), t.feeBps, t.partner, a.deadline] as const,
    value: buyValue(a.value),
  };
}

/** `sellRoutePancake` — the PancakeSwap sell. */
export function buildPartnerSellRoutePancake(a: PartnerSellArgs & { readonly hops: readonly PartnerPancakeHop[] }) {
  const t = checkedTerms(a);
  return {
    address: t.forwarder,
    abi: partnerFeeForwarderAbi,
    functionName: 'sellRoutePancake' as const,
    args: [requireAddress('token', a.token), requireUint('amountIn', a.amountIn), pancakeHopsOf(a.hops), requireUint('minOutNet', a.minOutNet), t.feeBps, t.partner, a.deadline] as const,
  };
}

/** `withdraw()` — pay the calling partner everything it is owed. Signed by the partner's own wallet. */
export function buildPartnerWithdraw(forwarder: Address) {
  return { address: requireAddress('forwarder', forwarder), abi: partnerFeeForwarderAbi, functionName: 'withdraw' as const, args: [] as const };
}

/** `withdrawTo(to)` — for a partner contract that cannot receive native itself. */
export function buildPartnerWithdrawTo(forwarder: Address, to: Address) {
  return { address: requireAddress('forwarder', forwarder), abi: partnerFeeForwarderAbi, functionName: 'withdrawTo' as const, args: [requireAddress('to', to)] as const };
}

/** Any request above as raw `{ to, data, value }` for a wallet that takes calldata. */
export function encodePartnerCall(request: {
  readonly address: Address;
  readonly abi: typeof partnerFeeForwarderAbi;
  readonly functionName: string;
  readonly args: readonly unknown[];
  readonly value?: bigint;
}): { to: Address; data: Hex; value: bigint } {
  const data = encodeFunctionData({
    abi: request.abi,
    functionName: request.functionName,
    args: request.args,
  } as Parameters<typeof encodeFunctionData>[0]);
  return { to: request.address, data, value: request.value ?? 0n };
}
