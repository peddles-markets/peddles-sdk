/**
 * What a Solana launch build knows before it reads the chain. Every address was READ, none from
 * memory: Meteora, Metaplex and wSOL from `solana/programs/peddles-launch/src/constants.rs`; the
 * program id, Config and lookup table from `docs/SOLANA_LAUNCH.md` §13 and Solana mainnet (the
 * program and table re-read for this SDK release, see CHANGELOG 0.8.0).
 *
 * NOTHING HERE IS A FEE OR A PRICE. The launch fee is `Config.launch_fee_lamports`, the opening price
 * band, badge and token program are each quote's `QuoteConfig`, and both are read from the chain at
 * build time (`readLaunchChainState`). Never hardcode them: the fee is retuned by the admin.
 */

/** The Peddles launch program on Solana mainnet (live since 2026-11-09). */
export const PEDDLES_SOLANA_LAUNCH_PROGRAM_ID = '4jTFPcqrwzxP9Ve7xo6dUk4oYWbfbi78qm63tX1JC4tL';
/** The program's address lookup table on mainnet: shared accounts plus every listed mint and QuoteConfig. */
export const PEDDLES_SOLANA_LAUNCH_LOOKUP_TABLE = 'QMUk4dcXoRqjQ47yNxkSm6Vn7qqRbZmYFFhv2i5kFos';

export const METEORA_DAMM_V2 = 'cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG';
export const METEORA_POOL_AUTHORITY = 'HLnpSz9h2S4hiLQ43rnSD9XkcUThA7B8hQMKmDaiTLcC';
export const METEORA_EVENT_AUTHORITY = '3rmHSu74h1ZcmAisVcWerTCiRDQbUrBKmcwptYGjHfet';
export const METAPLEX_TOKEN_METADATA = 'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s';

/** Lowest and highest rate traders may pay (`peddles_fees::split`): 1.25% to 5%. */
export const SOLANA_MIN_RATE_BPS = 125;
export const SOLANA_MAX_RATE_BPS = 500;

/** `COIN_DECIMALS` and `COIN_SUPPLY_RAW` in `constants.rs`. */
export const SOLANA_COIN_DECIMALS = 6;
export const SOLANA_COIN_SUPPLY_RAW = 1_000_000_000n * 10n ** BigInt(SOLANA_COIN_DECIMALS);

export type SolanaQuoteFamily = 'xstock' | 'sunrise' | 'prestock' | 'wsol';

export interface SolanaQuote {
  readonly mint: string;
  /** The ticker as the issuer writes it. Identity is the MINT, never the symbol. */
  readonly symbol: string;
  readonly name: string;
  readonly family: SolanaQuoteFamily;
  /**
   * What `docs/SOLANA_LAUNCH.md` §12 recorded, used ONLY to refuse a mint that no longer agrees with
   * the record. Every amount uses the decimals read from the mint itself.
   */
  readonly recordedDecimals: number;
  readonly offered: true;
}

/**
 * Every quote the Peddles web form may offer, identical to `apps/web/src/config/solanaLaunch.ts`
 * (a test holds them equal). Being listed is not being offered: a quote whose `QuoteConfig` is not
 * enabled on chain, whose mint disagrees with it, or whose Meteora badge is missing is refused by
 * `checkSolanaQuote`. PreStocks carry a 1% issuer transfer fee; every issuer can pause or seize.
 */
