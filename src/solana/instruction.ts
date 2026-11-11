import {
  ATA_PROGRAM,
  COMPUTE_BUDGET_PROGRAM,
  SYSTEM_PROGRAM,
  TOKEN_2022_PROGRAM,
  TOKEN_PROGRAM,
  WSOL_MINT,
  addressBytes,
  anchorDiscriminator,
  associatedTokenAddress,
  base58Decode,
  programAddress,
  utf8Encode,
} from './codec.js';
import {
  METAPLEX_TOKEN_METADATA,
  METEORA_DAMM_V2,
  METEORA_EVENT_AUTHORITY,
  METEORA_POOL_AUTHORITY,
} from './constants.js';
import { parseUrl } from './platform.js';

/**
 * The `launch` instruction, as bytes. Pure: no network, no key, no wallet.
 *
 * Ported byte for byte from the web app (`apps/web/src/features/launch/solana/instruction.ts`; a
 * parity test holds the two equal), which was built from
 * `solana/programs/peddles-launch/src/instructions/launch.rs` (the `Launch` account struct in field
 * order, `LaunchParams` in field order) and `constants.rs` (seeds). The program ships no IDL in the
 * repo; the source is the reference, and a mainnet `simulateTransaction` passes account validation.
 *
 * The coin mint and the position NFT mint are PDAs, so the creator is the transaction's ONLY
 * signer and there is no throwaway key anywhere. That is why the `PEDL` grind finds a SALT. The mint
 * is `[b"coin", salt]` from the pool, or `[b"coin", creator, salt]` for a Pre-Launch address.
 *
 * A launch transaction fits only as version 0 with an address lookup table (design §6), so the
 * compiler below takes one. Signers and invoked programs can never come from a table.
 */

const encoder = { encode: utf8Encode };

/** Metaplex limits, in BYTES (`peddles_fees::ix_data`). The program refuses more. */
export const MAX_NAME_BYTES = 32;
export const MAX_SYMBOL_BYTES = 10;
export const MAX_URI_BYTES = 200;

/** Solana's packet limit, and the most the API's `/swap/solana/*` routes accept. */
export const MAX_TRANSACTION_BYTES = 1232;

/** Design §6: the launch's estimate is 240–340k; "Request ~500k". */
export const LAUNCH_COMPUTE_UNITS = 500_000;

export interface AccountMeta {
  readonly address: string;
  readonly signer: boolean;
  readonly writable: boolean;
}

export interface Instruction {
  readonly programId: string;
  readonly accounts: readonly AccountMeta[];
  readonly data: Uint8Array;
}

const readonly = (address: string): AccountMeta => ({ address, signer: false, writable: false });
const writable = (address: string): AccountMeta => ({ address, signer: false, writable: true });

function must(value: string | null, what: string): string {
  if (value === null) throw new Error(`Could not derive ${what}.`);
  return value;
}

function mustBytes(address: string): Uint8Array {
  const bytes = addressBytes(address);
  if (!bytes) throw new Error(`Not a Solana address: ${address}`);
  return bytes;
}

/** Rust's `Pubkey` ordering: bytewise. */
function compareKeys(a: Uint8Array, b: Uint8Array): number {
  for (let i = 0; i < 32; i++) {
    if (a[i] !== b[i]) return a[i]! - b[i]!;
  }
  return 0;
}

/** With `creator`, the bound mint a Pre-Launch reserves. */
export function deriveCoinMint(programId: string, salt: Uint8Array, creator: string | null = null): string {
  if (salt.length !== 8) throw new Error('The salt is 8 bytes.');
  return must(programAddress(creator ? ['coin', mustBytes(creator), salt] : ['coin', salt], programId), 'the coin mint');
}

export interface LaunchAddresses {
  readonly config: string;
  readonly quoteConfig: string;
  readonly coinMint: string;
  readonly launchRecord: string;
  readonly feeVault: string;
  readonly creatorCoinAccount: string;
  readonly metadata: string;
  /** The same on every launch: Metaplex update authority and verified creator. */
  readonly peddlesCreator: string;
  readonly positionNftMint: string;
  readonly positionNftAccount: string;
  readonly pool: string;
  readonly position: string;
  readonly tokenAVault: string;
  readonly tokenBVault: string;
}

