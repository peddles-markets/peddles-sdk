# Integrate Peddles into your app — a prompt for Claude (or any coding agent)

Copy everything between the lines below into Claude Code, Cursor, or any coding agent working in
your repository. It gives the agent the SDK's surface and the rules a correct Peddles integration
has to follow, so it can wire Peddles in without guessing.

---

You are integrating **Peddles** into this codebase using the `@peddles/sdk` TypeScript package
(`npm i @peddles/sdk`, peer dependency `viem@^2`; source at github.com/peddles-markets/peddles-sdk). Peddles is a multi-chain
launchpad for memecoins paired against **tokenised stocks** or ETH, on **Uniswap v4**, where every
launch pool runs through one fee hook with terms fixed forever at launch. It also runs a **perp
launchpad**: a coin whose v4 pool carries leveraged longs and shorts (Base and Robinhood Chain). Website: https://peddles.xyz ·
docs: https://docs.peddles.xyz.

## What to build

Ask me which of these I want before writing code, then build only those:

1. **Read** — show a launched token: name, symbol, decimals, supply, pool terms (tax, holder split),
   holder rewards, clog state.
2. **Launch** — let a user create a coin (ETH-paired, stock-paired, or Clog) and sign it in their own
   wallet.
3. **Trade links / discovery** — link tokens to their chain explorer and to https://peddleswap.xyz or
   https://peddles.xyz/terminal.
4. **NFT graduation** — Art→DEX / NFT→stock graduation requests and NFT-holder fee claims.
5. **Perp market launch** — let a user create a perp market (`PeddlesPerpFactory.create`) and sign it.

## Install

```bash
npm i @peddles/sdk viem
```

## The SDK surface you will use

```ts
// Root export: address book, reads, fee maths, ABIs, clog + NFT helpers
import {
  supportedChains, isKnownChain, addressOf, deploymentFor, DEPLOYMENTS,
  UnknownChainError, UnknownContractError,
  getTokenInfo, isVariantSupported, getPoolTerms, PoolTermsUnavailableError,
  feeSplit, PLATFORM_FEE_BPS, CREATOR_FEE_BPS, MIN_CREATOR_TAX_BPS, MAX_CREATOR_TAX_BPS,
  getVariantAllocation, getClogVault, getClogState, isReleaseReady, clogShareOfInflows,
  relayParamsHash, stockGraduationOptInRequest, graduateToStockWithTermsRequest, graduateAndBuyRequest,
  getHolderCommitment, getDistributorState, holderClaimable,
  factoryAbi, feeHookAbi, stockLaunchpadAbi, erc20Abi, tokenV20Abi, holderRewardsAbi, /* … */
} from '@peddles/sdk';

// Launch builders: everything needed to produce an UNSIGNED launch tx { to, data, value }
import {
  launchAddressesFor, buildWethLaunchPlan, buildWethLaunchCall, encodeWethLaunchCall,
  readOrchestratorLaunchFee, buildStockLaunchCall, encodeStockLaunchCall, encodeStockApproval,
  readStockAllowance, readStockLaunchFee, readStockQuotes, isQuoteAllowed, predictStockCoin,
  randomSalt, mineSalt, validateFeeTerms, feeSplitRate, parseTaxPercent, formatTaxPercent,
  readLaunchVariants, variantForType, decodeLaunchRevert, explainLaunchRevert,
  // Snowball launches (see "Snowball launches" below)
  snowballTerms, snowballMinSpend, buildSnowballStockLaunch, buildSnowballQuoteLaunch,
  prepareSnowballQuotePlan, encodeSnowballLaunch, predictSnowballVault, predictSnowballStockToken,
  predictSnowballQuoteToken, readSnowballVault, snowballFactoryFor, SnowballUnavailableError,
} from '@peddles/sdk/launch';

// Perps: the perp launchpad (PeddlesPerpFactory) — addresses, live base reads, create calldata
import {
  perpChains, hasPerps, perpContracts, PerpsUnavailableError, readPerpBase,
  isValidPerpHookAddress, predictPerpHook, predictPerpToken, buildPerpCreate,
  perpFactoryAbi, perpErrorsAbi, PERP_HOOK_FLAGS,
} from '@peddles/sdk/perps';
```

Read the package's `README.md` and the `.d.ts` files in `node_modules/@peddles/sdk/dist` for exact
signatures before calling anything; do not invent parameters.

## Chains — resolve everything from the active chain, never hardcode one

- Live today: **Base 8453**, **Robinhood Chain 4663**, **BNB Smart Chain 56** and **Arc 5042** (all mainnet). Arc's gas is USDC and it has no stock pairs yet. `supportedChains()` is the source of truth — call it, don't copy
  this list.
