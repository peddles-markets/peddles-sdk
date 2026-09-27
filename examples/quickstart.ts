/**
 * The README's examples, type-checked (`npm run typecheck`) so the docs cannot drift from the API.
 * Read-only unless you send the returned transaction yourself.
 */
import { createPublicClient, http, type Address } from 'viem';
import { base } from 'viem/chains';
import { supportedChains, addressOf, getTokenInfo, getPoolTerms, feeSplit, isKnownChain } from '../src/index.js';
import {
  launchAddressesFor,
  buildWethLaunchPlan,
  buildWethLaunchCall,
  encodeWethLaunchCall,
  readOrchestratorLaunchFee,
  randomSalt,
  validateFeeTerms,
  decodeLaunchRevert,
} from '../src/launch/index.js';

export async function readToken(token: Address) {
  const client = createPublicClient({ chain: base, transport: http() });
  if (!isKnownChain(8453)) throw new Error('Base is not in this SDK build');
  const factory = addressOf(8453, 'PeddlesFactoryV20');
  const info = await getTokenInfo(client, token);
  const terms = await getPoolTerms(client, 8453, token);
  const split = feeSplit(terms.creatorTaxBps, terms.excessToCreatorBps, 1_000_000n);
  return { chains: supportedChains(), factory, info, terms, split };
}

export async function buildLaunch(user: Address) {
  const client = createPublicClient({ chain: base, transport: http() });
  const addresses = launchAddressesFor(8453);
  const salt = randomSalt();
  const plan = await buildWethLaunchPlan(client, addresses, { salt, variant: 0 });
  const { launchFee: launchFeeWei } = await readOrchestratorLaunchFee(client, addresses.orchestrator);
  const feeTerms = { taxBps: 300n, excessToCreatorBps: 5000n };
  const issue = validateFeeTerms(feeTerms);
  if (issue) throw new Error(`${issue.field}: ${issue.code}`);
  const call = buildWethLaunchCall(
    {
      name: 'My Coin',
      symbol: 'MINE',
      salt,
      creator: user,
      feeTerms,
      metadata: { contractUri: '', image: '', website: '', x: '', telegram: '' },
      plan,
      devBuyWei: 0n,
      minTokensOut: 0n,
      launchFeeWei,
    },
    addresses.orchestrator,
  );
  return encodeWethLaunchCall(call, addresses.orchestrator); // { to, data, value } for the user's wallet
}

export function explainFailure(error: unknown) {
  return decodeLaunchRevert(error);
}
