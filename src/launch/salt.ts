import { concat, encodeAbiParameters, getAddress, keccak256 } from 'viem';

/**
 * Salt handling for the two CREATE2 launch paths — a pure port of the web app's
 * `features/launch/salt.ts`, held identical by test.
 *
 * ─── EVERY PEDDLES ADDRESS ENDS IN `1978` ────────────────────────────────────
 * The platform contracts do, and launched tokens do too, with no option to choose
 * otherwise. So there is no vanity field: a launch MINES a salt whose address
 * carries the suffix, and the creator sees the address they will get.
 *
 * A salt does two jobs, and only one of them is the suffix:
 *
 *   1. It picks the address. Both contracts mix the variant AND `msg.sender`
 *      into it (`keccak256(abi.encode(variant, sender, salt))`), so a salt only
 *      ever addresses the caller's OWN CREATE2 space.
 *   2. It defeats front-running. The token address is an input to the pool key,
 *      so anyone who can predict it can open that pool first at a price of their
 *      choosing — the launch then reverts `POOL_PRICE_MISMATCH`. Mining starts
 *      from a CSPRNG value, so the mined salt is as unguessable as a random one.
 *
 * ─── LOCAL DERIVATION, CONTRACT CONFIRMATION ─────────────────────────────────
 * Mining computes the address locally (65,536 expected attempts is not an RPC
 * job), and the plan builders then CONFIRM the candidate with the contract's own
 * `getPeddlesAddress` / `predictCoin` before it is shown or submitted.
 */

/** The required address suffix, lowercase hex, no `0x`. */
export const ADDRESS_SUFFIX = '1978';

/**
 * `keccak256(abi.encode(uint8 variant, address sender, bytes32 salt))` — the
 * salt binding both `PeddlesStockLaunchpad._boundSalt` and
 * `PeddlesFactoryV20._boundSalt` apply.
 */
export function boundSalt(variant: number, sender: `0x${string}`, salt: `0x${string}`): `0x${string}` {
  return keccak256(
    encodeAbiParameters(
      [{ type: 'uint8' }, { type: 'address' }, { type: 'bytes32' }],
      [variant, sender, salt],
    ),
  );
}

/** Standard CREATE2: `keccak256(0xff ‖ deployer ‖ salt ‖ initCodeHash)[12:]`. */
export function create2Address(
  deployer: `0x${string}`,
  salt: `0x${string}`,
  initCodeHash: `0x${string}`,
): `0x${string}` {
  const digest = keccak256(concat(['0xff', deployer, salt, initCodeHash]));
  return getAddress(`0x${digest.slice(26)}`);
}

export function hasSuffix(address: string, suffix: string = ADDRESS_SUFFIX): boolean {
  return address.toLowerCase().endsWith(suffix.toLowerCase());
}

/**
 * A fresh unguessable salt from the platform CSPRNG (`crypto.getRandomValues`,
 * never `Math.random`): this value is the only thing standing between a launch
 * and a mempool watcher who opens the pool first.
 */
