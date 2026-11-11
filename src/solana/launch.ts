import { SYSTEM_PROGRAM, TOKEN_PROGRAM, WSOL_MINT, addressBytes, associatedTokenAddress, programAddress, utf8Encode } from './codec.js';
import {
  METEORA_DAMM_V2,
  PEDDLES_SOLANA_LAUNCH_LOOKUP_TABLE,
  PEDDLES_SOLANA_LAUNCH_PROGRAM_ID,
  SOLANA_COIN_SUPPLY_RAW,
  SOLANA_LAUNCH_QUOTES,
  type SolanaQuote,
} from './constants.js';
import { endsWithPedl } from './grind.js';
import {
  MAX_URI_BYTES,
  buildLaunchTransaction,
  deriveCoinMint,
  type LaunchAddresses,
  type LaunchParams,
  type LookupTable,
} from './instruction.js';
import {
  decodeConfig,
  decodeLookupTable,
  decodeMint,
  decodeQuoteConfig,
  displayToRaw,
  mintRefusal,
  quoteOffered,
  type LaunchConfig,
  type MintFacts,
  type QuoteConfigRead,
  type QuoteRead,
} from './reads.js';
import {
  getAccounts,
  getEpoch,
  getLatestBlockhash,
  getRecentPriorityFees,
  getRentLamportsPerByte,
  type RpcAccount,
  type SolanaRpcSource,
} from './rpc.js';
import {
  SOLANA_FLOOR_BPS,
  firstBuyMinCoins,
  firstBuyOpening,
  firstBuyQuoteNeeded,
  launchDepositsLamports,
  liquidityForExactSupply,
  openingMarketCapRaw,
  openingSqrtPrice,
  parseRatePercent,
  priorityBid,
  rateInRange,
  tokenAccountRentLamports,
  type FirstBuyOpening,
} from './terms.js';

/* ------------------------------------------------------------------ chain state */

/** A quote's Meteora token badge, `[b"token_badge", mint]` on DAMM v2, as the chain has it. */
export interface QuoteBadgeRead {
  /** The badge PDA for this mint. */
  readonly expected: string;
  /** The account exists, is owned by DAMM v2 and names this mint (bytes 8..40). */
  readonly valid: boolean;
}

/**
 * Everything the chain says about launching at all: the program's `Config` (platform wallet and the
 * live launch fee), each quote's `QuoteConfig`, mint and Meteora badge, the lookup table and today's
 * rent. The same accounts the web form reads (`apps/web/src/features/launch/solana/chainState.ts`),
 * plus the badges. Never a default: a failed read throws.
 */
export interface LaunchChainState {
  readonly config: LaunchConfig | null;
  readonly quotes: ReadonlyMap<string, QuoteRead>;
  readonly badges: ReadonlyMap<string, QuoteBadgeRead>;
  readonly lookupTable: LookupTable | null;
  readonly rentLamportsPerByte: bigint;
  readonly epoch: bigint;
}

export function meteoraBadgeAddress(mint: string): string {
  const bytes = addressBytes(mint);
  const address = bytes ? programAddress(['token_badge', bytes], METEORA_DAMM_V2) : null;
  if (!address) throw new Error(`Not a Solana address: ${mint}`);
  return address;
}

function readBadge(mint: string, account: RpcAccount | null): QuoteBadgeRead {
  const expected = meteoraBadgeAddress(mint);
  const mintBytes = addressBytes(mint)!;
  const valid =
    account !== null &&
    account.owner === METEORA_DAMM_V2 &&
    account.data.length >= 40 &&
    mintBytes.every((b, i) => account.data[8 + i] === b);
  return { expected, valid };
}

