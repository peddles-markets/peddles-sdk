import assert from 'node:assert/strict';
import test from 'node:test';
import { ContractFunctionRevertedError, encodeErrorResult, toFunctionSelector } from 'viem';

import { computeTokenAddress } from '../../index.js';
import { boundSalt, create2Address, hasSuffix, mineSalt, MiningAbortedError, MiningExhaustedError, randomSalt } from '../salt.js';
import { decodeLaunchRevert, revertIdentifier } from '../revert.js';
import { getSqrtPriceAtTick, liquidityForAmount, amountForLiquidity } from '../tickMath.js';
import { resolveTerms, variantForType, type LaunchVariant } from '../variants.js';
import { feeSplitRate, formatRatePercent, parseTaxPercent, validateFeeTerms } from '../feeTerms.js';

const FACTORY = '0x49F730DC7ecab3B0bb2A4D2C77E7aAC7C1741978' as const;
const SENDER = '0x43aC520D456f17f0Dad1291DB6CEfF9d88151978' as const;
const HASH = `0x${'11'.repeat(32)}` as const;

test('salt: the miner derives the same address as the SDK root computeTokenAddress', () => {
  const salt = randomSalt();
  const viaMiner = create2Address(FACTORY, boundSalt(1, SENDER, salt), HASH);
  const viaRoot = computeTokenAddress({ factory: FACTORY, variant: 1, sender: SENDER, salt, creationCodeHash: HASH });
  assert.equal(viaMiner, viaRoot);
});

test('salt: mines a suffix, honours the ceiling, and can be cancelled', async () => {
  // One byte keeps the test fast (1 in 256); the derivation is the same as for `1978`.
  const mined = await mineSalt({ deployer: FACTORY, variant: 0, sender: SENDER, initCodeHash: HASH, suffix: '78' });
  assert.ok(hasSuffix(mined.address, '78'));
  assert.equal(mined.address, computeTokenAddress({ factory: FACTORY, variant: 0, sender: SENDER, salt: mined.salt, creationCodeHash: HASH }));

  await assert.rejects(
    mineSalt({ deployer: FACTORY, variant: 0, sender: SENDER, initCodeHash: HASH, suffix: '1978', maxAttempts: 8 }),
    MiningExhaustedError,
  );
  await assert.rejects(
    mineSalt({ deployer: FACTORY, variant: 0, sender: SENDER, initCodeHash: HASH, suffix: '1978', signal: { aborted: true } }),
    MiningAbortedError,
  );
  await assert.rejects(mineSalt({ deployer: FACTORY, variant: 0, sender: SENDER, initCodeHash: HASH, suffix: 'zz' }), /whole hex bytes/);
});

test('tickMath: sqrt prices and the round-up shave match the contract’s edge values', () => {
  assert.equal(getSqrtPriceAtTick(0), 1n << 96n);
  assert.equal(getSqrtPriceAtTick(-887272), 4295128739n);
  assert.equal(getSqrtPriceAtTick(887272), 1461446703485210103287273052203988822378723970342n);
  assert.throws(() => getSqrtPriceAtTick(887273), /outside/);
  const q = liquidityForAmount(true, -887220, 887220, 10n ** 27n);
  assert.ok(q);
  assert.ok(q.amountUsed <= 10n ** 27n);
  assert.ok(amountForLiquidity(true, q.sqrtLower, q.sqrtUpper, q.liquidity + 1n) > 10n ** 27n || q.liquidity === (1n << 128n) - 1n);
  assert.equal(liquidityForAmount(true, 100, 50, 10n), null);
});