export function randomSalt(): `0x${string}` {
  const bytes = new Uint8Array(32);
  // Typed structurally: this package ships no DOM or Node lib, and both runtimes expose the same API.
  const cryptoApi = (globalThis as unknown as { crypto?: { getRandomValues(array: Uint8Array): Uint8Array } }).crypto;
  if (!cryptoApi) throw new Error('No CSPRNG (globalThis.crypto) is available; refusing to mine a guessable salt.');
  cryptoApi.getRandomValues(bytes);
  return `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

/** `0x00…00` — the salt a caller means by "none", still bound to the sender. */
export const ZERO_SALT: `0x${string}` = `0x${'0'.repeat(64)}`;

export interface MineParams {
  /** The contract that runs CREATE2 — the launchpad or the factory. */
  readonly deployer: `0x${string}`;
  /** The variant byte the contract mixes into the salt. */
  readonly variant: number;
  /** The `msg.sender` the contract binds the salt to — the creator, or the orchestrator. */
  readonly sender: `0x${string}`;
  readonly initCodeHash: `0x${string}`;
  readonly suffix?: string;
  /** Anything with an `aborted` flag — an `AbortSignal`, or a plain object a caller flips. */
  readonly signal?: { readonly aborted: boolean };
  /** Called every chunk with the attempt count so far. */
  readonly onProgress?: (attempts: number) => void;
  /**
   * Hard ceiling on attempts. A 4-hex suffix is 1 in 65,536; the default is ~60×
   * that, so hitting it means something is wrong with the inputs, not bad luck,
   * and the caller fails closed rather than looping forever.
   */
  readonly maxAttempts?: number;
}

export interface MinedSalt {
  readonly salt: `0x${string}`;
  /** The locally derived address. Confirm it with the contract before use. */
  readonly address: `0x${string}`;
  readonly attempts: number;
}

export class MiningAbortedError extends Error {
  constructor() {
    super('Address mining was cancelled.');
    this.name = 'MiningAbortedError';
  }
}

export class MiningExhaustedError extends Error {
  readonly attempts: number;
  constructor(suffix: string, attempts: number) {
    super(`No address ending in ${suffix} was found after ${attempts.toLocaleString()} attempts.`);
    this.name = 'MiningExhaustedError';
    this.attempts = attempts;
  }
}

const CHUNK = 4096;

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function bytesToHex(bytes: Uint8Array): `0x${string}` {
  let s = '0x';
  for (const b of bytes) s += b.toString(16).padStart(2, '0');
  return s as `0x${string}`;
}

/**
 * Find a salt whose bound CREATE2 address ends in `suffix`.
 *
 * The hot loop works on bytes: two keccaks per attempt, preimages preallocated
 * once, the suffix compared on the raw hash bytes. The winner is re-derived
 * through `boundSalt` + `create2Address` before it is returned, so the fast path
 * can never quietly disagree with the readable one. Runs in chunks and yields
 * between them, so a caller can cancel through `signal` and a main thread keeps
 * painting.
 */
export async function mineSalt(params: MineParams): Promise<MinedSalt> {
  const {
    deployer,
    variant,
    sender,
    initCodeHash,
    suffix = ADDRESS_SUFFIX,
    signal,
    onProgress,
    maxAttempts = 4_000_000,
  } = params;

  if (!/^[0-9a-fA-F]+$/.test(suffix) || suffix.length % 2 !== 0) {
    throw new Error(`The address suffix must be whole hex bytes; got "${suffix}".`);
  }
  const want = hexToBytes(suffix);

  // abi.encode(uint8 variant, address sender, bytes32 salt): three 32-byte words.
  const bound = new Uint8Array(96);
  bound[31] = variant & 0xff;
  bound.set(hexToBytes(sender), 32 + 12);
  const saltView = bound.subarray(64, 96);
  saltView.set(hexToBytes(randomSalt()));

  // 0xff ‖ deployer ‖ boundSalt ‖ initCodeHash.
  const create2 = new Uint8Array(85);
  create2[0] = 0xff;
  create2.set(hexToBytes(deployer), 1);
  create2.set(hexToBytes(initCodeHash), 53);

  const bump = () => {
    for (let i = 31; i >= 0; i -= 1) {
      saltView[i] = (saltView[i]! + 1) & 0xff;
      if (saltView[i] !== 0) break;
    }
  };

  let attempts = 0;

  while (attempts < maxAttempts) {
    if (signal?.aborted) throw new MiningAbortedError();

    for (let i = 0; i < CHUNK && attempts < maxAttempts; i += 1) {
      create2.set(keccak256(bound, 'bytes'), 21);
      const digest = keccak256(create2, 'bytes');
      attempts += 1;

      let hit = true;
      for (let j = 0; j < want.length; j += 1) {
        if (digest[32 - want.length + j] !== want[j]) {
          hit = false;
          break;
        }
      }
      if (hit) {
        const salt = bytesToHex(saltView);
        const address = create2Address(deployer, boundSalt(variant, sender, salt), initCodeHash);
        if (!hasSuffix(address, suffix)) {
          throw new Error('The address miner disagreed with itself; nothing was reserved.');
        }
        return { salt, address, attempts };
      }
      bump();
    }

    onProgress?.(attempts);
    // A macrotask yield (`setTimeout(0)`), so a main-thread caller gets to paint between chunks.
    await new Promise<void>((resolve) => (globalThis as unknown as { setTimeout(fn: () => void, ms: number): unknown }).setTimeout(resolve, 0));
  }

  throw new MiningExhaustedError(suffix, attempts);
}
