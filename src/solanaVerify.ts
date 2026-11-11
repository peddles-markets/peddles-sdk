/**
 * Is this Solana mint a real Peddles launch? One function for the web, the API and the bots.
 *
 * It answers from the chain and from nothing else. A mint counts only if the launch program's own
 * record exists for it, and Metaplex shows the one address only that program can sign for, as both
 * the update authority and a verified creator. Metaplex sets `verified` at creation only when the
 * creator is the update authority and signs, and the program's PDA can only sign inside the program,
 * so a copy cannot produce it.
 *
 * THE `PEDL` ENDING PROVES NOTHING. Anyone can grind one. It is not read here.
 *
 * No dependency and no network: the caller passes `getAccount`. A read that fails must throw, and
 * the throw comes through: "could not check" is not "no".
 */

const METAPLEX = 'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s';
const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export interface SolanaAccountRead {
  /** The program that owns the account, base58. */
  readonly owner: string;
  readonly data: Uint8Array;
}

/** Returns null when the account does not exist. Must throw when it could not be read. */
export type GetSolanaAccount = (address: string) => Promise<SolanaAccountRead | null>;

export type PeddlesMintCheck =
  | { readonly verified: true; readonly launchRecord: string; readonly creator: string }
  | { readonly verified: false; readonly reason: string };

function base58Encode(bytes: Uint8Array): string {
  let value = 0n;
  for (const b of bytes) value = (value << 8n) | BigInt(b);
  let out = '';
  while (value > 0n) {
    out = ALPHABET[Number(value % 58n)] + out;
    value /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    out = `1${out}`;
  }
  return out;
}

function base58Decode(text: string): Uint8Array | null {
  let value = 0n;
  for (const c of text) {
    const digit = ALPHABET.indexOf(c);
    if (digit < 0) return null;
    value = value * 58n + BigInt(digit);
  }
  const out: number[] = [];
  while (value > 0n) {
    out.unshift(Number(value & 0xffn));
    value >>= 8n;
  }
  for (const c of text) {
    if (c !== '1') break;
    out.unshift(0);
  }
  return Uint8Array.from(out);
}

function address32(text: string): Uint8Array | null {
  const bytes = base58Decode(text);
  return bytes && bytes.length === 32 ? bytes : null;
}

/* SHA-256, synchronous and dependency-free, because a browser's `crypto.subtle` is neither. */

const K = Uint32Array.from(
  (() => {
    const out: number[] = [];
    for (let c = 2; out.length < 64; c++) {
      let prime = true;
      for (let d = 2; d * d <= c; d++) if (c % d === 0) prime = false;
      if (prime) out.push(Math.floor((Math.cbrt(c) % 1) * 2 ** 32));
    }
    return out;
  })(),
);

function sha256(message: Uint8Array): Uint8Array {
  const length = message.length;
  const padded = new Uint8Array((((length + 8) >> 6) + 1) * 64);
  padded.set(message);
  padded[length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor((length * 8) / 2 ** 32));
  view.setUint32(padded.length - 4, (length * 8) >>> 0);

  const h = Uint32Array.from([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let block = 0; block < padded.length; block += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(block + i * 4);
    for (let i = 16; i < 64; i++) {
      const a = w[i - 15]!;
      const b = w[i - 2]!;
      w[i] = (w[i - 16]! + (rotr(a, 7) ^ rotr(a, 18) ^ (a >>> 3)) + w[i - 7]! + (rotr(b, 17) ^ rotr(b, 19) ^ (b >>> 10))) | 0;
    }
    let [a, b, c, d, e, f, g, x] = [h[0]!, h[1]!, h[2]!, h[3]!, h[4]!, h[5]!, h[6]!, h[7]!];
    for (let i = 0; i < 64; i++) {
      const t1 = (x + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i]! + w[i]!) | 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      x = g;
      g = f;
      f = e;
      e = (d + t1) | 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) | 0;
    }
    [a, b, c, d, e, f, g, x].forEach((value, i) => {
      h[i] = (h[i]! + value) | 0;
    });
  }
  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  h.forEach((value, i) => outView.setUint32(i * 4, value));
  return out;
}

/* A program-derived address: the first bump, from 255 down, whose hash is off the ed25519 curve. */

const P = 2n ** 255n - 19n;

function pow(base: bigint, exponent: bigint): bigint {
  let result = 1n;
  let b = ((base % P) + P) % P;
  let e = exponent;
  while (e > 0n) {
    if (e & 1n) result = (result * b) % P;
    b = (b * b) % P;
    e >>= 1n;
  }
  return result;
}

const D = (((-121665n * pow(121666n, P - 2n)) % P) + P) % P;
const SQRT_M1 = pow(2n, (P - 1n) / 4n);

