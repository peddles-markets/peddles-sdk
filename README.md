<p align="center">
  <img src="https://raw.githubusercontent.com/peddles-markets/peddles-sdk/main/.github/og.png" alt="Peddles — Multi Chain Stock Pairs Launchpad" width="100%" />
</p>

# Peddles SDK

TypeScript SDK for **[Peddles](https://peddles.xyz)** — the multi-chain launchpad for memecoins
**paired against tokenised stocks** (and ETH), with a fixed-at-launch fee model, a built-in
anti-sniper tax and holder rewards paid in the pool's own quote asset.

Read launches from the chain, build launch transactions for your users to sign, and decode what
went wrong when one reverts — with the same code the Peddles app runs.

- 🌐 **Website:** [peddles.xyz](https://peddles.xyz) · **App:** [pro.peddles.xyz](https://pro.peddles.xyz) · **Swap:** [peddleswap.xyz](https://peddleswap.xyz) · **Terminal:** [peddles.xyz/terminal](https://peddles.xyz/terminal)
- 📚 **Docs:** [docs.peddles.xyz](https://docs.peddles.xyz) · **Developers:** [docs.peddles.xyz/docs/sdk](https://docs.peddles.xyz/docs/sdk)
- 🤖 **Integrating with an AI coding agent?** Paste [`CLAUDE_PROMPT.md`](./CLAUDE_PROMPT.md) into Claude (or any agent).

---

## Chains

| Chain | Chain id | Status | Explorer |
| --- | --- | --- | --- |
| **Base** | 8453 | ✅ Live — mainnet | [base.blockscout.com](https://base.blockscout.com) · [basescan.org](https://basescan.org) |
| **Robinhood Chain** | 4663 | ✅ Live — mainnet | [robin.etherscan.io](https://robin.etherscan.io) |
| **BNB Smart Chain** | 56 | ✅ Live — mainnet | [bscscan.com](https://bscscan.com) |
| **Arc** | 5042 | ✅ Live — mainnet (no stock pairs yet; gas and the ETH-type quote are USDC) | [explorer.arc.io](https://explorer.arc.io) |
| **Ethereum** | 1 | ✅ Live — mainnet (no stock pairs or perps yet) | [etherscan.io](https://etherscan.io) |
| **Elysium** | 99901 | ✅ Live — mainnet (Kinetiq; gas HYPE, the ETH-type quote is WHYPE; no stock pairs or perps; Clog, handle and Snowball launches open once its Safe registers them) | [elysium.kinetiq.xyz/explorer](https://elysium.kinetiq.xyz/explorer) |

**Anubis** (6714): Peddles launches there run on Gully Core, not Uniswap v4, so Anubis has its own
address book and builders and stays out of `supportedChains()`. See [Anubis](#anubis-6714-launches-on-gully-core).

**Solana:** `@peddles/sdk/solana` builds, checks and verifies Peddles Solana launches (program
`4jTFPcqrwzxP9Ve7xo6dUk4oYWbfbi78qm63tX1JC4tL`). See [Solana](#solana).

The SDK ships an address book **only for chains with a live deployment**. `supportedChains()` is the
source of truth; a chain that is not in it throws `UnknownChainError` rather than falling back to
another chain's addresses. Every address in `DEPLOYMENTS` was confirmed to have code on its chain
before it was published (`npm run smoke` re-checks them live).

## What Peddles does (what you can build on)

| Feature | What it is |
| --- | --- |
| **Stock-paired launches** | A coin whose pool is paired against a tokenised stock (Coinbase B20 on Base, Robinhood tokens on 4663, bStocks on BSC). Holders are rewarded in that stock. |
| **ETH-paired launches** | The classic shape — a coin paired against the chain's wrapped gas asset on Uniswap v4: WETH on Base and Robinhood Chain, WBNB on BNB Smart Chain, and USDC on Arc (where USDC is the gas). |
| **Clog launches** | A launch type that holds back a slice of supply and releases it into the pool in small, time-spaced slices (≤ 3 hours for the whole clog). |
| **Handle launches** | Launches whose creator fees accrue to an X (Twitter) account's pot, claimable by that account. |
| **NFT bonding → DEX** | NFT collections sold on a bonding curve that graduate automatically into a DEX pool when they sell out. |
| **Art → DEX / NFT → stock graduation** | Collections graduating into a stock-paired coin, with an optional share of fees committed to NFT holders. |
| **One fee model, fixed at launch** | Every launch pool runs through `PeddlesFeeHook`: the creator picks an all-in tax (1–10%) and the split of the excess between themselves and holders **in the launch transaction**, and nobody can change either afterwards. |
| **Anti-sniper opening tax** | 20% on the first block, decaying to the pool's normal tax over ~3 minutes. The creator's own buy in the launch transaction pays the normal rate. |
| **Snowball launches** | The creator fixes forever a split of the pool's tax, by volume, between buyback-and-burn, permanent liquidity, themselves and holders. A per-token vault is the creator of record, so nobody can change it afterwards. See [Snowball launches](#snowball-launches). |
| **Holder rewards** | Paid in the pool's quote asset (a TSLA-paired coin pays TSLA), deployed and bound inside the launch transaction. |
| **Uniswap v4 venue** | Pools are native Uniswap v4 pools, identified by the Peddles fee hook address. |
| **Perps** | A perp launchpad (`PeddlesPerpFactory`) on **Base** and **Robinhood Chain**: one transaction launches a coin whose v4 pool carries leveraged longs and shorts against its own liquidity. See [Perps](#perps). |

Fee legs (constants in the contract, exposed by the SDK): **0.50% platform + 0.50% creator** are fixed
inside every pool's tax; everything above them is split between the creator and holders at the
creator's chosen ratio. `feeSplit()` computes it exactly.

## Install

```bash
npm i @peddles/sdk viem
```

`viem` (v2) is a peer dependency of the EVM entry points. `@peddles/sdk/solana` needs nothing (no
`viem`, no `@solana/web3.js`). The package is ESM and ships its TypeScript types.

## Quick start

```ts
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { supportedChains, addressOf, getTokenInfo, getPoolTerms, feeSplit } from '@peddles/sdk';

const client = createPublicClient({ chain: base, transport: http() });

supportedChains();                           // [1, 56, 4663, 5042, 8453, 99901]
addressOf(8453, 'PeddlesFactoryV20');        // 0x90bD4d38F621529b4aD6480c221075B7317b1978

// Identity and supply, read from the token itself — never assume 18 decimals.
const info = await getTokenInfo(client, token);

// The pool's permanent terms (tax, holder split, rewards distributor), read from the fee hook.
const terms = await getPoolTerms(client, 8453, token);

// Exactly where a fee goes. bigint in, bigint out — no floating point anywhere.
const split = feeSplit(terms.creatorTaxBps, terms.excessToCreatorBps, 1_000_000n);
```

### Build a launch for a user to sign (ETH-paired)

```ts
import {
  launchAddressesFor, buildWethLaunchPlan, buildWethLaunchCall, encodeWethLaunchCall,
  readOrchestratorLaunchFee, randomSalt, validateFeeTerms, decodeLaunchRevert,
} from '@peddles/sdk/launch';

const addresses = launchAddressesFor(8453);
const salt = randomSalt();   // or mineSalt({...}) for a vanity `…1978` token address, like the Peddles app
// `creator` is the wallet that will SEND the launch: the token address is bound to it, so nobody who
// copies the salt from a pending transaction can launch at that address. (Robinhood Chain moves to
// the bound contracts later; `addresses.saltBinding` says which a chain uses and the plan follows it.)
const plan = await buildWethLaunchPlan(client, addresses, { salt, creator: user, variant: 0 });   // 0 = plain launch
const { launchFee: launchFeeWei } = await readOrchestratorLaunchFee(client, addresses.orchestrator); // read, never assumed

const feeTerms = { taxBps: 300n, excessToCreatorBps: 5000n };                     // 3%, half the excess to holders
const issue = validateFeeTerms(feeTerms);                                        // null when valid
if (issue) throw new Error(`${issue.field}: ${issue.code}`);

const call = buildWethLaunchCall(
  { name: 'My Coin', symbol: 'MINE', salt, creator: user, feeTerms,
    metadata: { contractUri: '', image: 'ipfs://…', website: '', x: '', telegram: '' },
    plan, devBuyWei: 0n, minTokensOut: 0n, launchFeeWei },
  addresses.orchestrator,
);
const tx = encodeWethLaunchCall(call, addresses.orchestrator);   // { to, data, value } — hand to the wallet

// If it reverts, say why in words:
try { /* send tx */ } catch (e) { console.log(decodeLaunchRevert(e)); }
```

Stock-paired launches use `buildStockLaunchCall` / `encodeStockLaunchCall` with `readStockQuotes()`
(the whitelisted stock legs) and `readStockLaunchFee()`. Clog and NFT helpers live in the root export
(`getClogState`, `clogShareOfInflows`, `graduateAndBuyRequest`, …).

## Snowball launches

A Snowball launch fixes, in the launch transaction and **forever**, how the pool's tax is split **by
volume** between buyback-and-burn, permanent full-range liquidity, the creator and holders, on top
of the platform's fixed 0.50%. Example: a 5% tax = 0.5 platform / 1 burn / 1 LP / 1 creator / 1.5
holders. A per-token `PeddlesSnowballVault` makes the launch call, so **the vault is the creator of
record**: nobody (the creator, Peddles, the protocol Safe) can change the split or switch it off. The
creator's share is forwarded to their wallet; bought-back tokens go to `0x…dEaD`; the vault's
liquidity can never be removed. Describe it in those terms — a split of trading volume — never as a
return or profit.

```ts
import {
  launchAddressesFor, snowballTerms, snowballMinSpend, buildSnowballStockLaunch,
  buildSnowballQuoteLaunch, prepareSnowballQuotePlan, encodeSnowballLaunch, encodeStockApproval,
  readStockLaunchFee, readOrchestratorLaunchFee, readSnowballVault, randomSalt,
} from '@peddles/sdk/launch';

const addresses = launchAddressesFor(8453);          // addresses.snowballFactory: null where not deployed
const split = { burnBps: 100, lpBps: 100, creatorBps: 100, holderBps: 150 };
snowballTerms(split);   // { ok: true, taxBps: 500, excessToCreatorBps: 6250, exact: true } — mirrors termsFor
const salt = randomSalt();

// Stock-paired: approve the FACTORY (not the launchpad) for the first buy; value = the launchpad's fee.
const { launchFee } = await readStockLaunchFee(client, addresses.stockLaunchpad);
const stock = buildSnowballStockLaunch({
  factory: addresses.snowballFactory, name: 'My Coin', symbol: 'MINE', quote, quoteIn, minTokensOut,
  split, minSpend: snowballMinSpend(quoteDecimals), salt, launchFeeWei: launchFee,
});
await wallet.writeContract(stock);                   // { address, abi, functionName, args, value }

// WETH / USDC (Arc) / WBNB (BSC) and Clog: the plan is built for the VAULT, checked live.
const { vault, plan } = await prepareSnowballQuotePlan(client, addresses, { sender: user, salt, variant: 0 });
const fee = await readOrchestratorLaunchFee(client, addresses.orchestrator);
const quoteCall = buildSnowballQuoteLaunch({
  factory: addresses.snowballFactory, orchestrator: addresses.orchestrator, saltBinding: addresses.saltBinding,
  vault, name: 'My Coin', symbol: 'MINE', salt, metadata, plan, devBuyWei, minTokensOut,
  launchFeeWei: fee.launchFee, split, minSpend: snowballMinSpend(18),
});
// Clog types: quoteCall.clogFloorX18 is the opening price, so held-back supply never sells below it.

const state = await readSnowballVault(client, vaultAddress);   // terms, taxBps, buckets, lifetime totals
```

Availability, per chain (`snowballFactoryFor(chainId)`; every Snowball builder throws
`SnowballUnavailableError` on a chain without a factory):

| Chain | Stock-paired | WETH-type / Clog |
| --- | --- | --- |
| Base 8453, BNB Smart Chain 56, Arc 5042, Ethereum 1 | ✅ (Arc and Ethereum show no stock pairs yet) | ✅ |
| Robinhood Chain 4663 | ✅ | ✅ (`saltBinding: 'creator'`) |

Handle launches with Snowball are not deployed yet and are not in this SDK.

## Partner trades — earn on the trades your app routes

`PeddlesPartnerFeeForwarder` (live on Base, Robinhood Chain, BNB Smart Chain, Arc and Ethereum —
`partnerFeeForwarderFor(chainId)`, `null` where absent) splits the platform fee of a trade your app
routes: `partnerShareBps` of it to you (10% at deploy), plus your own fee on top (`partnerFeeBps`, up to
`maxPartnerFeeBps`, 1%). The platform fee is between `minFeeBps` and `maxFeeBps` (0.5%..2%). Both are
taken on the native leg, and the trader's wallet signs the calldata that carries both rates. Read the
terms live with `readPartnerTerms`; never hardcode them.

A trade names you with a **voucher**: Peddles' EIP-712 signature over `PartnerVoucher(partner, expiry)`
for one chain and one forwarder. Prove a payout address on [dev.peddles.xyz/earnings](https://dev.peddles.xyz/earnings),
then fetch vouchers from your server with an API key holding `partner:voucher` (valid up to 30 days;
cache and renew). A voucher can only ever pay the address it names.

```ts
import { buildPartnerBuyRoute, parsePartnerVoucher, readPartnerTerms, partnerFeeSplit } from '@peddles/sdk';

const res = await fetch('https://api.peddles.xyz/api/v1/launch-api/partner/voucher', {
  method: 'POST',
  headers: { 'X-API-Key': process.env.PEDDLES_API_KEY!, 'Content-Type': 'application/json' },
  body: JSON.stringify({ chainIds: [8453] }),
});
const voucher = parsePartnerVoucher((await res.json()).data.vouchers[0]);
const terms = await readPartnerTerms(client, voucher.forwarder);
const request = buildPartnerBuyRoute({
  voucher, terms, chainId: 8453, token, hops: [], value, minOut,
  feeBps: terms.minFeeBps, partnerFeeBps: 25, deadline,
});
await wallet.writeContract({ ...request, account: trader });
partnerFeeSplit(value, terms.minFeeBps, 25, terms.partnerShareBps); // exactly what the contract books
```

Builders for every entry point: `buildPartnerBuyV4` / `buildPartnerSellV4` (ETH-paired launches),
`buildPartnerBuyRoute` / `buildPartnerSellRoute` (every launch type), `buildPartnerBuyExternal` /
`buildPartnerSellExternal` (other v4 tokens), `buildPartnerBuyRoutePancake` / `buildPartnerSellRoutePancake`
(BSC stock legs on PancakeSwap); `encodePartnerCall` gives `{ to, data, value }`. They refuse a voucher
for another chain or forwarder, and rates outside the live terms when you pass `terms`. Your money is
paid to your address inside the trade; a payment that fails is held as `claimable` (`readPartnerClaimable`)
and withdrawn with `buildPartnerWithdraw` by the payout wallet — **an unclaimed balance can be moved to
the Peddles fee wallet 30 days after its last credit.** `partnerVoucherTypedData` /
`partnerVoucherDigest` reproduce the contract's EIP-712 exactly (pinned against `voucherDigest` on the
live Base forwarder).

## Perps

```ts
import { hexToBigInt, numberToHex, type Hex } from 'viem';
import { randomSalt } from '@peddles/sdk/launch';
import {
  perpContracts, readPerpBase, predictPerpToken, predictPerpHook,
  isValidPerpHookAddress, buildPerpCreate, perpFactoryAbi,
} from '@peddles/sdk/perps';

const { factory, hookDeployer, baseCandidates } = perpContracts(8453);   // or 4663; throws elsewhere

// Is the base open for launches, and on what curve? Read live — never from a file.
const weth = await readPerpBase(client, 8453, baseCandidates.WETH);
if (!weth.allowed) throw new Error('perp launches on WETH are closed on this chain');

// 1. The token address (any salt works).
const tokenSalt = randomSalt();
const tokenHash = await client.readContract({ address: factory, abi: perpFactoryAbi,
  functionName: 'tokenInitCodeHash', args: [name, symbol, tokenUri] });
const token = predictPerpToken(factory, tokenSalt, tokenHash);

// 2. MINE the hook salt: v4 reads a hook's permissions from the low 14 bits of its address.
const hookHash = await client.readContract({ address: factory, abi: perpFactoryAbi,
  functionName: 'hookInitCodeHash', args: [token] });
const next = (s: Hex): Hex => numberToHex((hexToBigInt(s) + 1n) % 2n ** 256n, { size: 32 });
let hookSalt = randomSalt(), hook = predictPerpHook(hookDeployer, hookSalt, hookHash);
while (!isValidPerpHookAddress(hook)) {           // ~16k attempts on average — run it in a Web Worker
  hookSalt = next(hookSalt);
  hook = predictPerpHook(hookDeployer, hookSalt, hookHash);
}
// Confirm both with the factory's own predictToken / predictHook before building.

// 3. The call. Not payable; a seed buy (bigint, base units) needs an exact approval to `factory` first.
const tx = buildPerpCreate({ chainId: 8453, name, symbol, tokenUri, base: weth.base,
  tokenSalt, hookSalt, seedBuyBase: 0n, hookAddress: hook });   // { to, data, value: 0n }
```

The Peddles app mines in a Web Worker over a preallocated `0xff ‖ deployer ‖ salt ‖ initCodeHash`
buffer, bumping only the salt bytes — one keccak per attempt. Mining is left to the caller so you
choose where it runs. Neither salt is bound to the sender: a copied pending `create` that lands first
takes the addresses, and the original reverts having paid only gas.

| Chain | Perps |
| --- | --- |
| Base 8453 | ✅ Live |
| Robinhood Chain 4663 | ✅ Live |
| BNB Smart Chain 56 | ✅ Live |
| Arc 5042 | ✅ Live |
| Ethereum 1 | — not deployed (`perpContracts(1)` throws) |

The perp contracts have **no external audit**.

## Solana

Everything for Solana is in its own entry point, `@peddles/sdk/solana`, so an EVM-only app never loads
it. It has **no dependencies**: no `@solana/web3.js`, no `viem`, no SPL or Metaplex packages. It runs
the same code as the Peddles launch form (a parity test checks that the instruction bytes, the account
metas and the compiled transactions are identical). It never holds a key and never signs.

```ts
import {
  prepareSolanaLaunch, simulateTransaction, takePooledSalt, grindPedlSalt,
  PEDDLES_SOLANA_LAUNCH_PROGRAM_ID, WSOL_MINT,
} from '@peddles/sdk/solana';
import { Connection, VersionedTransaction } from '@solana/web3.js'; // optional: any wallet stack works

const rpc = new Connection('https://your-node'); // or a URL, or your own request function
// 1. An 8-byte salt that makes the coin address end in PEDL. Ask the API's pool first; if it has
//    none, grind one (about 22.6M tries on average).
const salt =
  (await takePooledSalt())?.hit.salt ??
  (await grindPedlSalt({ programId: PEDDLES_SOLANA_LAUNCH_PROGRAM_ID, maxTries: 300_000_000, signal }))?.salt;
// 2. Read the chain, check the terms and the quote, then build the transaction.
const launch = await prepareSolanaLaunch({
  rpc, creator: wallet.publicKey.toBase58(), quoteMint: WSOL_MINT,
  name: 'My Coin', symbol: 'MYC', uri: pinnedMetadataUrl, // launchMetadataDocument() builds the JSON to pin
  ratePercent: '2', excessToCreatorBps: 5000,             // 1.25% to 5%; above 1.25% the split is required
  firstBuy: { display: '0.1' },                            // optional, in the units the wallet shows
  salt: salt!,
  expectedFeeLamports: feeShownToCreator,                  // refused if Config's fee has moved since
});
if (!launch.ok) throw new Error(launch.reason);           // the SDK refuses; it never fills in a default
// 3. Dry-run it, then the creator signs. The fee is launch.launchFeeLamports, read live from Config.
const sim = await simulateTransaction(rpc, launch.transaction);
if (sim.err === null) await wallet.signAndSendTransaction(VersionedTransaction.deserialize(launch.transaction));
```

What `prepareSolanaLaunch` checks, and what your integration must keep:

- **The launch fee is read from the program's `Config`** (`launchFeeLamports`). It is never shipped in
  the package. Right now it is the $0.10 testing fee (1,146,526 lamports, read 2026-11-11), until the
  owner puts it back to $2. Show the creator the value you read.
- **The program takes the fee from `Config` when the transaction executes**, not when you build it, and
  the launch carries no maximum. So prepare, show, simulate and sign promptly, and pass the fee you
  showed as `expectedFeeLamports`: if `Config` holds a different fee, `prepareSolanaLaunch` refuses.
  `Config`, the quote's `QuoteConfig`, mint and badge are re-read on every call, even when you pass a
  cached `chainState` (only its lookup table is reused).
- **A stock quote needs a Meteora token badge** (`[b"token_badge", mint]` on DAMM v2), and it must match
  the program's `QuoteConfig`. `checkSolanaQuote` refuses a stock that has no badge. It also refuses a
  quote the program has not enabled, a mint that disagrees with the program's record, and a token its
  issuer has paused, frozen or given a transfer hook.
- **A stock is priced by its live multiplier.** The pool counts raw units, so a stock's dollar value is
  the displayed price × the scaled-UI multiplier read from the mint (`quoteUsdPerWholeRawE18`,
  `openingMarketCapUsdE18`). PreStocks ANTHROPIC is ×10. A first buy given as `display` is scaled the
  same way (`displayToRaw`).
- **PreStocks carry a 1% issuer transfer fee** on every transfer, on top of the launch's terms
  (`quoteRawNeeded` includes it). **Every issuer can pause, seize or hook its token.** Tell the creator
  both.
- Two terms are fixed at launch. The first is the rate traders pay: 1.25% to 5%, in whole basis points,
  never rounded. The second is the creator's share of everything above the two fixed 0.50% legs; holders
  get the rest. Meteora keeps 20% of the pool fee. For the first 3 minutes, buys and sells pay an
  anti-sniper fee that starts at 20% and falls to the rate; the creator's first buy pays only the rate.
  The program's multisig can still upgrade it, so say "Peddles won't change it", never "nobody can".
  Meteora's operator can change a pool's fee after the opening schedule ends (up to 10%); Peddles won't.

The lower-level pieces are exported too:

- **Instruction and transaction:** `deriveLaunchAddresses`, `encodeLaunchData`, `launchAccounts`,
  `buildLaunchTransaction`, `compileV0Transaction` and `readLaunchChainState`.
- **Decoders:** `decodeConfig`, `decodeQuoteConfig`, `decodeMint`, `decodeLaunchRecord`,
  `decodeMeteoraPool` and `decodeMetadata`, among others.
- **Exact fee maths:** `volumeSplit`, `feeSchedule`, `firstBuyOpening`, `firstBuyMaxQuote` and
  `launchDepositsLamports`.

Every amount is a `bigint` in base units.

**Is a mint a real Peddles launch?** `verifyPeddlesMint(mint, programId, getAccount)` (also on the root
export) answers from the chain. A mint is genuine only if the launch program's `LaunchRecord` exists
for it, and Metaplex shows the program's creator address as both the update authority and a verified
creator. The `PEDL` ending proves nothing, because anyone can grind one, so it is not read.
`getAccount` returns `{ owner, data }`, returns `null` for a missing account, and **throws** when the
read fails.

**Which node to use:** the Peddles API's public proxy, `POST https://api.peddles.xyz/api/v1/rpc/solana`,
answers the read methods a launch needs. It does not forward `simulateTransaction` or
`sendTransaction`, so use your own node for those.

## Anubis (6714): launches on Gully Core

Anubis has no Uniswap v4. Peddles launches there go through `PeddlesGullyLaunchpad` on Gully Core, so
it has its own address book and builders: `isGullyChain(6714)` is true and `gullyDeploymentFor(6714)`
returns the core. `supportedChains()` stays the Uniswap v4 list, and every v4 builder still refuses 6714.

- **Gas is DAI, and native value cannot move.** The launch fee and any first buy are paid in the DAI
  ERC-20 (`0x83fd06F0846d9D90B3016bF670Efe2E0B11cDe14`), which the launchpad pulls with `transferFrom`.
  Every transaction the SDK builds for Anubis has `value: 0n`.
- **Approve exactly the fee plus the first buy, then launch.** `buildGullyApproveTx(6714, { launchFee, firstBuy })`
  computes the amount from those two parts, so it is never an unlimited allowance. `planGullyLaunch`
  reads the fee, balance and allowance fresh and returns the approval only when the allowance is short.
- **The fee is read from the chain** (`readGullyLaunchTerms`), never shipped in the package. It is 2 DAI
  today, and the owner can retune it at once, up to a 10 DAI cap. Pass the fee the creator was shown as
  `expectedFee`: if the fee has moved, the plan is refused.
- **Gully adds its own protocol fee to every trade**, on top of the launch's terms: 0.30% each way when
  last read, and Gully can raise it to 0.40%.
- **Holder rewards stream over one hour.** A holder who sells before the stream ends leaves the unpaid
  part to the holders who stay.

```ts
import {
  planGullyLaunch, buildGullyLaunchTx, gullyLaunchRequest, encodeGullyLaunchCall,
  gullyFirstBuyFloorFor, randomGullySalt, predictGullyLaunchToken, GULLY_VARIANT,
} from '@peddles/sdk';

const variant = GULLY_VARIANT.plain; // or GULLY_VARIANT.drip
const salt = randomGullySalt();      // keep it: a retry with the same salt can only make the same coin
const plan = await planGullyLaunch(client, 6714, { creator, variant, firstBuy: 0n, expectedFee: shownFee });
if (plan.approve) await wallet.sendTransaction(plan.approve); // wait for the receipt
const tx = buildGullyLaunchTx(6714, {
  variant, salt, name, symbol,
  metadata: { image, website, x, telegram },
  creatorTaxBps: 300n, excessToCreatorBps: 5000n,
  firstBuy: 0n, minTokensOut: 0n,
});
const coin = await predictGullyLaunchToken(client, 6714, creator, variant, salt);
```

If you include a first buy, simulate the launch first and set the floor from that simulation:
`gullyLaunchRequest({ ...args, minTokensOut: 0n })`, then `eth_call` it, then
`gullyFirstBuyFloorFor(firstBuy, tokensOut)`. `buildGullyLaunchTx` refuses a first buy that has no floor.
`settleGullyLaunch` and the `*GullyPendingLaunch` helpers settle a launch the wallet has already sent,
from the chain, so it is never sent twice.

## Rules the SDK follows — and your integration should too

1. **Money is `bigint` in base units, always.** Never route an amount through a JS `number`. Every
   amount travels with its `decimals`; format only at the render edge. B20 stock legs on Base are
   **8 decimals**, Robinhood's 18, USDG 6.
2. **The chain is the source of truth.** Read a token's name, supply, decimals, pool terms and lock
   status from the chain; use an API only for what the chain can't answer (logos, 24h volume, candles).
3. **No silent defaults.** An unknown chain, token or venue throws. Never fall back to another chain.
4. **A stock token is priced by its multiplier, never one-to-one with the share.**
5. **Metadata is user-supplied and hostile.** Escape it; never render it as HTML.

## Scripts

```bash
npm run build       # dist/
npm test            # unit tests, including constants pinned against the contract sources
npm run typecheck
npm run smoke       # LIVE: every address in the book has code on its chain (read-only, no key)
```

## License

MIT © Peddles
