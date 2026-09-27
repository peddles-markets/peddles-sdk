// GENERATED FILE — DO NOT EDIT.
// Written by script/generate-abis.mjs from contracts/out/<File>.sol/<Contract>.json.
// Re-run it after `forge build` and commit the result.

/** `PeddlesFactoryV20` — launch types, their declared economics, and CREATE2 address quoting. */
export const factoryAbi = [
  {
    "type": "function",
    "name": "variantAllocation",
    "inputs": [
      {
        "name": "variant",
        "type": "uint8"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "components": [
          {
            "name": "liquidityBps",
            "type": "uint16"
          },
          {
            "name": "airdropBps",
            "type": "uint16"
          },
          {
            "name": "vestingBps",
            "type": "uint16"
          },
          {
            "name": "burnBps",
            "type": "uint16"
          },
          {
            "name": "clogBps",
            "type": "uint16"
          },
          {
            "name": "clogSliceBps",
            "type": "uint16"
          },
          {
            "name": "clogMinInterval",
            "type": "uint64"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "variantInfo",
    "inputs": [
      {
        "name": "variant",
        "type": "uint8"
      }
    ],
    "outputs": [
      {
        "name": "codePointer",
        "type": "address"
      },
      {
        "name": "creationCodeHash",
        "type": "bytes32"
      },
      {
        "name": "enabled",
        "type": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "isVariantSupported",
    "inputs": [
      {
        "name": "variant",
        "type": "uint8"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getPeddlesAddress",
    "inputs": [
      {
        "name": "variant",
        "type": "uint8"
      },
      {
        "name": "sender",
        "type": "address"
      },
      {
        "name": "salt",
        "type": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "token",
        "type": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "TOKEN_CREATION_CODE_HASH",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "VARIANT_ASSET",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint8"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "VARIANT_CLOG",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint8"
      }
    ],
    "stateMutability": "view"
  }
] as const;

/** `PeddlesClogVault` — the marketing allocation, sold in capped slices. Proceeds stay in the vault until the creator withdraws them. */
export const clogVaultAbi = [
  {
    "type": "function",
    "name": "token",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "creator",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "router",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "sliceCap",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "minInterval",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint64"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "lastRelease",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint64"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "totalSold",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "previewRelease",
    "inputs": [],
    "outputs": [
      {
        "name": "amountIn",
        "type": "uint256"
      },
      {
        "name": "readyAt",
        "type": "uint64"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "release",
    "inputs": [
      {
        "name": "minOut",
        "type": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "out",
        "type": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "releaseFloorX18",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "setReleaseFloor",
    "inputs": [
      {
        "name": "floorX18",
        "type": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "withdrawProceeds",
    "inputs": [
      {
        "name": "to",
        "type": "address"
      }
    ],
    "outputs": [
      {
        "name": "amount",
        "type": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "escapeOpened",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "escape",
    "inputs": [],
    "outputs": [
      {
        "name": "amount",
        "type": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "sweepStray",
    "inputs": [
      {
        "name": "asset",
        "type": "address"
      }
    ],
    "outputs": [
      {
        "name": "amount",
        "type": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "event",
    "name": "Released",
    "inputs": [
      {
        "name": "tokensIn",
        "type": "uint256",
        "indexed": false
      },
      {
        "name": "quoteOut",
        "type": "uint256",
        "indexed": false
      },
      {
        "name": "to",
        "type": "address",
        "indexed": true
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ProceedsWithdrawn",
    "inputs": [
      {
        "name": "to",
        "type": "address",
        "indexed": true
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ReleaseFloorSet",
    "inputs": [
      {
        "name": "floorX18",
        "type": "uint256",
        "indexed": false
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Escaped",
    "inputs": [
      {
        "name": "tokensOut",
        "type": "uint256",
        "indexed": false
      },
      {
        "name": "to",
        "type": "address",
        "indexed": true
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "StraySwept",
    "inputs": [
      {
        "name": "asset",
        "type": "address",
        "indexed": true
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false
      },
      {
        "name": "to",
        "type": "address",
        "indexed": true
      }
    ],
    "anonymous": false
  }
] as const;

/** `PeddlesClogVaultFactory` — where a launch's clog vault lives. */
export const clogVaultFactoryAbi = [
  {
    "type": "function",
    "name": "vaultOf",
    "inputs": [
      {
        "name": "",
        "type": "address"
      },
      {
        "name": "",
        "type": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view"
  }
] as const;

/** ERC-20, narrowed to what a launch read needs (taken from `PeddlesTokenV20`; the shapes are the standard ones). */
export const erc20Abi = [
  {
    "type": "function",
    "name": "name",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "string"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "symbol",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "string"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "decimals",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint8"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "totalSupply",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "balanceOf",
    "inputs": [
      {
        "name": "account",
        "type": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view"
  }
] as const;

/** `PeddlesTokenV20` — the launched token's holder-rewards binding. */
export const tokenV20Abi = [
  {
    "type": "function",
    "name": "holderRewards",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "HOLDER_NOTIFY_GAS",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "error",
    "name": "NotifyGasTooLow",
    "inputs": []
  }
] as const;

/** `PeddlesFeeHook` — every launch pool's permanent terms and the rates they imply. */
export const feeHookAbi = [
  {
    "type": "function",
    "name": "poolConfig",
    "inputs": [
      {
        "name": "poolId",
        "type": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "components": [
          {
            "name": "quote",
            "type": "address"
          },
          {
            "name": "creatorTaxBps",
            "type": "uint16"
          },
          {
            "name": "excessToCreatorBps",
            "type": "uint16"
          },
          {
            "name": "registered",
            "type": "bool"
          },
          {
            "name": "token",
            "type": "address"
          },
          {
            "name": "startBlock",
            "type": "uint32"
          },
          {
            "name": "sniperWindow",
            "type": "uint32"
          },
          {
            "name": "creator",
            "type": "address"
          },
          {
            "name": "creatorPayout",
            "type": "address"
          },
          {
            "name": "rewards",
            "type": "address"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "totalFeeBps",
    "inputs": [
      {
        "name": "poolId",
        "type": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "sniperBlocksRemaining",
    "inputs": [
      {
        "name": "poolId",
        "type": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "holderRewardsFactory",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "PLATFORM_FEE_BPS",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint16"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "CREATOR_FEE_BPS",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint16"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "MIN_CREATOR_TAX_BPS",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint16"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "MAX_CREATOR_TAX_BPS",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint16"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "event",
    "name": "PoolRegistered",
    "inputs": [
      {
        "name": "poolId",
        "type": "bytes32",
        "indexed": true
      },
      {
        "name": "token",
        "type": "address",
        "indexed": true
      },
      {
        "name": "quote",
        "type": "address",
        "indexed": true
      },
      {
        "name": "creator",
        "type": "address",
        "indexed": false
      },
      {
        "name": "creatorTaxBps",
        "type": "uint16",
        "indexed": false
      },
      {
        "name": "excessToCreatorBps",
        "type": "uint16",
        "indexed": false
      },
      {
        "name": "rewards",
        "type": "address",
        "indexed": false
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "FeeAccrued",
    "inputs": [
      {
        "name": "poolId",
        "type": "bytes32",
        "indexed": true
      },
      {
        "name": "quote",
        "type": "address",
        "indexed": true
      },
      {
        "name": "platform",
        "type": "uint256",
        "indexed": false
      },
      {
        "name": "creator",
        "type": "uint256",
        "indexed": false
      },
      {
        "name": "holders",
        "type": "uint256",
        "indexed": false
      },
      {
        "name": "viaBefore",
        "type": "bool",
        "indexed": false
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "SniperFeeAccrued",
    "inputs": [
      {
        "name": "poolId",
        "type": "bytes32",
        "indexed": true
      },
      {
        "name": "quote",
        "type": "address",
        "indexed": true
      },
      {
        "name": "toLiquidity",
        "type": "uint256",
        "indexed": false
      },
      {
        "name": "toCreator",
        "type": "uint256",
        "indexed": false
      },
      {
        "name": "toPlatform",
        "type": "uint256",
        "indexed": false
      },
      {
        "name": "viaBefore",
        "type": "bool",
        "indexed": false
      }
    ],
    "anonymous": false
  }
] as const;

/** `PeddlesStockLaunchpad` — a stock-paired coin's pool id and the hook it is registered with. */
export const stockLaunchpadAbi = [
  {
    "type": "function",
    "name": "coins",
    "inputs": [
      {
        "name": "",
        "type": "address"
      }
    ],
    "outputs": [
      {
        "name": "creator",
        "type": "address"
      },
      {
        "name": "quote",
        "type": "address"
      },
      {
        "name": "poolId",
        "type": "bytes32"
      },
      {
        "name": "positionId",
        "type": "uint256"
      },
      {
        "name": "createdAt",
        "type": "uint64"
      },
      {
        "name": "tokenIsCurrency0",
        "type": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "feeHook",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view"
  }
] as const;

/** `PeddlesHolderRewards` — a launched coin holder rewards (the dust exit and the eligible-supply floor). */
export const holderRewardsAbi = [
  {
    "type": "function",
    "name": "token",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "quote",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "claim",
    "inputs": [],
    "outputs": [
      {
        "name": "amount",
        "type": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "minEligibleSupply",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "sweepableDust",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "sweepDust",
    "inputs": [],
    "outputs": [
      {
        "name": "amount",
        "type": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  }
] as const;

/** `PeddlesNFTFactory` — collection provenance. */
export const nftFactoryAbi = [
  {
    "type": "function",
    "name": "isPeddlesCollection",
    "inputs": [
      {
        "name": "",
        "type": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "isGraduationOperator",
    "inputs": [
      {
        "name": "operator",
        "type": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view"
  }
] as const;

/** `PeddlesArtCollection` — the holder-fee binding and the graduation latch (bonding collections expose the same selectors). */
export const nftCollectionAbi = [
  {
    "type": "function",
    "name": "owner",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "holderRewards",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "setHolderRewards",
    "inputs": [
      {
        "name": "distributor",
        "type": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "graduationReady",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "graduated",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "graduatedToken",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "balanceOf",
    "inputs": [
      {
        "name": "account",
        "type": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view"
  }
] as const;

/** `PeddlesNftFeeDistributorFactory` — one canonical fee distributor per collection (CREATE2, ownerless). */
export const nftFeeDistributorFactoryAbi = [
  {
    "type": "function",
    "name": "predict",
    "inputs": [
      {
        "name": "collection",
        "type": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "create",
    "inputs": [
      {
        "name": "collection",
        "type": "address"
      }
    ],
    "outputs": [
      {
        "name": "distributor",
        "type": "address"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "distributorOf",
    "inputs": [
      {
        "name": "",
        "type": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "isDistributor",
    "inputs": [
      {
        "name": "",
        "type": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "event",
    "name": "DistributorCreated",
    "inputs": [
      {
        "name": "collection",
        "type": "address",
        "indexed": true
      },
      {
        "name": "distributor",
        "type": "address",
        "indexed": true
      }
    ],
    "anonymous": false
  }
] as const;

/** `PeddlesNftFeeDistributor` — an Art->DEX launch split of the creator streams between the collection owner and NFT holders. */
export const nftFeeDistributorAbi = [
  {
    "type": "function",
    "name": "collection",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "quote",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "token",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "holderShareBps",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint16"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "assetsInitialized",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "pending",
    "inputs": [
      {
        "name": "holder",
        "type": "address"
      }
    ],
    "outputs": [
      {
        "name": "pendingQuote",
        "type": "uint256"
      },
      {
        "name": "pendingToken",
        "type": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "sharesOf",
    "inputs": [
      {
        "name": "",
        "type": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "totalShares",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "mirrorComplete",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "creatorShareOwed",
    "inputs": [],
    "outputs": [
      {
        "name": "quoteAmount",
        "type": "uint256"
      },
      {
        "name": "tokenAmount",
        "type": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "owedToHolders",
    "inputs": [],
    "outputs": [
      {
        "name": "quoteOwed",
        "type": "uint256"
      },
      {
        "name": "tokenOwed",
        "type": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "claim",
    "inputs": [],
    "outputs": [
      {
        "name": "quoteAmount",
        "type": "uint256"
      },
      {
        "name": "tokenAmount",
        "type": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "claimCreatorShare",
    "inputs": [
      {
        "name": "to",
        "type": "address"
      }
    ],
    "outputs": [
      {
        "name": "quoteAmount",
        "type": "uint256"
      },
      {
        "name": "tokenAmount",
        "type": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "syncAccount",
    "inputs": [
      {
        "name": "account",
        "type": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "syncAccounts",
    "inputs": [
      {
        "name": "accounts",
        "type": "address[]"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "harvestTokenHolderRewards",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "event",
    "name": "AssetsInitialized",
    "inputs": [
      {
        "name": "quote",
        "type": "address",
        "indexed": true
      },
      {
        "name": "token",
        "type": "address",
        "indexed": true
      },
      {
        "name": "tokenHolderRewards",
        "type": "address",
        "indexed": true
      },
      {
        "name": "holderShareBps",
        "type": "uint16",
        "indexed": false
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "RewardsReceived",
    "inputs": [
      {
        "name": "asset",
        "type": "address",
        "indexed": true
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false
      },
      {
        "name": "toCreator",
        "type": "uint256",
        "indexed": false
      },
      {
        "name": "undistributed",
        "type": "uint256",
        "indexed": false
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Claimed",
    "inputs": [
      {
        "name": "holder",
        "type": "address",
        "indexed": true
      },
      {
        "name": "quoteAmount",
        "type": "uint256",
        "indexed": false
      },
      {
        "name": "tokenAmount",
        "type": "uint256",
        "indexed": false
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "CreatorShareClaimed",
    "inputs": [
      {
        "name": "to",
        "type": "address",
        "indexed": true
      },
      {
        "name": "quoteAmount",
        "type": "uint256",
        "indexed": false
      },
      {
        "name": "tokenAmount",
        "type": "uint256",
        "indexed": false
      }
    ],
    "anonymous": false
  }
] as const;

/** `PeddlesNFTBondingGraduationOrchestratorV20` — a collection launches its WETH-paired coin (`graduateAndBuy`; a plain launch passes 0, 0, 0). */
export const nftBondingGraduationOrchestratorAbi = [
  {
    "type": "function",
    "name": "graduateAndBuy",
    "inputs": [
      {
        "name": "input",
        "type": "tuple",
        "components": [
          {
            "name": "collection",
            "type": "address"
          },
          {
            "name": "variant",
            "type": "uint8"
          },
          {
            "name": "salt",
            "type": "bytes32"
          },
          {
            "name": "params",
            "type": "bytes"
          },
          {
            "name": "initCalls",
            "type": "bytes[]"
          },
          {
            "name": "vaultInput",
            "type": "tuple",
            "components": [
              {
                "name": "token",
                "type": "address"
              },
              {
                "name": "creator",
                "type": "address"
              },
              {
                "name": "liquidityBps",
                "type": "uint16"
              },
              {
                "name": "airdropBps",
                "type": "uint16"
              },
              {
                "name": "vestingBps",
                "type": "uint16"
              },
              {
                "name": "burnBps",
                "type": "uint16"
              },
              {
                "name": "vaultBps",
                "type": "uint16"
              },
              {
                "name": "clogBps",
                "type": "uint16"
              },
              {
                "name": "airdropEnabled",
                "type": "bool"
              },
              {
                "name": "liquidityAmount",
                "type": "uint256"
              },
              {
                "name": "airdropAmount",
                "type": "uint256"
              },
              {
                "name": "vestingAmount",
                "type": "uint256"
              },
              {
                "name": "burnAmount",
                "type": "uint256"
              },
              {
                "name": "vestingStart",
                "type": "uint64"
              },
              {
                "name": "vestingCliff",
                "type": "uint64"
              },
              {
                "name": "vestingDuration",
                "type": "uint64"
              },
              {
                "name": "airdropStartsAt",
                "type": "uint64"
              },
              {
                "name": "airdropEpochLength",
                "type": "uint32"
              },
              {
                "name": "airdropEpochCount",
                "type": "uint16"
              },
              {
                "name": "burnStartsAt",
                "type": "uint64"
              },
              {
                "name": "burnEpochLength",
                "type": "uint32"
              },
              {
                "name": "firstBurnBps",
                "type": "uint16"
              },
              {
                "name": "minVoteBps",
                "type": "uint16"
              },
              {
                "name": "maxVoteBps",
                "type": "uint16"
              },
              {
                "name": "defaultVoteBps",
                "type": "uint16"
              },
              {
                "name": "quoteToken",
                "type": "address"
              },
              {
                "name": "poolManager",
                "type": "address"
              },
              {
                "name": "positionManager",
                "type": "address"
              },
              {
                "name": "hook",
                "type": "address"
              },
              {
                "name": "liquidityManager",
                "type": "address"
              },
              {
                "name": "airdropPublisher",
                "type": "address"
              },
              {
                "name": "fee",
                "type": "uint24"
              },
              {
                "name": "tickSpacing",
                "type": "int24"
              }
            ]
          },
          {
            "name": "creatorTaxBps",
            "type": "uint16"
          },
          {
            "name": "excessToCreatorBps",
            "type": "uint16"
          },
          {
            "name": "factoryValue",
            "type": "uint256"
          },
          {
            "name": "amountPeddles",
            "type": "uint256"
          },
          {
            "name": "sqrtPriceX96",
            "type": "uint160"
          },
          {
            "name": "tickLower",
            "type": "int24"
          },
          {
            "name": "tickUpper",
            "type": "int24"
          },
          {
            "name": "liquidity",
            "type": "uint256"
          }
        ]
      },
      {
        "name": "holderShareBps",
        "type": "uint16"
      },
      {
        "name": "devBuyValue",
        "type": "uint256"
      },
      {
        "name": "minTokensOut",
        "type": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "token",
        "type": "address"
      },
      {
        "name": "vaults",
        "type": "tuple",
        "components": [
          {
            "name": "liquidityVault",
            "type": "address"
          },
          {
            "name": "airdropVault",
            "type": "address"
          },
          {
            "name": "vestingVault",
            "type": "address"
          },
          {
            "name": "burnVault",
            "type": "address"
          }
        ]
      },
      {
        "name": "poolId",
        "type": "bytes32"
      },
      {
        "name": "positionId",
        "type": "uint256"
      },
      {
        "name": "tokensOut",
        "type": "uint256"
      }
    ],
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "nftFeeDistributorFactory",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "launchFee",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "maxLaunchFee",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "launchFeeTreasury",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "setLaunchFee",
    "inputs": [
      {
        "name": "next",
        "type": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "event",
    "name": "NFTBondingGraduatedV20",
    "inputs": [
      {
        "name": "collection",
        "type": "address",
        "indexed": true
      },
      {
        "name": "creator",
        "type": "address",
        "indexed": true
      },
      {
        "name": "token",
        "type": "address",
        "indexed": true
      },
      {
        "name": "liquidityVault",
        "type": "address",
        "indexed": false
      },
      {
        "name": "airdropVault",
        "type": "address",
        "indexed": false
      },
      {
        "name": "vestingVault",
        "type": "address",
        "indexed": false
      },
      {
        "name": "burnVault",
        "type": "address",
        "indexed": false
      },
      {
        "name": "creatorTaxBps",
        "type": "uint16",
        "indexed": false
      },
      {
        "name": "excessToCreatorBps",
        "type": "uint16",
        "indexed": false
      },
      {
        "name": "poolId",
        "type": "bytes32",
        "indexed": false
      },
      {
        "name": "positionId",
        "type": "uint256",
        "indexed": false
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "HolderFeesCommitted",
    "inputs": [
      {
        "name": "collection",
        "type": "address",
        "indexed": true
      },
      {
        "name": "token",
        "type": "address",
        "indexed": true
      },
      {
        "name": "distributor",
        "type": "address",
        "indexed": true
      },
      {
        "name": "poolId",
        "type": "bytes32",
        "indexed": false
      },
      {
        "name": "holderShareBps",
        "type": "uint16",
        "indexed": false
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "DevBought",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "indexed": true
      },
      {
        "name": "buyer",
        "type": "address",
        "indexed": true
      },
      {
        "name": "ethIn",
        "type": "uint256",
        "indexed": false
      },
      {
        "name": "tokensOut",
        "type": "uint256",
        "indexed": false
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "LaunchFeePaid",
    "inputs": [
      {
        "name": "payer",
        "type": "address",
        "indexed": true
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "LaunchFeeUpdated",
    "inputs": [
      {
        "name": "launchFee",
        "type": "uint256",
        "indexed": false
      }
    ],
    "anonymous": false
  }
] as const;

/** `PeddlesNftStockGraduationOrchestrator` — a collection launches its stock-paired coin, directly with terms or by consented relay. */
export const nftStockGraduationOrchestratorAbi = [
  {
    "type": "function",
    "name": "graduateToStockWithTerms",
    "inputs": [
      {
        "name": "g",
        "type": "tuple",
        "components": [
          {
            "name": "collection",
            "type": "address"
          },
          {
            "name": "name",
            "type": "string"
          },
          {
            "name": "symbol",
            "type": "string"
          },
          {
            "name": "quote",
            "type": "address"
          },
          {
            "name": "creatorTaxBps",
            "type": "uint16"
          },
          {
            "name": "excessToCreatorBps",
            "type": "uint16"
          },
          {
            "name": "holderShareBps",
            "type": "uint16"
          },
          {
            "name": "devBuyQuoteIn",
            "type": "uint256"
          },
          {
            "name": "minTokensOut",
            "type": "uint256"
          }
        ]
      }
    ],
    "outputs": [
      {
        "name": "token",
        "type": "address"
      },
      {
        "name": "tokensOut",
        "type": "uint256"
      }
    ],
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "graduateToStock",
    "inputs": [
      {
        "name": "collection",
        "type": "address"
      },
      {
        "name": "name",
        "type": "string"
      },
      {
        "name": "symbol",
        "type": "string"
      },
      {
        "name": "quote",
        "type": "address"
      },
      {
        "name": "holdersBps",
        "type": "uint16"
      }
    ],
    "outputs": [
      {
        "name": "token",
        "type": "address"
      }
    ],
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "setStockGraduationOptIn",
    "inputs": [
      {
        "name": "collection",
        "type": "address"
      },
      {
        "name": "paramsHash",
        "type": "bytes32"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "stockGraduationOptIn",
    "inputs": [
      {
        "name": "",
        "type": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "relayParamsHash",
    "inputs": [
      {
        "name": "collection",
        "type": "address"
      },
      {
        "name": "name",
        "type": "string"
      },
      {
        "name": "symbol",
        "type": "string"
      },
      {
        "name": "quote",
        "type": "address"
      },
      {
        "name": "holdersBps",
        "type": "uint16"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "distributorOf",
    "inputs": [
      {
        "name": "",
        "type": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "nftFeeDistributorFactory",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "event",
    "name": "NftGraduatedToStock",
    "inputs": [
      {
        "name": "collection",
        "type": "address",
        "indexed": true
      },
      {
        "name": "token",
        "type": "address",
        "indexed": true
      },
      {
        "name": "quote",
        "type": "address",
        "indexed": true
      },
      {
        "name": "liquidityVault",
        "type": "address",
        "indexed": false
      },
      {
        "name": "burnVault",
        "type": "address",
        "indexed": false
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "HolderFeesCommitted",
    "inputs": [
      {
        "name": "collection",
        "type": "address",
        "indexed": true
      },
      {
        "name": "token",
        "type": "address",
        "indexed": true
      },
      {
        "name": "distributor",
        "type": "address",
        "indexed": true
      },
      {
        "name": "poolId",
        "type": "bytes32",
        "indexed": false
      },
      {
        "name": "holderShareBps",
        "type": "uint16",
        "indexed": false
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "DevBought",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "indexed": true
      },
      {
        "name": "buyer",
        "type": "address",
        "indexed": true
      },
      {
        "name": "quoteIn",
        "type": "uint256",
        "indexed": false
      },
      {
        "name": "tokensOut",
        "type": "uint256",
        "indexed": false
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "StockGraduationOptInSet",
    "inputs": [
      {
        "name": "collection",
        "type": "address",
        "indexed": true
      },
      {
        "name": "collectionOwner",
        "type": "address",
        "indexed": true
      },
      {
        "name": "paramsHash",
        "type": "bytes32",
        "indexed": false
      }
    ],
    "anonymous": false
  }
] as const;

/** `PeddlesV4LiquidityExecutor` — the pool id of a WETH-paired launch. */
export const liquidityExecutorAbi = [
  {
    "type": "function",
    "name": "poolIdFor",
    "inputs": [
      {
        "name": "token",
        "type": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "hook",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view"
  }
] as const;

/** `PeddlesRouteSwapRouter` — buy or sell any launch with the native asset of its chain through caller-supplied v4 hops (docs/PAY_WITH_ETH.md). Quote by `eth_call`ing the same function from the buyer with `minTokensOut = 0`. */
export const routeSwapRouterAbi = [
  {
    "type": "function",
    "name": "buyWithNative",
    "inputs": [
      {
        "name": "token",
        "type": "address"
      },
      {
        "name": "hops",
        "type": "tuple[]",
        "components": [
          {
            "name": "key",
            "type": "tuple",
            "components": [
              {
                "name": "currency0",
                "type": "address"
              },
              {
                "name": "currency1",
                "type": "address"
              },
              {
                "name": "fee",
                "type": "uint24"
              },
              {
                "name": "tickSpacing",
                "type": "int24"
              },
              {
                "name": "hooks",
                "type": "address"
              }
            ]
          },
          {
            "name": "zeroForOne",
            "type": "bool"
          }
        ]
      },
      {
        "name": "minTokensOut",
        "type": "uint256"
      },
      {
        "name": "to",
        "type": "address"
      },
      {
        "name": "deadline",
        "type": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "tokenOut",
        "type": "uint256"
      }
    ],
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "sellForNative",
    "inputs": [
      {
        "name": "token",
        "type": "address"
      },
      {
        "name": "amountIn",
        "type": "uint256"
      },
      {
        "name": "hops",
        "type": "tuple[]",
        "components": [
          {
            "name": "key",
            "type": "tuple",
            "components": [
              {
                "name": "currency0",
                "type": "address"
              },
              {
                "name": "currency1",
                "type": "address"
              },
              {
                "name": "fee",
                "type": "uint24"
              },
              {
                "name": "tickSpacing",
                "type": "int24"
              },
              {
                "name": "hooks",
                "type": "address"
              }
            ]
          },
          {
            "name": "zeroForOne",
            "type": "bool"
          }
        ]
      },
      {
        "name": "minNativeOut",
        "type": "uint256"
      },
      {
        "name": "to",
        "type": "address"
      },
      {
        "name": "deadline",
        "type": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "nativeOut",
        "type": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "sweepStray",
    "inputs": [
      {
        "name": "asset",
        "type": "address"
      }
    ],
    "outputs": [
      {
        "name": "amount",
        "type": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "WETH",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "nativeScale",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "launchpad",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "poolManager",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "stockSwapRouter",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "v4SwapRouter",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "treasury",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "event",
    "name": "BoughtWithNative",
    "inputs": [
      {
        "name": "payer",
        "type": "address",
        "indexed": true
      },
      {
        "name": "token",
        "type": "address",
        "indexed": true
      },
      {
        "name": "nativeIn",
        "type": "uint256",
        "indexed": false
      },
      {
        "name": "tokenOut",
        "type": "uint256",
        "indexed": false
      },
      {
        "name": "to",
        "type": "address",
        "indexed": false
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "SoldForNative",
    "inputs": [
      {
        "name": "payer",
        "type": "address",
        "indexed": true
      },
      {
        "name": "token",
        "type": "address",
        "indexed": true
      },
      {
        "name": "tokenIn",
        "type": "uint256",
        "indexed": false
      },
      {
        "name": "nativeOut",
        "type": "uint256",
        "indexed": false
      },
      {
        "name": "to",
        "type": "address",
        "indexed": false
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "NativeRefunded",
    "inputs": [
      {
        "name": "payer",
        "type": "address",
        "indexed": true
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "QuoteRefunded",
    "inputs": [
      {
        "name": "payer",
        "type": "address",
        "indexed": true
      },
      {
        "name": "quote",
        "type": "address",
        "indexed": true
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "StraySwept",
    "inputs": [
      {
        "name": "asset",
        "type": "address",
        "indexed": true
      },
      {
        "name": "to",
        "type": "address",
        "indexed": true
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "BadPath",
    "inputs": []
  },
  {
    "type": "error",
    "name": "PartialFill",
    "inputs": []
  },
  {
    "type": "error",
    "name": "Slippage",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NoOutput",
    "inputs": []
  },
  {
    "type": "error",
    "name": "Expired",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidAmount",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidAddress",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NativeNotAllowed",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NothingToSweep",
    "inputs": []
  }
] as const;
