import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeFunctionData, getAddress, hashDomain, hashTypedData, keccak256, recoverAddress, toHex } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

import {
  PARTNER_FEE_FORWARDERS,
  PARTNER_VOUCHER_TYPEHASH,
  PartnerUnavailableError,
  buildPartnerBuyRoute,
  buildPartnerBuyV4,
  buildPartnerSellRoutePancake,
  buildPartnerWithdraw,
  encodePartnerCall,
  parsePartnerVoucher,
  partnerDomainSeparator,
  partnerFeeForwarderFor,
  partnerFeeSplit,
  partnerVoucherDigest,
  partnerVoucherTypedData,
  type PartnerVoucher,
} from '../partner.js';
import { partnerFeeForwarderAbi } from '../abis.js';
import * as rootEntry from '../index.js';
import { DEPLOYMENTS } from '../deployments.generated.js';
// The contract itself, as text: the domain strings and the type string are pinned against the source.
import forwarderSource from '../../contracts/src/PeddlesPartnerFeeForwarder.sol';

/** Base: the SDK's address book carries mainnets only. */
const CHAIN = 8453;
const PARTNER = getAddress('0x1111111111111111111111111111111111111111');
const EXPIRY = 1_900_000_000n;

test('the forwarder per chain comes from the address book, null where absent', () => {
  for (const [id, book] of Object.entries(DEPLOYMENTS)) {
    const listed = (book as Record<string, string>)['PeddlesPartnerFeeForwarder'] ?? null;
    assert.equal(partnerFeeForwarderFor(Number(id)), listed, `chain ${id}`);
  }
  for (const id of [8453, 4663, 56, 5042]) assert.match(String(PARTNER_FEE_FORWARDERS[id as keyof typeof PARTNER_FEE_FORWARDERS]), /^0x[0-9a-fA-F]{40}$/);
  assert.throws(() => partnerFeeForwarderFor(1), /no deployment for chain 1/);
  // Sepolia is a testnet: the published address book does not carry it.
  assert.throws(() => partnerFeeForwarderFor(11155111), /no deployment for chain 11155111/);
});

test('the EIP-712 strings match the contract source', () => {
  assert.ok(forwarderSource.includes('keccak256("PartnerVoucher(address partner,uint256 expiry)")'));
  assert.ok(forwarderSource.includes('keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)")'));
  assert.ok(forwarderSource.includes('keccak256("PeddlesPartnerFeeForwarder")'));
  assert.ok(forwarderSource.includes('keccak256("1")'));
  // The digest prefix and the struct encoding, as the contract writes them.
  assert.ok(forwarderSource.includes('abi.encodePacked("\\x19\\x01", domainSeparator(), keccak256(abi.encode(VOUCHER_TYPEHASH, partner, expiry)))'));
  assert.equal(PARTNER_VOUCHER_TYPEHASH, keccak256(toHex('PartnerVoucher(address partner,uint256 expiry)')));
});

test('the digest computed like the contract equals viem hashTypedData (an independent implementation)', () => {
  for (const [id, forwarder] of Object.entries(PARTNER_FEE_FORWARDERS)) {
    if (!forwarder) continue;
    const chainId = Number(id);
    for (const expiry of [0n, 1n, EXPIRY, 2n ** 256n - 1n]) {
      const typed = partnerVoucherTypedData(chainId, forwarder, PARTNER, expiry);
      assert.equal(partnerVoucherDigest(chainId, forwarder, PARTNER, expiry), hashTypedData(typed), `chain ${chainId} expiry ${expiry}`);
      assert.equal(partnerDomainSeparator(chainId, forwarder), hashDomain({ domain: typed.domain, types: { EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' },
      ] } }));
    }
  }
});

test('the domain binds chain and contract: the same voucher digests differently elsewhere', () => {
  const f = PARTNER_FEE_FORWARDERS[CHAIN]!;
  const a = partnerVoucherDigest(CHAIN, f, PARTNER, EXPIRY);
  assert.notEqual(a, partnerVoucherDigest(4663, f, PARTNER, EXPIRY));
  assert.notEqual(a, partnerVoucherDigest(CHAIN, PARTNER, PARTNER, EXPIRY));
  assert.notEqual(a, partnerVoucherDigest(CHAIN, f, PARTNER, EXPIRY + 1n));
});

test('a signature over the typed data recovers the signer from the contract-style digest', async () => {
  const signer = privateKeyToAccount(generatePrivateKey());
  const f = PARTNER_FEE_FORWARDERS[CHAIN]!;
  const signature = await signer.signTypedData(partnerVoucherTypedData(CHAIN, f, PARTNER, EXPIRY));
  assert.equal(await recoverAddress({ hash: partnerVoucherDigest(CHAIN, f, PARTNER, EXPIRY), signature }), signer.address);
  // 65 bytes and a low s, which `_signed` requires.
  assert.equal((signature.length - 2) / 2, 65);
  const s = BigInt(`0x${signature.slice(66, 130)}`);
  assert.ok(s <= 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0n);
});

test('partnerFeeSplit mirrors the contract: every division rounds down, the partner share comes out of the platform fee', () => {
  const s = partnerFeeSplit(1_000_000_000_000_000_000n, 50, 100, 1000);
  assert.equal(s.platformFee, 5_000_000_000_000_000n);
  assert.equal(s.partnerShare, 500_000_000_000_000n);
  assert.equal(s.partnerFee, 10_000_000_000_000_000n);
  assert.equal(s.toFeeRecipient, 4_500_000_000_000_000n);
  assert.equal(s.toPartner, 10_500_000_000_000_000n);
  const dust = partnerFeeSplit(199n, 50, 0, 1000);
  assert.equal(dust.platformFee, 0n);
  const odd = partnerFeeSplit(10_001n, 200, 33, 5000);
  assert.equal(odd.platformFee, 200n);
  assert.equal(odd.partnerShare, 100n);
  assert.equal(odd.partnerFee, 33n);
  assert.throws(() => partnerFeeSplit(1n, 1.5, 0, 0), RangeError);
});