export async function readLaunchChainState(
  rpc: SolanaRpcSource,
  options: {
    readonly programId?: string;
    /** Default: every quote the web lists. */
    readonly quotes?: readonly SolanaQuote[];
    /** Default: the program's mainnet table. `null` reads none. */
    readonly lookupTable?: string | null;
    readonly nowSeconds?: bigint;
  } = {},
): Promise<LaunchChainState> {
  const programId = options.programId ?? PEDDLES_SOLANA_LAUNCH_PROGRAM_ID;
  const listed = options.quotes ?? SOLANA_LAUNCH_QUOTES;
  const lookupTableAddress = options.lookupTable === undefined ? PEDDLES_SOLANA_LAUNCH_LOOKUP_TABLE : options.lookupTable;
  const nowSeconds = options.nowSeconds ?? BigInt(Math.floor(Date.now() / 1000));
  const [epoch, rentLamportsPerByte] = await Promise.all([getEpoch(rpc), getRentLamportsPerByte(rpc)]);
  const configAddress = programAddress(['config'], programId);
  const quoteAddresses = listed.map((q) => {
    const mint = addressBytes(q.mint);
    return mint ? programAddress(['quote', mint], programId) : null;
  });
  if (!configAddress || quoteAddresses.some((a) => a === null)) throw new Error('The launch program address is not valid.');
  const accounts = await getAccounts(rpc, [
    configAddress,
    ...(quoteAddresses as string[]),
    ...listed.map((q) => q.mint),
    ...listed.map((q) => meteoraBadgeAddress(q.mint)),
    ...(lookupTableAddress ? [lookupTableAddress] : []),
  ]);
  const count = listed.length;
  const quotes = new Map<string, QuoteRead>();
  const badges = new Map<string, QuoteBadgeRead>();
  listed.forEach((q, i) => {
    const config = accounts[1 + i] ?? null;
    const mint = accounts[1 + count + i] ?? null;
    quotes.set(q.mint, {
      config: config ? decodeQuoteConfig(config.data) : null,
      mint: mint ? decodeMint(mint.data, mint.owner, epoch, nowSeconds) : null,
    });
    badges.set(q.mint, readBadge(q.mint, accounts[1 + 2 * count + i] ?? null));
  });
  const table = lookupTableAddress ? (accounts[1 + 3 * count] ?? null) : null;
  const addresses = table ? decodeLookupTable(table.data) : null;
  return {
    config: accounts[0] ? decodeConfig(accounts[0].data) : null,
    quotes,
    badges,
    lookupTable: lookupTableAddress && addresses ? { address: lookupTableAddress, addresses } : null,
    rentLamportsPerByte,
    epoch,
  };
}

/* ------------------------------------------------------------------ the quote */

export type SolanaQuoteCheck =
  | { readonly ok: true; readonly quote: SolanaQuote; readonly config: QuoteConfigRead; readonly mint: MintFacts }
  | { readonly ok: false; readonly reason: string };

/**
 * May a launch pair against this quote right now? Only when it is a listed mint, the program has it
 * enabled, the mint agrees with `QuoteConfig` and the record, its issuer has not paused it, frozen new
 * accounts or set a transfer hook, and (for a Token-2022 stock) Meteora's badge exists for it and is
 * the one `QuoteConfig` names. Identity is the mint address, never the ticker.
 */
export function checkSolanaQuote(state: LaunchChainState, quoteMint: string): SolanaQuoteCheck {
  const quote = SOLANA_LAUNCH_QUOTES.find((q) => q.mint === quoteMint);
  if (!quote) return { ok: false, reason: `${quoteMint} is not a quote Peddles lists.` };
  const read = state.quotes.get(quote.mint);
  if (!read) return { ok: false, reason: `${quote.symbol} was not read.` };
  if (!read.config) return { ok: false, reason: `${quote.symbol} is not enabled by the launch program.` };
  if (!read.mint) return { ok: false, reason: `${quote.symbol}'s mint could not be read.` };
  if (!quoteOffered(quote.recordedDecimals, read)) return { ok: false, reason: `${quote.symbol} is not enabled, or its mint disagrees with the program's record.` };
  const refusal = mintRefusal(read.mint, quote.symbol);
  if (refusal) return { ok: false, reason: refusal };
  if (quote.family === 'wsol') {
    // The one quote on the plain Token program needs no badge: `QuoteConfig.badge` is the default key.
    if (read.config.badge !== SYSTEM_PROGRAM) return { ok: false, reason: 'Wrapped SOL has an unexpected badge in the program record.' };
  } else {
    const badge = state.badges.get(quote.mint);
    if (!badge?.valid) return { ok: false, reason: `${quote.symbol} has no Meteora token badge, so no pool can open.` };
    if (read.config.badge !== badge.expected) return { ok: false, reason: `${quote.symbol}'s badge in the program record is not Meteora's.` };
  }
  return { ok: true, quote, config: read.config, mint: read.mint };
}