- Take the chain from the user's wallet / app config. If `isKnownChain(chainId)` is false, **disable the
  Peddles feature and say so**; never fall back to another chain's addresses. The same contract name has
  a different address on every chain, and a router or token address from one chain used on another is a
  real-money bug.
- A launch's token address is bound to the wallet that sends it. `buildWethLaunchPlan` needs
  `creator` (the sender) and follows `launchAddressesFor(chainId).saltBinding` — `'creator'` on Base,
  BNB Smart Chain and Arc, `'none'` on a chain not yet on the bound contracts. Never pass a chain id
  check of your own in its place, and when mining a vanity salt for a bound chain pass
  `orchestratorBindings(creator)` to `mineSalt`.
- External addresses (WETH, Uniswap PoolManager, stock tokens) differ per chain too — read them from the
  chain (the launch plan does this: `buildWethLaunchPlan` reads the pool manager, WETH and hook from the
  liquidity executor) rather than pasting constants.
- Block times differ (Base ~2 s, Robinhood Chain counts Ethereum L1 blocks inside the EVM). Never convert
  "blocks" to time with another chain's number.

## Money rules — these are not optional

1. **Never use a JS `number` for token amounts, prices or balances.** Use `bigint` in base units
   everywhere; the SDK returns `bigint`. Convert with `viem`'s `parseUnits` / `formatUnits` only at the
   input and render edges.
2. **Every amount travels with its `decimals`.** Never assume 18: Coinbase B20 stock tokens on Base are
   **8 decimals**, Robinhood stock tokens 18, USDG 6. `getTokenInfo()` returns decimals with the supply.
3. **A tokenised stock is priced by its multiplier**, never one-to-one with the share
   (`uiMultiplier()` on Robinhood/bStocks, `toScaledBalance()` on B20). Unknown price = show nothing.
4. **Never invent a price or fall back to a stale one.** If a price source fails, render "unavailable".

## Read order — chain first, API second

- Read name, symbol, decimals, total supply, pool terms and lock status **from the chain** (the SDK's
  read helpers do). A token page must work the moment the launch transaction confirms.
- Use an off-chain API only for what the chain can't answer (logo, description, 24h volume, candles),
  and when both answer, the chain wins.
- Batch reads (`client.multicall`) and cache per block; don't hammer the RPC on every render.

## Launching — the user signs, your code never holds keys

- Build an **unsigned** tx with the SDK (`encodeWethLaunchCall` / `encodeStockLaunchCall` return
  `{ to, data, value }`) and hand it to the user's wallet. Never ask for or store a private key.
- **Read the launch fee from the chain** (`readOrchestratorLaunchFee`, `readStockLaunchFee`) — it is
  owner-set per chain and changes; never hardcode it. Show it to the user before they sign.
- **Fee terms are permanent.** `taxBps` (100–1000 = 1–10% all-in) and `excessToCreatorBps` are fixed in
  the launch transaction and nobody can change them afterwards. Validate with `validateFeeTerms()` and
  show the user the split from `feeSplitRate()` before they commit; say plainly that it is permanent.
- Stock-paired launches: offer only quotes from `readStockQuotes()` / `isQuoteAllowed()`, and handle the
  ERC-20 approval (`readStockAllowance` → `encodeStockApproval`) before the launch tx.
- Check `isVariantSupported(client, chainId, variant)` before offering a launch type; a type that is not
  registered on the chain must not be offered.
- On failure, show `decodeLaunchRevert(error)` / `explainLaunchRevert(...)` — a reason in words, not a hex
  blob. Never report success until the receipt says `status: success`.

## Snowball launches — a fixed-forever split of trading volume

