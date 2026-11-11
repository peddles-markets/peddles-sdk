import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { peddlesCreatorAddress, verifyPeddlesMint, type GetSolanaAccount } from '../solanaVerify.js';

/** A real program id shape; nothing here is deployed. The accounts below are built to the layouts. */
const PROGRAM = 'cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG';
const METAPLEX = 'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s';
const TOKEN = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const MINT = 'XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB';
/** Read with `find_program_address` semantics by the keeper's own tested derivation, in this test's setup. */
const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function decode(text: string): Uint8Array {
  let value = 0n;
  for (const c of text) value = value * 58n + BigInt(ALPHABET.indexOf(c));
  const hex = value.toString(16).padStart(64, '0');
  return Uint8Array.from(Buffer.from(hex, 'hex'));
}

const str = (s: string) => {
  const b = Buffer.from(s);
  const n = Buffer.alloc(4);
  n.writeUInt32LE(b.length);
  return Buffer.concat([n, b]);
};

function metadata(o: { update: string; mint?: string; creator: string; verified?: boolean; fee?: number; mutable?: boolean }): Uint8Array {
  const fee = Buffer.alloc(2);
  fee.writeUInt16LE(o.fee ?? 0);
  return Buffer.concat([
    Uint8Array.of(4),
    decode(o.update),
    decode(o.mint ?? MINT),
    str('Live Test'),
    str('LIVE'),
    str('https://peddles.xyz/t.json'),
    fee,
    Uint8Array.of(1, 1, 0, 0, 0),
    decode(o.creator),
    Uint8Array.of(o.verified === false ? 0 : 1, 100),
    Uint8Array.of(0, o.mutable ? 1 : 0),
  ]);
}

function record(mint = MINT): Uint8Array {
  const out = Buffer.alloc(455);
  createHash('sha256').update('account:LaunchRecord').digest().subarray(0, 8).copy(out, 0);
  Buffer.from(decode(mint)).copy(out, 8);
  return out;
}

const CREATOR = peddlesCreatorAddress(PROGRAM);

/** Serves by account kind, so a test changes only what it is about. */
function chain(over: { mint?: unknown; record?: unknown; metadata?: unknown } = {}): GetSolanaAccount {
  const reads: unknown[] = [];
  return async () => {
    reads.push(1);
    const i = reads.length;
    if (i === 1) return (over.mint === undefined ? { owner: TOKEN, data: new Uint8Array(82) } : over.mint) as never;
    if (i === 2) return (over.record === undefined ? { owner: PROGRAM, data: record() } : over.record) as never;
    return (over.metadata === undefined ? { owner: METAPLEX, data: metadata({ update: CREATOR, creator: CREATOR }) } : over.metadata) as never;
  };
}

const reasonOf = async (getAccount: GetSolanaAccount) => {
  const out = await verifyPeddlesMint(MINT, PROGRAM, getAccount);
  assert.equal(out.verified, false);
  return (out as { reason: string }).reason;
};

test('a genuine launch verifies, and names the record and the creator', async () => {
  const out = await verifyPeddlesMint(MINT, PROGRAM, chain());
  assert.equal(out.verified, true);
  assert.equal((out as { creator: string }).creator, CREATOR);
});

test('the creator address is the same for every launch, and differs by program', () => {
  assert.equal(peddlesCreatorAddress(PROGRAM), CREATOR);
  assert.notEqual(peddlesCreatorAddress(METAPLEX), CREATOR);
});

test('a copy with the right creator but unverified fails', async () => {
  const data = metadata({ update: CREATOR, creator: CREATOR, verified: false });
  assert.match(await reasonOf(chain({ metadata: { owner: METAPLEX, data } })), /not verified/);
});

test('a copy with its own update authority fails', async () => {
  const data = metadata({ update: MINT, creator: CREATOR });
  assert.match(await reasonOf(chain({ metadata: { owner: METAPLEX, data } })), /update authority/);
});

test('metadata not owned by Metaplex fails', async () => {
  const data = metadata({ update: CREATOR, creator: CREATOR });
  assert.match(await reasonOf(chain({ metadata: { owner: PROGRAM, data } })), /not owned by Metaplex/);
});

test('no launch record fails, whatever the metadata says', async () => {
  assert.match(await reasonOf(chain({ record: null })), /No launch record/);
});

test('a record owned by anything else, of the wrong type or for another mint, fails', async () => {
  assert.match(await reasonOf(chain({ record: { owner: METAPLEX, data: record() } })), /not owned by the launch program/);
  const wrong = Buffer.from(record());
  wrong[0] = wrong[0]! ^ 1;
  assert.match(await reasonOf(chain({ record: { owner: PROGRAM, data: wrong } })), /wrong type/);
  assert.match(await reasonOf(chain({ record: { owner: PROGRAM, data: record(PROGRAM) } })), /another mint/);
});

test('a royalty or mutable metadata fails: a launch has neither', async () => {
  assert.match(await reasonOf(chain({ metadata: { owner: METAPLEX, data: metadata({ update: CREATOR, creator: CREATOR, fee: 100 }) } })), /royalty/);
  assert.match(await reasonOf(chain({ metadata: { owner: METAPLEX, data: metadata({ update: CREATOR, creator: CREATOR, mutable: true }) } })), /changed/);
});

test('a Token-2022 mint is not a launch: the coin is always plain SPL', async () => {
  assert.match(await reasonOf(chain({ mint: { owner: PROGRAM, data: new Uint8Array(82) } })), /Not a launch mint/);
});

test('an address ending PEDL proves nothing: the ending is never read', async () => {
  assert.match(await reasonOf(chain({ record: null })), /No launch record/);
  assert.equal(/ends?_?with|PEDL\b.*===/.test(verifyPeddlesMint.toString()), false);
});

test('a failed read is an error, not a no', async () => {
  await assert.rejects(verifyPeddlesMint(MINT, PROGRAM, async () => { throw new Error('node is behind'); }), /node is behind/);
});

test('bad input is a no, without a read', async () => {
  const out = await verifyPeddlesMint('0xabc', PROGRAM, async () => { throw new Error('should not read'); });
  assert.equal(out.verified, false);
});
