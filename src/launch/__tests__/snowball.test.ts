import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeFunctionData } from 'viem';

// The contract source pins the constants; the web parity lives in snowballParity.test.ts (monorepo only).
import factorySource from '../../../contracts/src/PeddlesSnowballFactory.sol';
import {
  buildSnowballQuoteLaunch,
  buildSnowballStockLaunch,
  clogFloorAtOpen,
  encodeSnowballLaunch,
  prepareSnowballQuotePlan,
  snowballFeeTerms,
  snowballMinSpend,
  snowballTerms,
  type SnowballSplit,
} from '../snowball.js';
import { snowballFactoryAbi } from '../abi.generated.js';
import { launchAddressesFor } from '../addresses.js';
import type { ReadClient } from '../../client.js';
import type { WethLaunchPlan } from '../wethPlan.js';
import { EMPTY_WETH_METADATA } from '../wethCall.js';
import { DEPLOYMENTS, SNOWBALL_FACTORIES, SnowballUnavailableError, requireSnowballFactory, snowballFactoryFor } from '../../deployments.js';

/**
 *   pnpm --filter @peddles/sdk test
 */

const split = (burnBps: number, lpBps: number, creatorBps: number, holderBps: number): SnowballSplit => ({ burnBps, lpBps, creatorBps, holderBps });
const DEFAULT = split(100, 100, 100, 150);
const FACTORY = '0x249fcF53b13f3bd27e2969D5A3DF6f6B96aCDaAb' as const;
const ORCHESTRATOR = '0xB2f25Fd1b20269CD1553d63A942935Ab09F91978' as const;
const VAULT = '0x2222222222222222222222222222222222222222' as const;
const SALT = `0x${'cd'.repeat(32)}` as const;

test('snowballTerms pins the docs/SNOWBALL.md table', () => {
  const rows: Array<[SnowballSplit, number, number, boolean]> = [
    [split(100, 100, 100, 150), 500, 6250, true],
    [split(100, 0, 0, 150), 300, 2500, true],
    [split(50, 0, 0, 0), 100, 0, true],
    [split(500, 250, 200, 0), 1000, 10000, true],
    [split(100, 50, 0, 200), 400, 3333, false],
  ];
  for (const [s, taxBps, excessToCreatorBps, exact] of rows) {
    assert.deepEqual(snowballTerms(s), { ok: true, taxBps, excessToCreatorBps, exact }, JSON.stringify(s));
  }
});

test('snowballTerms refuses what termsFor refuses, by the contract error name', () => {
  const code = (s: SnowballSplit) => {
    const r = snowballTerms(s);
    return r.ok ? null : r.code;
  };
  assert.equal(code(split(0, 0, 300, 0)), 'NoSnowball');
  assert.equal(code(split(25, 0, 0, 100)), 'VaultShareBelowCreatorLeg');
  assert.equal(code(split(500, 300, 100, 100)), 'TaxOutOfBand');
  assert.equal(code(split(1.5, 0, 0, 0)), 'NotBps');
  assert.equal(code(split(-1, 100, 0, 0)), 'NotBps');
  assert.equal(code(split(0x10000, 0, 0, 0)), 'NotBps');
});

test('constants mirror PeddlesSnowballFactory.sol', () => {
  const src = factorySource as unknown as string;
  for (const [name, value] of [
    ['BPS', '10_000'],
    ['PLATFORM_LEG_BPS', '50'],
    ['CREATOR_LEG_BPS', '50'],
    ['MIN_TAX_BPS', '100'],
    ['MAX_TAX_BPS', '1000'],
  ] as const) {
    assert.ok(new RegExp(`constant ${name} = ${value};`).test(src), `${name} = ${value}`);
  }
});

