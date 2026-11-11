/**
 * ABI fragments for a launch on `PeddlesGullyLaunchpad` (Gully Core, Anubis 6714), typed by hand from
 * `contracts/src/gully/PeddlesGullyLaunchpad.sol` and held identical to the web app's
 * `features/launch/gullyLaunchCall.ts` by test (every function and event the web signs or reads has
 * the same selector here).
 */

/**
 * Custom errors a launch can bubble up: the swap router's floor on the first buy (`SlippageExceeded`,
 * `PeddlesGullySwapRouter.sol`) and the fee hook's registration refusals (`PeddlesPancakeFeeHook.sol`).
 * The launchpad itself reverts with strings.
 */
export const gullyErrorsAbi = [
  { type: 'error', name: 'SlippageExceeded', inputs: [] },
  { type: 'error', name: 'FeeAboveCap', inputs: [] },
  { type: 'error', name: 'FeeBelowFloor', inputs: [] },
  { type: 'error', name: 'AlreadyRegistered', inputs: [] },
  { type: 'error', name: 'NotRegistrar', inputs: [] },
] as const;

const launchInputComponents = [
  { name: 'variant', type: 'uint8' },
  { name: 'salt', type: 'bytes32' },
  { name: 'name', type: 'string' },
  { name: 'symbol', type: 'string' },
  { name: 'metadataCalls', type: 'bytes[]' },
  { name: 'creatorTaxBps', type: 'uint16' },
  { name: 'excessToCreatorBps', type: 'uint16' },
] as const;

const addressView = (name: string) =>
  ({ type: 'function', name, stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] }) as const;

export const gullyLaunchpadAbi = [
  ...gullyErrorsAbi,
  {
    type: 'function',
    name: 'launch',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'input', type: 'tuple', components: launchInputComponents }],
    outputs: [
      { name: 'token', type: 'address' },
      { name: 'poolId', type: 'bytes32' },
      { name: 'positionId', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'launchAndBuy',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'input', type: 'tuple', components: launchInputComponents },
      { name: 'devBuyQuote', type: 'uint256' },
      { name: 'minTokensOut', type: 'uint256' },
    ],
    outputs: [
      { name: 'token', type: 'address' },
      { name: 'poolId', type: 'bytes32' },
      { name: 'positionId', type: 'uint256' },
      { name: 'tokensOut', type: 'uint256' },
    ],
  },
  { type: 'function', name: 'launchFee', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'maxLaunchFee', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  addressView('feeToken'),
  addressView('quoteToken'),
  addressView('tokenFactory'),
  addressView('feeHook'),
  addressView('treasury'),
  { type: 'function', name: 'fee', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint24' }] },
  { type: 'function', name: 'tickSpacing', stateMutability: 'view', inputs: [], outputs: [{ type: 'int24' }] },
  {
    type: 'function',
    name: 'launchSalt',
    stateMutability: 'pure',
    inputs: [
      { name: 'creator', type: 'address' },
      { name: 'salt', type: 'bytes32' },
    ],
    outputs: [{ type: 'bytes32' }],
  },
  {
    type: 'function',
    name: 'predictLaunchToken',
    stateMutability: 'view',
    inputs: [
      { name: 'creator', type: 'address' },
      { name: 'variant', type: 'uint8' },
      { name: 'salt', type: 'bytes32' },
    ],
    outputs: [{ type: 'address' }],
  },
  { type: 'function', name: 'positionIdOf', stateMutability: 'view', inputs: [{ name: 'token', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'poolIdFor', stateMutability: 'view', inputs: [{ name: 'token', type: 'address' }], outputs: [{ type: 'bytes32' }] },
  { type: 'function', name: 'lpIsLocked', stateMutability: 'view', inputs: [{ name: 'token', type: 'address' }], outputs: [{ type: 'bool' }] },
  {
    type: 'event',
    name: 'PeddlesLaunchedV20',
    inputs: [
      { name: 'token', type: 'address', indexed: true },
      { name: 'creator', type: 'address', indexed: true },
      { name: 'salt', type: 'bytes32', indexed: true },
      { name: 'liquidityVault', type: 'address', indexed: false },
      { name: 'airdropVault', type: 'address', indexed: false },
      { name: 'vestingVault', type: 'address', indexed: false },
      { name: 'burnVault', type: 'address', indexed: false },
      { name: 'creatorTaxBps', type: 'uint16', indexed: false },
      { name: 'excessToCreatorBps', type: 'uint16', indexed: false },
      { name: 'poolId', type: 'bytes32', indexed: false },
      { name: 'positionId', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'LaunchFeePaid',
    inputs: [
      { name: 'payer', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'DevBought',
    inputs: [
      { name: 'token', type: 'address', indexed: true },
      { name: 'buyer', type: 'address', indexed: true },
      { name: 'quoteIn', type: 'uint256', indexed: false },
      { name: 'tokensOut', type: 'uint256', indexed: false },
    ],
  },
] as const;

/** The token factory's registry, as the launchpad checks it (`isVariantSupported`, `variantAllocation`). */
export const gullyTokenFactoryAbi = [
  { type: 'function', name: 'isVariantSupported', stateMutability: 'view', inputs: [{ name: 'variant', type: 'uint8' }], outputs: [{ type: 'bool' }] },
  {
    type: 'function',
    name: 'variantAllocation',
    stateMutability: 'view',
    inputs: [{ name: 'variant', type: 'uint8' }],
    outputs: [
      {
        type: 'tuple',
        components: [
          { name: 'liquidityBps', type: 'uint16' },
          { name: 'airdropBps', type: 'uint16' },
          { name: 'vestingBps', type: 'uint16' },
          { name: 'burnBps', type: 'uint16' },
          { name: 'clogBps', type: 'uint16' },
          { name: 'clogSliceBps', type: 'uint16' },
          { name: 'clogMinInterval', type: 'uint64' },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'variantInfo',
    stateMutability: 'view',
    inputs: [{ name: 'variant', type: 'uint8' }],
    outputs: [
      { name: 'codePointer', type: 'address' },
      { name: 'creationCodeHash', type: 'bytes32' },
      { name: 'enabled', type: 'bool' },
    ],
  },
] as const;

/** The quote ERC-20 (DAI on Anubis): balance, allowance and the exact-amount approval. */
export const gullyQuoteTokenAbi = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'a', type: 'address' }], outputs: [{ type: 'uint256' }] },
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
] as const;

/** The two metadata writes the launchpad lets a creator put in the launch (`metadataCalls`). */
export const gullyTokenMetadataAbi = [
  { type: 'function', name: 'updateContractURI', stateMutability: 'nonpayable', inputs: [{ name: 'uri', type: 'string' }], outputs: [] },
  {
    type: 'function',
    name: 'updateExtraMetadata',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'key', type: 'string' },
      { name: 'value', type: 'string' },
    ],
    outputs: [],
  },
] as const;
