import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { WEB_FIXTURE } from './fixtures/solanaLaunchWeb.fixture.js';
import * as sdk from '../solana/index.js';
import { sha256, utf8Decode, utf8Encode } from '../solana/codec.js';

/**
 * PARITY: `@peddles/sdk/solana` against the web app's own launch code. The fixture is generated from
 * `apps/web/src/features/launch/solana/**` by `script/generate-solana-launch-fixture.ts`; every byte
 * of instruction data, every account meta, every compiled transaction and every term below must be
 * the web's exactly.
 */

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const unhex = (h: string) => Uint8Array.from(h.match(/../g) ?? [], (p) => Number.parseInt(p, 16));
const g = globalThis as unknown as {
  TextEncoder: new () => { encode(s: string): Uint8Array };
  TextDecoder: new () => { decode(b: Uint8Array): string };
  btoa(s: string): string;
};

test('the quote list and constants are the web build’s', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(sdk.SOLANA_LAUNCH_QUOTES)), WEB_FIXTURE.quotes);
  assert.equal(sdk.SOLANA_LAUNCH_QUOTES.length, 123);
  const c = WEB_FIXTURE.constants;
  assert.equal(sdk.METEORA_DAMM_V2, c.METEORA_DAMM_V2);
  assert.equal(sdk.METEORA_POOL_AUTHORITY, c.METEORA_POOL_AUTHORITY);
  assert.equal(sdk.METEORA_EVENT_AUTHORITY, c.METEORA_EVENT_AUTHORITY);
  assert.equal(sdk.METAPLEX_TOKEN_METADATA, c.METAPLEX_TOKEN_METADATA);
  assert.equal(sdk.SOLANA_MIN_RATE_BPS, c.SOLANA_MIN_RATE_BPS);
  assert.equal(sdk.SOLANA_MAX_RATE_BPS, c.SOLANA_MAX_RATE_BPS);
  assert.equal(String(sdk.SOLANA_COIN_SUPPLY_RAW), c.SOLANA_COIN_SUPPLY_RAW);
  assert.equal(WEB_FIXTURE.program, sdk.PEDDLES_SOLANA_LAUNCH_PROGRAM_ID);
});

for (const launch of WEB_FIXTURE.launches) {
  test(`launch instruction and transaction match the web byte for byte: ${launch.label}`, () => {
    const i = launch.input;
    const salt = unhex(i.salt);
    const params: sdk.LaunchParams = {
      salt,
      boundToCreator: i.bound,
      name: i.name,
      symbol: i.symbol,
      uri: i.uri,
      rateBps: i.rate,
      excessToCreatorBps: i.excess,
      creatorPayout: i.creator,
      liquidity: BigInt(i.liquidity),
      sqrtPrice: BigInt(i.sqrtPrice),
      firstBuyQuote: BigInt(i.firstBuy),
      firstBuyMinCoins: BigInt(i.firstBuyMinCoins),
    };
    const addresses = sdk.deriveLaunchAddresses({ programId: WEB_FIXTURE.program, salt, boundToCreator: i.bound, quoteMint: i.quoteMint, creator: i.creator });
    assert.deepEqual({ ...addresses }, launch.addresses);
    const creatorQuoteAccount = sdk.associatedTokenAddress(i.quoteMint, i.creator, i.quoteTokenProgram)!;
    const instruction = sdk.launchInstruction(
      WEB_FIXTURE.program,
      { addresses, creator: i.creator, quoteMint: i.quoteMint, quoteTokenProgram: i.quoteTokenProgram, quoteBadge: i.quoteBadge, creatorQuoteAccount, platformWallet: '6vQw56PfF2sKd9dy6SotpksQddGo5zAe9mRvo5GUWPtV' },
      params,
    );
    assert.equal(hex(instruction.data), launch.data);
    assert.deepEqual(instruction.accounts.map((a) => ({ ...a })), launch.accounts);
    assert.equal(instruction.accounts.length, 28);

    const built = sdk.buildLaunchTransaction({
      programId: WEB_FIXTURE.program,
      creator: i.creator,
      quoteMint: i.quoteMint,
      quoteTokenProgram: i.quoteTokenProgram,
      quoteBadge: i.quoteBadge,
      platformWallet: '6vQw56PfF2sKd9dy6SotpksQddGo5zAe9mRvo5GUWPtV',
      params,
      recentBlockhash: 'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s',
      lookupTable: i.table ? { address: i.table.address, addresses: [...i.table.addresses] } : null,
      priorityMicroLamports: BigInt(i.priority),
    });
    assert.equal(built.ok, launch.built.ok);
    if (built.ok && launch.built.ok) assert.equal(hex(built.transaction), launch.built.transaction);
  });
}

