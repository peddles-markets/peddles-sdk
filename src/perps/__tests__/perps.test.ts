import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeFunctionData, getContractAddress, keccak256, toFunctionSelector, toHex } from 'viem';
import { UnknownChainError } from '../../deployments.js';
import {
  PERP_DEPLOYMENTS,
  PERP_HOOK_FLAG,
  PERP_HOOK_FLAG_MASK,
  PERP_HOOK_FLAGS,
  PerpsUnavailableError,
  buildPerpCreate,
  hasPerps,
  isValidPerpHookAddress,
  perpChains,
  perpContracts,
  perpFactoryAbi,
  predictPerpHook,
  predictPerpToken,
  readPerpBase,
} from '../index.js';
import type { ReadClient } from '../../client.js';

/* ---------------------------------------------------------------- address book */

test('perps ship for Base and Robinhood Chain, and every address is well-formed and non-zero', () => {
  assert.ok(hasPerps(8453));
  assert.ok(hasPerps(4663));
  assert.deepEqual(perpChains().sort(), Object.keys(PERP_DEPLOYMENTS).map(Number).sort());
  for (const chainId of perpChains()) {
    const c = perpContracts(chainId);
    assert.equal(c.chainId, chainId);
    for (const a of [c.factory, c.hookDeployer, c.treasury, c.hookCodePointer, ...Object.values(c.baseCandidates)]) {
      assert.match(a, /^0x[0-9a-fA-F]{40}$/);
      assert.ok(!/^0x0{40}$/.test(a));
    }
    assert.ok(Object.keys(c.baseCandidates).length > 0);
  }
  // No chain shares a factory with another.
  const factories = perpChains().map((id) => perpContracts(id).factory.toLowerCase());
  assert.equal(new Set(factories).size, factories.length);
});

test("perpContracts fails closed — never another chain's addresses", () => {
  assert.throws(() => perpContracts(1), UnknownChainError);
  assert.throws(() => perpContracts(56), UnknownChainError);
  assert.throws(() => perpContracts(Number.NaN), UnknownChainError);
});

test('PerpsUnavailableError names the chain', () => {
  const e = new PerpsUnavailableError(5042);
  assert.equal(e.chainId, 5042);
  assert.match(e.message, /5042/);
});

/* ---------------------------------------------------------------- the hook-address rule */

test('the permission bits are the factory constant 0x2ACC, inside the 14-bit mask', () => {
  assert.equal(PERP_HOOK_FLAGS, 0x2acc);
  assert.equal(PERP_HOOK_FLAG_MASK, 0x3fff);
  assert.equal(PERP_HOOK_FLAGS & ~PERP_HOOK_FLAG_MASK, 0);
  assert.equal(Object.keys(PERP_HOOK_FLAG).length, 7);
});

test('the predicate accepts hooks a live factory actually deployed', () => {
  // Sepolia perp markets, from contracts/deployments/11155111-perp.json (launches + superseded).
  for (const hook of [
    '0x513B7067C6E16Aa8f40077d5246585417A5a6AcC',
    '0x2a43FcFdCA70C681BA04Df18c04B4F30Fc372acC',
    '0x01cB58A1a0432aef48C55719396b1809D72cAacc',
    '0x104737630f10C1D4477703742a3F3344Ab892Acc',
  ]) {
    assert.ok(isValidPerpHookAddress(hook), hook);
  }
});

test('the predicate reads only the low 14 bits and refuses anything else (the web vectors)', () => {
  const base = '0x' + '1'.repeat(36);
  assert.ok(isValidPerpHookAddress(`${base}2acc`));
  assert.ok(isValidPerpHookAddress(`${base}2ACC`));
  // Bits 14 and 15 are outside the mask.
  assert.ok(isValidPerpHookAddress(`${base}6acc`));
  assert.ok(isValidPerpHookAddress(`${base}eacc`));
  assert.ok(!isValidPerpHookAddress(`${base}2acd`));
  assert.ok(!isValidPerpHookAddress(`${base}0acc`));
  assert.ok(!isValidPerpHookAddress('0x2acc'));
  assert.ok(!isValidPerpHookAddress('not an address'));
});

const INIT_HASH = keccak256(toHex('peddles perp hook init code, test vector'));
const DEPLOYER = '0x2e25cdaBE3842fe4eC4DC2ABFc9Ba48bbdbbaE59' as const;

test('predictPerpHook / predictPerpToken are plain CREATE2 from the right deployer', () => {
  const salt = keccak256(toHex('salt'));
  assert.equal(
    predictPerpHook(DEPLOYER, salt, INIT_HASH),
    getContractAddress({ opcode: 'CREATE2', from: DEPLOYER, salt, bytecodeHash: INIT_HASH }),
  );
  const factory = '0x341c5396F66C24F5543A1b99Df012EBf2DA7775D' as const;
  assert.equal(
    predictPerpToken(factory, salt, INIT_HASH),
    getContractAddress({ opcode: 'CREATE2', from: factory, salt, bytecodeHash: INIT_HASH }),
  );
  assert.throws(() => predictPerpHook(DEPLOYER, '0x1234', INIT_HASH), /32 bytes/);
});