/** Every derived account of one launch. Seeds: `constants.rs`, and Meteora's in design §4.1. */
export function deriveLaunchAddresses(input: {
  readonly programId: string;
  readonly salt: Uint8Array;
  readonly boundToCreator: boolean;
  readonly quoteMint: string;
  readonly creator: string;
}): LaunchAddresses {
  const { programId, salt, boundToCreator, quoteMint, creator } = input;
  const quote = mustBytes(quoteMint);
  const coinMint = deriveCoinMint(programId, salt, boundToCreator ? creator : null);
  const coin = mustBytes(coinMint);
  const launchRecord = must(programAddress(['launch', coin], programId), 'the launch record');
  const positionNftMint = must(programAddress(['position_nft', coin], programId), 'the position NFT mint');
  const nft = mustBytes(positionNftMint);
  const [high, low] = compareKeys(coin, quote) >= 0 ? [coin, quote] : [quote, coin];
  const pool = must(programAddress(['cpool', high, low], METEORA_DAMM_V2), 'the pool');
  const poolBytes = mustBytes(pool);
  return {
    config: must(programAddress(['config'], programId), 'the config'),
    quoteConfig: must(programAddress(['quote', quote], programId), 'the quote config'),
    coinMint,
    launchRecord,
    feeVault: must(programAddress(['fee_vault', mustBytes(launchRecord)], programId), 'the fee vault'),
    creatorCoinAccount: must(associatedTokenAddress(coinMint, creator, TOKEN_PROGRAM), 'the creator coin account'),
    metadata: must(
      programAddress(['metadata', mustBytes(METAPLEX_TOKEN_METADATA), coin], METAPLEX_TOKEN_METADATA),
      'the metadata account',
    ),
    peddlesCreator: must(programAddress(['creator'], programId), 'the Peddles creator'),
    positionNftMint,
    positionNftAccount: must(programAddress(['position_nft_account', nft], METEORA_DAMM_V2), 'the NFT account'),
    pool,
    position: must(programAddress(['position', nft], METEORA_DAMM_V2), 'the position'),
    tokenAVault: must(programAddress(['token_vault', coin, poolBytes], METEORA_DAMM_V2), 'the coin vault'),
    tokenBVault: must(programAddress(['token_vault', quote, poolBytes], METEORA_DAMM_V2), 'the quote vault'),
  };
}

/* ------------------------------------------------------------------ Borsh */

class Writer {
  private readonly parts: Uint8Array[] = [];
  bytes(value: Uint8Array): this {
    this.parts.push(value);
    return this;
  }
  /** A little-endian unsigned integer of `size` bytes. Refuses a value that does not fit. */
  uint(value: bigint, size: number): this {
    if (value < 0n || value >= 1n << BigInt(size * 8)) throw new Error('An integer does not fit its field.');
    const out = new Uint8Array(size);
    let rest = value;
    for (let i = 0; i < size; i++) {
      out[i] = Number(rest & 0xffn);
      rest >>= 8n;
    }
    return this.bytes(out);
  }
  string(value: string): this {
    const utf8 = encoder.encode(value);
    return this.uint(BigInt(utf8.length), 4).bytes(utf8);
  }
  done(): Uint8Array {
    const out = new Uint8Array(this.parts.reduce((n, p) => n + p.length, 0));
    let at = 0;
    for (const part of this.parts) {
      out.set(part, at);
      at += part.length;
    }
    return out;
  }
}

/**
 * What the pinned metadata adds, in its own fields: the creator's name, image and description stay
 * theirs. The on-chain `uri` is the only link to this document.
 */
export function peddlesMetadataFields(coinMint: string): {
  readonly external_url: string;
  readonly attributes: ReadonlyArray<{ readonly trait_type: string; readonly value: string }>;
} {
  return {
    external_url: `https://peddles.xyz/terminal/token/solana/${coinMint}`,
    attributes: [{ trait_type: 'Platform', value: 'Launched on Peddles' }],
  };
}