test('the launch money matches the web: split, schedule, first buy, max buy', () => {
  const l = WEB_FIXTURE.launches[0]!.input;
  const sqrtPrice = BigInt(l.sqrtPrice);
  const liquidity = BigInt(l.liquidity);
  for (const v of WEB_FIXTURE.termVectors) {
    const split = sdk.volumeSplit(v.rate, v.excess);
    assert.deepEqual(Object.fromEntries(Object.entries(split).map(([k, x]) => [k, String(x)])), v.split);
    const s = sdk.feeSchedule(v.rate);
    assert.deepEqual({ cliff: String(s.cliff), reduction: String(s.reduction) }, v.schedule);
    const o = sdk.firstBuyOpening(sqrtPrice, liquidity, sdk.SOLANA_COIN_SUPPLY_RAW, 50_000_000n, v.rate);
    assert.deepEqual(
      o ? { fee: String(o.fee), poolQuote: String(o.poolQuote), coins: String(o.coins), needed100: String(sdk.firstBuyQuoteNeeded(o, 100)), minCoins: String(sdk.firstBuyMinCoins(o.coins)) } : null,
      v.opening,
    );
    assert.equal(
      String(sdk.firstBuyMaxQuote({ balance: 9_000_000_000n, sqrtPrice, liquidity, supply: sdk.SOLANA_COIN_SUPPLY_RAW, rateBps: v.rate, transferFeeBps: 100 })),
      v.maxQuote,
    );
  }
  for (const [text, bps] of WEB_FIXTURE.rateTexts) assert.equal(sdk.parseRatePercent(text), bps, text);
  for (const [family, deposits, rent] of WEB_FIXTURE.deposits) {
    assert.equal(String(sdk.launchDepositsLamports(family, 5_080n)), deposits);
    assert.equal(String(sdk.tokenAccountRentLamports(family, 5_080n)), rent);
  }
  for (const [recent, bid] of WEB_FIXTURE.priority) assert.equal(String(sdk.priorityBid(recent.map(BigInt))), bid);
});

test('mint decoding matches the web on real mainnet mint bytes (TSLAx, PreStocks ANTHROPIC)', () => {
  assert.equal(WEB_FIXTURE.mints.length, 2);
  for (const m of WEB_FIXTURE.mints) {
    const facts = sdk.decodeMint(unhex(m.data), sdk.TOKEN_2022_PROGRAM, 900n, 1_800_000_000n);
    assert.deepEqual(facts ? { ...facts, multiplierWad: String(facts.multiplierWad) } : null, m.facts, m.file);
  }
  assert.equal(WEB_FIXTURE.mints[1]!.facts!.multiplierWad, '10000000000000000000');
});

test('the PEDL salt search matches the web: same hasher, same hits, bound and unbound', () => {
  const hasher = new sdk.CoinSaltHasher(sdk.addressBytes(WEB_FIXTURE.program)!);
  const a = sdk.grindChunk({ hasher, high: 12345, low: -7, tries: 200_000, modulus: 58 * 58, target: 1234 });
  const bound = new sdk.CoinSaltHasher(sdk.addressBytes(WEB_FIXTURE.program)!, sdk.addressBytes('7S9b5c2vEYhiVzqijW2SehGzJ5DAio1X2KdN2fEXgykX')!);
  const b = sdk.grindChunk({ hasher: bound, high: -99, low: 2_147_483_000, tries: 200_000, modulus: 58 * 58, target: 99 });
  assert.deepEqual(
    [a, b].map((x) => ({ hit: x.hit ? { salt: hex(x.hit.salt), address: x.hit.address } : null, nextLow: x.nextLow })),
    WEB_FIXTURE.grinds,
  );
  // And the fast hasher's address is the general PDA derivation's.
  assert.equal(a.hit!.address, sdk.deriveCoinMint(WEB_FIXTURE.program, a.hit!.salt));
  assert.equal(b.hit!.address, sdk.deriveCoinMint(WEB_FIXTURE.program, b.hit!.salt, '7S9b5c2vEYhiVzqijW2SehGzJ5DAio1X2KdN2fEXgykX'));
});