/* ------------------------------------------------------------------ the terms */

/** `SYMBOL_RE` of the web's launch schema: 2–10 characters, a letter first, A–Z and 0–9. */
export const SOLANA_SYMBOL_RE = /^[A-Z][A-Z0-9]{1,9}$/;
const MAX_NAME_BYTES = 32;

export interface SolanaLaunchTermsInput {
  readonly name: string;
  readonly symbol: string;
  /** The quote's ticker, refused as the coin's own (with SOL and WSOL). */
  readonly quoteSymbol: string;
  /** What traders pay: either exact percent text as the form takes it ("2", "1.25"), or whole basis points. */
  readonly ratePercent?: string;
  readonly rateBps?: number;
  /**
   * The creator's share, in basis points, of everything above the two fixed 0.50% legs (holders get
   * the rest). Required above the 1.25% floor; at the floor there is nothing to split and it must be
   * omitted or 0.
   */
  readonly excessToCreatorBps?: number | null;
}

export type SolanaLaunchTerms =
  | { readonly ok: true; readonly name: string; readonly symbol: string; readonly rateBps: number; readonly excessToCreatorBps: number }
  | { readonly ok: false; readonly field: 'name' | 'symbol' | 'rate' | 'excess'; readonly reason: string };

/**
 * The web form's rules for the launch terms, in one function: the name trimmed (2+ characters, at
 * most 32 bytes), the ticker trimmed with any leading `$` dropped and uppercased, the rate 1.25% to
 * 5% in whole basis points (never rounded), and the creator's share of the excess. Refuses; never
 * defaults a term that decides money.
 */
export function solanaLaunchTerms(input: SolanaLaunchTermsInput): SolanaLaunchTerms {
  const name = (input.name ?? '').trim();
  if (name.length < 2) return { ok: false, field: 'name', reason: 'The name needs at least 2 characters.' };
  if (utf8Encode(name).length > MAX_NAME_BYTES) return { ok: false, field: 'name', reason: `The name is at most ${MAX_NAME_BYTES} bytes.` };
  const symbol = (input.symbol ?? '').trim().replace(/^\$+/, '').toUpperCase();
  if (!SOLANA_SYMBOL_RE.test(symbol)) return { ok: false, field: 'symbol', reason: 'The ticker is 2–10 characters, a letter first, A–Z and 0–9 only.' };
  const clash = [input.quoteSymbol, 'SOL', 'WSOL'].map((t) => (t ?? '').trim().replace(/^\$+/, '').toUpperCase()).find((t) => t !== '' && t === symbol);
  if (clash) return { ok: false, field: 'symbol', reason: `$${symbol} is the pair's own ticker. Pick another.` };

  if ((input.ratePercent === undefined) === (input.rateBps === undefined)) return { ok: false, field: 'rate', reason: 'Give the rate once: ratePercent or rateBps.' };
  const rateBps = input.ratePercent !== undefined ? parseRatePercent(input.ratePercent) : Number.isInteger(input.rateBps) ? input.rateBps! : null;
  if (!rateInRange(rateBps)) return { ok: false, field: 'rate', reason: 'The rate is 1.25% to 5%, in whole basis points.' };

  const excess = input.excessToCreatorBps ?? null;
  if (rateBps <= SOLANA_FLOOR_BPS) {
    if (excess !== null && excess !== 0) return { ok: false, field: 'excess', reason: 'At 1.25% there is nothing above the fixed legs to split.' };
    return { ok: true, name, symbol, rateBps, excessToCreatorBps: 0 };
  }
  if (excess === null) return { ok: false, field: 'excess', reason: 'Choose who gets the fee above the floor: excessToCreatorBps, 0 to 10000.' };
  if (!Number.isInteger(excess) || excess < 0 || excess > 10_000) return { ok: false, field: 'excess', reason: 'The split is 0 to 10000 basis points.' };
  return { ok: true, name, symbol, rateBps, excessToCreatorBps: excess };
}

