// GENERATED FILE — DO NOT EDIT.
// Written by script/generate-launch-abis.mjs from contracts/out/<File>.sol/<Contract>.json.
// Re-run it after `forge build` and commit the result.

/** `PeddlesLaunchOrchestratorV20` — the WETH-type launch entrypoints, the reads a launch plan needs, and the launch event. */
export const launchOrchestratorAbi = [
  {
    "type": "function",
    "name": "launch",
    "inputs": [
      {
        "name": "input",
        "type": "tuple",
        "internalType": "struct PeddlesLaunchOrchestratorV20.LaunchInput",
        "components": [
          {
            "name": "variant",
            "type": "uint8",
            "internalType": "uint8"
          },
          {
            "name": "salt",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "params",
            "type": "bytes",
            "internalType": "bytes"
          },
          {
            "name": "initCalls",
            "type": "bytes[]",
            "internalType": "bytes[]"
          },
          {
            "name": "vaultInput",
            "type": "tuple",
            "internalType": "struct PeddlesVaultFactoryV20.CreateVaultsInput",
            "components": [
              {
                "name": "token",
                "type": "address",
                "internalType": "address"
              },
              {
                "name": "creator",
                "type": "address",
                "internalType": "address"
              },
              {
                "name": "liquidityBps",
                "type": "uint16",
                "internalType": "uint16"
              },
              {
                "name": "airdropBps",
                "type": "uint16",
                "internalType": "uint16"
              },
              {
                "name": "vestingBps",
                "type": "uint16",
                "internalType": "uint16"
              },
              {
                "name": "burnBps",
                "type": "uint16",
                "internalType": "uint16"
              },
              {
                "name": "vaultBps",
                "type": "uint16",
                "internalType": "uint16"
              },
              {
                "name": "clogBps",
                "type": "uint16",
                "internalType": "uint16"
              },
              {
                "name": "airdropEnabled",
                "type": "bool",
                "internalType": "bool"
              },
              {
                "name": "liquidityAmount",
                "type": "uint256",
                "internalType": "uint256"
              },
              {
                "name": "airdropAmount",
                "type": "uint256",
                "internalType": "uint256"
              },
              {
                "name": "vestingAmount",
                "type": "uint256",
                "internalType": "uint256"
              },
              {
                "name": "burnAmount",
                "type": "uint256",
                "internalType": "uint256"
              },
              {
                "name": "vestingStart",
                "type": "uint64",
                "internalType": "uint64"
              },
              {
                "name": "vestingCliff",
                "type": "uint64",
                "internalType": "uint64"
              },
              {
                "name": "vestingDuration",
                "type": "uint64",
                "internalType": "uint64"
              },
              {
                "name": "airdropStartsAt",
                "type": "uint64",
                "internalType": "uint64"
              },
              {
                "name": "airdropEpochLength",
                "type": "uint32",
                "internalType": "uint32"
              },
              {
                "name": "airdropEpochCount",
                "type": "uint16",
                "internalType": "uint16"
              },
              {
                "name": "burnStartsAt",
                "type": "uint64",
                "internalType": "uint64"
              },
              {
                "name": "burnEpochLength",
                "type": "uint32",
                "internalType": "uint32"
              },
              {
                "name": "firstBurnBps",
                "type": "uint16",
                "internalType": "uint16"
              },
              {
                "name": "minVoteBps",
                "type": "uint16",
                "internalType": "uint16"
              },
              {
                "name": "maxVoteBps",
                "type": "uint16",
                "internalType": "uint16"
              },
              {
                "name": "defaultVoteBps",
                "type": "uint16",
                "internalType": "uint16"
              },
              {
                "name": "quoteToken",
                "type": "address",
                "internalType": "address"
              },
              {
                "name": "poolManager",
                "type": "address",
                "internalType": "address"
              },
              {
                "name": "positionManager",
                "type": "address",
                "internalType": "address"
              },
              {
                "name": "hook",
                "type": "address",
                "internalType": "address"
              },
              {
                "name": "liquidityManager",
                "type": "address",
                "internalType": "address"
              },
              {
                "name": "airdropPublisher",
                "type": "address",
                "internalType": "address"
              },
              {
                "name": "fee",
                "type": "uint24",
                "internalType": "uint24"
              },
              {
                "name": "tickSpacing",
                "type": "int24",
                "internalType": "int24"
              }
            ]
          },
          {
            "name": "creatorTaxBps",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "excessToCreatorBps",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "factoryValue",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "amountPeddles",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "sqrtPriceX96",
            "type": "uint160",
            "internalType": "uint160"
          },
          {
            "name": "tickLower",
            "type": "int24",
            "internalType": "int24"
          },
          {
            "name": "tickUpper",
            "type": "int24",
            "internalType": "int24"
          },
          {
            "name": "liquidity",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      }
    ],
    "outputs": [
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "vaults",
        "type": "tuple",
        "internalType": "struct IPeddlesVaultRegistryV20.VaultSet",
        "components": [
          {
            "name": "liquidityVault",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "airdropVault",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "vestingVault",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "burnVault",
            "type": "address",
            "internalType": "address"
          }
        ]
      },
      {
        "name": "poolId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "positionId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "launchAndBuy",
    "inputs": [
      {
        "name": "input",
        "type": "tuple",
        "internalType": "struct PeddlesLaunchOrchestratorV20.LaunchInput",
        "components": [
          {
            "name": "variant",
            "type": "uint8",
            "internalType": "uint8"
          },
          {
            "name": "salt",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "params",
            "type": "bytes",
            "internalType": "bytes"
          },
          {
            "name": "initCalls",
            "type": "bytes[]",
            "internalType": "bytes[]"
          },
          {
            "name": "vaultInput",
            "type": "tuple",
            "internalType": "struct PeddlesVaultFactoryV20.CreateVaultsInput",
            "components": [
              {
                "name": "token",
                "type": "address",
                "internalType": "address"
              },
              {
                "name": "creator",
                "type": "address",
                "internalType": "address"
              },
              {
                "name": "liquidityBps",
                "type": "uint16",
                "internalType": "uint16"
              },
              {
                "name": "airdropBps",
                "type": "uint16",
                "internalType": "uint16"
              },
              {
                "name": "vestingBps",
                "type": "uint16",
                "internalType": "uint16"
              },
              {
                "name": "burnBps",
                "type": "uint16",
                "internalType": "uint16"
              },
              {
                "name": "vaultBps",
                "type": "uint16",
                "internalType": "uint16"
              },
              {
                "name": "clogBps",
                "type": "uint16",
                "internalType": "uint16"
              },
              {
                "name": "airdropEnabled",
                "type": "bool",
                "internalType": "bool"
              },
              {
                "name": "liquidityAmount",
                "type": "uint256",
                "internalType": "uint256"
              },
              {
                "name": "airdropAmount",
                "type": "uint256",
                "internalType": "uint256"
              },
              {
                "name": "vestingAmount",
                "type": "uint256",
                "internalType": "uint256"
              },
              {
                "name": "burnAmount",
                "type": "uint256",
                "internalType": "uint256"
              },
              {
                "name": "vestingStart",
                "type": "uint64",
                "internalType": "uint64"
              },
              {
                "name": "vestingCliff",
                "type": "uint64",
                "internalType": "uint64"
              },
              {
                "name": "vestingDuration",
                "type": "uint64",
                "internalType": "uint64"
              },
              {
                "name": "airdropStartsAt",
                "type": "uint64",
                "internalType": "uint64"
              },
              {
                "name": "airdropEpochLength",
                "type": "uint32",
                "internalType": "uint32"
              },
              {
                "name": "airdropEpochCount",
                "type": "uint16",
                "internalType": "uint16"
              },
              {
                "name": "burnStartsAt",
                "type": "uint64",
                "internalType": "uint64"
              },
              {
                "name": "burnEpochLength",
                "type": "uint32",
                "internalType": "uint32"
              },
              {
                "name": "firstBurnBps",
                "type": "uint16",
                "internalType": "uint16"
              },
              {
                "name": "minVoteBps",
                "type": "uint16",
                "internalType": "uint16"
              },
              {
                "name": "maxVoteBps",
                "type": "uint16",
                "internalType": "uint16"
              },
              {
                "name": "defaultVoteBps",
                "type": "uint16",
                "internalType": "uint16"
              },
              {
                "name": "quoteToken",
                "type": "address",
                "internalType": "address"
              },
              {
                "name": "poolManager",
                "type": "address",
                "internalType": "address"
              },
              {
                "name": "positionManager",
                "type": "address",
                "internalType": "address"
              },
              {
                "name": "hook",
                "type": "address",
                "internalType": "address"
              },
              {
                "name": "liquidityManager",
                "type": "address",
                "internalType": "address"
              },
              {
                "name": "airdropPublisher",
                "type": "address",
                "internalType": "address"
              },
              {
                "name": "fee",
                "type": "uint24",
                "internalType": "uint24"
              },
              {
                "name": "tickSpacing",
                "type": "int24",
                "internalType": "int24"
              }
            ]
          },
          {
            "name": "creatorTaxBps",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "excessToCreatorBps",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "factoryValue",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "amountPeddles",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "sqrtPriceX96",
            "type": "uint160",
            "internalType": "uint160"
          },
          {
            "name": "tickLower",
            "type": "int24",
            "internalType": "int24"
          },
          {
            "name": "tickUpper",
            "type": "int24",
            "internalType": "int24"
          },
          {
            "name": "liquidity",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      },
      {
        "name": "devBuyValue",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "minTokensOut",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "vaults",
        "type": "tuple",
        "internalType": "struct IPeddlesVaultRegistryV20.VaultSet",
        "components": [
          {
            "name": "liquidityVault",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "airdropVault",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "vestingVault",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "burnVault",
            "type": "address",
            "internalType": "address"
          }
        ]
      },
      {
        "name": "poolId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "positionId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "tokensOut",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "LAUNCH_SALT_DOMAIN",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "launchSalt",
    "inputs": [
      {
        "name": "creator",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "salt",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "pure"
  },
  {
    "type": "function",
    "name": "predictLaunchToken",
    "inputs": [
      {
        "name": "creator",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "variant",
        "type": "uint8",
        "internalType": "uint8"
      },
      {
        "name": "salt",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
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
        "type": "address",
        "internalType": "contract IPeddlesFeeHookV20"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "airdropPublisher",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "clogVaultFactory",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "defaultLiquidityBps",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint16",
        "internalType": "uint16"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "defaultAirdropBps",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint16",
        "internalType": "uint16"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "defaultVestingBps",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint16",
        "internalType": "uint16"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "defaultBurnBps",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint16",
        "internalType": "uint16"
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
        "type": "uint256",
        "internalType": "uint256"
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
        "type": "uint256",
        "internalType": "uint256"
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
        "type": "address",
        "internalType": "address"
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
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "event",
    "name": "PeddlesLaunchedV20",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "creator",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "salt",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "liquidityVault",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      },
      {
        "name": "airdropVault",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      },
      {
        "name": "vestingVault",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      },
      {
        "name": "burnVault",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      },
      {
        "name": "creatorTaxBps",
        "type": "uint16",
        "indexed": false,
        "internalType": "uint16"
      },
      {
        "name": "excessToCreatorBps",
        "type": "uint16",
        "indexed": false,
        "internalType": "uint16"
      },
      {
        "name": "poolId",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      },
      {
        "name": "positionId",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
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
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
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
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  }
] as const;

/** `PeddlesStockLaunchpad` — the stock-paired launch entrypoints (both `createCoin` overloads), the launch fee, the quote whitelist, the CREATE2 inputs and the launch event. */
export const stockLaunchpadLaunchAbi = [
  {
    "type": "function",
    "name": "createCoin",
    "inputs": [
      {
        "name": "name",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "symbol",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "quote",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "creatorTaxBps",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "excessToCreatorBps",
        "type": "uint16",
        "internalType": "uint16"
      }
    ],
    "outputs": [
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "createCoin",
    "inputs": [
      {
        "name": "name",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "symbol",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "quote",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "creatorTaxBps",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "excessToCreatorBps",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "salt",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "createCoinAndBuy",
    "inputs": [
      {
        "name": "name",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "symbol",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "quote",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "creatorTaxBps",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "excessToCreatorBps",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "salt",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "quoteIn",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "minTokensOut",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "tokensOut",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "launchFee",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
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
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "COIN_VARIANT",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint8",
        "internalType": "uint8"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "coinInitCodeHash",
    "inputs": [
      {
        "name": "name",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "symbol",
        "type": "string",
        "internalType": "string"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "pure"
  },
  {
    "type": "function",
    "name": "predictCoin",
    "inputs": [
      {
        "name": "creator",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "salt",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "name",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "symbol",
        "type": "string",
        "internalType": "string"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "quoteConfig",
    "inputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "allowed",
        "type": "bool",
        "internalType": "bool"
      },
      {
        "name": "configured",
        "type": "bool",
        "internalType": "bool"
      },
      {
        "name": "startTick",
        "type": "int24",
        "internalType": "int24"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "quoteCount",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "allQuotes",
    "inputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
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
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "TOTAL_SUPPLY",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "liquidityBps",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint16",
        "internalType": "uint16"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "airdropBps",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint16",
        "internalType": "uint16"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "vestingBps",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint16",
        "internalType": "uint16"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "burnBps",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint16",
        "internalType": "uint16"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "event",
    "name": "CoinCreated",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "creator",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "quote",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "poolId",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      },
      {
        "name": "positionId",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "sqrtPriceX96",
        "type": "uint160",
        "indexed": false,
        "internalType": "uint160"
      },
      {
        "name": "name",
        "type": "string",
        "indexed": false,
        "internalType": "string"
      },
      {
        "name": "symbol",
        "type": "string",
        "indexed": false,
        "internalType": "string"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "AIRDROP_FUNDING",
    "inputs": []
  },
  {
    "type": "error",
    "name": "BPS_RANGE",
    "inputs": []
  },
  {
    "type": "error",
    "name": "BPS_SUM",
    "inputs": []
  },
  {
    "type": "error",
    "name": "BurnFunding",
    "inputs": []
  },
  {
    "type": "error",
    "name": "DevBuySlippage",
    "inputs": []
  },
  {
    "type": "error",
    "name": "FEE_ABOVE_CAP",
    "inputs": []
  },
  {
    "type": "error",
    "name": "FEE_TRANSFER_FAILED",
    "inputs": []
  },
  {
    "type": "error",
    "name": "LAUNCH_FEE_REQUIRED",
    "inputs": []
  },
  {
    "type": "error",
    "name": "LiquidityFunding",
    "inputs": []
  },
  {
    "type": "error",
    "name": "LiquidityOverflow",
    "inputs": []
  },
  {
    "type": "error",
    "name": "MulDivOverflow",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NOTHING_TO_CLAIM",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NOT_OWNER",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NO_AIRDROP_PUBLISHER",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NO_LAUNCH_BURN",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NO_VESTING",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NoDevBuy",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NoSwapRouter",
    "inputs": []
  },
  {
    "type": "error",
    "name": "PERMIT2_APPROVE",
    "inputs": []
  },
  {
    "type": "error",
    "name": "POOL_INIT_FAILED",
    "inputs": []
  },
  {
    "type": "error",
    "name": "POOL_PRICE_MISMATCH",
    "inputs": []
  },
  {
    "type": "error",
    "name": "PositionNotMinted",
    "inputs": []
  },
  {
    "type": "error",
    "name": "QUOTE_NOT_ALLOWED",
    "inputs": []
  },
  {
    "type": "error",
    "name": "QUOTE_TRANSFER",
    "inputs": []
  },
  {
    "type": "error",
    "name": "QuoteApproveFailed",
    "inputs": []
  },
  {
    "type": "error",
    "name": "QuotePullFailed",
    "inputs": []
  },
  {
    "type": "error",
    "name": "QuoteRefundFailed",
    "inputs": []
  },
  {
    "type": "error",
    "name": "REENTRANT",
    "inputs": []
  },
  {
    "type": "error",
    "name": "REFUND_FAILED",
    "inputs": []
  },
  {
    "type": "error",
    "name": "RouterWriteOnce",
    "inputs": []
  },
  {
    "type": "error",
    "name": "SkimFailed",
    "inputs": []
  },
  {
    "type": "error",
    "name": "SkimOwed",
    "inputs": []
  },
  {
    "type": "error",
    "name": "SweepFailed",
    "inputs": []
  },
  {
    "type": "error",
    "name": "TOKEN_TRANSFER",
    "inputs": []
  },
  {
    "type": "error",
    "name": "TickHigh",
    "inputs": []
  },
  {
    "type": "error",
    "name": "TickLow",
    "inputs": []
  },
  {
    "type": "error",
    "name": "TickRange",
    "inputs": []
  },
  {
    "type": "error",
    "name": "UNKNOWN_COIN",
    "inputs": []
  },
  {
    "type": "error",
    "name": "VestingFunding",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ZERO_ADDR",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ZERO_FEE_HOOK",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ZERO_LIQUIDITY",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ZERO_OWNER",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ZERO_QUOTE",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ZERO_TREASURY",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ZERO_V4",
    "inputs": []
  }
] as const;

/** `PeddlesHandleLauncher` — handle launches: both entrypoints, the wallet-bound salt and its two predictors, and the launch event. */
export const handleLauncherLaunchAbi = [
  {
    "type": "function",
    "name": "launchStock",
    "inputs": [
      {
        "name": "ticket",
        "type": "tuple",
        "internalType": "struct PeddlesHandleLauncher.Ticket",
        "components": [
          {
            "name": "xUserId",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "handleHash",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "deadline",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "sig",
            "type": "bytes",
            "internalType": "bytes"
          }
        ]
      },
      {
        "name": "name",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "symbol",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "quote",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "creatorTaxBps",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "excessToCreatorBps",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "salt",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "quoteIn",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "minTokensOut",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "tokensOut",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "launchQuote",
    "inputs": [
      {
        "name": "ticket",
        "type": "tuple",
        "internalType": "struct PeddlesHandleLauncher.Ticket",
        "components": [
          {
            "name": "xUserId",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "handleHash",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "deadline",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "sig",
            "type": "bytes",
            "internalType": "bytes"
          }
        ]
      },
      {
        "name": "input",
        "type": "tuple",
        "internalType": "struct IHandleOrchestrator.LaunchInput",
        "components": [
          {
            "name": "variant",
            "type": "uint8",
            "internalType": "uint8"
          },
          {
            "name": "salt",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "params",
            "type": "bytes",
            "internalType": "bytes"
          },
          {
            "name": "initCalls",
            "type": "bytes[]",
            "internalType": "bytes[]"
          },
          {
            "name": "vaultInput",
            "type": "tuple",
            "internalType": "struct IHandleOrchestrator.CreateVaultsInput",
            "components": [
              {
                "name": "token",
                "type": "address",
                "internalType": "address"
              },
              {
                "name": "creator",
                "type": "address",
                "internalType": "address"
              },
              {
                "name": "liquidityBps",
                "type": "uint16",
                "internalType": "uint16"
              },
              {
                "name": "airdropBps",
                "type": "uint16",
                "internalType": "uint16"
              },
              {
                "name": "vestingBps",
                "type": "uint16",
                "internalType": "uint16"
              },
              {
                "name": "burnBps",
                "type": "uint16",
                "internalType": "uint16"
              },
              {
                "name": "vaultBps",
                "type": "uint16",
                "internalType": "uint16"
              },
              {
                "name": "clogBps",
                "type": "uint16",
                "internalType": "uint16"
              },
              {
                "name": "airdropEnabled",
                "type": "bool",
                "internalType": "bool"
              },
              {
                "name": "liquidityAmount",
                "type": "uint256",
                "internalType": "uint256"
              },
              {
                "name": "airdropAmount",
                "type": "uint256",
                "internalType": "uint256"
              },
              {
                "name": "vestingAmount",
                "type": "uint256",
                "internalType": "uint256"
              },
              {
                "name": "burnAmount",
                "type": "uint256",
                "internalType": "uint256"
              },
              {
                "name": "vestingStart",
                "type": "uint64",
                "internalType": "uint64"
              },
              {
                "name": "vestingCliff",
                "type": "uint64",
                "internalType": "uint64"
              },
              {
                "name": "vestingDuration",
                "type": "uint64",
                "internalType": "uint64"
              },
              {
                "name": "airdropStartsAt",
                "type": "uint64",
                "internalType": "uint64"
              },
              {
                "name": "airdropEpochLength",
                "type": "uint32",
                "internalType": "uint32"
              },
              {
                "name": "airdropEpochCount",
                "type": "uint16",
                "internalType": "uint16"
              },
              {
                "name": "burnStartsAt",
                "type": "uint64",
                "internalType": "uint64"
              },
              {
                "name": "burnEpochLength",
                "type": "uint32",
                "internalType": "uint32"
              },
              {
                "name": "firstBurnBps",
                "type": "uint16",
                "internalType": "uint16"
              },
              {
                "name": "minVoteBps",
                "type": "uint16",
                "internalType": "uint16"
              },
              {
                "name": "maxVoteBps",
                "type": "uint16",
                "internalType": "uint16"
              },
              {
                "name": "defaultVoteBps",
                "type": "uint16",
                "internalType": "uint16"
              },
              {
                "name": "quoteToken",
                "type": "address",
                "internalType": "address"
              },
              {
                "name": "poolManager",
                "type": "address",
                "internalType": "address"
              },
              {
                "name": "positionManager",
                "type": "address",
                "internalType": "address"
              },
              {
                "name": "hook",
                "type": "address",
                "internalType": "address"
              },
              {
                "name": "liquidityManager",
                "type": "address",
                "internalType": "address"
              },
              {
                "name": "airdropPublisher",
                "type": "address",
                "internalType": "address"
              },
              {
                "name": "fee",
                "type": "uint24",
                "internalType": "uint24"
              },
              {
                "name": "tickSpacing",
                "type": "int24",
                "internalType": "int24"
              }
            ]
          },
          {
            "name": "creatorTaxBps",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "excessToCreatorBps",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "factoryValue",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "amountPeddles",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "sqrtPriceX96",
            "type": "uint160",
            "internalType": "uint160"
          },
          {
            "name": "tickLower",
            "type": "int24",
            "internalType": "int24"
          },
          {
            "name": "tickUpper",
            "type": "int24",
            "internalType": "int24"
          },
          {
            "name": "liquidity",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      },
      {
        "name": "devBuyValue",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "minTokensOut",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "clogFloorX18",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "tokensOut",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "HANDLE_SALT_DOMAIN",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "handleSalt",
    "inputs": [
      {
        "name": "launcher",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "salt",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "pure"
  },
  {
    "type": "function",
    "name": "predictQuoteToken",
    "inputs": [
      {
        "name": "launcher",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "variant",
        "type": "uint8",
        "internalType": "uint8"
      },
      {
        "name": "salt",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "predictStockToken",
    "inputs": [
      {
        "name": "launcher",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "salt",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "name",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "symbol",
        "type": "string",
        "internalType": "string"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "orchestrator",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IHandleOrchestrator"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "stockLaunchpad",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IHandleStockLaunchpad"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "potOf",
    "inputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "event",
    "name": "HandleLaunched",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "xUserId",
        "type": "uint64",
        "indexed": true,
        "internalType": "uint64"
      },
      {
        "name": "launcher",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "pot",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      },
      {
        "name": "handleHash",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      },
      {
        "name": "clogVault",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      },
      {
        "name": "devBuyTokens",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "ClogFloorRequired",
    "inputs": []
  },
  {
    "type": "error",
    "name": "CreatorMustBeLauncher",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NativeRefused",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotClogCoin",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotHandleCoin",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NothingToSweep",
    "inputs": []
  },
  {
    "type": "error",
    "name": "Reentrant",
    "inputs": []
  },
  {
    "type": "error",
    "name": "TransferFailed",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ZeroAddress",
    "inputs": []
  }
] as const;

/** `PeddlesV4LiquidityExecutor` — every chain-specific pool parameter a WETH-type launch has to mirror. */
export const liquidityExecutorLaunchAbi = [
  {
    "type": "function",
    "name": "quoteToken",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
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
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "positionManager",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
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
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "fee",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint24",
        "internalType": "uint24"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "tickSpacing",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "int24",
        "internalType": "int24"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "defaultSingleSidedTicks",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "tickLower",
        "type": "int24",
        "internalType": "int24"
      },
      {
        "name": "tickUpper",
        "type": "int24",
        "internalType": "int24"
      }
    ],
    "stateMutability": "view"
  }
] as const;

/** `PeddlesTokenV20` — the two metadata writes a WETH-type launch may carry in `initCalls`. */
export const tokenMetadataAbi = [
  {
    "type": "function",
    "name": "updateContractURI",
    "inputs": [
      {
        "name": "uri",
        "type": "string",
        "internalType": "string"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "updateExtraMetadata",
    "inputs": [
      {
        "name": "key",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "val",
        "type": "string",
        "internalType": "string"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "error",
    "name": "AccessControlBadConfirmation",
    "inputs": []
  },
  {
    "type": "error",
    "name": "AccessControlUnauthorizedAccount",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "neededRole",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ]
  },
  {
    "type": "error",
    "name": "ERC20InsufficientAllowance",
    "inputs": [
      {
        "name": "spender",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "allowance",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "needed",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "ERC20InsufficientBalance",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "balance",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "needed",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "HolderRewardsAlreadySet",
    "inputs": []
  },
  {
    "type": "error",
    "name": "LastAdminMustUseRenounceLastAdmin",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotFinalAdmin",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotifyGasTooLow",
    "inputs": []
  },
  {
    "type": "error",
    "name": "SupplyCapBelowCurrentSupply",
    "inputs": [
      {
        "name": "currentSupply",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "requestedCap",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "SupplyCapExceeded",
    "inputs": [
      {
        "name": "cap",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "requestedSupply",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "ZeroAddress",
    "inputs": []
  }
] as const;

/** `PeddlesFeeHook` custom errors. */
export const feeHookErrorsAbi = [
  {
    "type": "error",
    "name": "AlreadyRegistered",
    "inputs": []
  },
  {
    "type": "error",
    "name": "FeeAboveCap",
    "inputs": []
  },
  {
    "type": "error",
    "name": "FeeBelowFloor",
    "inputs": []
  },
  {
    "type": "error",
    "name": "HookAddressFlagsMismatch",
    "inputs": [
      {
        "name": "got",
        "type": "uint160",
        "internalType": "uint160"
      },
      {
        "name": "want",
        "type": "uint160",
        "internalType": "uint160"
      }
    ]
  },
  {
    "type": "error",
    "name": "HookNotImplemented",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotOwner",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotPoolCreator",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotPoolManager",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotRegistered",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotRegistrar",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotSweeping",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NothingToSweep",
    "inputs": []
  },
  {
    "type": "error",
    "name": "OpeningTaxBelowCap",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ReentrantCall",
    "inputs": []
  },
  {
    "type": "error",
    "name": "SniperWindowTooLong",
    "inputs": []
  },
  {
    "type": "error",
    "name": "TransferFailed",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ZeroAddress",
    "inputs": []
  }
] as const;

/** `PeddlesV4SwapRouter` custom errors. */
export const swapRouterErrorsAbi = [
  {
    "type": "error",
    "name": "BadCallback",
    "inputs": []
  },
  {
    "type": "error",
    "name": "EthNotAllowed",
    "inputs": []
  },
  {
    "type": "error",
    "name": "EthTransferFailed",
    "inputs": []
  },
  {
    "type": "error",
    "name": "FeeStackingForbidden",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidAddress",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidAmount",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidFee",
    "inputs": []
  },
  {
    "type": "error",
    "name": "Locked",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NoOutput",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotOwner",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NothingPending",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ReservedBalance",
    "inputs": []
  },
  {
    "type": "error",
    "name": "Slippage",
    "inputs": []
  },
  {
    "type": "error",
    "name": "TransferFailed",
    "inputs": []
  }
] as const;

/** `PeddlesClogVault` custom errors. */
export const clogVaultErrorsAbi = [
  {
    "type": "error",
    "name": "ApproveFailed",
    "inputs": []
  },
  {
    "type": "error",
    "name": "CannotSweepClog",
    "inputs": []
  },
  {
    "type": "error",
    "name": "EscapeNotOpen",
    "inputs": [
      {
        "name": "opensAt",
        "type": "uint64",
        "internalType": "uint64"
      }
    ]
  },
  {
    "type": "error",
    "name": "FloorUnset",
    "inputs": []
  },
  {
    "type": "error",
    "name": "IntervalTooLong",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotCreator",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotRouter",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NothingToRelease",
    "inputs": []
  },
  {
    "type": "error",
    "name": "Reentrant",
    "inputs": []
  },
  {
    "type": "error",
    "name": "Slippage",
    "inputs": []
  },
  {
    "type": "error",
    "name": "TooSoon",
    "inputs": [
      {
        "name": "readyAt",
        "type": "uint64",
        "internalType": "uint64"
      }
    ]
  },
  {
    "type": "error",
    "name": "TransferFailed",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ZeroAddress",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ZeroSliceCap",
    "inputs": []
  }
] as const;

/** `PeddlesHolderRewards` custom errors. */
export const holderRewardsErrorsAbi = [
  {
    "type": "error",
    "name": "BatchTooLarge",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ExclusionsLocked",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotToken",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NothingToClaim",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ReentrantCall",
    "inputs": []
  },
  {
    "type": "error",
    "name": "RewardAssetProtected",
    "inputs": []
  },
  {
    "type": "error",
    "name": "SameAsset",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ThresholdAboveCap",
    "inputs": []
  },
  {
    "type": "error",
    "name": "TransferFailed",
    "inputs": []
  },
  {
    "type": "error",
    "name": "Unauthorized",
    "inputs": []
  },
  {
    "type": "error",
    "name": "UnsupportedToken",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ZeroAddress",
    "inputs": []
  }
] as const;

/** `PeddlesFactoryV20` custom errors. */
export const factoryErrorsAbi = [
  {
    "type": "error",
    "name": "AllocationAirdropClosed",
    "inputs": []
  },
  {
    "type": "error",
    "name": "AllocationBadSum",
    "inputs": [
      {
        "name": "got",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "AllocationClogAboveCap",
    "inputs": [
      {
        "name": "got",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "cap",
        "type": "uint16",
        "internalType": "uint16"
      }
    ]
  },
  {
    "type": "error",
    "name": "AllocationClogIntervalTooLong",
    "inputs": [
      {
        "name": "got",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "cap",
        "type": "uint64",
        "internalType": "uint64"
      }
    ]
  },
  {
    "type": "error",
    "name": "AllocationClogTermsMissing",
    "inputs": []
  },
  {
    "type": "error",
    "name": "AllocationLaunchBurnBanned",
    "inputs": []
  },
  {
    "type": "error",
    "name": "AllocationVestingClosed",
    "inputs": []
  },
  {
    "type": "error",
    "name": "AllocationZeroLiquidity",
    "inputs": []
  },
  {
    "type": "error",
    "name": "DefaultAdminGrantForbidden",
    "inputs": [
      {
        "name": "index",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "EmptyInitCall",
    "inputs": [
      {
        "name": "index",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "EmptyVariantCode",
    "inputs": []
  },
  {
    "type": "error",
    "name": "FactoryBusy",
    "inputs": []
  },
  {
    "type": "error",
    "name": "FactoryCleanupFailed",
    "inputs": []
  },
  {
    "type": "error",
    "name": "IncorrectCreate2Address",
    "inputs": [
      {
        "name": "expected",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "actual",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "InitCallFailed",
    "inputs": [
      {
        "name": "index",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "revertData",
        "type": "bytes",
        "internalType": "bytes"
      }
    ]
  },
  {
    "type": "error",
    "name": "InitialAdminMustBeCaller",
    "inputs": [
      {
        "name": "expected",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "actual",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "InvalidAssetVersion",
    "inputs": [
      {
        "name": "version",
        "type": "uint8",
        "internalType": "uint8"
      }
    ]
  },
  {
    "type": "error",
    "name": "InvalidDecimals",
    "inputs": [
      {
        "name": "decimals",
        "type": "uint8",
        "internalType": "uint8"
      }
    ]
  },
  {
    "type": "error",
    "name": "InvalidNameLength",
    "inputs": [
      {
        "name": "length",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "InvalidSymbolLength",
    "inputs": [
      {
        "name": "length",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "NotOwner",
    "inputs": [
      {
        "name": "caller",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "NotPendingOwner",
    "inputs": [
      {
        "name": "caller",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "NothingToSweep",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ParametersUnavailable",
    "inputs": []
  },
  {
    "type": "error",
    "name": "RescueFailed",
    "inputs": []
  },
  {
    "type": "error",
    "name": "TokenAlreadyDeployed",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "TokenDeployFailed",
    "inputs": []
  },
  {
    "type": "error",
    "name": "UnauthorizedParametersReader",
    "inputs": [
      {
        "name": "caller",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "expectedToken",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "UnsupportedInitCall",
    "inputs": [
      {
        "name": "index",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "selector",
        "type": "bytes4",
        "internalType": "bytes4"
      }
    ]
  },
  {
    "type": "error",
    "name": "UnsupportedRoleGrant",
    "inputs": [
      {
        "name": "index",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "role",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ]
  },
  {
    "type": "error",
    "name": "UnsupportedVariant",
    "inputs": [
      {
        "name": "variant",
        "type": "uint8",
        "internalType": "uint8"
      }
    ]
  },
  {
    "type": "error",
    "name": "ValueNotAccepted",
    "inputs": []
  },
  {
    "type": "error",
    "name": "VariantAlreadyRegistered",
    "inputs": [
      {
        "name": "variant",
        "type": "uint8",
        "internalType": "uint8"
      }
    ]
  },
  {
    "type": "error",
    "name": "VariantCodeNotPeddlesToken",
    "inputs": []
  },
  {
    "type": "error",
    "name": "VariantCodeStoreFailed",
    "inputs": []
  },
  {
    "type": "error",
    "name": "VariantDisabled",
    "inputs": [
      {
        "name": "variant",
        "type": "uint8",
        "internalType": "uint8"
      }
    ]
  },
  {
    "type": "error",
    "name": "VariantReserved",
    "inputs": [
      {
        "name": "variant",
        "type": "uint8",
        "internalType": "uint8"
      }
    ]
  },
  {
    "type": "error",
    "name": "ZeroOwner",
    "inputs": []
  }
] as const;

/** Every custom error a launch can revert with, from every contract it passes through. Selectors resolve against this. */
export const launchErrorsAbi = [
  ...launchOrchestratorAbi,
  ...stockLaunchpadLaunchAbi,
  ...handleLauncherLaunchAbi,
  ...liquidityExecutorLaunchAbi,
  ...tokenMetadataAbi,
  ...feeHookErrorsAbi,
  ...swapRouterErrorsAbi,
  ...clogVaultErrorsAbi,
  ...holderRewardsErrorsAbi,
  ...factoryErrorsAbi,
].filter((e) => e.type === 'error');
