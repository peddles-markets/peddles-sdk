# Changelog

## 0.8.0 — Solana launch building, Anubis (Gully Core) launches

Added:

- **`@peddles/sdk/solana`: build a Peddles Solana launch, not only verify one.** This is a new entry
  point with no dependencies (no `@solana/web3.js`, no `viem`). It is ported from the Peddles web
  form's own launch code, and a parity test checks that its output is byte-identical to the web's:
  instruction data, the 28 account metas, compiled v0 transactions, fee maths, mint decoding and the
  `PEDL` grind. New exports include:
  - `prepareSolanaLaunch(input)`, which reads `Config`, the quote's `QuoteConfig`, mint and Meteora
    badge, and the lookup table. It validates the terms, sizes the first buy and returns the unsigned
    v0 transaction, together with the live `launchFeeLamports`, an estimate of the deposits, and what
    the creator must hold. A refusal comes back as `{ ok: false, reason }`; a failed read throws.
  - `expectedFeeLamports` on `prepareSolanaLaunch`: the program charges `Config.launch_fee_lamports` at
    execution with no maximum in the launch, so pass the fee the creator was shown and the build is
    refused if `Config` now differs. `Config`, the quote's `QuoteConfig`, mint and badge are re-read on
    every call even with a cached `chainState` (only its lookup table is reused). The result reports
    `priorityFeeSource` (`given`, `read`, or `unavailable` when the fee read failed and the bid is 0),
    and `lamportsNeeded` includes the creator's wSOL account rent on a SOL pair when that account does
    not exist yet.
  - `readLaunchChainState` and `meteoraBadgeAddress`.
  - `checkSolanaQuote`, which passes a quote only if it is enabled, matches the program's record, is
    not paused, frozen or hooked, and has a Meteora badge that matches.
  - `solanaLaunchTerms`, the rules for the rate (1.25% to 5%), the split (required above the floor),
    the ticker and the name.
  - The builders: `deriveLaunchAddresses`, `encodeLaunchData`, `launchAccounts`, `launchInstruction`,
    `buildLaunchTransaction`, `compileV0Transaction`, `computeBudgetInstructions`,
    `wrapSolInstructions` and `launchMetadataDocument`.
  - `grindPedlSalt({ programId, maxTries, signal?, creator?, onProgress? })`, a plain async search
    with a try budget and an abort signal.
  - `takePooledSalt` and `readPooledSalt`, for the API's salt pool. A pooled salt is accepted only
    when its mint recomputes from the salt.
  - The exact `bigint` maths: `volumeSplit`, `feeSchedule`, `firstBuyOpening`, `firstBuyQuoteNeeded`,
    `firstBuyMaxQuote`, `liquidityForExactSupply`, `launchDepositsLamports` and `priorityBid`.
  - Pricing at displayed price × live multiplier: `quoteUsdPerWholeRawE18` and
    `openingMarketCapUsdE18`.
  - Decoders for `Config`, `QuoteConfig`, mints (Token-2022 transfer fee, scaled-UI multiplier,
    pause, default account state, transfer hook), `LaunchRecord`, Meteora pools and positions, and
    Metaplex metadata.
  - RPC helpers: `solanaRpc` (takes a URL, a `Connection`'s `rpcEndpoint`, or your own request
    function), `getAccounts` and `simulateTransaction`.
  - Constants: `SOLANA_LAUNCH_QUOTES` (the 123 listed quotes) and the program addresses.

  Checked live on Solana mainnet on 2026-11-11 at 22:55Z, by simulation only; nothing was signed. A
  SOL-paired launch built by the SDK simulated with no error at slot 468,298,307. The launch program
  used 243,496 compute units, created the Meteora pool and locked the position permanently. The launch
  fee read was still the $0.10 testing fee (1,146,526 lamports).