/* ------------------------------------------------------------------ amounts and prices */

const WAD = 10n ** 18n;
const PLAIN_DECIMAL = /^(\d+)(?:\.(\d+))?$/;

/** Exact decimal text to base units at `decimals`. Null for anything that is not a plain non-negative decimal or is too precise. */
export function parseDecimalUnits(text: string, decimals: number): bigint | null {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) return null;
  const trimmed = text.trim();
  const normal = /^\.\d/.test(trimmed) ? `0${trimmed}` : trimmed;
  const match = PLAIN_DECIMAL.exec(normal);
  if (!match) return null;
  const fraction = (match[2] ?? '').replace(/0+$/, '');
  if (fraction.length > decimals) return null;
  return BigInt(match[1]!) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, '0') || '0');
}

/**
 * USD per WHOLE RAW token of a quote, as an 18-decimal fixed-point bigint: the displayed price (what a
 * price feed such as Jupiter quotes per displayed token) × the scaled-UI multiplier read live from the
 * mint. A pool works in raw units, so the displayed price alone mis-prices any stock whose multiplier
 * is not 1 (PreStocks ANTHROPIC ×10 opens at ≈ $35K instead of $3.5K). Null for an unreadable price.
 */
export function quoteUsdPerWholeRawE18(displayedUsdPrice: string, multiplierWad: bigint): bigint | null {
  const price = parseDecimalUnits(displayedUsdPrice, 18);
  if (price === null || price === 0n || multiplierWad <= 0n) return null;
  return (price * multiplierWad) / WAD;
}

/**
 * The opening market cap in USD, as an 18-decimal fixed-point bigint: supply × opening price in raw
 * quote, priced at displayed price × multiplier. The launch program holds it near $3.5K through each
 * quote's band; this is how a client states it.
 */
export function openingMarketCapUsdE18(input: {
  readonly sqrtPrice: bigint;
  readonly quoteDecimals: number;
  readonly displayedUsdPrice: string;
  readonly multiplierWad: bigint;
  readonly supplyRaw?: bigint;
}): bigint | null {
  const perWhole = quoteUsdPerWholeRawE18(input.displayedUsdPrice, input.multiplierWad);
  if (perWhole === null) return null;
  const capRaw = openingMarketCapRaw(input.sqrtPrice, input.supplyRaw ?? SOLANA_COIN_SUPPLY_RAW);
  return (capRaw * perWhole) / 10n ** BigInt(input.quoteDecimals);
}

/* ------------------------------------------------------------------ the whole launch */

export interface PrepareSolanaLaunchInput {
  readonly rpc: SolanaRpcSource;
  /** Default: the Peddles mainnet program. */
  readonly programId?: string;
  /** Default: the program's mainnet table. Without one a launch does not fit a transaction. */
  readonly lookupTable?: string | null;
  /** The signing wallet. It pays everything, and is the creator payout. */
  readonly creator: string;
  /** The quote's MINT (identity is the address). */
  readonly quoteMint: string;
  readonly name: string;
  readonly symbol: string;
  /** The pinned `metadata.json` link (`launchMetadataDocument`), at most 200 bytes, https:// or ipfs://. */
  readonly uri: string;
  readonly ratePercent?: string;
  readonly rateBps?: number;
  readonly excessToCreatorBps?: number | null;
  /**
   * The creator's first buy, fee included: raw quote units, or decimal text in the units the wallet
   * SHOWS (scaled by the live multiplier, as the form takes it). Omit for none.
   */
  readonly firstBuy?: { readonly raw: bigint } | { readonly display: string } | null;
  /** 8 bytes whose coin mint ends `PEDL`: from `takePooledSalt` or `grindPedlSalt`. */
  readonly salt: Uint8Array;
  /** A Pre-Launch address bound to this creator (`[b"coin", creator, salt]`). Default false. */
  readonly boundToCreator?: boolean;
  /** Default: the web's bid from recent prioritization fees, capped at 2,000,000 µlamports. */
  readonly priorityMicroLamports?: bigint;
  /** Default: read from the node. */
  readonly recentBlockhash?: string;
  /**
   * Reuse across launches. ONLY its static part is taken: the lookup table. `Config` (the fee and the
   * platform wallet), the quote's `QuoteConfig`, mint, badge and the rent are read fresh on every call.
   */
  readonly chainState?: LaunchChainState;
  /**
   * The launch fee the creator was SHOWN, in lamports. The program charges `Config.launch_fee_lamports`
   * as it is when the transaction executes, and the launch carries no maximum, so pass the figure you
   * displayed: if `Config` differs now, the launch is refused instead of built. Strongly recommended.
   */
  readonly expectedFeeLamports?: bigint;
}