test('metadata document and compute budget match the web', () => {
  const doc = sdk.launchMetadataDocument({
    coinMint: WEB_FIXTURE.launches[0]!.addresses.coinMint,
    name: 'Peddles Test',
    imageCid: 'bafkreiimage',
    description: '  hello  ',
    socials: { x: 'https://x.com/PeddlesX', telegram: null, website: 'https://peddles.xyz' },
  });
  assert.deepEqual(JSON.parse(JSON.stringify(doc)), WEB_FIXTURE.metadata);
  assert.deepEqual([sdk.computeBudgetInstructions(0n), sdk.computeBudgetInstructions(7n, 900_000)].map((l) => l.map((i) => hex(i.data))), WEB_FIXTURE.budget);
});

test('the codec equals the platform: sha256, UTF-8 both ways, base64', () => {
  const samples = ['', 'a', 'global:launch', 'x'.repeat(55), 'x'.repeat(56), 'y'.repeat(64), 'z'.repeat(1000), 'Ünïcødé 🚀', '\ud800 lone', 'tail \udfff'];
  for (const s of samples) {
    const bytes = new g.TextEncoder().encode(s);
    assert.equal(hex(utf8Encode(s)), hex(bytes), JSON.stringify(s));
    assert.equal(hex(sha256(bytes)), hex(createHash('sha256').update(bytes).digest()));
    assert.equal(sdk.base64Encode(bytes), g.btoa(String.fromCharCode(...bytes)));
    assert.equal(hex(sdk.base64Decode(sdk.base64Encode(bytes))!), hex(bytes));
  }
  const odd = [Uint8Array.of(0xff), Uint8Array.of(0xe2, 0x82), Uint8Array.of(0xf0, 0x9f, 0x98), Uint8Array.of(0xed, 0xa0, 0x80), Uint8Array.of(0xef, 0xbb, 0xbf, 0x41), Uint8Array.of(0xc0, 0xaf, 0x41), Uint8Array.of(0xe0, 0x80, 0x41)];
  for (const b of odd) assert.equal(utf8Decode(b), new g.TextDecoder().decode(b), hex(b));
  assert.equal(sdk.base64Decode('abc'), null);
});

test('terms are refused, never defaulted', () => {
  const ok = sdk.solanaLaunchTerms({ name: ' Peddles ', symbol: '$ped', quoteSymbol: 'TSLAx', ratePercent: '2', excessToCreatorBps: 5000 });
  assert.deepEqual(ok, { ok: true, name: 'Peddles', symbol: 'PED', rateBps: 200, excessToCreatorBps: 5000 });
  assert.equal(sdk.solanaLaunchTerms({ name: 'Peddles', symbol: 'PED', quoteSymbol: 'TSLAx', ratePercent: '2' }).ok, false); // no split above the floor
  assert.equal(sdk.solanaLaunchTerms({ name: 'Peddles', symbol: 'PED', quoteSymbol: 'TSLAx', rateBps: 125 }).ok, true); // nothing to split at the floor
  assert.equal(sdk.solanaLaunchTerms({ name: 'Peddles', symbol: 'PED', quoteSymbol: 'TSLAx', rateBps: 125, excessToCreatorBps: 5000 }).ok, false);
  assert.equal(sdk.solanaLaunchTerms({ name: 'Peddles', symbol: 'PED', quoteSymbol: 'TSLAx', ratePercent: '1.255', excessToCreatorBps: 0 }).ok, false);
  assert.equal(sdk.solanaLaunchTerms({ name: 'Peddles', symbol: 'PED', quoteSymbol: 'TSLAx', rateBps: 501, excessToCreatorBps: 0 }).ok, false);
  assert.equal(sdk.solanaLaunchTerms({ name: 'Peddles', symbol: 'PED', quoteSymbol: 'TSLAx', rateBps: 124 }).ok, false);
  assert.equal(sdk.solanaLaunchTerms({ name: 'Peddles', symbol: 'PED', quoteSymbol: 'TSLAx', rateBps: 200, ratePercent: '2', excessToCreatorBps: 0 }).ok, false);
  assert.equal(sdk.solanaLaunchTerms({ name: 'Peddles', symbol: 'tslax', quoteSymbol: 'TSLAx', rateBps: 125 }).ok, false); // the pair's own ticker
  assert.equal(sdk.solanaLaunchTerms({ name: 'Peddles', symbol: 'sol', quoteSymbol: 'TSLAx', rateBps: 125 }).ok, false);
  assert.equal(sdk.solanaLaunchTerms({ name: 'P', symbol: 'PED', quoteSymbol: 'TSLAx', rateBps: 125 }).ok, false);
  assert.equal(sdk.solanaLaunchTerms({ name: '🚀'.repeat(9), symbol: 'PED', quoteSymbol: 'TSLAx', rateBps: 125 }).ok, false); // 36 bytes
  // The web's own excess reading agrees wherever both accept.
  for (const [rate, text, bps] of WEB_FIXTURE.excessTexts) {
    if (bps === null) continue;
    const r = sdk.solanaLaunchTerms({ name: 'Peddles', symbol: 'PED', quoteSymbol: 'X', rateBps: rate, excessToCreatorBps: rate <= 125 ? null : Number(text) });
    assert.equal(r.ok && r.excessToCreatorBps, bps);
  }
});