test('feeTerms: bounds, the exact split and the render helpers', () => {
  assert.equal(validateFeeTerms({ taxBps: 100n, excessToCreatorBps: 0n }), null);
  assert.deepEqual(validateFeeTerms({ taxBps: 99n, excessToCreatorBps: 0n }), { field: 'taxBps', code: 'TAX_BELOW_MIN' });
  assert.deepEqual(validateFeeTerms({ taxBps: 500n, excessToCreatorBps: 10_001n }), { field: 'excessToCreatorBps', code: 'SPLIT_OUT_OF_RANGE' });
  const rate = feeSplitRate({ taxBps: 450n, excessToCreatorBps: 2500n });
  assert.ok(rate);
  assert.equal(rate.total, 450n * 10_000n);
  assert.equal(rate.platform + rate.creator + rate.holders, rate.total);
  assert.equal(formatRatePercent(rate.platform), '0.50');
  assert.equal(formatRatePercent(rate.creator), '1.375');
  assert.equal(formatRatePercent(rate.holders), '2.625');
  assert.equal(parseTaxPercent('4.5'), 450n);
  assert.equal(parseTaxPercent('4.567'), null);
});

test('revert: custom errors the calling ABI lacks resolve by selector; unknown ones are not guessed', () => {
  for (const [signature, expected] of [
    ['FeeAboveCap()', /above the 10\.00% maximum/],
    ['FeeBelowFloor()', /below the 1\.00% minimum/],
    ['NotifyGasTooLow()', /ran out of gas/],
    ['FeeStackingForbidden()', /second fee/],
    ['QUOTE_NOT_ALLOWED()', /does not allow this quote asset/],
    ['POOL_PRICE_MISMATCH()', /fresh salt/],
  ] as const) {
    const error = new ContractFunctionRevertedError({ abi: [], data: toFunctionSelector(signature), functionName: 'createCoin' });
    const decoded = decodeLaunchRevert(error);
    assert.equal(decoded.raw, signature.slice(0, -2));
    assert.match(decoded.message, expected);
  }
  const unknown = new ContractFunctionRevertedError({ abi: [], data: '0xdeadbeef', functionName: 'createCoin' });
  assert.equal(decodeLaunchRevert(unknown).raw, null);

  // Raw revert data (what `eth_call` returns) decodes the same way, and Error(string) reasons too.
  const errorString = encodeErrorResult({ abi: [{ type: 'error', name: 'Error', inputs: [{ type: 'string' }] }], errorName: 'Error', args: ['CREATOR_MISMATCH'] });
  assert.equal(revertIdentifier(errorString), 'CREATOR_MISMATCH');
  assert.match(decodeLaunchRevert(errorString).message, /different creator address/);
});

test('variants: terms resolve as the contracts refuse, and a public type picks exactly one variant', () => {
  const full = { liquidityBps: 10_000n, airdropBps: 0n, vestingBps: 0n, burnBps: 0n, clogBps: 0n, clogSliceBps: 0n, clogMinIntervalSeconds: 0n };
  const clog = { ...full, liquidityBps: 9_500n, clogBps: 500n, clogSliceBps: 28n, clogMinIntervalSeconds: 600n };
  assert.equal(resolveTerms(full).ok, true);
  const resolvedClog = resolveTerms(clog);
  assert.ok(resolvedClog.ok);
  assert.equal(resolvedClog.shape, 'clog');
  assert.equal(resolveTerms({ ...full, liquidityBps: 9_000n, vestingBps: 1_000n }).ok, false);
  assert.equal(resolveTerms({ ...clog, clogSliceBps: 0n }).ok, false);

  const mk = (id: number, allocation: typeof full, enabled = true): LaunchVariant => ({ id, enabled, allocation, terms: resolveTerms(allocation), refusal: enabled ? null : 'retired' });
  const list = [mk(0, full), mk(1, clog)];
  const standard = variantForType(list, 'standard');
  assert.ok('variant' in standard);
  assert.equal(standard.variant.id, 0);
  const picked = variantForType(list, 'clog');
  assert.ok('variant' in picked);
  assert.equal(picked.variant.id, 1);
  assert.ok('refusal' in variantForType([mk(0, full)], 'clog'));
  assert.ok('refusal' in variantForType([mk(0, full), mk(1, clog), mk(2, clog)], 'clog'));
  assert.ok('refusal' in variantForType([mk(0, full), mk(1, clog, false)], 'clog'));
});
