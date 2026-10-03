import assert from 'node:assert/strict';
import test from 'node:test';

import { DEPLOYMENTS, LAUNCH_SALT_BINDINGS, launchSaltBindingFor, UnknownChainError } from '../../deployments.js';
import type { ReadClient } from '../../client.js';
import { launchAddressesFor, launchAddressesFromRecord } from '../addresses.js';
import { buildWethLaunchPlan } from '../wethPlan.js';

const A = (n: number) => `0x${n.toString(16).padStart(40, '0')}` as `0x${string}`;
const RECORD = {
  PeddlesFactoryV20: A(1),
  PeddlesLaunchOrchestratorV20: A(2),
  PeddlesV4LiquidityExecutor: A(3),
  PeddlesFeeHook: A(4),
  PeddlesStockLaunchpad: A(5),
};

test('every chain in the address book says how its orchestrator derives a launch address', () => {
  for (const id of Object.keys(DEPLOYMENTS).map(Number)) {
    const binding = launchSaltBindingFor(id);
    assert.ok(binding === 'creator' || binding === 'none', `chain ${id}`);
    assert.equal(binding, LAUNCH_SALT_BINDINGS[id as keyof typeof LAUNCH_SALT_BINDINGS]);
    assert.equal(launchAddressesFor(id).saltBinding, binding, `chain ${id}`);
  }
  assert.throws(() => launchSaltBindingFor(1), UnknownChainError);
});

test('a record names the binding or has none; anything else is refused', () => {
  assert.equal(launchAddressesFromRecord({ ...RECORD, launchSaltBinding: 'creator' }).saltBinding, 'creator');
  assert.equal(launchAddressesFromRecord(RECORD).saltBinding, 'none');
  assert.throws(() => launchAddressesFromRecord({ ...RECORD, launchSaltBinding: 'wallet' }), /launchSaltBinding/);
});

/** The address-prediction read `buildWethLaunchPlan` puts in its first multicall. */
async function predictionRead(saltBinding: 'creator' | 'none' | undefined, arg?: 'creator' | 'none') {
  let asked: { functionName: string; address: string } | null = null;
  const client = {
    multicall: async ({ contracts }: { contracts: readonly { functionName: string; address: string }[] }) => {
      const read = contracts.find((c) => c.functionName === 'predictLaunchToken' || c.functionName === 'getPeddlesAddress');
      asked = read ? { functionName: read.functionName, address: read.address } : null;
      throw new Error('stop after the first multicall');
    },
  } as unknown as ReadClient;
  const addresses = { ...launchAddressesFromRecord(RECORD), saltBinding };
  await assert.rejects(
    buildWethLaunchPlan(client, addresses, { salt: `0x${'11'.repeat(32)}`, creator: A(9), variant: 0, ...(arg ? { saltBinding: arg } : {}) }),
    /stop after the first multicall/,
  );
  return asked as { functionName: string; address: string } | null;
}

test('the launch plan follows the chain’s binding: the bound orchestrator predicts, an unbound chain asks the factory', async () => {
  assert.deepEqual(await predictionRead('creator'), { functionName: 'predictLaunchToken', address: A(2) });
  assert.deepEqual(await predictionRead('none'), { functionName: 'getPeddlesAddress', address: A(1) });
  // Addresses that carry no binding are treated as bound; an explicit argument wins over the addresses.
  assert.deepEqual(await predictionRead(undefined), { functionName: 'predictLaunchToken', address: A(2) });
  assert.deepEqual(await predictionRead('creator', 'none'), { functionName: 'getPeddlesAddress', address: A(1) });
});