test('quotes are priced displayed price × live multiplier, exactly', () => {
  // ANTHROPIC ×10: a $91.40 displayed price is $914 per whole raw token.
  assert.equal(sdk.quoteUsdPerWholeRawE18('91.40', 10n * 10n ** 18n), 914n * 10n ** 18n);
  assert.equal(sdk.quoteUsdPerWholeRawE18('abc', 10n ** 18n), null);
  assert.equal(sdk.quoteUsdPerWholeRawE18('0', 10n ** 18n), null);
  assert.equal(sdk.parseDecimalUnits('1.5', 6), 1_500_000n);
  assert.equal(sdk.parseDecimalUnits('.0002', 6), 200n);
  assert.equal(sdk.parseDecimalUnits('1.0000001', 6), null);
  assert.equal(sdk.parseDecimalUnits('-1', 6), null);
  assert.equal(sdk.displayToRaw(10n * 10n ** 9n, 10n * 10n ** 18n), 10n ** 9n);
});

test('the grind is bounded and stoppable', async () => {
  assert.equal(await sdk.grindPedlSalt({ programId: WEB_FIXTURE.program, maxTries: 1000, start: [1, 1] }), null);
  await assert.rejects(sdk.grindPedlSalt({ programId: WEB_FIXTURE.program, maxTries: 10_000_000, chunk: 1000, start: [1, 1], signal: { aborted: true, reason: new Error('stop') } }), /stop/);
  await assert.rejects(sdk.grindPedlSalt({ programId: WEB_FIXTURE.program, maxTries: 0 }), /maxTries/);
});

test('a pooled salt is believed only when it recomputes', () => {
  const program = WEB_FIXTURE.program;
  const a = sdk.grindChunk({ hasher: new sdk.CoinSaltHasher(sdk.addressBytes(program)!), high: 12345, low: -7, tries: 200_000, modulus: 58 * 58, target: 1234 }).hit!;
  // Not a PEDL ending: refused even though the mint matches the salt.
  assert.equal(sdk.readPooledSalt({ data: { salt: hex(a.salt), mint: a.address, reservedUntil: '2026-11-11T00:00:00Z' } }, program), null);
  assert.equal(sdk.readPooledSalt({ data: { salt: 'zz', mint: a.address, reservedUntil: 'x' } }, program), null);
});

test('the launch account order is the program’s `struct Launch`', () => {
  const l = WEB_FIXTURE.launches[1]!;
  const accounts = l.accounts.map((a: sdk.AccountMeta) => a.address);
  assert.equal(accounts[0], l.input.creator);
  assert.equal(accounts[17], sdk.METEORA_POOL_AUTHORITY);
  assert.equal(accounts[21], sdk.METEORA_DAMM_V2);
  assert.equal(accounts[27], sdk.SYSTEM_PROGRAM);
  assert.equal(sdk.meteoraBadgeAddress('XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB').length > 30, true);
});