/** The creator's links, each an https URL or absent. Pinned as attributes, which the API's metadata schema takes. */
export interface LaunchSocials {
  readonly x?: string | null;
  readonly telegram?: string | null;
  readonly website?: string | null;
}

/** The API refuses an attribute value over 128 characters (`attributeSchema`, `ipfs.service.ts`). */
export const MAX_SOCIAL_CHARS = 128;
const SOCIAL_TRAITS: ReadonlyArray<readonly [keyof LaunchSocials, string]> = [
  ['website', 'Website'],
  ['x', 'X'],
  ['telegram', 'Telegram'],
];

/** One link, checked, or null when it was left empty. A link that is not https throws, naming the field. */
export function socialLink(value: string | null | undefined, label: string): string | null {
  const text = (value ?? '').trim();
  if (text === '') return null;
  let url: ReturnType<typeof parseUrl>;
  try {
    url = parseUrl(text);
  } catch {
    throw new Error(`${label} must be a full https:// link.`);
  }
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error(`${label} must be a full https:// link.`);
  if (text.length > MAX_SOCIAL_CHARS) throw new Error(`${label} is longer than ${MAX_SOCIAL_CHARS} characters.`);
  return text;
}

/**
 * The `metadata.json` a launch pins, whose link the program writes into Metaplex: the creator's name,
 * picture, description and links, then Peddles' own fields. The launch form and the operator's
 * test-launch script both pin exactly this; the API validates it again before it pins.
 */
export function launchMetadataDocument(input: {
  readonly coinMint: string;
  readonly name: string;
  readonly imageCid: string;
  readonly description?: string | null;
  readonly socials?: LaunchSocials | null;
}): {
  readonly name: string;
  readonly image: string;
  readonly description?: string;
  readonly external_url: string;
  readonly attributes: ReadonlyArray<{ readonly trait_type: string; readonly value: string }>;
} {
  const fields = peddlesMetadataFields(input.coinMint);
  const links = SOCIAL_TRAITS.flatMap(([key, trait]) => {
    const link = socialLink(input.socials?.[key], trait);
    return link ? [{ trait_type: trait, value: link }] : [];
  });
  const description = (input.description ?? '').trim();
  return {
    name: input.name,
    image: `ipfs://${input.imageCid}`,
    ...(description ? { description } : {}),
    external_url: fields.external_url,
    attributes: [...fields.attributes, ...links],
  };
}

export interface LaunchParams {
  readonly salt: Uint8Array;
  readonly boundToCreator: boolean;
  readonly name: string;
  readonly symbol: string;
  readonly uri: string;
  readonly rateBps: number;
  readonly excessToCreatorBps: number;
  readonly creatorPayout: string;
  /** Deposits exactly the whole supply at `sqrtPrice`, with or without a first buy. */
  readonly liquidity: bigint;
  /** √P0, the price BEFORE any first buy. */
  readonly sqrtPrice: bigint;
  /** Raw quote, fee included. 0 for none. */
  readonly firstBuyQuote: bigint;
  readonly firstBuyMinCoins: bigint;
}

/** `LaunchParams` in field order, after Anchor's `sha256("global:launch")[..8]`. */
export function encodeLaunchData(p: LaunchParams): Uint8Array {
  if (p.salt.length !== 8) throw new Error('The salt is 8 bytes.');
  if (encoder.encode(p.name).length > MAX_NAME_BYTES) throw new Error('The name is too long.');
  if (encoder.encode(p.symbol).length > MAX_SYMBOL_BYTES) throw new Error('The ticker is too long.');
  if (encoder.encode(p.uri).length > MAX_URI_BYTES) throw new Error('The metadata link is too long.');
  return new Writer()
    .bytes(anchorDiscriminator('launch'))
    .bytes(p.salt)
    .uint(p.boundToCreator ? 1n : 0n, 1)
    .string(p.name)
    .string(p.symbol)
    .string(p.uri)
    .uint(BigInt(p.rateBps), 2)
    .uint(BigInt(p.excessToCreatorBps), 2)
    .bytes(mustBytes(p.creatorPayout))
    .uint(p.liquidity, 16)
    .uint(p.sqrtPrice, 16)
    .uint(p.firstBuyQuote, 8)
    .uint(p.firstBuyMinCoins, 8)
    .done();
}

