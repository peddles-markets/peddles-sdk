/**
 * The little of Solana's wire format a launch needs: base58, base64, UTF-8, SHA-256, the ed25519
 * curve check and program-derived addresses.
 *
 * Ported from the web app (`apps/web/src/features/terminal/solana/codec.ts`), which is pinned against
 * the values the general Solana client libraries produce. The SDK targets plain ES2022 with no DOM or
 * Node types and no Solana dependency, so the few platform helpers the web takes from the browser
 * (`TextEncoder`, `atob`, `btoa`, `viem`'s `sha256`) are written out here and tested equal to them
 * (`src/__tests__/solanaLaunch.test.ts`).
 *
 * Nothing in this file touches a network or a key.
 */

/* ------------------------------------------------------------------ UTF-8 */

/** UTF-8 bytes, exactly as `TextEncoder` writes them (a lone surrogate becomes U+FFFD). */
export function utf8Encode(text: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < text.length; i++) {
    let code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = i + 1 < text.length ? text.charCodeAt(i + 1) : 0;
      if (next >= 0xdc00 && next <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
        i++;
      } else {
        code = 0xfffd;
      }
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      code = 0xfffd;
    }
    if (code < 0x80) out.push(code);
    else if (code < 0x800) out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    else if (code < 0x10000) out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    else out.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
  }
  return Uint8Array.from(out);
}

/**
 * UTF-8 text, exactly as `new TextDecoder('utf-8')` reads it (WHATWG: each maximal invalid subpart
 * becomes one U+FFFD, and a leading byte-order mark is dropped).
 */
export function utf8Decode(bytes: Uint8Array): string {
  let out = '';
  let codePoint = 0;
  let needed = 0;
  let seen = 0;
  let lower = 0x80;
  let upper = 0xbf;
  const push = (cp: number) => {
    out += String.fromCodePoint(cp);
  };
  for (let i = 0; i <= bytes.length; i++) {
    if (i === bytes.length) {
      if (needed !== 0) push(0xfffd);
      break;
    }
    const byte = bytes[i]!;
    if (needed === 0) {
      if (byte <= 0x7f) push(byte);
      else if (byte >= 0xc2 && byte <= 0xdf) {
        needed = 1;
        codePoint = byte & 0x1f;
      } else if (byte >= 0xe0 && byte <= 0xef) {
        if (byte === 0xe0) lower = 0xa0;
        if (byte === 0xed) upper = 0x9f;
        needed = 2;
        codePoint = byte & 0xf;
      } else if (byte >= 0xf0 && byte <= 0xf4) {
        if (byte === 0xf0) lower = 0x90;
        if (byte === 0xf4) upper = 0x8f;
        needed = 3;
        codePoint = byte & 0x7;
      } else push(0xfffd);
      continue;
    }
    if (byte < lower || byte > upper) {
      codePoint = needed = seen = 0;
      lower = 0x80;
      upper = 0xbf;
      push(0xfffd);
      i--; // reprocess this byte as a fresh start
      continue;
    }
    lower = 0x80;
    upper = 0xbf;
    codePoint = (codePoint << 6) | (byte & 0x3f);
    seen++;
    if (seen === needed) {
      push(codePoint);
      codePoint = needed = seen = 0;
    }
  }
  return out.charCodeAt(0) === 0xfeff ? out.slice(1) : out;
}

/* ------------------------------------------------------------------ base58 / base64 */

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const ALPHABET_INDEX: Readonly<Record<string, number>> = Object.fromEntries([...ALPHABET].map((c, i) => [c, i]));

export function base58Encode(bytes: Uint8Array): string {
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  let out = '';
  while (n > 0n) {
    out = ALPHABET[Number(n % 58n)] + out;
    n /= 58n;
  }
  return '1'.repeat(zeros) + out;
}

/** Null when the text is not base58. */
export function base58Decode(text: string): Uint8Array | null {
  let zeros = 0;
  while (zeros < text.length && text[zeros] === '1') zeros++;
  let n = 0n;
  for (const c of text) {
    const v = ALPHABET_INDEX[c];
    if (v === undefined) return null;
    n = n * 58n + BigInt(v);
  }
  const body: number[] = [];
  while (n > 0n) {
    body.unshift(Number(n & 0xffn));
    n >>= 8n;
  }
  return Uint8Array.from([...new Array<number>(zeros).fill(0), ...body]);
}