test('a real PEDL salt, ground for the 2026-11-11 mainnet simulation, is found again from its start', async () => {
  // Ground by `grindPedlSalt` in 3.5 s; the launch built on it simulated with err null at slot 468,298,307.
  const hit = await sdk.grindPedlSalt({ programId: WEB_FIXTURE.program, maxTries: 1, start: [0x0e2647f5, 0x1fa43bd9] });
  assert.ok(hit);
  assert.equal(hex(hit.salt), '0e2647f51fa43bd9');
  assert.equal(hit.address, '8GMfaB1f8graCBix8hcmFvUsCXyu1AqrysMQW6wjPEDL');
  assert.equal(sdk.deriveCoinMint(WEB_FIXTURE.program, hit.salt), hit.address);
  assert.ok(sdk.endsWithPedl(sdk.addressBytes(hit.address)!));
  assert.equal(sdk.readPooledSalt({ data: { salt: '0e2647f51fa43bd9', mint: hit.address, reservedUntil: '2026-11-11T23:00:00Z' } }, WEB_FIXTURE.program)?.hit.address, hit.address);
});

/* ------------------------------------------------------------------ prepareSolanaLaunch against a scripted node */

const LE = (v: bigint, size: number) => Uint8Array.from({ length: size }, (_, i) => Number((v >> BigInt(8 * i)) & 0xffn));
const cat = (parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) (out.set(p, at), (at += p.length));
  return out;
};
const key = (a: string) => sdk.addressBytes(a)!;
const CREATOR = 'F5NtutnRKr23gfNjRWq5WpaJ8KA97kDhqADU9dktxapF';
const PLATFORM = '7S9b5c2vEYhiVzqijW2SehGzJ5DAio1X2KdN2fEXgykX';
const PEDL_SALT = unhex('0e2647f51fa43bd9');

interface Chain {
  fee: bigint;
  enabled: boolean;
  wsolAccountExists: boolean;
}

/** A node that answers from `chain`, read at call time, so a test can move the chain between calls. */
function scriptedNode(chain: Chain): sdk.SolanaRpcRequest {
  const program = WEB_FIXTURE.program;
  const sqrt = BigInt(WEB_FIXTURE.launches[0]!.input.sqrtPrice);
  const a = sdk.deriveLaunchAddresses({ programId: program, salt: PEDL_SALT, boundToCreator: false, quoteMint: sdk.WSOL_MINT, creator: CREATOR });
  const wsolAta = sdk.associatedTokenAddress(sdk.WSOL_MINT, CREATOR)!;
  const table = [a.config, a.peddlesCreator, a.quoteConfig, sdk.WSOL_MINT, sdk.METEORA_POOL_AUTHORITY, sdk.METEORA_EVENT_AUTHORITY, sdk.METEORA_DAMM_V2, sdk.METAPLEX_TOKEN_METADATA, sdk.TOKEN_PROGRAM, sdk.TOKEN_2022_PROGRAM, sdk.ATA_PROGRAM, sdk.SYSTEM_PROGRAM, PLATFORM];
  const accounts = (): Record<string, { owner: string; data: Uint8Array }> => ({
    [a.config]: {
      owner: program,
      data: cat([sdk.anchorAccountDiscriminator('Config'), key(PLATFORM), key(PLATFORM), key(PLATFORM), key(PLATFORM), key(PLATFORM), LE(chain.fee, 8), Uint8Array.of(0, 255)]),
    },
    [a.quoteConfig]: {
      owner: program,
      data: cat([sdk.anchorAccountDiscriminator('QuoteConfig'), key(sdk.WSOL_MINT), key(sdk.TOKEN_PROGRAM), Uint8Array.of(9), key(sdk.SYSTEM_PROGRAM), Uint8Array.of(chain.enabled ? 1 : 0), LE(sqrt, 16), LE(sqrt, 16), Uint8Array.of(255)]),
    },
    [sdk.WSOL_MINT]: { owner: sdk.TOKEN_PROGRAM, data: (() => { const m = new Uint8Array(82); m[44] = 9; m[45] = 1; return m; })() },
    [sdk.PEDDLES_SOLANA_LAUNCH_LOOKUP_TABLE]: { owner: sdk.ADDRESS_LOOKUP_TABLE_PROGRAM, data: cat([new Uint8Array(56), ...table.map(key)]) },
    ...(chain.wsolAccountExists ? { [wsolAta]: { owner: sdk.TOKEN_PROGRAM, data: new Uint8Array(165) } } : {}),
  });
  return (async (method: string, params: readonly unknown[]) => {
    if (method === 'getEpochInfo') return { epoch: 900 };
    if (method === 'getMinimumBalanceForRentExemption') return 6_960 * 128;
    if (method === 'getLatestBlockhash') return { value: { blockhash: sdk.METAPLEX_TOKEN_METADATA } };
    if (method === 'getRecentPrioritizationFees') throw new Error('node down');
    if (method === 'getMultipleAccounts') {
      const all = accounts();
      return { value: (params[0] as string[]).map((k) => (all[k] ? { owner: all[k]!.owner, lamports: 1, data: [sdk.base64Encode(all[k]!.data), 'base64'] } : null)) };
    }
    throw new Error(`unexpected ${method}`);
  }) as sdk.SolanaRpcRequest;
}

