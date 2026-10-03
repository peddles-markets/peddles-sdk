import assert from 'node:assert/strict';
import test from 'node:test';
import { encodeAbiParameters, keccak256, toBytes } from 'viem';

import {
  applySaltBindings,
  boundSalt,
  create2Address,
  handleQuoteBindings,
  handleSalt,
  handleStockBindings,
  hasSuffix,
  HANDLE_SALT_DOMAIN,
  launchSalt,
  LAUNCH_SALT_DOMAIN,
  mineSalt,
  orchestratorBindings,
  randomSalt,
} from '../salt.js';

const FACTORY = '0x49F730DC7ecab3B0bb2A4D2C77E7aAC7C1741978' as const;
const ORCH = '0x43aC520D456f17f0Dad1291DB6CEfF9d88151978' as const;
const LAUNCHER = '0x265f0653aa62b30fab11d0718d12cede7965d7c4' as const;
const ALICE = '0x00000000000000000000000000000000000a11ce' as const;
const MALLORY = '0x000000000000000000000000000000000000bad0' as const;
const HASH = `0x${'11'.repeat(32)}` as const;

test('bound salt: domains are the contracts’ constants', () => {
  assert.equal(LAUNCH_SALT_DOMAIN, keccak256(toBytes('PEDDLES_V20_LAUNCH_SALT')));
  assert.equal(HANDLE_SALT_DOMAIN, keccak256(toBytes('PEDDLES_HANDLE_LAUNCH_SALT')));
});

test('bound salt: launchSalt is keccak256(abi.encode(domain, creator, salt)) and creator-specific', () => {
  const salt = randomSalt();
  const expected = keccak256(
    encodeAbiParameters([{ type: 'bytes32' }, { type: 'address' }, { type: 'bytes32' }], [LAUNCH_SALT_DOMAIN, ALICE, salt]),
  );
  assert.equal(launchSalt(ALICE, salt), expected);
  assert.notEqual(launchSalt(ALICE, salt), launchSalt(MALLORY, salt));
  assert.notEqual(handleSalt(ALICE, salt), launchSalt(ALICE, salt), 'domain separated');
});

test('bound salt: the same salt from another creator is another address', () => {
  const salt = randomSalt();
  const a = create2Address(FACTORY, boundSalt(0, ORCH, launchSalt(ALICE, salt)), HASH);
  const m = create2Address(FACTORY, boundSalt(0, ORCH, launchSalt(MALLORY, salt)), HASH);
  const raw = create2Address(FACTORY, boundSalt(0, ORCH, salt), HASH);
  assert.notEqual(a, m);
  assert.notEqual(a, raw, 'the pre-2026-10-01 raw-salt address is not the bound one');
});

test('bound salt: handle layers compose in contract order', () => {
  const salt = randomSalt();
  assert.equal(applySaltBindings(salt, handleQuoteBindings(ALICE, LAUNCHER)), launchSalt(LAUNCHER, handleSalt(ALICE, salt)));
  assert.equal(applySaltBindings(salt, handleStockBindings(ALICE)), handleSalt(ALICE, salt));
  assert.equal(applySaltBindings(salt, orchestratorBindings(ALICE)), launchSalt(ALICE, salt));
  assert.equal(applySaltBindings(salt), salt);
});

test('bound salt: the miner honours preBind (one and two layers)', async () => {
  for (const preBind of [orchestratorBindings(ALICE), handleQuoteBindings(ALICE, LAUNCHER)]) {
    const mined = await mineSalt({ deployer: FACTORY, variant: 1, sender: ORCH, initCodeHash: HASH, suffix: '78', preBind });
    assert.ok(hasSuffix(mined.address, '78'));
    assert.equal(mined.address, create2Address(FACTORY, boundSalt(1, ORCH, applySaltBindings(mined.salt, preBind)), HASH));
  }
});
