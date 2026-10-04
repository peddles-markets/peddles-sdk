<p align="center">
  <img src="https://raw.githubusercontent.com/peddles-markets/peddles-sdk/main/.github/og.png" alt="Peddles — Multi Chain Stock Pairs Launchpad" width="100%" />
</p>

# Peddles SDK

TypeScript SDK for **[Peddles](https://peddles.xyz)** — the multi-chain launchpad for memecoins
**paired against tokenised stocks** (and ETH), with a fixed-at-launch fee model, a built-in
anti-sniper tax and holder rewards paid in the pool's own quote asset.

Read launches from the chain, build launch transactions for your users to sign, and decode what
went wrong when one reverts — with the same code the Peddles app runs.

- 🌐 **Website:** [peddles.xyz](https://peddles.xyz) · **App:** [pro.peddles.xyz](https://pro.peddles.xyz) · **Swap:** [peddleswap.xyz](https://peddleswap.xyz) · **Terminal:** [terminal.peddles.xyz](https://terminal.peddles.xyz)
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

`viem` (v2) is a peer dependency. The package is ESM and ships its TypeScript types.

## Quick start

```ts
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { supportedChains, addressOf, getTokenInfo, getPoolTerms, feeSplit } from '@peddles/sdk';

const client = createPublicClient({ chain: base, transport: http() });

supportedChains();                           // [56, 4663, 5042, 8453]
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
| Base 8453, BNB Smart Chain 56, Arc 5042 | ✅ (Arc shows no stock pairs yet) | ✅ |
| Robinhood Chain 4663 | ✅ | ⏳ needs the creator-bound orchestrator; its Safe batch is not signed yet, so the builders refuse (`saltBinding: 'none'`) |

Handle launches with Snowball are not deployed yet and are not in this SDK.

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

The perp contracts have **no external audit**.

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