function isOnCurve(key: Uint8Array): boolean {
  let y = 0n;
  for (let i = 31; i >= 0; i--) y = (y << 8n) | BigInt(key[i] ?? 0);
  const sign = y >> 255n;
  y &= (1n << 255n) - 1n;
  if (y >= P) return false;
  const y2 = (y * y) % P;
  const u = (y2 - 1n + P) % P;
  const v = (D * y2 + 1n) % P;
  const v3 = (v * v * v) % P;
  const v7 = (v3 * v3 * v) % P;
  let x = (u * v3 * pow((u * v7) % P, (P - 5n) / 8n)) % P;
  const vx2 = (v * ((x * x) % P)) % P;
  if (vx2 !== u) {
    if (vx2 !== (P - u) % P) return false;
    x = (x * SQRT_M1) % P;
  }
  return !(x === 0n && sign === 1n);
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/**
 * The bytes of an ASCII seed or type name. Not `TextEncoder`: the package targets plain ES2022 with
 * no DOM or Node types, and every string passed here is a fixed ASCII constant.
 */
const text = (value: string): Uint8Array =>
  Uint8Array.from(value, (c) => {
    const code = c.charCodeAt(0);
    if (code > 0x7f) throw new Error('ASCII only.');
    return code;
  });

function programAddress(seeds: readonly Uint8Array[], program: Uint8Array): string {
  for (let bump = 255; bump >= 0; bump--) {
    const key = sha256(concat([...seeds, Uint8Array.of(bump), program, text('ProgramDerivedAddress')]));
    if (!isOnCurve(key)) return base58Encode(key);
  }
  throw new Error('No viable bump.');
}

/** The address every genuine launch carries: Metaplex update authority and verified creator. */
export function peddlesCreatorAddress(programId: string): string {
  const program = address32(programId);
  if (!program) throw new Error('Not a program id.');
  return programAddress([text('creator')], program);
}

const LAUNCH_RECORD_LEN = 455;
const LAUNCH_RECORD_DISCRIMINATOR = 'account:LaunchRecord';

/** Metaplex `Metadata`: key, update_authority, mint, then name, symbol, uri as u32-length strings. */
function readMetadata(data: Uint8Array): { updateAuthority: string; mint: string; creators: { address: string; verified: boolean; share: number }[]; sellerFeeBps: number; mutable: boolean } | null {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (data.length < 65 || data[0] !== 4) return null; // Key::MetadataV1
  let at = 65;
  for (let i = 0; i < 3; i++) {
    if (at + 4 > data.length) return null;
    at += 4 + view.getUint32(at, true);
  }
  if (at + 3 > data.length) return null;
  const sellerFeeBps = view.getUint16(at, true);
  at += 2;
  const creators: { address: string; verified: boolean; share: number }[] = [];
  const hasCreators = data[at++];
  if (hasCreators === 1) {
    if (at + 4 > data.length) return null;
    const count = view.getUint32(at, true);
    at += 4;
    if (at + count * 34 > data.length) return null;
    for (let i = 0; i < count; i++) {
      creators.push({ address: base58Encode(data.subarray(at, at + 32)), verified: data[at + 32] === 1, share: data[at + 33]! });
      at += 34;
    }
  }
  if (at + 2 > data.length) return null;
  const mutable = data[at + 1] === 1; // after primary_sale_happened
  return {
    updateAuthority: base58Encode(data.subarray(1, 33)),
    mint: base58Encode(data.subarray(33, 65)),
    creators,
    sellerFeeBps,
    mutable,
  };
}

/**
 * Yes or no, from the chain. `programId` is the launch program for this cluster, from config. Throws
 * only if `getAccount` throws: a failed read is not an answer.
 */
export async function verifyPeddlesMint(mint: string, programId: string, getAccount: GetSolanaAccount): Promise<PeddlesMintCheck> {
  const no = (reason: string): PeddlesMintCheck => ({ verified: false, reason });
  const mintKey = address32(mint);
  const program = address32(programId);
  if (!mintKey) return no('Not a Solana address.');
  if (!program) return no('No launch program for this cluster.');
  const metaplex = address32(METAPLEX)!;

  const recordAddress = programAddress([text('launch'), mintKey], program);
  const metadataAddress = programAddress([text('metadata'), metaplex, mintKey], metaplex);
  const [mintAccount, record, metadataAccount] = await Promise.all([getAccount(mint), getAccount(recordAddress), getAccount(metadataAddress)]);

  if (!mintAccount) return no('No such mint.');
  if (mintAccount.owner !== TOKEN_PROGRAM || mintAccount.data.length !== 82) return no('Not a launch mint.');

  if (!record) return no('No launch record for this mint.');
  if (record.owner !== programId) return no('The launch record is not owned by the launch program.');
  if (record.data.length !== LAUNCH_RECORD_LEN) return no('The launch record is the wrong size.');
  const discriminator = sha256(text(LAUNCH_RECORD_DISCRIMINATOR)).subarray(0, 8);
  if (discriminator.some((byte, i) => byte !== record.data[i])) return no('The launch record has the wrong type.');
  if (base58Encode(record.data.subarray(8, 40)) !== mint) return no('The launch record names another mint.');

  if (!metadataAccount) return no('No metadata for this mint.');
  if (metadataAccount.owner !== METAPLEX) return no('The metadata is not owned by Metaplex.');
  const metadata = readMetadata(metadataAccount.data);
  if (!metadata || metadata.mint !== mint) return no('The metadata could not be read.');

  const creator = programAddress([text('creator')], program);
  if (metadata.updateAuthority !== creator) return no('The update authority is not the Peddles creator.');
  if (!metadata.creators.some((c) => c.address === creator && c.verified)) return no('The Peddles creator is not verified on this mint.');
  if (metadata.sellerFeeBps !== 0) return no('The metadata carries a royalty.');
  if (metadata.mutable) return no('The metadata can still be changed.');

  return { verified: true, launchRecord: recordAddress, creator };
}
