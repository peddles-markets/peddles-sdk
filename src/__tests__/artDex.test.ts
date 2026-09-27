import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeAbiParameters, encodeAbiParameters, keccak256 } from 'viem';

import { graduateAndBuyRequest, graduateToStockWithTermsRequest, relayParamsHash, stockGraduationOptInRequest } from '../artDex.js';
import { nftStockGraduationOrchestratorAbi } from '../abis.js';
// The contract itself, as text, so the encoding order cannot drift from the source it mirrors.
import orchestratorSource from '../../contracts/src/PeddlesNftStockGraduationOrchestrator.sol';

/**
 * Art->DEX request builders and the relay consent hash. `node:test`, bundled with the esbuild apps/web
 * already ships. From the repo root:
 *
 *   apps/web/node_modules/.bin/esbuild packages/sdk/src/__tests__/artDex.test.ts \
 *     --bundle --platform=node --format=esm --loader:.sol=text --outfile=$TEMP/sdk-artdex.test.mjs
 *   node --test --test-reporter=spec $TEMP/sdk-artdex.test.mjs
 */

const base = {
  chainId: 11155111,
  orchestrator: '0x78B1C87408A26d1cA95bee54a3811BCB84621978',
  collection: '0x000000000000000000000000000000000000a47a',
  name: 'Art Coin',
  symbol: 'ART',
  quote: '0x0000000000000000000000000000000000000006',
  holderShareBps: 7000,
} as const;

test('relayParamsHash encodes exactly what the orchestrator hashes, in the source order', () => {
  const m = /function relayParamsHash\([\s\S]*?keccak256\(abi\.encode\(([\s\S]*?)\)\);/.exec(orchestratorSource as unknown as string);
  assert.ok(m, 'PeddlesNftStockGraduationOrchestrator.sol declares relayParamsHash');
  assert.deepEqual(
    m[1]!.split(',').map((s) => s.trim()),
    ['block.chainid', 'address(this)', 'collection', 'name', 'symbol', 'quote', 'holdersBps'],
  );

  const types = [{ type: 'uint256' }, { type: 'address' }, { type: 'address' }, { type: 'string' }, { type: 'string' }, { type: 'address' }, { type: 'uint16' }] as const;
  const encoded = encodeAbiParameters(types, [BigInt(base.chainId), base.orchestrator, base.collection, base.name, base.symbol, base.quote, base.holderShareBps]);
  assert.equal(relayParamsHash(base), keccak256(encoded));
  const decoded = decodeAbiParameters(types, encoded);
  assert.equal(decoded[3], 'Art Coin');
  assert.equal(decoded[6], 7000);
});

test('relayParamsHash binds every parameter, the chain and the orchestrator', () => {
  const h = relayParamsHash(base);
  const variants = [
    { ...base, chainId: 4663 },
    { ...base, orchestrator: '0x00000000000000000000000000000000000000b3' },
    { ...base, collection: '0x000000000000000000000000000000000000a47b' },
    { ...base, name: 'Relayer Picked' },
    { ...base, symbol: 'RLY' },
    { ...base, quote: '0x0000000000000000000000000000000000000007' },
    { ...base, holderShareBps: 0 },
  ] as const;
  for (const v of variants) assert.notEqual(relayParamsHash(v), h);
  assert.throws(() => relayParamsHash({ ...base, holderShareBps: 10001 }), RangeError);
});

test('request builders target the right function with the contract tuple shape', () => {
  const optIn = stockGraduationOptInRequest(base);
  assert.equal(optIn.functionName, 'setStockGraduationOptIn');
  assert.deepEqual(optIn.args, [base.collection, relayParamsHash(base)]);

  const direct = graduateToStockWithTermsRequest({
    orchestrator: base.orchestrator,
    collection: base.collection,
    name: base.name,
    symbol: base.symbol,
    quote: base.quote,
    creatorTaxBps: 500,
    excessToCreatorBps: 2500,
    holderShareBps: 7000,
    devBuyQuoteIn: 10n ** 6n,
    minTokensOut: 1n,
    launchFee: 5n,
  });
  const fn = nftStockGraduationOrchestratorAbi.find((e) => e.type === 'function' && e.name === 'graduateToStockWithTerms') as {
    inputs: readonly [{ components: readonly { name: string }[] }];
  };
  assert.deepEqual(Object.keys(direct.args[0]), fn.inputs[0].components.map((c) => c.name));
  assert.equal(direct.value, 5n);

  const weth = graduateAndBuyRequest({ orchestrator: base.orchestrator, input: {}, holderShareBps: 0, devBuyValue: 0n, minTokensOut: 0n, value: 1n });
  assert.equal(weth.functionName, 'graduateAndBuy');
  assert.throws(() => graduateAndBuyRequest({ orchestrator: base.orchestrator, input: {}, holderShareBps: 0, devBuyValue: 2n, minTokensOut: 0n, value: 1n }), RangeError);
});