test('fee terms, minSpend and the clog floor are exact', () => {
  assert.deepEqual(snowballFeeTerms(DEFAULT), { taxBps: 500n, excessToCreatorBps: 6250n });
  assert.equal(snowballFeeTerms(split(0, 0, 200, 0)), null);
  assert.equal(snowballMinSpend(18), 10n ** 9n);
  assert.equal(snowballMinSpend(6), 1n);
  assert.equal(snowballMinSpend(8), 1n);
  assert.throws(() => snowballMinSpend(1.5));
  const Q96 = 2n ** 96n;
  assert.equal(clogFloorAtOpen(Q96, true), 10n ** 18n);
  assert.equal(clogFloorAtOpen(Q96 / 2n, true), 25n * 10n ** 16n);
  assert.equal(clogFloorAtOpen(Q96 / 2n, false), 4n * 10n ** 18n);
  assert.throws(() => clogFloorAtOpen(0n, true));
  assert.throws(() => clogFloorAtOpen(4295128739n, true)); // rounds to zero → refused
});

test('stock: carries the split, minSpend and salt; pays only the launch fee; round-trips', () => {
  const call = buildSnowballStockLaunch({
    factory: FACTORY,
    name: 'Otter',
    symbol: 'OTTR',
    quote: '0x00000000000000000000000000000000000000aa',
    quoteIn: 5n,
    minTokensOut: 1n,
    split: DEFAULT,
    minSpend: snowballMinSpend(18),
    salt: SALT,
    launchFeeWei: 7n,
  });
  assert.equal(call.address, FACTORY);
  assert.equal(call.functionName, 'launchStock');
  assert.equal(call.value, 7n);
  const tx = encodeSnowballLaunch(call);
  assert.equal(tx.to, FACTORY);
  const decoded = decodeFunctionData({ abi: snowballFactoryAbi, data: tx.data });
  assert.equal(decoded.functionName, 'launchStock');
  assert.deepEqual(decoded.args?.[1], DEFAULT);
  assert.equal(decoded.args?.[2], 10n ** 9n);
  assert.equal(decoded.args?.[3], SALT);
});

test('stock: refuses no factory, a refused split, zero minSpend and a floor with no buy', () => {
  const base = {
    factory: FACTORY,
    name: 'Otter',
    symbol: 'OTTR',
    quote: '0x00000000000000000000000000000000000000aa',
    quoteIn: 0n,
    minTokensOut: 0n,
    split: DEFAULT,
    minSpend: 1n,
    salt: SALT,
    launchFeeWei: 0n,
  } as const;
  assert.throws(() => buildSnowballStockLaunch({ ...base, factory: null }), SnowballUnavailableError);
  assert.throws(() => buildSnowballStockLaunch({ ...base, split: split(0, 0, 100, 0) }));
  assert.throws(() => buildSnowballStockLaunch({ ...base, minSpend: 0n }));
  assert.throws(() => buildSnowballStockLaunch({ ...base, minTokensOut: 1n }));
});

const PLAN: WethLaunchPlan = {
  predictedToken: '0x1111111111111111111111111111111111111978',
  quoteToken: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
  tokenIsCurrency0: true,
  tickLower: -887220,
  tickUpper: 887220,
  startTick: -138180,
  sqrtPriceX96: 2n ** 96n / 1000n,
  liquidity: 123n,
  totalSupply: 10n ** 27n,
  pooledSupply: 10n ** 27n,
  poolFeePpm: 0,
  tickSpacing: 60,
  hook: '0xFb42813B355D67B498de0C694E9B7aAEDeCC00cC',
  poolManager: '0xE03A1074c86CFeDd5C142C4F04F1a1536e203543',
  positionManager: '0x429ba70129df741B2Ca2a85BC3A2a3328e5c09b4',
  liquidityManager: '0xD276c0434B3F461b3ECfCd52211fa21078581978',
  airdropPublisher: '0x000000000000000000000000000000000000dEaD',
  allocationBps: { liquidity: 10_000, airdrop: 0, vesting: 0, burn: 0, clog: 0 },
  clog: null,
  variant: 0,
};

const QUOTE_ARGS = {
  factory: FACTORY,
  orchestrator: ORCHESTRATOR,
  saltBinding: 'creator',
  vault: VAULT,
  name: 'Otter',
  symbol: 'OTTR',
  salt: SALT,
  metadata: EMPTY_WETH_METADATA,
  plan: PLAN,
  devBuyWei: 3n,
  minTokensOut: 2n,
  launchFeeWei: 11n,
  split: DEFAULT,
  minSpend: 10n ** 9n,
} as const;