export const SOLANA_LAUNCH_QUOTES: readonly SolanaQuote[] = [
  { mint: 'So11111111111111111111111111111111111111112', symbol: 'SOL', name: 'Wrapped SOL', family: 'wsol', recordedDecimals: 9, offered: true },
  { mint: 'XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W', symbol: 'SPYx', name: 'SP500 xStock', family: 'xstock', recordedDecimals: 8, offered: true },
  { mint: 'Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh', symbol: 'NVDAx', name: 'NVIDIA xStock', family: 'xstock', recordedDecimals: 8, offered: true },
  { mint: 'Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ', symbol: 'QQQx', name: 'Nasdaq xStock', family: 'xstock', recordedDecimals: 8, offered: true },
  { mint: 'Xs3oZwbHvqis4NYcf4YKWmEia2eC84wSiVrcYcTqpH8', symbol: 'SPCXx', name: 'SpaceX xStock', family: 'xstock', recordedDecimals: 8, offered: true },
  { mint: 'XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB', symbol: 'TSLAx', name: 'Tesla xStock', family: 'xstock', recordedDecimals: 8, offered: true },
  { mint: 'XsP7xzNPvEHS1m6qfanPUGjNmdnmsLKEoNAnHjdxxyZ', symbol: 'MSTRx', name: 'MicroStrategy xStock', family: 'xstock', recordedDecimals: 8, offered: true },
  { mint: 'XsueG8BtpquVJX9LVLLEGuViXUungE6WmK5YZ3p3bd1', symbol: 'CRCLx', name: 'Circle xStock', family: 'xstock', recordedDecimals: 8, offered: true },
  { mint: 'XspzcW1PRtgf6Wj92HCiZdjzKCyFekVD8P5Ueh3dRMX', symbol: 'MSFTx', name: 'Microsoft xStock', family: 'xstock', recordedDecimals: 8, offered: true },
  { mint: 'XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp', symbol: 'AAPLx', name: 'Apple xStock', family: 'xstock', recordedDecimals: 8, offered: true },
  { mint: 'XsCPL9dNWBMvFtTmwcCA5v3xWPSMEBCszbQdiLLq6aN', symbol: 'GOOGLx', name: 'Alphabet xStock', family: 'xstock', recordedDecimals: 8, offered: true },
  { mint: 'XsqE9cRRpzxcGKDXj1BJ7Xmg4GRhZoyY1KpmGSxAWT2', symbol: 'MCDx', name: 'McDonald\'s xStock', family: 'xstock', recordedDecimals: 8, offered: true },
  { mint: 'Xsa62P5mvPszXL1krVUnU5ar38bBSVcWAB6fmPCo5Zu', symbol: 'METAx', name: 'Meta xStock', family: 'xstock', recordedDecimals: 8, offered: true },
  { mint: 'Xsf9mBktVB9BSU5kf4nHxPq5hCBJ2j2ui3ecFGxPRGc', symbol: 'GMEx', name: 'Gamestop xStock', family: 'xstock', recordedDecimals: 8, offered: true },
  { mint: 'Xs3eBt7uRfJX8QUs4suhyU8p2M6DoUDrJyWBa8LLZsg', symbol: 'AMZNx', name: 'Amazon.com xStock', family: 'xstock', recordedDecimals: 8, offered: true },
  { mint: 'Xs78JED6PFZxWc2wCEPspZW9kL3Se5J7L5TChKgsidH', symbol: 'STRCx', name: 'Strategy PP Variable xStock', family: 'xstock', recordedDecimals: 8, offered: true },
  { mint: 'Xs7ZdzSHLU9ftNJsii5fCeJhoRWSC32SQGzGQtePxNu', symbol: 'COINx', name: 'Coinbase xStock', family: 'xstock', recordedDecimals: 8, offered: true },
  { mint: 'XsoBhf2ufR8fTyNSjqfU71DYGaE6Z3SUGAidpzriAA4', symbol: 'PLTRx', name: 'Palantir xStock', family: 'xstock', recordedDecimals: 8, offered: true },
  { mint: 'XsvNBAYkrDRNhA7wPHQfX3ZUXZyZLdnCQDfHZ56bzpg', symbol: 'HOODx', name: 'Robinhood xStock', family: 'xstock', recordedDecimals: 8, offered: true },
  { mint: 'Xs6B6zawENwAbWVi7w92rjazLuAr5Az59qgWKcNb45x', symbol: 'BRK.Bx', name: 'Berkshire Hathaway xStock', family: 'xstock', recordedDecimals: 8, offered: true },
  { mint: 'XshPgPdXFRWB8tP1j82rebb2Q9rPgGX37RuqzohmArM', symbol: 'INTCx', name: 'Intel xStock', family: 'xstock', recordedDecimals: 8, offered: true },
  { mint: 'XsaBXg8dU5cPM6ehmVctMkVqoiRG2ZjMo1cyBJ3AykQ', symbol: 'KOx', name: 'Coca-Cola xStock', family: 'xstock', recordedDecimals: 8, offered: true },
  { mint: 'XsjQP3iMAaQ3kQScQKthQpx9ALRbjKAjQtHg6TFomoc', symbol: 'TQQQx', name: 'TQQQ xStock', family: 'xstock', recordedDecimals: 8, offered: true },
  { mint: 'Xs2yquAgsHByNzx68WJC55WHjHBvG9JsMB7CWjTLyPy', symbol: 'DFDVx', name: 'DFDV xStock', family: 'xstock', recordedDecimals: 8, offered: true },
  { mint: 'XsafvsGtzFqqHgTnA3aPC83EAMkacU5mcGtcSayhpVV', symbol: 'TSMx', name: 'TSMC xStock', family: 'xstock', recordedDecimals: 8, offered: true },
  { mint: 'XsgSaSvNSqLTtFuyWPBhK9196Xb9Bbdyjj4fH3cPJGo', symbol: 'AVGOx', name: 'Broadcom xStock', family: 'xstock', recordedDecimals: 8, offered: true },
  { mint: 'XsfCC9VL4DamVGNgdJpfLXB3sBVa158Gbx8sh7NzmTk', symbol: 'VIDAx', name: 'Vida Global xStock', family: 'xstock', recordedDecimals: 8, offered: true },
  { mint: 'XsaHND8sHyfMfsWPj6kSdd5VwvCayZvjYgKmmcNL5qh', symbol: 'XOMx', name: 'Exxon Mobil xStock', family: 'xstock', recordedDecimals: 8, offered: true },
  { mint: 'SPCXxcqXj6e5dJDVNovHN8744zkbhM2bYudU45BimGb', symbol: 'SPCX', name: 'SpaceX - Backpack Securities', family: 'sunrise', recordedDecimals: 6, offered: true },
  { mint: 'TTWofwAge91oFhZs7kpQdyrVRkmevgM88xijGvQFbKo', symbol: 'TTWO', name: 'Take-Two Interactive Software - Backpack Securities', family: 'sunrise', recordedDecimals: 6, offered: true },
  { mint: 'DJTu7vi8norVzdVAffgvb39VP7wjKeTsgaMBJrzfxvoF', symbol: 'DJT', name: 'Trump Media & Technology Group Corp. Common Stock - Backpack Securities', family: 'sunrise', recordedDecimals: 6, offered: true },
  { mint: 'SKHYhSjuRWHgikq8eRKbtBbpABgJSkd7ytQV14i9EQ3', symbol: 'SKHY', name: 'SK Hynix - Backpack Securities', family: 'sunrise', recordedDecimals: 6, offered: true },
  { mint: 'TSLAqBbv4CNCnzWFeB7LmydAyEiNMJtve7DYKLpdK4S', symbol: 'TSLA', name: 'Tesla - Backpack Securities', family: 'sunrise', recordedDecimals: 6, offered: true },
  { mint: 'AMZNw7cwU9L9c7ewZXxTws2PwQYxBGm2Rxg3FLDBJz9B', symbol: 'AMZN', name: 'Amazon - Backpack Securities', family: 'sunrise', recordedDecimals: 6, offered: true },
  { mint: 'MUxEsUKSMACyw5fZf68wxf5FLnZVhtU9CwH8uNNGay1', symbol: 'MU', name: 'Micron Technology - Backpack Securities', family: 'sunrise', recordedDecimals: 6, offered: true },
  { mint: 'AMD8XwJXgQ9WV45Wyj9yFLejxzf2J6VM1PJY8bJEjeES', symbol: 'AMD', name: 'Advanced Micro Devices - Backpack Securities', family: 'sunrise', recordedDecimals: 6, offered: true },
  { mint: 'NVDAVuiB7hwd3m5Wa1JuHNovPaPG6BH1QNztbKFxNjv', symbol: 'NVDA', name: 'Nvidia - Backpack Securities', family: 'sunrise', recordedDecimals: 6, offered: true },
  { mint: 'METAaH6MMZZgy2CTEJq3QdNi7AFVTV3NxHFBfFgLEDd', symbol: 'META', name: 'Meta Platforms - Backpack Securities', family: 'sunrise', recordedDecimals: 6, offered: true },
  { mint: 'MRNAzXzhNcaEXJPibHEn8cd4vyekCDiivTyEwswLUCT', symbol: 'MRNA', name: 'Moderna - Backpack Securities', family: 'sunrise', recordedDecimals: 6, offered: true },
  { mint: 'DKNGQFNGQmoBdXSRGKJ8tTu7uPDasw5JDcfMmWniNfow', symbol: 'DKNG', name: 'DraftKings - Backpack Securities', family: 'sunrise', recordedDecimals: 6, offered: true },
  { mint: 'SQQQAa3gUxgnqcEsdjPA4RQNQBgB97TnG2hJhk2WaGE', symbol: 'SQQQ', name: 'ProShares UltraPro Short QQQ - Backpack Securities', family: 'sunrise', recordedDecimals: 6, offered: true },
  { mint: 'MSFThX899B1DddH5jkyMpdArWXzP85VXLYDrbGGcRJM', symbol: 'MSFT', name: 'Microsoft - Backpack Securities', family: 'sunrise', recordedDecimals: 6, offered: true },
  { mint: 'HiMSSzzwkZkrXJ4PGVJRdtfLaANeAztjjcgk5Dxe7Lwx', symbol: 'HIMS', name: 'Hims & Hers Health - Backpack Securities', family: 'sunrise', recordedDecimals: 6, offered: true },
  { mint: 'CYPHuMmCL1GxJWa2tsPhLKykC7GrHJTCHwbXD4g5uawK', symbol: 'CYPH', name: 'Cypherpunk Technologies - Backpack Securities', family: 'sunrise', recordedDecimals: 6, offered: true },
  { mint: 'SNDKbwMUQvZhnLnxLduradgLHG5KrPuKwpnrkkGRhfH', symbol: 'SNDK', name: 'Sandisk - Backpack Securities', family: 'sunrise', recordedDecimals: 6, offered: true },
  { mint: 'MSTRdWXMeZxdE8osAQy3fA4rvTY5rgummDSMEx6U7Nz', symbol: 'MSTR', name: 'Strategy - Backpack Securities', family: 'sunrise', recordedDecimals: 6, offered: true },
  { mint: 'NKEda5nHhNGgjrE9nDdMvaEmkmJ96qqxzBVZEcKmjSg', symbol: 'NKE', name: 'NIKE - Backpack Securities', family: 'sunrise', recordedDecimals: 6, offered: true },
  { mint: 'BABANGA4JE7Kkam4nTrALAwAVgsNJUuFJnnkF7S16BZp', symbol: 'BABA', name: 'Alibaba Group Holding - Backpack Securities', family: 'sunrise', recordedDecimals: 6, offered: true },
  { mint: 'AAPLEDt8RpzPgXyhvFzkMBofvFSQw9gpeMCoUdPdLnB8', symbol: 'AAPL', name: 'Apple - Backpack Securities', family: 'sunrise', recordedDecimals: 6, offered: true },
  { mint: 'NFLX7qV57zuVxCoHy3s1jiGZyALraLNwttbxdvmYJLJ', symbol: 'NFLX', name: 'Netflix - Backpack Securities', family: 'sunrise', recordedDecimals: 6, offered: true },
  { mint: 'RACEyWiM2ztEZcJx2AHXU2eWjhxU57x3vXn92b39dLD', symbol: 'RACE', name: 'Ferrari - Backpack Securities', family: 'sunrise', recordedDecimals: 6, offered: true },
  { mint: 'DRAMjSWR7HRfJKjRkvQWYL2bcaejaVhuxEcjf4pAY4Cw', symbol: 'DRAM', name: 'Roundhill Memory ETF - Backpack Securities', family: 'sunrise', recordedDecimals: 6, offered: true },
  { mint: 'MNSTy46haEN7sEaeXAWBXG6zHaRikCvqf3krAEDzxr2', symbol: 'MNST', name: 'Monster Beverage - Backpack Securities', family: 'sunrise', recordedDecimals: 6, offered: true },
  { mint: 'AMC1qwR9KhiyrQBRPrxnfo4JfMeMZqEBvt5tgTytNNoc', symbol: 'AMC', name: 'AMC Entertainment - Backpack Securities', family: 'sunrise', recordedDecimals: 6, offered: true },
  { mint: 'GooGLMvZtJZXHdNZy95RUrAMCCKxV6ghK3qE5ddBgVm5', symbol: 'GOOGL', name: 'Alphabet - Backpack Securities', family: 'sunrise', recordedDecimals: 6, offered: true },
  { mint: 'LLYuwZ33keFihgwoxXsBawy31AiRFLFSva32TYq5TvD', symbol: 'LLY', name: 'Eli Lilly and Company - Backpack Securities', family: 'sunrise', recordedDecimals: 6, offered: true },
  { mint: 'WENAZ2WyPbmgvUcKfQ8hyMDfBQP9bZ65hsZ5KTFrRGZ', symbol: 'WEN', name: 'The Wendy\'s Company - Backpack Securities', family: 'sunrise', recordedDecimals: 6, offered: true },
  { mint: 'GRNDYDpqwpCm6jVxpbh4xT5AM4r3p391qYsKTHqgaET2', symbol: 'GRND', name: 'Grindr - Backpack Securities', family: 'sunrise', recordedDecimals: 6, offered: true },
  { mint: 'BoTx8y9ynfdxf5ZjWtCoBVkff52qKA82ysaLU8ZM6d8T', symbol: 'BOT', name: 'RoboStrategy - Backpack Securities', family: 'sunrise', recordedDecimals: 6, offered: true },
  { mint: 'RDDTGbhHwVXfyCvQMXzzowKjf5qrYBZAnehoXW83ooh', symbol: 'RDDT', name: 'Reddit - Backpack Securities', family: 'sunrise', recordedDecimals: 6, offered: true },
  { mint: 'RBLXDGRD64AtRamHMFVcjqne3Ar7NLWtFtYNtsrf1cE', symbol: 'RBLX', name: 'Roblox - Backpack Securities', family: 'sunrise', recordedDecimals: 6, offered: true },
  { mint: 'BLKKYfF41c6xRPrtX1rdYbxLE1xxEdZUnxQsB5hcZ8Nf', symbol: 'BLK', name: 'BlackRock - Backpack Securities', family: 'sunrise', recordedDecimals: 6, offered: true },
  { mint: 'URARfsinxCRw4JpvQhuT4CxavdZXZEMjv9ZwWmWpwag', symbol: 'URA', name: 'Global X Uranium ETF - Backpack Securities', family: 'sunrise', recordedDecimals: 6, offered: true },
  { mint: 'CzLTZppPdZtTjyq3WGpHLstoc3GLhu7zH5Zg6xUa6Gv5', symbol: 'COPX', name: 'Global X Copper Miners ETF - Backpack Securities', family: 'sunrise', recordedDecimals: 6, offered: true },
  { mint: 'CZEB3WNZuF2Yz1z2H81RcCk8T7fsw82KB33zqamASVsg', symbol: 'COST', name: 'Costco Wholesale - Backpack Securities', family: 'sunrise', recordedDecimals: 6, offered: true },
  { mint: 'DNUTsCvKbKwu2RM72cUuW3TD9YpzArzACcqYQssjPLSk', symbol: 'DNUT', name: 'Krispy Kreme, Inc. Common Stock - Backpack Securities', family: 'sunrise', recordedDecimals: 6, offered: true },
  { mint: 'LULUmT9VMttkfAJE236LXJcYJ2tTP7nunrSWR5G1BdS', symbol: 'LULU', name: 'lululemon athletica inc. - Backpack Securities', family: 'sunrise', recordedDecimals: 6, offered: true },
  { mint: 'NQ5hSuXQZrbnrwcDVk2qN73njjd3E3v3badYHnj5thF', symbol: 'IONQ', name: 'IonQ - Backpack Securities', family: 'sunrise', recordedDecimals: 6, offered: true },
  { mint: 'QUBTAD8C9bMU9LvmMNgKPhrmBGbHvxpu6vfWQtThxxw', symbol: 'QUBT', name: 'Quantum Computing - Backpack Securities', family: 'sunrise', recordedDecimals: 6, offered: true },
  { mint: 'RKLBnAXGqv31iZomqsuAWkQm1aqC7JwwvbCfzGdqAhz', symbol: 'RKLB', name: 'Rocket Lab - Backpack Securities', family: 'sunrise', recordedDecimals: 6, offered: true },
  { mint: 'ABNB56TteaTZG1S3DY2W8VMncQmHMvNCGaZgAba49CLP', symbol: 'ABNB', name: 'Airbnb - Backpack Securities', family: 'sunrise', recordedDecimals: 6, offered: true },
  { mint: 'CMGi497VQA9RiHVWpQi5B847vN8RLaEwcMhB5kEUhkAQ', symbol: 'CMG', name: 'Chipotle Mexican Grill - Backpack Securities', family: 'sunrise', recordedDecimals: 6, offered: true },
  { mint: 'RENzhrJQgmAnfcLhU1U5XwAMc6TC15UA6jCbPBaasnj', symbol: 'IREN', name: 'IREN - Backpack Securities', family: 'sunrise', recordedDecimals: 6, offered: true },
  { mint: 'EWY4owSJYMpwN33qGDu5gGxpkQkpMJu8ZUsQJaNZG5dv', symbol: 'EWY', name: 'iShares MSCI South Korea ETF - Backpack Securities', family: 'sunrise', recordedDecimals: 6, offered: true },
  { mint: 'MGMuubtUEirmkhfEQdmGUh4pr7HuUdMWcZXFtpPbVJD', symbol: 'MGM', name: 'MGM Resorts International - Backpack Securities', family: 'sunrise', recordedDecimals: 6, offered: true },
  { mint: 'CHWYHz2zfKajomqPV9it26n7vu7AgZZfqGHXCWtGWuJg', symbol: 'CHWY', name: 'Chewy - Backpack Securities', family: 'sunrise', recordedDecimals: 6, offered: true },
  { mint: 'BEBVfXZ8uCxRBuunEbW9wcq9r7W9ySNo14oJBJkDgpZx', symbol: 'BE', name: 'Bloom Energy - Backpack Securities', family: 'sunrise', recordedDecimals: 6, offered: true },
  { mint: 'LMT3i1BHgixFqPUgcyteJhnEz2dpy9i3cYy4pi9BoeV', symbol: 'LMT', name: 'Lockheed Martin - Backpack Securities', family: 'sunrise', recordedDecimals: 6, offered: true },
  { mint: 'BMKdM4yUxX12moFqVk195k7coMbaybd4RUKCUdm7D1Sk', symbol: 'IBM', name: 'International Business Machines - Backpack Securities', family: 'sunrise', recordedDecimals: 6, offered: true },
  { mint: 'SPHRp8cZaSQBTp1KMNP4V1X821SXhXWt4Q2yLdyHzju', symbol: 'SPHR', name: 'Sphere Entertainment Co. - Backpack Securities', family: 'sunrise', recordedDecimals: 6, offered: true },
  { mint: 'BBosJLw8ZzoATiEyywiifx7AgmrD2Cm3XjFWbhbRhChy', symbol: 'BB', name: 'BlackBerry - Backpack Securities', family: 'sunrise', recordedDecimals: 6, offered: true },
  { mint: 'SNAPcESrvnH8yUdgeMF6xm1hym9b6hW6s8YeqeHdZFz', symbol: 'SNAP', name: 'Snap - Backpack Securities', family: 'sunrise', recordedDecimals: 6, offered: true },
  { mint: 'LUV9GB51PNZNRyzzyYK3rtqFfvDvWtRiXZ34wVq2HrX', symbol: 'LUV', name: 'Southwest Airlines Co. - Backpack Securities', family: 'sunrise', recordedDecimals: 6, offered: true },
  { mint: 'UVXY4ojmAMTaPwUmrRmcuxWHjMHCbz3BxX2RBMzjYKx', symbol: 'UVXY', name: 'ProShares Ultra VIX Short-Term Futures ETF - Backpack Securities', family: 'sunrise', recordedDecimals: 6, offered: true },
  { mint: 'PTNzAfFAB4LvoUQEUUGrFMyUoRLExMYjH6CcfyQfsVP', symbol: 'PTN', name: 'Palatin Technologies, Inc. Common Stock - Backpack Securities', family: 'sunrise', recordedDecimals: 6, offered: true },
  { mint: 'TSM2Hiuf7Z9REcwZFQvsBEekBYCYziWBABfFnj6V6gQ', symbol: 'TSM', name: 'Taiwan Semiconductor Manufacturing Company - Backpack Securities', family: 'sunrise', recordedDecimals: 6, offered: true },
  { mint: 'N7Q5fYX7YRnDQksfdBKnoUb3awm92n7QNAD35X3Rq1X', symbol: 'NOK', name: 'Nokia Oyj - Backpack Securities', family: 'sunrise', recordedDecimals: 6, offered: true },
  { mint: 'MRVLSjkR2ceUBukujaD3xCyHP1H3B2SzpsNTZF546jo', symbol: 'MRVL', name: 'Marvell Technology - Backpack Securities', family: 'sunrise', recordedDecimals: 6, offered: true },
  { mint: 'DELL2aRKQz7DMq5DrKLtkn47ZCnbxXPZXrSGbkmd13wy', symbol: 'DELL', name: 'Dell Technologies - Backpack Securities', family: 'sunrise', recordedDecimals: 6, offered: true },
  { mint: 'SH55hfaipFAbwT42nQYhRoM5o5t61QpkmJ6p62vXB3m', symbol: 'SHOP', name: 'Shopify - Backpack Securities', family: 'sunrise', recordedDecimals: 6, offered: true },
  { mint: 'CRWVJeR2yEZuDUKYfGuKCHvLz8ywn4LGvovHfy5WiFmi', symbol: 'CRWV', name: 'CoreWeave - Backpack Securities', family: 'sunrise', recordedDecimals: 6, offered: true },
  { mint: 'NBiSF3UaVUFtRzHwAfxyHsBCAZWGEKnMpewAE4oh7BG', symbol: 'NBIS', name: 'Nebius Group N.V. - Backpack Securities', family: 'sunrise', recordedDecimals: 6, offered: true },
  { mint: 'RUKx7nBgm94pwRPbVm99xYVdcTDTUyGs8Cw3VSYQXHf', symbol: 'RIOT', name: 'Riot Platforms - Backpack Securities', family: 'sunrise', recordedDecimals: 6, offered: true },
  { mint: 'BULL151gUXcFV5wXEUqu9Am2L7Qt4bTJRLRuAUjkcspC', symbol: 'BULL', name: 'Webull Corporation Class A Ordinary Shares - Backpack Securities', family: 'sunrise', recordedDecimals: 6, offered: true },
  { mint: 'JNJg1znKdF712Phe7L7z52AATAvEjEytBdN2w8Lnh1Y', symbol: 'JNJ', name: 'Johnson & Johnson - Backpack Securities', family: 'sunrise', recordedDecimals: 6, offered: true },
  { mint: 'PUSAG1stksTcAoK9MjinEHUwAYRJsbovywYCk37m6hy', symbol: 'PUSA', name: 'Powerus Corporation - Backpack Securities', family: 'sunrise', recordedDecimals: 6, offered: true },
  { mint: 'ARMbSB1MBRQrY6PNMao1HdQ431VafC6JRJCsGZ2Yv3iJ', symbol: 'ARM', name: 'Arm Holdings - Backpack Securities', family: 'sunrise', recordedDecimals: 6, offered: true },
  { mint: 'SCHHJ3jRdSjeFEVAaLrnYdx3Brphn92Ys7z1qkiCtPX', symbol: 'SCHH', name: 'Schwab U.S. REIT ETF - Backpack Securities', family: 'sunrise', recordedDecimals: 6, offered: true },
  { mint: 'PFER6ENqP8r8NF3CqVt4mFowxsin3V5MLidBNQFCC3x', symbol: 'PFE', name: 'Pfizer - Backpack Securities', family: 'sunrise', recordedDecimals: 6, offered: true },
  { mint: 'FLWSojG1gB5VStYR3Sb4nQFRt43UBYkqih1j2CpVLqgd', symbol: 'FLWS', name: '1-800-FLOWERS.COM - Backpack Securities', family: 'sunrise', recordedDecimals: 6, offered: true },
  { mint: 'UPSqUeMHcWbkdg784XuBUEF9DtySSnW9ur5LAVdcuB9', symbol: 'UPS', name: 'United Parcel Service - Backpack Securities', family: 'sunrise', recordedDecimals: 6, offered: true },
  { mint: 'WULFeyfrj1VJKD9HhRTcW8R4g5HefUA11HDEdBv2WxD', symbol: 'WULF', name: 'TeraWulf - Backpack Securities', family: 'sunrise', recordedDecimals: 6, offered: true },
  { mint: 'BArimz1PcKZr8PcPh3tcZ2dg4S7FJLk3cw6R5F8GsHKg', symbol: 'BA', name: 'The Boeing Company - Backpack Securities', family: 'sunrise', recordedDecimals: 6, offered: true },
  { mint: 'HooDYv5RewLRiMLnEVq3VJqdqxhuE6c5eYvqejMC3e9A', symbol: 'HOOD', name: 'Robinhood Markets - Backpack Securities', family: 'sunrise', recordedDecimals: 6, offered: true },
  { mint: 'FWDtiB5fXHdVAewPqvHPL2dh4aBC1C6GacQbePoQXKjz', symbol: 'FWDI', name: 'Forward Industries, Inc. - Backpack Securities', family: 'sunrise', recordedDecimals: 6, offered: true },
  { mint: 'BRVaZKg6J9iF2BEsdpsxJ9NyvN9PPxPZuoQUX2v8qqkk', symbol: 'BROS', name: 'Dutch Bros - Backpack Securities', family: 'sunrise', recordedDecimals: 6, offered: true },
  { mint: 'GPRR2u6NS5yBQHWGauoJ9HXgjrTH8dDsrBfTV5zAYvDH', symbol: 'GPRO', name: 'GoPro - Backpack Securities', family: 'sunrise', recordedDecimals: 6, offered: true },
  { mint: 'iNTCy1qTsUEZQe3DSocLz1ZXXai34Gdw8THQh5rxFaF', symbol: 'INTC', name: 'Intel - Backpack Securities', family: 'sunrise', recordedDecimals: 6, offered: true },
  { mint: 'EWZzCki1igp2y73UyUM4RCG4QUVMQAtnrQUVNaDHzDxJ', symbol: 'EWZ', name: 'iShares MSCI Brazil ETF - Backpack Securities', family: 'sunrise', recordedDecimals: 6, offered: true },
  { mint: 'HTZsLG4zqaNvWMwXSLHH3GG5KyJpKwpBRsKVdMG6hvzP', symbol: 'HTZ', name: 'Hertz Global Holdings, Inc Common Stock - Backpack Securities', family: 'sunrise', recordedDecimals: 6, offered: true },
  { mint: 'RcZmt84VMJv9bDhKqmw1uWDahYrUT468VwAChTnfD8p', symbol: 'RIVN', name: 'Rivian Automotive - Backpack Securities', family: 'sunrise', recordedDecimals: 6, offered: true },
  { mint: 'SPYBo66VJPFjh1pXMb9Le53kDYWTK1zzYVDeVRWtsbi', symbol: 'SPY', name: 'State Street SPDR S&P 500 ETF Trust - Backpack Securities', family: 'sunrise', recordedDecimals: 6, offered: true },
  { mint: 'CEQnejxG1FPzMS6UiLbcxNiMKrZM3x6GTZucpJoSeByy', symbol: 'ICE', name: 'Intercontinental Exchange - Backpack Securities', family: 'sunrise', recordedDecimals: 6, offered: true },
  { mint: 'RUMsPfFZFnN1ZmGANwP7FNMJMjKH4m9RiMePrtVtLe7', symbol: 'RUM', name: 'RUM Group Inc. - Backpack Securities', family: 'sunrise', recordedDecimals: 6, offered: true },
  { mint: 'Pren1FvFX6J3E4kXhJuCiAD5aDmGEb7qJRncwA8Lkhw', symbol: 'ANTHROPIC', name: 'Anthropic PreStock', family: 'prestock', recordedDecimals: 9, offered: true },
  { mint: 'PreweJYECqtQwBtpxHL171nL2K6umo692gTm7Q3rpgF', symbol: 'OPENAI', name: 'OpenAI PreStock', family: 'prestock', recordedDecimals: 9, offered: true },
  { mint: 'PresTj4Yc2bAR197Er7wz4UUKSfqt6FryBEdAriBoQB', symbol: 'ANDURIL', name: 'Anduril PreStock', family: 'prestock', recordedDecimals: 9, offered: true },
  { mint: 'PrekqLJvJ3qVdXmBGDiexvwUTF4rLFDa6HWS4HJbw9S', symbol: 'NEURALINK', name: 'Neuralink PreStock', family: 'prestock', recordedDecimals: 9, offered: true },
  { mint: 'Pre8AREmFPtoJFT8mQSXQLh56cwJmM7CFDRuoGBZiUP', symbol: 'POLYMARKET', name: 'Polymarket PreStock', family: 'prestock', recordedDecimals: 9, offered: true },
  { mint: 'PreLWGkkeqG1s4HEfFZSy9moCrJ7btsHuUtfcCeoRua', symbol: 'KALSHI', name: 'Kalshi PreStock', family: 'prestock', recordedDecimals: 9, offered: true },
  { mint: 'PreZad18qfPtbxNpMtMuAuX2zVpvkEU8DnJx56faCWd', symbol: 'FIGUREAI', name: 'Figure AI PreStock', family: 'prestock', recordedDecimals: 9, offered: true },
  { mint: 'PreANxuXjsy2pvisWWMNB6YaJNzr7681wJJr2rHsfTh', symbol: 'SPACEX', name: 'SpaceX PreStock', family: 'prestock', recordedDecimals: 9, offered: true },
  { mint: 'Pre9atBqkocK1QngFy7Q7zvyQictEFpXdLi6bZ2qnYy', symbol: 'OURA', name: 'Oura PreStock', family: 'prestock', recordedDecimals: 9, offered: true },
];
