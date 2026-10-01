import assert from 'node:assert/strict';
import test from 'node:test';
import { concat, encodeAbiParameters, keccak256, getAddress, slice } from 'viem';

import {
  BPS,
  CREATOR_FEE_BPS,
  MAX_CREATOR_TAX_BPS,
  MAX_FEE_AMOUNT,
  MIN_CREATOR_TAX_BPS,
  PLATFORM_FEE_BPS,
  feeSplit,
} from '../feeSplit.js';
import * as rootEntry from '../index.js';
// The contract itself, as text, so the constants cannot drift from the source they mirror.
import hookSource from '../../contracts/src/PeddlesFeeHook.sol';

/**
 * The fixed-terms fee split. No runner is installed; this is `node:test` bundled
 * with the esbuild apps/web already ships. From the repo root:
 *
 *   apps/web/node_modules/.bin/esbuild packages/sdk/src/__tests__/feeSplit.test.ts \
 *     --bundle --platform=node --format=esm --loader:.sol=text --outfile=$TEMP/sdk-fee.test.mjs
 *   node --test --test-reporter=spec $TEMP/sdk-fee.test.mjs
 */

/** `_book`, transcribed line for line from PeddlesFeeHook.sol — the oracle for the grid. */
function book(total: bigint, excessToCreatorBps: bigint, fee: bigint) {
  const platformCut = (fee * 50n) / total;
  const creatorBase = (fee * 50n) / total;
  const excess = fee - platformCut - creatorBase;
  const creatorCut = creatorBase + (excess * excessToCreatorBps) / 10000n;
  const holderCut = fee - platformCut - creatorCut;
  return { platform: platformCut, creator: creatorCut, holders: holderCut };
}

function constantIn(source: string, name: string): string {
  const m = new RegExp(`constant\\s+${name}\\s*=\\s*([^;]+);`).exec(source);
  assert.ok(m, `PeddlesFeeHook.sol declares ${name}`);
  return (m[1] as string).trim();
}

test('constants mirror PeddlesFeeHook.sol', () => {
  assert.equal(constantIn(hookSource, 'PLATFORM_FEE_BPS'), String(PLATFORM_FEE_BPS));
  assert.equal(constantIn(hookSource, 'CREATOR_FEE_BPS'), String(CREATOR_FEE_BPS));
  assert.equal(constantIn(hookSource, 'MAX_TOTAL_FEE_BPS'), String(MAX_CREATOR_TAX_BPS));
  assert.equal(constantIn(hookSource, 'MIN_TOTAL_FEE_BPS'), 'PLATFORM_FEE_BPS + CREATOR_FEE_BPS');
  assert.equal(constantIn(hookSource, 'MIN_CREATOR_TAX_BPS'), 'MIN_TOTAL_FEE_BPS');
  assert.equal(constantIn(hookSource, 'MAX_CREATOR_TAX_BPS'), 'MAX_TOTAL_FEE_BPS');
  assert.equal(constantIn(hookSource, 'BPS'), '10_000');
  assert.equal(BPS, 10_000);
  assert.equal(constantIn(hookSource, 'MAX_FEE_AMOUNT'), 'uint256(uint128(type(int128).max))');
  assert.equal(MAX_FEE_AMOUNT, 2n ** 127n - 1n);
  assert.equal(MIN_CREATOR_TAX_BPS, 100);
});

test('the split formula in the source is the one transcribed here', () => {
  // If `_book` changes shape, this fails before the grid can pass against a stale oracle.
  for (const line of [
    'uint256 platformCut = (fee * PLATFORM_FEE_BPS) / total;',
    'uint256 creatorBase = (fee * CREATOR_FEE_BPS) / total;',
    'uint256 excess = fee - platformCut - creatorBase;',
    'uint256 creatorCut = creatorBase + (excess * c.excessToCreatorBps) / BPS;',
    'uint256 holderCut = fee - platformCut - creatorCut;',
  ]) {
    assert.ok(hookSource.includes(line), `PeddlesFeeHook.sol contains: ${line}`);
  }
});

const TAXES = [100, 101, 550, 1000];
const EXCESS = [0, 5000, 10000];
const FEES = [0n, 1n, 2n, 49n, 99n, 100n, 101n, 549n, 551n, 999n, 1001n, 12_345n, 10n ** 18n + 3n, MAX_FEE_AMOUNT];