test('quote: the vault is the creator of record, the terms are termsFor(split), value = fee + buy', () => {
  const call = buildSnowballQuoteLaunch(QUOTE_ARGS);
  assert.equal(call.functionName, 'launchQuote');
  assert.equal(call.value, 14n);
  assert.equal(call.input.vaultInput.creator, VAULT);
  assert.equal(call.input.creatorTaxBps, 500);
  assert.equal(call.input.excessToCreatorBps, 6250);
  assert.equal(call.clogFloorX18, 0n);
  const decoded = decodeFunctionData({ abi: snowballFactoryAbi, data: encodeSnowballLaunch(call).data });
  assert.equal(decoded.functionName, 'launchQuote');
  assert.equal(decoded.args?.[1], 3n);
  assert.equal(decoded.args?.[2], 2n);
  assert.equal(decoded.args?.[3], 0n);
  assert.deepEqual(decoded.args?.[4], DEFAULT);
  assert.equal(decoded.args?.[5], 10n ** 9n);
});

test('quote: a Clog plan carries the opening-price floor', () => {
  const clogPlan: WethLaunchPlan = {
    ...PLAN,
    pooledSupply: 95n * 10n ** 25n,
    allocationBps: { ...PLAN.allocationBps, liquidity: 9_500, clog: 500 },
    clog: { bps: 500, sliceBps: 28, minIntervalSeconds: 600 },
    variant: 1,
  };
  const call = buildSnowballQuoteLaunch({ ...QUOTE_ARGS, plan: clogPlan });
  assert.equal(call.clogFloorX18, clogFloorAtOpen(clogPlan.sqrtPriceX96, true));
  assert.ok(call.clogFloorX18 > 0n);
  assert.equal(call.args[3], call.clogFloorX18);
});

test('quote: refuses no factory and an unbound orchestrator', () => {
  assert.throws(() => buildSnowballQuoteLaunch({ ...QUOTE_ARGS, factory: undefined }), SnowballUnavailableError);
  assert.throws(() => buildSnowballQuoteLaunch({ ...QUOTE_ARGS, saltBinding: 'none' }), /creator-bound/);
  assert.throws(() => buildSnowballQuoteLaunch({ ...QUOTE_ARGS, devBuyWei: 0n }), /first-buy/);
});

test('prepareSnowballQuotePlan fails closed when the factory is wired elsewhere', async () => {
  const addresses = { ...launchAddressesFor(8453) };
  const client = {
    multicall: async () => ['0x0000000000000000000000000000000000000001', addresses.feeHook, VAULT, PLAN.predictedToken],
    readContract: async () => {
      throw new Error('not reached');
    },
    getBalance: async () => 0n,
  } as unknown as ReadClient;
  await assert.rejects(prepareSnowballQuotePlan(client, addresses, { sender: VAULT, salt: SALT, variant: 0 }), /different launch orchestrator/);
  await assert.rejects(prepareSnowballQuotePlan(client, { ...addresses, snowballFactory: null }, { sender: VAULT, salt: SALT, variant: 0 }), SnowballUnavailableError);
  await assert.rejects(prepareSnowballQuotePlan(client, { ...addresses, saltBinding: 'none' }, { sender: VAULT, salt: SALT, variant: 0 }), /creator-bound/);
});

test('every shipped chain resolves its Snowball factory from the book, or null', () => {
  for (const id of Object.keys(DEPLOYMENTS).map(Number)) {
    const book = DEPLOYMENTS[id as keyof typeof DEPLOYMENTS] as Readonly<Record<string, string>>;
    const expected = book['PeddlesSnowballFactory'] ?? null;
    assert.equal(snowballFactoryFor(id), expected, String(id));
    assert.equal(SNOWBALL_FACTORIES[id as keyof typeof SNOWBALL_FACTORIES], expected);
    assert.equal(launchAddressesFor(id).snowballFactory, expected);
    if (expected) assert.equal(requireSnowballFactory(id), expected);
  }
  assert.throws(() => snowballFactoryFor(1));
});
