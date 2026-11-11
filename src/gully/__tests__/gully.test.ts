import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeFunctionData, encodeAbiParameters, encodeEventTopics, keccak256, maxUint256, toBytes, type Log } from 'viem';
import {
  GULLY_LAUNCH_SALT_DOMAIN,
  GullyLaunchRefusedError,
  GullyUnavailableError,
  buildGullyApproveTx,
  buildGullyLaunchTx,
  gullyDeploymentFor,
  gullyLaunchSalt,
  gullyLaunchedFromReceipt,
  gullyLaunchpadAbi,
  gullyMetadataCalls,
  gullyQuoteTokenAbi,
  gullyTokenMetadataAbi,
  isGullyChain,
  readGullyPendingLaunch,
  writeGullyPendingLaunch,
  clearGullyPendingLaunch,
  type GullyLaunchArgs,
} from '../index.js';

const D = gullyDeploymentFor(6714);
const CREATOR = '0xeF2d4791A7B3dc4c00ABa9FbF7D6660bA5a017bD' as const;
const SALT = '0xa4ffd8a53025da08b7e37c1fbaba5ebede49f42fa14b27b9fb4ed1394acdad58' as const;
const BASE: GullyLaunchArgs = {
  variant: 0,
  salt: SALT,
  name: 'T',
  symbol: 'T',
  metadata: { image: '', website: '', x: '', telegram: '' },
  creatorTaxBps: 300n,
  excessToCreatorBps: 5000n,
  firstBuy: 0n,
  minTokensOut: 0n,
};

test('the address book is the 6714 record, and only Gully chains are in it', () => {
  assert.equal(D.launchpad, '0xD01C35110Ed7d608da332620C041627E859Da4DA');
  assert.equal(D.quoteToken, '0x83fd06F0846d9D90B3016bF670Efe2E0B11cDe14');
  assert.equal(D.rewardStreamSeconds, 3600);
  assert.ok(isGullyChain(6714));
  for (const id of [1, 56, 8453, 4663, 5042, 99901, 11155111]) {
    assert.equal(isGullyChain(id), false);
    assert.throws(() => gullyDeploymentFor(id), GullyUnavailableError);
    assert.throws(() => buildGullyApproveTx(id, { launchFee: 1n, firstBuy: 0n }), GullyUnavailableError);
  }
});

test('the launch salt domain and binding are the contract\'s', () => {
  assert.equal(GULLY_LAUNCH_SALT_DOMAIN, keccak256(toBytes('PEDDLES_GULLY_LAUNCH_SALT')));
  assert.equal(
    gullyLaunchSalt(CREATOR, SALT),
    keccak256(encodeAbiParameters([{ type: 'bytes32' }, { type: 'address' }, { type: 'bytes32' }], [GULLY_LAUNCH_SALT_DOMAIN, CREATOR, SALT])),
  );
});

test('the approval is exactly fee + first buy, to the launchpad, with no value', () => {
  const tx = buildGullyApproveTx(6714, { launchFee: 2n * 10n ** 18n, firstBuy: 5n });
  assert.equal(tx.to, D.quoteToken);
  assert.equal(tx.value, 0n);
  const { functionName, args } = decodeFunctionData({ abi: gullyQuoteTokenAbi, data: tx.data });
  assert.equal(functionName, 'approve');
  assert.deepEqual(args, [D.launchpad, 2n * 10n ** 18n + 5n]);
  assert.notEqual(args?.[1], maxUint256);
  assert.throws(() => buildGullyApproveTx(6714, { launchFee: 0n, firstBuy: 0n }), GullyLaunchRefusedError);
  assert.throws(() => buildGullyApproveTx(6714, { launchFee: -1n, firstBuy: 2n }), GullyLaunchRefusedError);
});