- **Anubis (chain 6714): Gully Core launch building** (`src/gully/`, exported from the root). This is a
  separate address book, `GULLY_DEPLOYMENTS`, generated from `contracts/deployments/6714.json` by
  `script/generate-gully-deployments.mjs`. It ships the 7 live core contracts and the quote token, and
  leaves out role wallets and the predicted add-ons, which are not deployed. New exports:
  - `readGullyLaunchTerms`, which reads the fee live (2 DAI when this was written) and refuses a quote
    or fee token that disagrees with the book;
  - `readGullyWallet` and `planGullyLaunch`;
  - `buildGullyApproveTx`, an approval for EXACTLY fee + first buy;
  - `buildGullyLaunchTx`, `gullyLaunchRequest` and `encodeGullyLaunchCall`, for the coin and Drip types
    (`launch` and `launchAndBuy`);
  - salt and address helpers: `gullyLaunchSalt`, `randomGullySalt`, `computeGullyLaunchToken` and
    `predictGullyLaunchToken`;
  - `readGullyLaunchRecord`, plus the pending-launch settle helpers;
  - revert decoding.

  Gas on Anubis is DAI, pulled as an ERC-20, and every Anubis transaction has `value: 0n`. Gully's own
  protocol fee (0.30%) applies to trades on top of the launch's terms. Holder rewards stream over one
  hour. Calldata is held byte-identical to the web launch form by test, and an `eth_call` against Anubis
  mainnet was checked live (block 18,902,325, 2026-11-11 22:49Z). `supportedChains()` is unchanged, so it
  still lists only the Uniswap v4 chains.

Changed:

- The README, `CLAUDE_PROMPT.md` and this file now cover Solana launching and Anubis.
- `npm run deployments` also regenerates the Gully address book (`src/gully/deployments.generated.ts`).

## 0.7.0 — Ethereum and Elysium mainnets, Solana mint verification

Added:

- **Elysium (chain 99901, Kinetiq)** in the address book: the full stack deployed 2026-11-09/10 (29
  contracts, from `contracts/deployments/99901.json`, launch salt binding `creator`). `supportedChains()` is
  now `[1, 56, 4663, 5042, 8453, 99901]`. Gas is HYPE and the ETH-type quote is WHYPE; no stock pairs and
  no perps there (`hasPerps(99901)` is false). The Clog variant, NFT bonding, handle and Snowball launchers
  are deployed but take launches only once the Elysium Safe registers them (its batch 1).
- **Ethereum (chain 1)** in the address book: the full Peddles stack deployed 2026-11-09 (29 contracts,
  from `contracts/deployments/1.json`, launch salt binding `creator`). `supportedChains()` is now
  `[1, 56, 4663, 5042, 8453]`, and every per-chain helper resolves chain 1 from the book:
  `launchAddressesFor`, `snowballFactoryFor` / `snowballHandleFactoryFor`, `partnerFeeForwarderFor`.
  Ethereum has **no perps**: `hasPerps(1)` is false and `perpContracts(1)` throws `PerpsUnavailableError`.
  No stock quote is whitelisted on chain 1 yet, so stock-paired builders have nothing to pair against there
  until its quotes are set.
- `verifyPeddlesMint(mint, programId, getAccount)` and `peddlesCreatorAddress(programId)`, with the
  types `GetSolanaAccount`, `SolanaAccountRead` and `PeddlesMintCheck`: is a Solana mint a real Peddles
  launch, answered from the chain (the launch program's `LaunchRecord`, and the program's creator address
  as Metaplex update authority and verified creator). No dependency and no network; the `PEDL` address
  ending is not read. Launching on Solana is not in the SDK.

Changed:

- `solanaVerify` encodes its ASCII seeds without `TextEncoder`, so the package builds against plain
  ES2022 (since the Solana check landed, `pnpm build` failed on it).
- README and `CLAUDE_PROMPT.md`: Ethereum in the chain tables, perps listed on Base, Robinhood Chain, BNB
  Smart Chain and Arc, Robinhood Chain on the creator-bound orchestrator, a Solana section.

Not included: Anubis (6714). Its venue is Gully Core, whose contracts the SDK's Uniswap v4 reads do not
fit; it stays out of `supportedChains()` until it has its own support.

## 0.6.0 — Partner trades

Added:

- `PARTNER_FEE_FORWARDERS`, `partnerFeeForwarderFor(chainId)` — `PeddlesPartnerFeeForwarder` per chain
  (null where not deployed). Live on Base, Robinhood Chain, BNB Smart Chain and Arc.
- The voucher: `partnerVoucherTypedData(chainId, forwarder, partner, expiry)` (EIP-712 domain
  `PeddlesPartnerFeeForwarder` / `1`, type `PartnerVoucher(address partner,uint256 expiry)`),
  `partnerDomainSeparator`, `partnerVoucherDigest` (the contract's `voucherDigest`, computed the
  contract's way and pinned against viem's `hashTypedData` and the live Base forwarder),
  `parsePartnerVoucher` for the API's JSON, `isPartnerVoucherValid` (a `voucherValid` read).