export interface LaunchAccountInputs {
  readonly addresses: LaunchAddresses;
  readonly creator: string;
  readonly quoteMint: string;
  /** From `QuoteConfig`, never assumed. */
  readonly quoteTokenProgram: string;
  readonly quoteBadge: string;
  /** The creator's token account of the quote; it must exist and hold at least 1 raw unit. */
  readonly creatorQuoteAccount: string;
  /** `Config.platform_wallet`, read from the chain. */
  readonly platformWallet: string;
}

/** `struct Launch`, in field order. An order mistake here is a refused launch, so a test pins it. */
export function launchAccounts(i: LaunchAccountInputs): readonly AccountMeta[] {
  const a = i.addresses;
  return [
    { address: i.creator, signer: true, writable: true },
    readonly(a.config),
    readonly(a.quoteConfig),
    readonly(i.quoteMint),
    writable(a.coinMint),
    writable(a.launchRecord),
    writable(a.feeVault),
    writable(a.creatorCoinAccount),
    writable(i.creatorQuoteAccount),
    writable(a.metadata),
    readonly(a.peddlesCreator),
    writable(a.positionNftMint),
    writable(a.positionNftAccount),
    writable(a.pool),
    writable(a.position),
    writable(a.tokenAVault),
    writable(a.tokenBVault),
    readonly(METEORA_POOL_AUTHORITY),
    readonly(i.quoteBadge),
    writable(i.platformWallet),
    readonly(METEORA_EVENT_AUTHORITY),
    readonly(METEORA_DAMM_V2),
    readonly(METAPLEX_TOKEN_METADATA),
    readonly(TOKEN_PROGRAM),
    readonly(i.quoteTokenProgram),
    readonly(TOKEN_2022_PROGRAM),
    readonly(ATA_PROGRAM),
    readonly(SYSTEM_PROGRAM),
  ];
}

export function launchInstruction(programId: string, accounts: LaunchAccountInputs, params: LaunchParams): Instruction {
  return { programId, accounts: launchAccounts(accounts), data: encodeLaunchData(params) };
}

/* ------------------------------------------------------------------ the instructions around it */

/** Solana's per-transaction compute ceiling. */
export const MAX_COMPUTE_UNITS = 1_400_000;

export function computeBudgetInstructions(priorityMicroLamports: bigint, units: number = LAUNCH_COMPUTE_UNITS): readonly Instruction[] {
  if (!Number.isInteger(units) || units <= 0 || units > MAX_COMPUTE_UNITS) throw new Error('The compute limit is out of range.');
  const limit: Instruction = {
    programId: COMPUTE_BUDGET_PROGRAM,
    accounts: [],
    data: new Writer().uint(2n, 1).uint(BigInt(units), 4).done(),
  };
  if (priorityMicroLamports <= 0n) return [limit];
  return [
    limit,
    { programId: COMPUTE_BUDGET_PROGRAM, accounts: [], data: new Writer().uint(3n, 1).uint(priorityMicroLamports, 8).done() },
  ];
}

/**
 * A wSOL pair: the creator's account must exist and hold the first buy plus the 1 raw unit Meteora
 * pulls to prove the mint (design §1.6). Opens the account if needed, wraps, syncs. The same three
 * instructions `apps/api/src/terminal/swap/deep.ts` sends.
 */
export function wrapSolInstructions(creator: string, wsolAccount: string, lamports: bigint): readonly Instruction[] {
  return [
    {
      programId: ATA_PROGRAM,
      accounts: [
        { address: creator, signer: true, writable: true },
        writable(wsolAccount),
        readonly(creator),
        readonly(WSOL_MINT),
        readonly(SYSTEM_PROGRAM),
        readonly(TOKEN_PROGRAM),
      ],
      data: Uint8Array.of(1), // CreateIdempotent
    },
    {
      programId: SYSTEM_PROGRAM,
      accounts: [{ address: creator, signer: true, writable: true }, writable(wsolAccount)],
      data: new Writer().uint(2n, 4).uint(lamports, 8).done(), // Transfer
    },
    { programId: TOKEN_PROGRAM, accounts: [writable(wsolAccount)], data: Uint8Array.of(17) }, // SyncNative
  ];
}