/** A 32-byte Solana address, or null. */
export function addressBytes(address: string): Uint8Array | null {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) return null;
  const bytes = base58Decode(address);
  return bytes && bytes.length === 32 ? bytes : null;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_INDEX: Readonly<Record<string, number>> = Object.fromEntries([...B64].map((c, i) => [c, i]));

/** Null when the text is not padded standard base64. */
export function base64Decode(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(text) || text.length % 4 !== 0) return null;
  const body = text.replace(/=+$/, '');
  if (text.length - body.length > 0 && text.length - body.length !== (4 - (body.length % 4)) % 4) return null;
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const c of body) {
    buffer = (buffer << 6) | B64_INDEX[c]!;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 0xff);
    }
  }
  return Uint8Array.from(out);
}

export function base64Encode(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!;
    const b = i + 1 < bytes.length ? bytes[i + 1]! : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2]! : 0;
    const n = (a << 16) | (b << 8) | c;
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]!;
    out += i + 1 < bytes.length ? B64[(n >> 6) & 63]! : '=';
    out += i + 2 < bytes.length ? B64[n & 63]! : '=';
  }
  return out;
}

/* ------------------------------------------------------------------ integers */

export function readU16LE(b: Uint8Array, at: number): number | null {
  if (at < 0 || at + 2 > b.length) return null;
  return b[at]! | (b[at + 1]! << 8);
}

export function readU64LE(b: Uint8Array, at: number): bigint | null {
  if (at < 0 || at + 8 > b.length) return null;
  let n = 0n;
  for (let i = 7; i >= 0; i--) n = (n << 8n) | BigInt(b[at + i]!);
  return n;
}

/* ------------------------------------------------------------------ SHA-256 */