- Reads: `readPartnerTerms` (share, platform fee bounds, own-fee cap, signer, reclaim window),
  `readPartnerClaimable`. Maths: `partnerFeeSplit`, the contract's rounding exactly.
- Calldata builders for every entry point — `buildPartnerBuyV4` / `SellV4`, `BuyRoute` / `SellRoute`,
  `BuyExternal` / `SellExternal`, `BuyRoutePancake` / `SellRoutePancake` — plus `buildPartnerWithdraw`,
  `buildPartnerWithdrawTo` and `encodePartnerCall`. They fail closed (`PartnerUnavailableError`) on a
  voucher for another chain or forwarder, and on rates outside the live terms when given.
- Generated ABI `partnerFeeForwarderAbi` (also from `@peddles/sdk/abis`): trading entry points,
  withdrawals, views, events and errors. Owner setters are absent.

## 0.5.0 — Snowball handle launches, perps on every mainnet

Added:

- `SNOWBALL_HANDLE_FACTORIES`, `snowballHandleFactoryFor(chainId)` — `PeddlesSnowballHandleFactory` per
  chain (null where not deployed). Live on Base, BNB Smart Chain, Arc and Robinhood Chain.
- `buildHandleSnowballStockLaunch(ticket, args)` — a Snowball launch FOR an X account: the oracle ticket
  (from the Peddles API) goes first and the creator share is paid to that account's pot. Approve the
  handle factory for the first buy.
- Generated ABI `snowballHandleFactoryAbi` (both entrypoints, predictors, vault/pot/launcher lookups,
  `SnowballLaunched` and `HandleLaunched`).

Changed:

- Robinhood Chain launches are creator-bound (its Safe enabled the bound orchestrator 2026-10-04), so
  `launchSaltBindingFor(4663)` is `creator` and early addresses are safe to share there too.
- Perps: BNB Smart Chain and Arc carry perp records — `hasPerps` / `perpContracts` resolve every mainnet.

## 0.4.0 — Snowball launches

A Snowball launch fixes, in the launch transaction and forever, how the pool's tax is split by
volume between buyback-and-burn, permanent liquidity, the creator and holders (plus the platform's
fixed 0.50%). A per-token `PeddlesSnowballVault` is the creator of record, so nobody can change the
split or switch it off afterwards.

Added (`@peddles/sdk/launch`):

- `snowballTerms(split)` — exact mirror of `PeddlesSnowballFactory.termsFor` (integer bps, the same
  floor, the same refusals, by the contract's error name); `snowballFeeTerms`, `snowballMinSpend`,
  `clogFloorAtOpen`.
- `buildSnowballStockLaunch` (`launchStock`) and `buildSnowballQuoteLaunch` (`launchQuote`, WETH /
  USDC on Arc / WBNB on BSC and Clog) return viem-ready `{ address, abi, functionName, args, value }`;
  `encodeSnowballLaunch` returns `{ to, data, value }`.
- `prepareSnowballQuotePlan` — predicts the vault, checks the factory's orchestrator and fee hook
  against the chain's address set live, and builds the WETH-type plan for the vault.
- Chain reads: `predictSnowballVault`, `predictSnowballStockToken`, `predictSnowballQuoteToken`,
  `readSnowballVault` (terms, tax, burn / LP / creator buckets, lifetime totals).
- Generated ABIs `snowballFactoryAbi`, `snowballVaultAbi` (also from `@peddles/sdk/abis` and the
  root); their custom errors join `launchErrorsAbi`, and `decodeLaunchRevert` explains the factory's.

Added (address book):

- `SNOWBALL_FACTORIES`, `snowballFactoryFor(chainId)` (null where not deployed),
  `requireSnowballFactory`, `SnowballUnavailableError`; `LaunchAddresses.snowballFactory`. Snowball
  builders fail closed on a chain without a factory.
- Live on Base 8453, BNB Smart Chain 56, Arc 5042 and Robinhood Chain 4663. On Robinhood Chain only
  stock-paired Snowball launches work today: WETH-type and Clog need the creator-bound orchestrator,
  whose enabling Safe batch is not signed yet, and the builders refuse them (`saltBinding: 'none'`).
- Snowball for handle launches is not deployed and is not included.

## 0.3.0

Creator-bound launches on Base, BNB Smart Chain and Arc; the address book says which salt binding
each chain uses (`launchSaltBindingFor`, `LaunchAddresses.saltBinding`).

## 0.2.0

The perps module (`@peddles/sdk/perps`), perp addresses on Base and Robinhood Chain.