test('a search over predictPerpHook finds a valid hook (the documented mining recipe)', () => {
  let n = 0n;
  for (;;) {
    const salt = toHex(n, { size: 32 });
    const addr = predictPerpHook(DEPLOYER, salt, INIT_HASH);
    if (isValidPerpHookAddress(addr)) {
      assert.equal(parseInt(addr.slice(-4), 16) & 0x3fff, 0x2acc);
      break;
    }
    n += 1n;
    assert.ok(n < 1_000_000n, 'no hook found in 1M attempts');
  }
});

/* ---------------------------------------------------------------- create calldata */

const TOKEN_SALT = keccak256(toHex('token salt'));
const HOOK_SALT = keccak256(toHex('hook salt'));
const WETH_BASE = '0x4200000000000000000000000000000000000006' as const;

test("buildPerpCreate encodes exactly the CreateParams struct, to the chain's factory, with no value", () => {
  const call = buildPerpCreate({
    chainId: 8453,
    name: 'Moose Money',
    symbol: 'MOOSE',
    tokenUri: 'ipfs://bafy',
    base: WETH_BASE,
    tokenSalt: TOKEN_SALT,
    hookSalt: HOOK_SALT,
    seedBuyBase: 50_000_000_000_000_000n,
  });
  assert.equal(call.to, PERP_DEPLOYMENTS[8453].PeddlesPerpFactory);
  assert.equal(call.value, 0n);
  assert.equal(call.data.slice(0, 10), toFunctionSelector('create((string,string,string,address,bytes32,bytes32,uint256))'));
  const decoded = decodeFunctionData({ abi: perpFactoryAbi, data: call.data });
  assert.equal(decoded.functionName, 'create');
  assert.deepEqual(decoded.args, [
    {
      name: 'Moose Money',
      symbol: 'MOOSE',
      tokenUri: 'ipfs://bafy',
      base: WETH_BASE,
      tokenSalt: TOKEN_SALT,
      hookSalt: HOOK_SALT,
      seedBuyBase: 50_000_000_000_000_000n,
    },
  ]);
  // Robinhood Chain resolves its own factory.
  const rh = buildPerpCreate({
    chainId: 4663,
    name: 'A',
    symbol: 'A',
    tokenUri: '',
    base: WETH_BASE,
    tokenSalt: TOKEN_SALT,
    hookSalt: HOOK_SALT,
    seedBuyBase: 0n,
  });
  assert.equal(rh.to, PERP_DEPLOYMENTS[4663].PeddlesPerpFactory);
});

test('buildPerpCreate refuses what the factory would refuse', () => {
  const ok = {
    chainId: 8453,
    name: 'A',
    symbol: 'A',
    tokenUri: '',
    base: WETH_BASE,
    tokenSalt: TOKEN_SALT,
    hookSalt: HOOK_SALT,
    seedBuyBase: 0n,
  } as const;
  assert.throws(() => buildPerpCreate({ ...ok, chainId: 1 }), UnknownChainError);
  assert.throws(() => buildPerpCreate({ ...ok, name: '' }), /non-empty/);
  assert.throws(() => buildPerpCreate({ ...ok, symbol: '' }), /non-empty/);
  assert.throws(() => buildPerpCreate({ ...ok, base: '0x1234' as never }), /address/);
  assert.throws(() => buildPerpCreate({ ...ok, hookSalt: '0x12' }), /32 bytes/);
  assert.throws(() => buildPerpCreate({ ...ok, seedBuyBase: -1n }), /negative/);
  assert.throws(() => buildPerpCreate({ ...ok, seedBuyBase: 1 as never }), /bigint/);
  assert.throws(() => buildPerpCreate({ ...ok, hookAddress: `0x${'1'.repeat(36)}2acd` }), /permission bits/);
  assert.equal(buildPerpCreate({ ...ok, hookAddress: `0x${'1'.repeat(36)}2acc` }).value, 0n);
});

/* ---------------------------------------------------------------- live-read shape */

test("readPerpBase asks the chain's own factory and returns bigints", async () => {
  const calls: { address: string; functionName: string }[] = [];
  const client = {
    readContract: async (args: { address: string; functionName: string }) => {
      calls.push(args);
      return [true, 2_785_000_000_000_000_000n, 3_978_571_428_571_428_571n] as const;
    },
  } as unknown as ReadClient;
  const base = await readPerpBase(client, 4663, '0x0bd7d308f8e1639fab988df18a8011f41eacad73');
  assert.deepEqual(base, {
    base: '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73',
    allowed: true,
    v: 2_785_000_000_000_000_000n,
    tickWidth: 3_978_571_428_571_428_571n,
  });
  assert.equal(calls[0]?.address, PERP_DEPLOYMENTS[4663].PeddlesPerpFactory);
  assert.equal(calls[0]?.functionName, 'bases');
  await assert.rejects(readPerpBase(client, 1, base.base), UnknownChainError);
});