export type PreparedSolanaLaunch =
  | {
      readonly ok: true;
      /** Version 0, one empty signature for the creator's wallet. `VersionedTransaction.deserialize(transaction)` takes it. */
      readonly transaction: Uint8Array;
      readonly addresses: LaunchAddresses;
      readonly params: LaunchParams;
      readonly quote: SolanaQuote;
      readonly quoteMint: MintFacts;
      readonly quoteConfig: QuoteConfigRead;
      /**
       * `Config.launch_fee_lamports`, read fresh in this call. The program charges whatever `Config` holds
       * WHEN THE TRANSACTION EXECUTES (capped at 0.25 SOL by the program), so show it, simulate and sign
       * promptly, and pass it as `expectedFeeLamports` when you rebuild. Never hardcode it.
       */
      readonly launchFeeLamports: bigint;
      readonly platformWallet: string;
      /** Rent locked in the launch's permanent accounts, from today's rate. An estimate. */
      readonly depositsLamportsEstimate: bigint;
      /**
       * Lamports the creator spends besides network fees: the fee and the deposits; on a SOL pair also the
       * wrapped first buy (+1 lamport Meteora pulls) and the rent of the creator's wSOL account when it
       * does not exist yet (the launch opens it).
       */
      readonly lamportsNeeded: bigint;
      /** Raw quote the creator's account must hold: the first buy with the issuer's transfer fee on each leg, plus the 1 unit Meteora pulls. */
      readonly quoteRawNeeded: bigint;
      readonly firstBuy: (FirstBuyOpening & { readonly quoteRaw: bigint; readonly minCoins: bigint }) | null;
      readonly openingMarketCapQuoteRaw: bigint;
      readonly priorityMicroLamports: bigint;
      /**
       * Where the priority bid came from: `given` by the caller, `read` from recent prioritization fees,
       * or `unavailable` when that read failed and the bid fell back to 0 (the launch may land slowly).
       */
      readonly priorityFeeSource: 'given' | 'read' | 'unavailable';
    }
  | { readonly ok: false; readonly reason: string; readonly tooLarge?: boolean };

/**
 * Read the chain, check the terms and the quote, and build the launch transaction for the creator to
 * sign: the web form's path, minus the wallet. Refusals come back as `{ ok: false, reason }`; a read
 * that fails throws. Nothing is signed or sent here. Dry-run the result (`simulateTransaction`) before
 * asking a wallet to sign it.
 *
 * Every fact that decides money or whether the launch can work is read fresh here, even when
 * `chainState` is passed: `Config` (fee, platform wallet), the quote's `QuoteConfig`, mint and badge,
 * the coin address and the creator's wSOL account. The fee is charged at execution, so pass
 * `expectedFeeLamports` and sign promptly. The priority bid falls back to 0 when recent fees cannot be
 * read (`priorityFeeSource: 'unavailable'`).
 */
