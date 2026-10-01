// GENERATED FILE — DO NOT EDIT.
// Written by script/generate-perp-abis.mjs from contracts/out/<File>.sol/<Contract>.json.
// Re-run it after `forge build` and commit the result.

/** `PeddlesPerpFactory` — market creation, CREATE2 prediction, per-base curve policy, the lens, and the launch registry. */
export const perpFactoryAbi = [
  {
    "type": "function",
    "name": "create",
    "inputs": [
      {
        "name": "p",
        "type": "tuple",
        "internalType": "struct PeddlesPerpFactory.CreateParams",
        "components": [
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
            "name": "tokenUri",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "base",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "tokenSalt",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "hookSalt",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "seedBuyBase",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      }
    ],
    "outputs": [
      {
        "name": "hook",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "lens",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "predictToken",
    "inputs": [
      {
        "name": "tokenSalt",
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
      },
      {
        "name": "tokenUri",
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
    "name": "predictHook",
    "inputs": [
      {
        "name": "hookSalt",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "token",
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
    "type": "function",
    "name": "tokenInitCodeHash",
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
        "name": "tokenUri",
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
    "name": "hookInitCodeHash",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      }
    ],
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
    "name": "bases",
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
        "name": "v",
        "type": "uint128",
        "internalType": "uint128"
      },
      {
        "name": "tickWidth",
        "type": "uint128",
        "internalType": "uint128"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "deployLens",
    "inputs": [
      {
        "name": "hookAddr",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "lens",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "hookDeployer",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract PeddlesPerpHookDeployer"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "feeRegistry",
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
        "internalType": "contract IPoolManager"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "blockTimeMs",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint32",
        "internalType": "uint32"
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
    "name": "hookId",
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
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "launches",
    "inputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "hook",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "lens",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "base",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "creator",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "createdAt",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "launchCount",
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
    "type": "event",
    "name": "Launched",
    "inputs": [
      {
        "name": "hook",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
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
        "name": "lens",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      },
      {
        "name": "base",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      },
      {
        "name": "v",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "tickWidth",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
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
      },
      {
        "name": "tokenUri",
        "type": "string",
        "indexed": false,
        "internalType": "string"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "LensDeployed",
    "inputs": [
      {
        "name": "hook",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "lens",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "BadHookAddr",
    "inputs": []
  },
  {
    "type": "error",
    "name": "BadParams",
    "inputs": []
  },
  {
    "type": "error",
    "name": "LensAlreadyDeployed",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotWhitelisted",
    "inputs": []
  },
  {
    "type": "error",
    "name": "TransferFailed",
    "inputs": []
  },
  {
    "type": "error",
    "name": "UnknownHook",
    "inputs": []
  }
] as const;

/** `PeddlesPerpHook` custom errors — the hook is constructed and configured inside `create`. */
export const perpHookErrorsAbi = [
  {
    "type": "error",
    "name": "AntiSnipeWindow",
    "inputs": []
  },
  {
    "type": "error",
    "name": "BadBlockTime",
    "inputs": []
  },
  {
    "type": "error",
    "name": "BadCurveParams",
    "inputs": []
  },
  {
    "type": "error",
    "name": "BadSeedRange",
    "inputs": []
  },
  {
    "type": "error",
    "name": "BandAlreadySeeded",
    "inputs": []
  },
  {
    "type": "error",
    "name": "BaseAlreadySet",
    "inputs": []
  },
  {
    "type": "error",
    "name": "BorrowCapPerBlockExceeded",
    "inputs": []
  },
  {
    "type": "error",
    "name": "CollateralBelowMin",
    "inputs": []
  },
  {
    "type": "error",
    "name": "CooldownActive",
    "inputs": []
  },
  {
    "type": "error",
    "name": "CurveAlreadySet",
    "inputs": []
  },
  {
    "type": "error",
    "name": "DeadlineExceeded",
    "inputs": []
  },
  {
    "type": "error",
    "name": "EthTransferFailed",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ExactOutputDisallowed",
    "inputs": []
  },
  {
    "type": "error",
    "name": "FeeContextAlreadySet",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InsufficientBorrowCapacity",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidAction",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidBand",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidInitPrice",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidLeverage",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidPoolKey",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidSellBps",
    "inputs": []
  },
  {
    "type": "error",
    "name": "LaunchNotQuiescent",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NoOpenPosition",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotOwner",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotPositionOwner",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotShortable",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NothingSold",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NothingToClaim",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NothingToSweep",
    "inputs": []
  },
  {
    "type": "error",
    "name": "PartialFill",
    "inputs": []
  },
  {
    "type": "error",
    "name": "PoolAlreadyInitialized",
    "inputs": []
  },
  {
    "type": "error",
    "name": "PoolMgrOnly",
    "inputs": []
  },
  {
    "type": "error",
    "name": "PoolNotInitializedErr",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ProtocolPaused",
    "inputs": []
  },
  {
    "type": "error",
    "name": "Reentrancy",
    "inputs": []
  },
  {
    "type": "error",
    "name": "SlippageExceeded",
    "inputs": []
  },
  {
    "type": "error",
    "name": "TailNotSeeded",
    "inputs": []
  },
  {
    "type": "error",
    "name": "TokenSupplyMismatch",
    "inputs": []
  },
  {
    "type": "error",
    "name": "TokenTransferFailed",
    "inputs": []
  },
  {
    "type": "error",
    "name": "TradingNotEnabled",
    "inputs": []
  },
  {
    "type": "error",
    "name": "TwapNotWarm",
    "inputs": []
  },
  {
    "type": "error",
    "name": "UnauthorizedInit",
    "inputs": []
  },
  {
    "type": "error",
    "name": "UnauthorizedLP",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ZeroAddress",
    "inputs": []
  }
] as const;

/** Uniswap v4-core `Hooks` library errors — `HookAddressNotValid` is a hook salt that does not carry the permission bits. */
export const v4HooksErrorsAbi = [
  {
    "type": "error",
    "name": "HookAddressNotValid",
    "inputs": [
      {
        "name": "hooks",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "HookCallFailed",
    "inputs": []
  },
  {
    "type": "error",
    "name": "HookDeltaExceedsSwapAmount",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidHookResponse",
    "inputs": []
  }
] as const;

/** Every custom error a perp `create` can revert with. Selectors resolve against this. */
export const perpErrorsAbi = [...perpFactoryAbi, ...perpHookErrorsAbi, ...v4HooksErrorsAbi].filter((e) => e.type === 'error');
