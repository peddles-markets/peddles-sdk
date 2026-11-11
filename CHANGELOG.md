# Changelog

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