export async function prepareSolanaLaunch(input: PrepareSolanaLaunchInput): Promise<PreparedSolanaLaunch> {
  const programId = input.programId ?? PEDDLES_SOLANA_LAUNCH_PROGRAM_ID;
  const lookupTable = input.lookupTable === undefined ? PEDDLES_SOLANA_LAUNCH_LOOKUP_TABLE : input.lookupTable;
  const refuse = (reason: string, tooLarge?: boolean): PreparedSolanaLaunch => ({ ok: false, reason, ...(tooLarge ? { tooLarge } : {}) });

  if (!addressBytes(programId)) return refuse('The launch program address is not valid.');
  if (!addressBytes(input.creator)) return refuse('The creator is not a Solana address.');
  const listed = SOLANA_LAUNCH_QUOTES.find((q) => q.mint === input.quoteMint);
  if (!listed) return refuse(`${input.quoteMint} is not a quote Peddles lists.`);

  const terms = solanaLaunchTerms({
    name: input.name,
    symbol: input.symbol,
    quoteSymbol: listed.symbol,
    ...(input.ratePercent !== undefined ? { ratePercent: input.ratePercent } : {}),
    ...(input.rateBps !== undefined ? { rateBps: input.rateBps } : {}),
    excessToCreatorBps: input.excessToCreatorBps ?? null,
  });
  if (!terms.ok) return refuse(terms.reason);
  const uri = (input.uri ?? '').trim();
  if (!/^(https:\/\/|ipfs:\/\/)\S+$/i.test(uri)) return refuse('The metadata link must be an https:// or ipfs:// link.');
  if (utf8Encode(uri).length > MAX_URI_BYTES) return refuse(`The metadata link is longer than ${MAX_URI_BYTES} bytes.`);

  if (!(input.salt instanceof Uint8Array) || input.salt.length !== 8) return refuse('The salt is 8 bytes.');
  const boundToCreator = input.boundToCreator ?? false;
  const coinMint = deriveCoinMint(programId, input.salt, boundToCreator ? input.creator : null);
  if (!endsWithPedl(addressBytes(coinMint)!)) return refuse('This salt does not give a coin address ending PEDL, so the program would refuse it.');

  // Fresh every call: a cached Config or quote could hide a fee change or a paused stock.
  const cachedTable = input.chainState?.lookupTable ?? null;
  const reuseTable = cachedTable !== null && cachedTable.address === lookupTable;
  const fresh = await readLaunchChainState(input.rpc, { programId, quotes: [listed], lookupTable: reuseTable ? null : lookupTable });
  const state: LaunchChainState = reuseTable ? { ...fresh, lookupTable: cachedTable } : fresh;
  if (!state.config) return refuse('The launch program has no Config on this cluster.');
  if (lookupTable && !state.lookupTable) return refuse(`The lookup table ${lookupTable} could not be read.`);
  if (input.expectedFeeLamports !== undefined && input.expectedFeeLamports !== state.config.launchFeeLamports) {
    return refuse(
      `The launch fee is now ${state.config.launchFeeLamports} lamports, not the ${input.expectedFeeLamports} shown. Show the new fee and confirm again.`,
    );
  }
  const quote = checkSolanaQuote(state, listed.mint);
  if (!quote.ok) return refuse(quote.reason);
  const facts = quote.mint;

  const sqrtPrice = openingSqrtPrice(quote.config.minSqrtPrice, quote.config.maxSqrtPrice);
  const liquidity = sqrtPrice !== null ? liquidityForExactSupply(sqrtPrice, SOLANA_COIN_SUPPLY_RAW) : null;
  if (sqrtPrice === null || liquidity === null) return refuse(`${listed.symbol} has no opening price set, so launching against it is paused.`);

  let firstBuyRaw = 0n;
  const fb = input.firstBuy ?? null;
  if (fb !== null) {
    if ('raw' in fb) {
      if (typeof fb.raw !== 'bigint' || fb.raw < 0n) return refuse('The first buy is a non-negative bigint of raw quote.');
      firstBuyRaw = fb.raw;
    } else {
      const units = parseDecimalUnits(fb.display, facts.decimals);
      if (units === null) return refuse(`The first buy is not an amount of ${listed.symbol} at ${facts.decimals} decimals.`);
      firstBuyRaw = displayToRaw(units, facts.multiplierWad);
    }
  }
  if (firstBuyRaw >= 1n << 64n) return refuse('The first buy is too large.');
  const opening = firstBuyRaw > 0n ? firstBuyOpening(sqrtPrice, liquidity, SOLANA_COIN_SUPPLY_RAW, firstBuyRaw, terms.rateBps) : null;
  if (firstBuyRaw > 0n && opening === null) return refuse('This first buy is too small or too large for the pool, so the launch would fail.');

  const wsolAccount = listed.family === 'wsol' ? associatedTokenAddress(WSOL_MINT, input.creator, TOKEN_PROGRAM) : null;
  if (listed.family === 'wsol' && wsolAccount === null) return refuse('The creator wSOL account could not be derived.');
  const [existing, wsolExisting] = await getAccounts(input.rpc, wsolAccount ? [coinMint, wsolAccount] : [coinMint]);
  if (existing) return refuse(`${coinMint} already exists: another launch took this salt. Take or grind a new one.`);

  let priorityFeeSource: 'given' | 'read' | 'unavailable' = input.priorityMicroLamports !== undefined ? 'given' : 'read';
  const [recentBlockhash, priorityMicroLamports] = await Promise.all([
    input.recentBlockhash ?? getLatestBlockhash(input.rpc),
    input.priorityMicroLamports ??
      getRecentPriorityFees(input.rpc)
        .catch(() => {
          priorityFeeSource = 'unavailable';
          return [] as readonly bigint[];
        })
        .then(priorityBid),
  ]);
  if (priorityMicroLamports < 0n) return refuse('The priority fee cannot be negative.');

  const params: LaunchParams = {
    salt: input.salt,
    boundToCreator,
    name: terms.name,
    symbol: terms.symbol,
    uri,
    rateBps: terms.rateBps,
    excessToCreatorBps: terms.excessToCreatorBps,
    creatorPayout: input.creator,
    liquidity,
    sqrtPrice,
    firstBuyQuote: firstBuyRaw,
    firstBuyMinCoins: opening ? firstBuyMinCoins(opening.coins) : 0n,
  };
  const built = buildLaunchTransaction({
    programId,
    creator: input.creator,
    quoteMint: listed.mint,
    quoteTokenProgram: quote.config.tokenProgram,
    quoteBadge: quote.config.badge,
    platformWallet: state.config.platformWallet,
    params,
    recentBlockhash,
    lookupTable: state.lookupTable,
    priorityMicroLamports,
  });
  if (!built.ok) return refuse(built.reason, built.tooLarge);

  const deposits = launchDepositsLamports(listed.family, state.rentLamportsPerByte);
  const wsolRent = listed.family === 'wsol' && !wsolExisting ? tokenAccountRentLamports('wsol', state.rentLamportsPerByte) : 0n;
  const wrapped = listed.family === 'wsol' ? firstBuyRaw + 1n + wsolRent : 0n;
  return {
    ok: true,
    transaction: built.transaction,
    addresses: built.addresses,
    params,
    quote: listed,
    quoteMint: facts,
    quoteConfig: quote.config,
    launchFeeLamports: state.config.launchFeeLamports,
    platformWallet: state.config.platformWallet,
    depositsLamportsEstimate: deposits,
    lamportsNeeded: state.config.launchFeeLamports + deposits + wrapped,
    quoteRawNeeded: listed.family === 'wsol' ? 0n : (opening ? firstBuyQuoteNeeded(opening, facts.transferFeeBps) : 0n) + 1n,
    firstBuy: opening ? { ...opening, quoteRaw: firstBuyRaw, minCoins: params.firstBuyMinCoins } : null,
    openingMarketCapQuoteRaw: openingMarketCapRaw(sqrtPrice, SOLANA_COIN_SUPPLY_RAW),
    priorityMicroLamports,
    priorityFeeSource,
  };
}