function voucher(over: Partial<PartnerVoucher> = {}): PartnerVoucher {
  return {
    chainId: CHAIN,
    forwarder: PARTNER_FEE_FORWARDERS[CHAIN]!,
    partner: PARTNER,
    expiry: EXPIRY,
    signature: `0x${'11'.repeat(64)}1b`,
    ...over,
  };
}

test('builders produce calldata that decodes to the voucher and the rates the trader signs', () => {
  const token = getAddress('0x2222222222222222222222222222222222222222');
  const req = buildPartnerBuyV4({ voucher: voucher(), feeBps: 50, partnerFeeBps: 25, deadline: 1_800_000_000n, token, value: 10n ** 16n, minOut: 1n });
  const call = encodePartnerCall(req);
  assert.equal(call.to, PARTNER_FEE_FORWARDERS[CHAIN]);
  assert.equal(call.value, 10n ** 16n);
  const decoded = decodeFunctionData({ abi: partnerFeeForwarderAbi, data: call.data });
  assert.equal(decoded.functionName, 'buyV4');
  const [dToken, dMin, dFee, dPartner, dDeadline] = decoded.args as unknown as [string, bigint, number, { partner: string; partnerFeeBps: number; expiry: bigint; signature: string }, bigint];
  assert.equal(dToken, token);
  assert.equal(dMin, 1n);
  assert.equal(dFee, 50);
  assert.equal(dPartner.partner, PARTNER);
  assert.equal(dPartner.partnerFeeBps, 25);
  assert.equal(dPartner.expiry, EXPIRY);
  assert.equal(dDeadline, 1_800_000_000n);

  const route = encodePartnerCall(
    buildPartnerBuyRoute({ voucher: voucher(), feeBps: 50, partnerFeeBps: 0, deadline: 1n, token, value: 1n, minOut: 0n, hops: [] }),
  );
  assert.equal(decodeFunctionData({ abi: partnerFeeForwarderAbi, data: route.data }).functionName, 'buyRoute');
  const sell = encodePartnerCall(
    buildPartnerSellRoutePancake({ voucher: voucher(), feeBps: 50, partnerFeeBps: 0, deadline: 1n, token, amountIn: 5n, minOutNet: 0n, hops: [{ tokenIn: token, tokenOut: PARTNER, fee: 2500 }] }),
  );
  assert.equal(sell.value, 0n);
  assert.equal(decodeFunctionData({ abi: partnerFeeForwarderAbi, data: sell.data }).functionName, 'sellRoutePancake');
  assert.equal(decodeFunctionData({ abi: partnerFeeForwarderAbi, data: encodePartnerCall(buildPartnerWithdraw(PARTNER_FEE_FORWARDERS[CHAIN]!)).data }).functionName, 'withdraw');
});

test('builders fail closed on a voucher for another chain or forwarder, and on rates outside the live terms', () => {
  const token = getAddress('0x2222222222222222222222222222222222222222');
  const base = { feeBps: 50, partnerFeeBps: 0, deadline: 1n, token, value: 1n, minOut: 0n };
  assert.throws(() => buildPartnerBuyV4({ ...base, voucher: voucher(), chainId: 4663 }), PartnerUnavailableError);
  assert.throws(() => buildPartnerBuyV4({ ...base, voucher: voucher({ forwarder: PARTNER }) }), PartnerUnavailableError);
  const terms = { minFeeBps: 50, maxFeeBps: 200, maxPartnerFeeBps: 100 };
  assert.throws(() => buildPartnerBuyV4({ ...base, feeBps: 49, voucher: voucher(), terms }), RangeError);
  assert.throws(() => buildPartnerBuyV4({ ...base, feeBps: 201, voucher: voucher(), terms }), RangeError);
  assert.throws(() => buildPartnerBuyV4({ ...base, partnerFeeBps: 101, voucher: voucher(), terms }), RangeError);
  assert.throws(() => buildPartnerBuyV4({ ...base, value: 0n, voucher: voucher() }), RangeError);
  assert.equal(buildPartnerBuyV4({ ...base, voucher: voucher(), terms, chainId: CHAIN }).functionName, 'buyV4');
});

test('parsePartnerVoucher takes the API JSON and refuses anything malformed', () => {
  const v = parsePartnerVoucher({ chainId: CHAIN, forwarder: PARTNER_FEE_FORWARDERS[CHAIN]!.toLowerCase(), partner: PARTNER.toLowerCase(), expiry: '1900000000', signature: `0x${'ab'.repeat(65)}` });
  assert.equal(v.expiry, EXPIRY);
  assert.equal(v.partner, PARTNER);
  assert.throws(() => parsePartnerVoucher({ ...v, expiry: '1.5', signature: v.signature }), TypeError);
  assert.throws(() => parsePartnerVoucher({ chainId: CHAIN, forwarder: v.forwarder, partner: v.partner, expiry: '1', signature: '0x12' }), TypeError);
});

test('the root entry exports the partner surface', () => {
  assert.equal(typeof rootEntry.partnerFeeForwarderFor, 'function');
  assert.equal(typeof rootEntry.partnerVoucherTypedData, 'function');
  assert.equal(typeof rootEntry.buildPartnerBuyRoute, 'function');
  assert.ok(Array.isArray(rootEntry.partnerFeeForwarderAbi));
});
