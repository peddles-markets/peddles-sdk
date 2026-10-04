# Changelog

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