test('the launch call is refused rather than defaulted', () => {
  const tx = buildGullyLaunchTx(6714, BASE);
  assert.equal(tx.functionName, 'launch');
  assert.equal(tx.value, 0n);
  // A first buy with no floor from a simulation is never built.
  assert.throws(() => buildGullyLaunchTx(6714, { ...BASE, firstBuy: 1n, minTokensOut: 0n }), GullyLaunchRefusedError);
  const buy = buildGullyLaunchTx(6714, { ...BASE, firstBuy: 1n, minTokensOut: 1n });
  assert.equal(buy.functionName, 'launchAndBuy');
  assert.throws(() => buildGullyLaunchTx(6714, { ...BASE, variant: 2 as 0 }), GullyLaunchRefusedError);
  assert.throws(() => buildGullyLaunchTx(6714, { ...BASE, creatorTaxBps: 50n }), GullyLaunchRefusedError);
  const decoded = decodeFunctionData({ abi: gullyLaunchpadAbi, data: buy.data });
  assert.equal(decoded.functionName, 'launchAndBuy');
});

test('contractURI is optional and written first; empty fields are dropped', () => {
  assert.deepEqual(gullyMetadataCalls({ image: ' ', website: '', x: '', telegram: '' }), []);
  const calls = gullyMetadataCalls({ contractURI: ' ipfs://c ', image: 'ipfs://i', website: '', x: '', telegram: '' });
  assert.equal(calls.length, 2);
  assert.deepEqual(decodeFunctionData({ abi: gullyTokenMetadataAbi, data: calls[0]! }).args, ['ipfs://c']);
  assert.deepEqual(decodeFunctionData({ abi: gullyTokenMetadataAbi, data: calls[1]! }).args, ['image', 'ipfs://i']);
});

test('the pending record round-trips and rejects garbage', () => {
  const m = new Map<string, string>();
  const store = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
  writeGullyPendingLaunch(store, 6714, { salt: SALT, hash: null, variant: 1, creator: CREATOR });
  assert.deepEqual(readGullyPendingLaunch(store, 6714), { salt: SALT, hash: null, variant: 1, creator: CREATOR });
  assert.equal(m.has('peddles.gully-launch.6714'), true);
  m.set('peddles.gully-launch.6714', '{"salt":"0x1","variant":0}');
  assert.equal(readGullyPendingLaunch(store, 6714), null);
  clearGullyPendingLaunch(store, 6714);
  assert.equal(readGullyPendingLaunch(store, 6714), null);
});

test('a receipt names the coin only from this launchpad and this creator', () => {
  const token = '0x16A3e8E5a0Bca8F666C982acDCBBdD1dF5BC79C4' as const;
  const topics = encodeEventTopics({ abi: gullyLaunchpadAbi, eventName: 'PeddlesLaunchedV20', args: { token, creator: CREATOR, salt: SALT } });
  const zero = '0x0000000000000000000000000000000000000000' as const;
  const data = encodeAbiParameters(
    [{ type: 'address' }, { type: 'address' }, { type: 'address' }, { type: 'address' }, { type: 'uint16' }, { type: 'uint16' }, { type: 'bytes32' }, { type: 'uint256' }],
    [D.launchpad, zero, zero, zero, 300, 5000, '0x4fbfa25004c06847f86925466ced9339fadfb857148b986920ae63f4df542715', 1n],
  );
  const log = (address: `0x${string}`) =>
    ({ address, topics, data, blockHash: null, blockNumber: null, logIndex: null, transactionHash: null, transactionIndex: null, removed: false }) as unknown as Log;
  assert.deepEqual(gullyLaunchedFromReceipt([log(D.launchpad)], D.launchpad, CREATOR), {
    token,
    poolId: '0x4fbfa25004c06847f86925466ced9339fadfb857148b986920ae63f4df542715',
    positionId: 1n,
  });
  assert.equal(gullyLaunchedFromReceipt([log(D.feeHook)], D.launchpad, CREATOR), null);
  assert.equal(gullyLaunchedFromReceipt([log(D.launchpad)], D.launchpad, D.feeHook), null);
});