/* ------------------------------------------------------------------ version 0 message */

export interface LookupTable {
  readonly address: string;
  /** The table's addresses, in table order, read from the chain. */
  readonly addresses: readonly string[];
}

function compact(n: number): number[] {
  const out: number[] = [];
  let rest = n;
  for (;;) {
    const low = rest & 0x7f;
    rest >>= 7;
    if (rest === 0) {
      out.push(low);
      return out;
    }
    out.push(low | 0x80);
  }
}

/**
 * A serialized version 0 transaction, its one signature empty for the wallet to fill. `lookupTables`
 * (Pay with SOL: ours and Jupiter's) are tried in order after `lookupTable`; an address loads from
 * the first table that holds it. One table compiles exactly as before.
 */
export function compileV0Transaction(input: {
  readonly payer: string;
  readonly recentBlockhash: string;
  readonly instructions: readonly Instruction[];
  readonly lookupTable: LookupTable | null;
  readonly lookupTables?: readonly LookupTable[];
}): Uint8Array {
  const { payer, recentBlockhash, instructions } = input;
  const tables = [...(input.lookupTable ? [input.lookupTable] : []), ...(input.lookupTables ?? [])].filter(
    (t, i, all) => all.findIndex((o) => o.address === t.address) === i,
  );
  const flags = new Map<string, { signer: boolean; writable: boolean; invoked: boolean }>();
  const note = (address: string, signer: boolean, isWritable: boolean, invoked: boolean) => {
    const seen = flags.get(address) ?? { signer: false, writable: false, invoked: false };
    flags.set(address, { signer: seen.signer || signer, writable: seen.writable || isWritable, invoked: seen.invoked || invoked });
  };
  note(payer, true, true, false);
  for (const ix of instructions) {
    note(ix.programId, false, false, true);
    for (const a of ix.accounts) note(a.address, a.signer, a.writable, false);
  }

  const tableIndex = new Map<string, { table: number; index: number }>();
  tables.forEach((table, t) =>
    table.addresses.forEach((address, i) => {
      if (i < 256 && !tableIndex.has(address)) tableIndex.set(address, { table: t, index: i });
    }),
  );

  const staticKeys: string[] = [];
  const loaded = tables.map(() => ({ writable: [] as { address: string; index: number }[], readonly: [] as { address: string; index: number }[] }));
  const rank = (f: { signer: boolean; writable: boolean }) => (f.signer ? (f.writable ? 0 : 1) : f.writable ? 2 : 3);
  for (const [address, f] of flags) {
    const at = tableIndex.get(address);
    if (at === undefined || f.signer || f.invoked) staticKeys.push(address);
    else loaded[at.table]![f.writable ? 'writable' : 'readonly'].push({ address, index: at.index });
  }
  const loadedWritable = loaded.flatMap((l) => l.writable);
  const loadedReadonly = loaded.flatMap((l) => l.readonly);
  staticKeys.sort((a, b) => {
    if (a === payer) return -1;
    if (b === payer) return 1;
    return rank(flags.get(a)!) - rank(flags.get(b)!);
  });

  const signerCount = staticKeys.filter((k) => flags.get(k)!.signer).length;
  const readonlySigners = staticKeys.filter((k) => flags.get(k)!.signer && !flags.get(k)!.writable).length;
  const readonlyUnsigned = staticKeys.filter((k) => !flags.get(k)!.signer && !flags.get(k)!.writable).length;

  const order = [...staticKeys, ...loadedWritable.map((k) => k.address), ...loadedReadonly.map((k) => k.address)];
  if (order.length > 256) throw new Error('A transaction cannot address this many accounts.');
  const position = new Map(order.map((address, i) => [address, i]));

  const bytes: number[] = [0x80, signerCount, readonlySigners, readonlyUnsigned];
  bytes.push(...compact(staticKeys.length));
  for (const key of staticKeys) bytes.push(...mustBytes(key));

  const hash = base58Decode(recentBlockhash);
  if (!hash || hash.length !== 32) throw new Error('Not a blockhash.');
  bytes.push(...hash);

  bytes.push(...compact(instructions.length));
  for (const ix of instructions) {
    bytes.push(position.get(ix.programId)!);
    bytes.push(...compact(ix.accounts.length));
    for (const a of ix.accounts) bytes.push(position.get(a.address)!);
    bytes.push(...compact(ix.data.length));
    bytes.push(...ix.data);
  }

  const used = tables.map((table, t) => ({ table, ...loaded[t]! })).filter((u) => u.writable.length + u.readonly.length > 0);
  bytes.push(...compact(used.length));
  for (const u of used) {
    bytes.push(...mustBytes(u.table.address));
    bytes.push(...compact(u.writable.length), ...u.writable.map((k) => k.index));
    bytes.push(...compact(u.readonly.length), ...u.readonly.map((k) => k.index));
  }

  const out = new Uint8Array(1 + 64 * signerCount + bytes.length);
  out.set(compact(signerCount), 0);
  out.set(bytes, 1 + 64 * signerCount);
  return out;
}