const launchInput = (rpc: sdk.SolanaRpcRequest, extra: Partial<sdk.PrepareSolanaLaunchInput> = {}): sdk.PrepareSolanaLaunchInput => ({
  rpc,
  creator: CREATOR,
  quoteMint: sdk.WSOL_MINT,
  name: 'Peddles Test',
  symbol: 'PTEST',
  uri: 'https://ipfs.latches.fun/ipfs/bafkreiabc',
  rateBps: 200,
  excessToCreatorBps: 5000,
  salt: PEDL_SALT,
  ...extra,
});

test('prepareSolanaLaunch refuses when the launch fee moved from the one shown', async () => {
  const chain: Chain = { fee: 1_146_526n, enabled: true, wsolAccountExists: false };
  const rpc = scriptedNode(chain);
  const shown = await sdk.prepareSolanaLaunch(launchInput(rpc, { expectedFeeLamports: 1_146_526n }));
  assert.ok(shown.ok, shown.ok ? '' : shown.reason);
  assert.equal(shown.launchFeeLamports, 1_146_526n);
  chain.fee = 23_166_917n; // the $2 restore lands between showing and signing
  const moved = await sdk.prepareSolanaLaunch(launchInput(rpc, { expectedFeeLamports: 1_146_526n }));
  assert.equal(moved.ok, false);
  assert.match(moved.ok ? '' : moved.reason, /launch fee is now 23166917 lamports/);
});

test('prepareSolanaLaunch re-reads Config and the quote even when given a cached chainState', async () => {
  const chain: Chain = { fee: 1_146_526n, enabled: true, wsolAccountExists: false };
  const rpc = scriptedNode(chain);
  const cached = await sdk.readLaunchChainState(rpc, { quotes: sdk.SOLANA_LAUNCH_QUOTES.filter((q) => q.mint === sdk.WSOL_MINT) });
  assert.equal(cached.config!.launchFeeLamports, 1_146_526n);
  chain.fee = 23_166_917n;
  const fresh = await sdk.prepareSolanaLaunch(launchInput(rpc, { chainState: cached }));
  assert.ok(fresh.ok);
  assert.equal(fresh.launchFeeLamports, 23_166_917n); // not the cached 1,146,526
  chain.enabled = false; // the admin disables the quote after the cache was taken
  const disabled = await sdk.prepareSolanaLaunch(launchInput(rpc, { chainState: cached }));
  assert.equal(disabled.ok, false);
});

test('lamportsNeeded counts the wSOL account rent only when that account is missing; a failed fee read is said', async () => {
  const chain: Chain = { fee: 1_146_526n, enabled: true, wsolAccountExists: false };
  const missing = await sdk.prepareSolanaLaunch(launchInput(scriptedNode(chain), { firstBuy: { raw: 1_000_000n } }));
  chain.wsolAccountExists = true;
  const present = await sdk.prepareSolanaLaunch(launchInput(scriptedNode(chain), { firstBuy: { raw: 1_000_000n } }));
  assert.ok(missing.ok && present.ok);
  assert.equal(missing.lamportsNeeded - present.lamportsNeeded, sdk.tokenAccountRentLamports('wsol', 6_960n));
  assert.equal(present.lamportsNeeded, 1_146_526n + present.depositsLamportsEstimate + 1_000_000n + 1n);
  assert.equal(present.priorityFeeSource, 'unavailable');
  assert.equal(present.priorityMicroLamports, 0n);
  const given = await sdk.prepareSolanaLaunch(launchInput(scriptedNode(chain), { priorityMicroLamports: 5n }));
  assert.ok(given.ok && given.priorityFeeSource === 'given');
});