- What it is: the creator picks, in the launch transaction, how the pool's tax is split **by volume**
  between buyback-and-burn (bought on the coin's own pool, sent to `0x…dEaD`), permanent full-range
  liquidity, the creator and holders, on top of the platform's fixed 0.50%. A per-token vault makes
  the launch call, so **the vault is the creator of record**; nobody — the creator, Peddles, or the
  protocol Safe — can change the split or switch it off. Say "fixed forever" and state each leg as a
  percent of volume. **Never describe it as returns, yield or profit** for anyone.
- Offer it only where `snowballFactoryFor(chainId)` (or `launchAddressesFor(chainId).snowballFactory`)
  is non-null. Every Snowball builder and factory read throws `SnowballUnavailableError` without one; never
  fall back to a plain launch.
- Show the user `snowballTerms(split)` before they sign: the all-in tax and whether the split is exact.
  A refusal (`ok: false`) carries the contract's own error name and a sentence — disable the launch.
- Stock-paired: `buildSnowballStockLaunch`; the first buy is approved to the **Snowball factory**, not
  the launchpad (`encodeStockApproval(quote, factory, quoteIn)`); `value` = `readStockLaunchFee().launchFee`.
- WETH / USDC (Arc) / WBNB (BSC) and Clog: `prepareSnowballQuotePlan` (reads the vault, checks the
  factory's wiring live and builds the plan for the vault) → `buildSnowballQuoteLaunch`. On Robinhood
  Chain this path is refused until its creator-bound orchestrator is enabled; stock-paired works there.
- `minSpend` is required and must be > 0: use `snowballMinSpend(quoteDecimals)`.
- After launch, read a vault with `readSnowballVault` (terms, tax, burn/LP/creator buckets, lifetime
  totals) — chain reads only. "Burned" is `totals.tokensBurned`, not a drop in `totalSupply`.

## Partner trades — earn on the trades your app routes

- If the app lets users trade Peddles tokens, route through `PeddlesPartnerFeeForwarder` with the
  developer's voucher so they earn a share of the platform fee. Offer it only where
  `partnerFeeForwarderFor(chainId)` is non-null; on any other chain, do not route partner trades.
- Vouchers come from the developer's SERVER (`POST /api/v1/launch-api/partner/voucher` with an API key
  holding `partner:voucher`), never from code that ships an API key to the browser. Parse them with
  `parsePartnerVoucher`. A voucher is for one chain; renew before `expiry` (≤ 30 days).
- Read `readPartnerTerms(client, forwarder)` live and pass `terms` to the builder, so a fee outside
  `minFeeBps..maxFeeBps` or above `maxPartnerFeeBps` is refused before the wallet opens.
- Show the trader both rates before they sign — the platform fee and the developer's own fee on top —
  as percents of the trade. `partnerFeeSplit` gives the exact amounts the contract books.
- Use the builders (`buildPartnerBuyRoute`, `buildPartnerSellRoute`, …), simulate, then let the
  trader's wallet sign. A sell needs an approval of exactly `amountIn` to the forwarder.
- Payments that fail are held as `claimable`; only the payout wallet can withdraw
  (`buildPartnerWithdraw`). Say plainly that an unclaimed balance can be moved to the Peddles fee wallet
  30 days after its last credit.

## Perps — launching a perp market

- Perps exist only where `hasPerps(chainId)` is true (Base 8453, Robinhood Chain 4663).
  `perpContracts(chainId)` throws on any other chain: disable the feature, never borrow another chain's
  factory.
- **Read the base live.** `readPerpBase(client, chainId, base)` returns `{ allowed, v, tickWidth }` as
  bigints. Offer a base only while `allowed` is true; the creator has no curve choice, every market on a
  base uses the factory's `v`/`tickWidth`. `baseCandidates` in `perpContracts()` is a list to ask about,
  not an answer.
- **You mine the hook salt.** Read `tokenInitCodeHash(name, symbol, tokenUri)` and then
  `hookInitCodeHash(token)` from the factory, loop `predictPerpHook(hookDeployer, salt, hash)` from a
  random 32-byte salt until `isValidPerpHookAddress(address)` (≈16k attempts — do it in a Web Worker),
  then confirm both addresses with the factory's `predictToken` / `predictHook` before building.
- `buildPerpCreate({...})` returns `{ to, data, value: 0n }`. `create` is not payable. An optional
  `seedBuyBase` (bigint, base units) is pulled with `transferFrom`: approve exactly that amount to the
  factory first, never an unlimited approval. Simulate before asking the user to sign; decode failures
  with `perpErrorsAbi`.
- Name, symbol and token URI are permanent. Perp contracts have no external audit — say so where a user
  commits money.

## UI rules

- Token metadata (name, symbol, description, links, images) is **user-supplied and hostile**: escape it,
  never use `dangerouslySetInnerHTML`, and label it "creator-supplied" where a user might trust it.
- Show what costs money and what is permanent (launch fee, fee terms, dev buy). Don't show internal
  contract names or mechanism to end users.
- The first ~3 minutes of every pool carry a decaying **anti-sniper tax (20% → the pool's normal tax)**;
  if your UI quotes a trade in that window, include it.

## Done means

- Type-checks with `strict`, no `any` on SDK values, no `number` for amounts.
- A test or script that **reads live chain state** through your integration (e.g. `getTokenInfo` on a real
  Base token) — a check that passes with the network unplugged hasn't tested anything.
- Unknown chain, unknown token and RPC failure each render an honest, specific state instead of a
  default.

---

*Maintained with the SDK at https://github.com/peddles-markets/peddles-sdk. Found a mismatch between this
prompt and the SDK? The SDK's types win — please open an issue.*