/* ------------------------------------------------------------------ the whole transaction */

export interface LaunchTransactionInput {
  readonly programId: string;
  readonly creator: string;
  readonly quoteMint: string;
  readonly quoteTokenProgram: string;
  readonly quoteBadge: string;
  readonly platformWallet: string;
  readonly params: LaunchParams;
  readonly recentBlockhash: string;
  readonly lookupTable: LookupTable | null;
  readonly priorityMicroLamports: bigint;
  /**
   * Pay with SOL in one transaction: the verified Jupiter swap that buys the stock first
   * (payWithSol.ts), its lookup tables, and the compute it needs on top of the launch's.
   */
  readonly swap?: { readonly instructions: readonly Instruction[]; readonly lookupTables: readonly LookupTable[]; readonly computeUnits: number } | null;
}

export type BuiltLaunch =
  | { readonly ok: true; readonly transaction: Uint8Array; readonly addresses: LaunchAddresses }
  | { readonly ok: false; readonly reason: string; readonly tooLarge?: boolean };

/** The transaction a wallet will be asked to sign. A pair of SOL wraps what it needs first. */
export function buildLaunchTransaction(input: LaunchTransactionInput): BuiltLaunch {
  const { programId, creator, quoteMint, quoteTokenProgram, params } = input;
  const creatorQuoteAccount = must(associatedTokenAddress(quoteMint, creator, quoteTokenProgram), 'the creator quote account');
  const addresses = deriveLaunchAddresses({ programId, salt: params.salt, boundToCreator: params.boundToCreator, quoteMint, creator });
  const launch = launchInstruction(
    programId,
    {
      addresses,
      creator,
      quoteMint,
      quoteTokenProgram,
      quoteBadge: input.quoteBadge,
      creatorQuoteAccount,
      platformWallet: input.platformWallet,
    },
    params,
  );
  const wrap = quoteMint === WSOL_MINT ? wrapSolInstructions(creator, creatorQuoteAccount, params.firstBuyQuote + 1n) : [];
  const swap = input.swap ?? null;
  const units = swap ? Math.min(MAX_COMPUTE_UNITS, LAUNCH_COMPUTE_UNITS + swap.computeUnits) : LAUNCH_COMPUTE_UNITS;
  const transaction = compileV0Transaction({
    payer: creator,
    recentBlockhash: input.recentBlockhash,
    instructions: [...computeBudgetInstructions(input.priorityMicroLamports, units), ...wrap, ...(swap?.instructions ?? []), launch],
    lookupTable: input.lookupTable,
    lookupTables: swap?.lookupTables ?? [],
  });
  if (transaction.length > MAX_TRANSACTION_BYTES) {
    return swap
      ? { ok: false, reason: 'The swap and the launch do not fit in one Solana transaction.', tooLarge: true }
      : { ok: false, reason: 'This launch does not fit in one Solana transaction. Shorten the name.' };
  }
  return { ok: true, transaction, addresses };
}