const K = Int32Array.from([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01,
  0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08,
  0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
export const SHA256_IV = Int32Array.from([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);

/** The message schedule of one block: `w[0..16]` in, `w[16..64]` out. */
export function sha256Expand(w: Int32Array): void {
  for (let t = 16; t < 64; t++) {
    const a = w[t - 15]!;
    const b = w[t - 2]!;
    const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
    const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
    w[t] = (w[t - 16]! + s0 + w[t - 7]! + s1) | 0;
  }
}

/** One compression of an expanded block into `state`. */
export function sha256Compress(state: Int32Array, w: Int32Array): void {
  let a = state[0]!;
  let b = state[1]!;
  let c = state[2]!;
  let d = state[3]!;
  let e = state[4]!;
  let f = state[5]!;
  let g = state[6]!;
  let h = state[7]!;
  for (let t = 0; t < 64; t++) {
    const s1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
    const ch = (e & f) ^ (~e & g);
    const t1 = (h + s1 + ch + K[t]! + w[t]!) | 0;
    const s0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
    const maj = (a & b) ^ (a & c) ^ (b & c);
    const t2 = (s0 + maj) | 0;
    h = g;
    g = f;
    f = e;
    e = (d + t1) | 0;
    d = c;
    c = b;
    b = a;
    a = (t1 + t2) | 0;
  }
  state[0] = (state[0]! + a) | 0;
  state[1] = (state[1]! + b) | 0;
  state[2] = (state[2]! + c) | 0;
  state[3] = (state[3]! + d) | 0;
  state[4] = (state[4]! + e) | 0;
  state[5] = (state[5]! + f) | 0;
  state[6] = (state[6]! + g) | 0;
  state[7] = (state[7]! + h) | 0;
}

export function sha256(message: Uint8Array): Uint8Array {
  const blocks = Math.floor((message.length + 8) / 64) + 1;
  const padded = new Uint8Array(blocks * 64);
  padded.set(message);
  padded[message.length] = 0x80;
  const bits = BigInt(message.length) * 8n;
  for (let i = 0; i < 8; i++) padded[padded.length - 1 - i] = Number((bits >> BigInt(8 * i)) & 0xffn);
  const state = Int32Array.from(SHA256_IV);
  const w = new Int32Array(64);
  for (let block = 0; block < blocks; block++) {
    for (let t = 0; t < 16; t++) {
      const at = block * 64 + t * 4;
      w[t] = (padded[at]! << 24) | (padded[at + 1]! << 16) | (padded[at + 2]! << 8) | padded[at + 3]!;
    }
    sha256Expand(w);
    sha256Compress(state, w);
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 8; i++) {
    const v = state[i]!;
    out[i * 4] = (v >>> 24) & 0xff;
    out[i * 4 + 1] = (v >>> 16) & 0xff;
    out[i * 4 + 2] = (v >>> 8) & 0xff;
    out[i * 4 + 3] = v & 0xff;
  }
  return out;
}

/* ------------------------------------------------------------------ derived addresses */

const P = 2n ** 255n - 19n;
const D = 37095705934669439343138083508754565189542113879843219016388785533085940283555n;

const mod = (a: bigint): bigint => ((a % P) + P) % P;

function modPow(base: bigint, exponent: bigint): bigint {
  let result = 1n;
  let b = mod(base);
  let e = exponent;
  while (e > 0n) {
    if (e & 1n) result = (result * b) % P;
    b = (b * b) % P;
    e >>= 1n;
  }
  return result;
}

/**
 * Is this 32-byte value a point on the ed25519 curve (a key someone could hold), as opposed to a
 * program-derived address? The strict decoding rule the Solana runtime uses.
 */
export function isOnCurve(bytes: Uint8Array): boolean {
  if (bytes.length !== 32) return false;
  let y = 0n;
  for (let i = 31; i >= 0; i--) y = (y << 8n) | BigInt(bytes[i]!);
  const signBit = (y >> 255n) & 1n;
  y &= (1n << 255n) - 1n;
  if (y >= P) return false;
  const y2 = (y * y) % P;
  const u = mod(y2 - 1n);
  const v = mod(D * y2 + 1n);
  const v3 = mod(v * v * v);
  const v7 = mod(v3 * v3 * v);
  const x = mod(u * v3 * modPow(u * v7, (P - 5n) / 8n));
  const vx2 = mod(v * x * x);
  if (vx2 !== u && vx2 !== mod(-u)) return false;
  if (u === 0n && signBit === 1n) return false;
  return true;
}

const PDA_MARKER = utf8Encode('ProgramDerivedAddress');

export function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** The program-derived address for these seeds (canonical bump), or null when a seed or the program is malformed. */
export function programAddress(seeds: readonly (string | Uint8Array)[], program: string): string | null {
  const programBytes = addressBytes(program);
  if (!programBytes) return null;
  const parts: Uint8Array[] = [];
  for (const seed of seeds) {
    const bytes = typeof seed === 'string' ? utf8Encode(seed) : seed;
    if (bytes.length > 32) return null;
    parts.push(bytes);
  }
  for (let bump = 255; bump >= 0; bump--) {
    const hash = sha256(concatBytes([...parts, Uint8Array.of(bump), programBytes, PDA_MARKER]));
    if (!isOnCurve(hash)) return base58Encode(hash);
  }
  return null;
}

export const SYSTEM_PROGRAM = '11111111111111111111111111111111';
export const COMPUTE_BUDGET_PROGRAM = 'ComputeBudget111111111111111111111111111111';
export const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
export const TOKEN_2022_PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
export const ATA_PROGRAM = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
export const ADDRESS_LOOKUP_TABLE_PROGRAM = 'AddressLookupTab1e1111111111111111111111111';
export const WSOL_MINT = 'So11111111111111111111111111111111111111112';

/** The associated token account of `owner` for `mint` under a token program. Null on a malformed address. */
export function associatedTokenAddress(mint: string, owner: string, tokenProgram: string = TOKEN_PROGRAM): string | null {
  const [o, t, m] = [addressBytes(owner), addressBytes(tokenProgram), addressBytes(mint)];
  if (!o || !t || !m) return null;
  return programAddress([o, t, m], ATA_PROGRAM);
}

/** The first eight bytes of an Anchor instruction: sha256("global:<name>"). */
export function anchorDiscriminator(name: string): Uint8Array {
  return sha256(utf8Encode(`global:${name}`)).subarray(0, 8);
}

/** The first eight bytes of an Anchor account: sha256("account:<Name>"). */
export function anchorAccountDiscriminator(name: string): Uint8Array {
  return sha256(utf8Encode(`account:${name}`)).subarray(0, 8);
}
