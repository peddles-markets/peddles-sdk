// GENERATED FILE — DO NOT EDIT.
// Written by script/generate-gully-deployments.mjs from contracts/deployments/<chainId>.json
// (venue gullyCore). Re-run it after any Gully deploy and commit the result.

/**
 * The Peddles core on each Gully Core chain, by chain id. `quoteToken` is the ERC-20 every launch
 * quotes in and pays its launch fee in (DAI on Anubis). `fee` (pips) and `tickSpacing` are the
 * launchpad's immutable pool shape; `rewardStreamSeconds` is the holder-reward stream window the
 * rewards factory was deployed with. The launch fee is NOT here: it is read live.
 */
export const GULLY_DEPLOYMENTS = {
  6714: {
    PeddlesGullyLaunchpad: '0xD01C35110Ed7d608da332620C041627E859Da4DA',
    PeddlesFactoryV20: '0xe8a3f7Bd9aF4cD6e4d899E2139b04a8Bbb3e0ADd',
    PeddlesVaultRegistry: '0x239A6492B40f4576550158B403B6F97927A799fa',
    PeddlesPancakeFeeHook: '0x53edFBD1d70a65C027Bd1605a5e693e42c527E7c',
    PeddlesGullySwapRouter: '0xAe3Cc107De3E846d23dFCa4e6d9b3D1220a1E5d9',
    PeddlesGullyClogVaultFactory: '0xa66543b9aFA80b115eBdb60496c2445AE73104DF',
    PeddlesGullyStreamingRewardsFactory: '0xD3b6668f82D1C71ceC248ec3c9287CC783c3A860',
    quoteToken: '0x83fd06F0846d9D90B3016bF670Efe2E0B11cDe14',
    firstBlock: 18653733,
    fee: 10000,
    tickSpacing: 200,
    rewardStreamSeconds: 3600,
  },
} as const;

export type GullyChainId = keyof typeof GULLY_DEPLOYMENTS;