test('grid: excess ∈ {0, 5000, 10000} × tax ∈ {100, 101, 550, 1000} matches the contract exactly', () => {
  let cases = 0;
  for (const tax of TAXES) {
    for (const e of EXCESS) {
      for (const fee of FEES) {
        const got = feeSplit(tax, e, fee);
        const want = book(BigInt(tax), BigInt(e), fee);
        assert.deepEqual(got, want, `tax=${tax} e=${e} fee=${fee}`);
        assert.equal(got.platform + got.creator + got.holders, fee, 'legs sum to the fee');
        assert.ok(got.platform >= 0n && got.creator >= 0n && got.holders >= 0n, 'no negative leg');
        if (e === 10000) assert.equal(got.holders, 0n, 'all excess to creator leaves holders nothing');
        if (e === 0) {
          // Creator keeps exactly the fixed leg; every floor's dust is with holders.
          assert.equal(got.creator, got.platform);
          assert.equal(got.holders, fee - 2n * got.platform);
        }
        cases++;
      }
    }
  }
  assert.equal(cases, TAXES.length * EXCESS.length * FEES.length);
});

test('worked vectors', () => {
  assert.deepEqual(feeSplit(550, 5000, 1_000_000n), { platform: 90_909n, creator: 500_000n, holders: 409_091n });
  assert.deepEqual(feeSplit(101, 0, 101n), { platform: 50n, creator: 50n, holders: 1n });
  assert.deepEqual(feeSplit(100, 10000, 99n), { platform: 49n, creator: 50n, holders: 0n });
  assert.deepEqual(feeSplit(1000, 10000, 12_345n), { platform: 617n, creator: 11_728n, holders: 0n });
  assert.deepEqual(feeSplit(1000, 0, 1000n), { platform: 50n, creator: 50n, holders: 900n });
  // At the 1% floor with e=0 the holder leg is at most the odd unit two floors leave.
  assert.deepEqual(feeSplit(100, 0, 101n), { platform: 50n, creator: 50n, holders: 1n });
});

test('the contract table in PeddlesFeeHook.sol (as shares of volume)', () => {
  // fee = gross × tax / 10000 on a gross of 1_000_000 units, so 1 unit = 0.0001%.
  const gross = 1_000_000n;
  const at = (tax: number, e: number) => feeSplit(tax, e, (gross * BigInt(tax)) / 10000n);
  assert.deepEqual(at(100, 0), { platform: 5_000n, creator: 5_000n, holders: 0n });
  assert.deepEqual(at(300, 0), { platform: 5_000n, creator: 5_000n, holders: 20_000n });
  assert.deepEqual(at(300, 5000), { platform: 5_000n, creator: 15_000n, holders: 10_000n });
  assert.deepEqual(at(1000, 0), { platform: 5_000n, creator: 5_000n, holders: 90_000n });
  assert.deepEqual(at(1000, 10000), { platform: 5_000n, creator: 95_000n, holders: 0n });
});

test('refuses terms and fees the hook would refuse or never charge', () => {
  for (const tax of [0, 99, 1001, 550.5, Number.NaN]) {
    assert.throws(() => feeSplit(tax, 0, 1n), RangeError, `tax ${tax}`);
  }
  for (const e of [-1, 10001, 0.5]) {
    assert.throws(() => feeSplit(550, e, 1n), RangeError, `excess ${e}`);
  }
  assert.throws(() => feeSplit(550, 0, -1n), RangeError);
  assert.throws(() => feeSplit(550, 0, MAX_FEE_AMOUNT + 1n), RangeError);
  assert.throws(() => feeSplit(550, 0, 1 as unknown as bigint), TypeError);
});

test('root entry exports the split, the terms read, and the fee-hook ABI', () => {
  assert.equal(rootEntry.feeSplit, feeSplit);
  assert.equal(typeof rootEntry.getPoolTerms, 'function');
  assert.ok(rootEntry.feeHookAbi.some((e) => e.type === 'function' && e.name === 'poolConfig'));
  for (const id of [4663, 8453] as const) assert.ok(!('PeddlesCreatorFeeHook' in rootEntry.DEPLOYMENTS[id]), 'retired contract is not shipped');
  assert.ok(!('11155111' in rootEntry.DEPLOYMENTS), 'the published address book is mainnet only');
});

test('computeTokenAddress is the factory CREATE2 formula', () => {
  const factory = '0x098f781da692d5Ff477ca5abE4fcb213168a1978' as const;
  const sender = '0xD2CBB85Fd79FB3cE472eF779b8D8CA7Fb4fb1978' as const;
  const salt = keccak256('0x1234');
  const creationCodeHash = keccak256('0xdeadbeef');
  const variant = 1;
  // Independent transcription of `_boundSalt` + `_computeAddress`.
  const boundSalt = keccak256(
    encodeAbiParameters([{ type: 'uint8' }, { type: 'address' }, { type: 'bytes32' }], [variant, sender, salt]),
  );
  const digest = keccak256(concat(['0xff', factory, boundSalt, creationCodeHash]));
  const want = getAddress(slice(digest, 12));
  assert.equal(rootEntry.computeTokenAddress({ factory, variant, sender, salt, creationCodeHash }), want);
  // The variant is part of the address.
  assert.notEqual(
    rootEntry.computeTokenAddress({ factory, variant: 2, sender, salt, creationCodeHash }),
    want,
  );
});
