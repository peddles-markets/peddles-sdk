// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/*

               _______  _______  ______   ______   _        _______
      (  ____ )(  ____ \(  __  \ (  __  \ ( \      (  ____ \(  ____ \
      | (    )|| (    \/| (  \  )| (  \  )| (      | (    \/| (    \/
      | (____)|| (__    | |   ) || |   ) || |      | (__    | (_____
      |  _____)|  __)   | |   | || |   | || |      |  __)   (_____  )
      | (      | (      | |   ) || |   ) || |      | (            ) |
      | )      | (____/\| (__/  )| (__/  )| (____/\| (____/\/\____) |
      |/       (_______/(______/ (______/ (_______/(_______/\_______)


      THE STOCK-PAIRED LAUNCHPAD

      Launch tokens and NFTs paired against tokenised stocks.
      100% of supply goes to liquidity, locked from block zero.
      Holders earn the stock you are paired to.

      Website     https://peddles.xyz
      X           https://x.com/PeddlesX
      Telegram    https://t.me/peddlesnews


*/

import {
    PeddlesSnowballVault,
    SnowballPoolKey,
    SnowballTerms,
    ISnowballDeployer,
    ISnowballOperatorSource,
    ISnowballFeeHook
} from "./PeddlesSnowballVault.sol";

interface ISnowballLaunchpad {
    function createCoinAndBuy(
        string calldata name,
        string calldata symbol,
        address quote,
        uint16 creatorTaxBps,
        uint16 excessToCreatorBps,
        bytes32 salt,
        uint256 quoteIn,
        uint256 minTokensOut
    ) external payable returns (address token, uint256 tokensOut);
    function predictCoin(address creator, bytes32 salt, string memory name, string memory symbol)
        external
        view
        returns (address);
    function poolKeyFor(address token, address quote) external view returns (SnowballPoolKey memory);
    function feeHook() external view returns (address);
}

/// @dev ABI mirror of `PeddlesLaunchOrchestratorV20`'s launch surface, mirrored rather than imported
///      so this contract does not compile the V20 stack. `Snowball.t.sol` pins `launchAndBuy`'s
///      selector against the real contract so the two cannot drift silently.
interface ISnowballOrchestrator {
    struct CreateVaultsInput {
        address token;
        address creator;
        uint16 liquidityBps;
        uint16 airdropBps;
        uint16 vestingBps;
        uint16 burnBps;
        uint16 vaultBps;
        uint16 clogBps;
        bool airdropEnabled;
        uint256 liquidityAmount;
        uint256 airdropAmount;
        uint256 vestingAmount;
        uint256 burnAmount;
        uint64 vestingStart;
        uint64 vestingCliff;
        uint64 vestingDuration;
        uint64 airdropStartsAt;
        uint32 airdropEpochLength;
        uint16 airdropEpochCount;
        uint64 burnStartsAt;
        uint32 burnEpochLength;
        uint16 firstBurnBps;
        uint16 minVoteBps;
        uint16 maxVoteBps;
        uint16 defaultVoteBps;
        address quoteToken;
        address poolManager;
        address positionManager;
        address hook;
        address liquidityManager;
        address airdropPublisher;
        uint24 fee;
        int24 tickSpacing;
    }

    struct VaultSet {
        address liquidityVault;
        address airdropVault;
        address vestingVault;
        address burnVault;
    }

    struct LaunchInput {
        uint8 variant;
        bytes32 salt;
        bytes params;
        bytes[] initCalls;
        CreateVaultsInput vaultInput;
        uint16 creatorTaxBps;
        uint16 excessToCreatorBps;
        uint256 factoryValue;
        uint256 amountPeddles;
        uint160 sqrtPriceX96;
        int24 tickLower;
        int24 tickUpper;
        uint256 liquidity;
    }

    function launchAndBuy(LaunchInput calldata input, uint256 devBuyValue, uint256 minTokensOut)
        external
        payable
        returns (address token, VaultSet memory vaults, bytes32 poolId, uint256 positionId, uint256 tokensOut);
    function clogVaultFactory() external view returns (address);
    function launchSalt(address creator, bytes32 salt) external pure returns (bytes32);
    function predictLaunchToken(address creator, uint8 variant, bytes32 salt) external view returns (address);
    function liquidityExecutor() external view returns (address);
    function feeHook() external view returns (address);
}

interface ISnowballLiquidityExecutor {
    function poolKeyFor(address token) external view returns (SnowballPoolKey memory);
    function quoteToken() external view returns (address);
}

interface ISnowballClogVaultFactory {
    function vaultOf(address deployer, address token) external view returns (address);
}

interface ISnowballStrayERC20 {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @title PeddlesSnowballFactory
/// @notice Launches a Snowball token: deploys the token's `PeddlesSnowballVault` and makes the launch
/// call AS that vault, through the chain's real launcher, so the vault is the pool's creator of record
/// from the first block. The split the creator chose — burn / LP / creator / holders, in bps of volume
/// — is fixed in the same transaction and nothing afterwards can change or stop it.
///
/// ── SUPPORTED LAUNCH TYPES ─────────────────────────────────────────────────────────────────────
///   stock-paired         `PeddlesStockLaunchpad.createCoinAndBuy`
///   WETH-paired, Clog    `PeddlesLaunchOrchestratorV20.launchAndBuy` (the creator-bound one)
/// Handle launches are refused by construction: `PeddlesHandleLauncher` is the creator of record of
/// every handle coin and binds the creator leg to the X account's pot, so no Snowball vault can hold
/// it. NFT graduations and Art→DEX graduate a collection, not a creator's launch call; out of scope.
///
/// ── ADDRESSES ARE PREDICTABLE (Pre-Launch) ─────────────────────────────────────────────────────
///   vault = CREATE2(this, keccak256(abi.encode(SALT_DOMAIN, creator, salt)), vaultInitCodeHash)
///   stock token = launchpad.predictCoin(vault, salt, name, symbol)
///   WETH / Clog token = orchestrator.predictLaunchToken(vault, variant, salt)
/// The vault salt is bound to the calling wallet, and each token salt to the vault, so nobody can
/// occupy a creator's advertised address. `predictVault` / `predictStockToken` / `predictQuoteToken`.
///
/// ── THE ONE OWNER POWER ────────────────────────────────────────────────────────────────────────
/// `owner` (the chain's protocolOwner Safe) sets `operator`, the keeper that may spend a vault's burn
/// and LP buckets before they go stale. The operator can only spend a bucket into that vault's own
/// pool; no function pays the operator or the owner anything, and a zero operator leaves the
/// permissionless stale path. There is no pause, no fee, no setter for any vault's terms.
contract PeddlesSnowballFactory is ISnowballOperatorSource {
    uint16 public constant BPS = 10_000;
    /// @notice The hook's fixed legs (PLATFORM_FEE_BPS, CREATOR_FEE_BPS) and its band.
    uint16 public constant PLATFORM_LEG_BPS = 50;
    uint16 public constant CREATOR_LEG_BPS = 50;
    uint16 public constant MIN_TAX_BPS = 100;
    uint16 public constant MAX_TAX_BPS = 1000;

    bytes32 public constant SALT_DOMAIN = keccak256("PEDDLES_SNOWBALL_VAULT_SALT");

    address public immutable feeHook;
    address public immutable poolManager;
    address public immutable stockLaunchpad;
    address public immutable orchestrator;
    /// @notice The CREATE2 host of every vault (deployed by this constructor; only this factory drives it).
    address public immutable vaultDeployer;
    bytes32 public immutable vaultInitCodeHash;

    address public owner;
    address public pendingOwner;
    /// @inheritdoc ISnowballOperatorSource
    address public operator;

    /// @notice token => its Snowball vault; vault => the human creator.
    mapping(address => address) public vaultOf;
    mapping(address => address) public creatorOf;

    uint256 private _lock = 1;

    event SnowballLaunched(
        address indexed vault,
        address indexed creator,
        address indexed token,
        bytes32 poolId,
        address quote,
        uint16 burnBps,
        uint16 lpBps,
        uint16 creatorBps,
        uint16 holderBps,
        uint16 taxBps,
        uint16 excessToCreatorBps,
        uint256 minSpend,
        address clogVault,
        uint256 devBuyTokens
    );
    event OperatorUpdated(address indexed operator);
    event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event Swept(address indexed asset, address indexed to, uint256 amount);

    error ZeroAddress();
    error NotOwner();
    error NotPendingOwner();
    error ReentrantCall();
    error WrongHook();
    error NoSnowball();
    error VaultShareBelowCreatorLeg();
    error TaxOutOfBand();
    error ZeroMinSpend();
    error CreatorMustBeVault();
    error TermsMismatch();
    error PredictionMismatch();
    error ClogFloorRequired();
    error NothingToSweep();
    error TransferFailed();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier nonReentrant() {
        if (_lock != 1) revert ReentrantCall();
        _lock = 2;
        _;
        _lock = 1;
    }

    /// @param feeHook_        this chain's `PeddlesFeeHook` (deployments/<chainId>.json)
    /// @param stockLaunchpad_ this chain's `PeddlesStockLaunchpad`
    /// @param orchestrator_   this chain's creator-bound `PeddlesLaunchOrchestratorV20`
    /// @param owner_          this chain's protocolOwner Safe
    /// @param operator_       the keeper signer; may be zero
    constructor(address feeHook_, address stockLaunchpad_, address orchestrator_, address owner_, address operator_) {
        if (feeHook_ == address(0) || stockLaunchpad_ == address(0) || orchestrator_ == address(0) || owner_ == address(0)) {
            revert ZeroAddress();
        }
        if (ISnowballLaunchpad(stockLaunchpad_).feeHook() != feeHook_) revert WrongHook();
        if (ISnowballOrchestrator(orchestrator_).feeHook() != feeHook_) revert WrongHook();
        // Fail closed on an UNBOUND orchestrator (no `launchSalt`): token addresses would not be
        // bound to the vault and anyone could occupy a Snowball token's advertised address.
        ISnowballOrchestrator(orchestrator_).launchSalt(address(this), bytes32(0));
        address pm = ISnowballFeeHook(feeHook_).poolManager();
        if (pm == address(0)) revert ZeroAddress();
        feeHook = feeHook_;
        poolManager = pm;
        stockLaunchpad = stockLaunchpad_;
        orchestrator = orchestrator_;
        address d = address(new PeddlesSnowballVaultDeployer());
        vaultDeployer = d;
        vaultInitCodeHash = PeddlesSnowballVaultDeployer(d).vaultInitCodeHash();
        owner = owner_;
        operator = operator_;
        emit OwnershipTransferred(address(0), owner_);
        emit OperatorUpdated(operator_);
    }

    // =========================================================================================
    // The terms formula
    // =========================================================================================

    /// @notice Map a creator's split of VOLUME to the hook's launch terms.
    ///
    ///     V      = burn + lp + creator          (the vault's share of volume)
    ///     taxBps = 50 + V + holders             (50 = the platform's fixed 0.50%)
    ///     E      = taxBps - 100                 (the hook's "excess" above its two fixed legs)
    ///     excessToCreatorBps = floor((V - 50) * 10000 / E)      (0 when E == 0)
    ///
    /// The hook then pays the creator leg 0.50% + E * excessToCreatorBps / 10000 of volume, which is
    /// exactly V when `exact`; otherwise it is short by less than E / 10000 bps (at most 0.0009% of
    /// volume) and that sliver goes to holders, as all of the hook's rounding does. Refused: no burn
    /// and no LP (not a Snowball), V below the hook's fixed 0.50% creator leg, a tax outside 1–10%.
    function termsFor(SnowballTerms memory t) public pure returns (uint16 taxBps, uint16 excessToCreatorBps, bool exact) {
        uint256 v = uint256(t.burnBps) + t.lpBps + t.creatorBps;
        if (uint256(t.burnBps) + t.lpBps == 0) revert NoSnowball();
        if (v < CREATOR_LEG_BPS) revert VaultShareBelowCreatorLeg();
        uint256 total = PLATFORM_LEG_BPS + v + t.holderBps;
        if (total < MIN_TAX_BPS || total > MAX_TAX_BPS) revert TaxOutOfBand();
        taxBps = uint16(total);
        uint256 e = total - MIN_TAX_BPS;
        if (e == 0) return (taxBps, 0, true);
        uint256 num = (v - CREATOR_LEG_BPS) * BPS;
        excessToCreatorBps = uint16(num / e);
        exact = num % e == 0;
    }

    // =========================================================================================
    // Launches
    // =========================================================================================

    struct StockLaunch {
        string name;
        string symbol;
        address quote;
        uint256 quoteIn;
        uint256 minTokensOut;
    }

    /// @notice Launch a stock-paired Snowball token. `msg.value` pays the launchpad's launch fee (any
    /// excess comes back). A dev buy pulls `quoteIn` of the quote from the caller (approve this
    /// factory first) and the bought tokens are delivered to the caller.
    function launchStock(StockLaunch calldata p, SnowballTerms calldata t, uint256 minSpend, bytes32 salt)
        external
        payable
        nonReentrant
        returns (address vault, address token, uint256 devBuyTokens)
    {
        (uint16 tax, uint16 excess,) = termsFor(t);
        address predictedVault = predictVault(msg.sender, salt);
        token = ISnowballLaunchpad(stockLaunchpad).predictCoin(predictedVault, salt, p.name, p.symbol);
        SnowballPoolKey memory key = ISnowballLaunchpad(stockLaunchpad).poolKeyFor(token, p.quote);
        vault = _deploy(salt, token, p.quote, key, stockLaunchpad, t, tax, excess, minSpend);

        PeddlesSnowballVault v = PeddlesSnowballVault(payable(vault));
        uint256 quoteIn;
        if (p.quoteIn != 0) {
            uint256 before = ISnowballStrayERC20(p.quote).balanceOf(vault);
            _pull(p.quote, msg.sender, vault, p.quoteIn);
            quoteIn = ISnowballStrayERC20(p.quote).balanceOf(vault) - before;
            v.exec(p.quote, abi.encodeWithSignature("approve(address,uint256)", stockLaunchpad, quoteIn));
        }
        bytes memory ret = v.exec{value: msg.value}(
            stockLaunchpad,
            abi.encodeCall(
                ISnowballLaunchpad.createCoinAndBuy,
                (p.name, p.symbol, p.quote, tax, excess, salt, quoteIn, p.minTokensOut)
            )
        );
        (address launched,) = abi.decode(ret, (address, uint256));
        if (launched != token) revert PredictionMismatch();
        if (quoteIn != 0) v.exec(p.quote, abi.encodeWithSignature("approve(address,uint256)", stockLaunchpad, 0));

        devBuyTokens = v.bind(address(0));
        _record(vault, token, key, p.quote, t, tax, excess, minSpend, address(0), devBuyTokens);
    }

    /// @notice Launch a WETH-paired (USDC on Arc, WBNB on BSC) or Clog Snowball token through the
    /// orchestrator. `input.vaultInput.creator` MUST be `predictVault(msg.sender, input.salt)` and the
    /// input's tax terms MUST equal `termsFor(t)`. `msg.value` = launch fee + factory value + dev buy +
    /// liquidity funding, exactly as for `launchAndBuy`. `clogFloorX18` is required for a Clog type.
    function launchQuote(
        ISnowballOrchestrator.LaunchInput calldata input,
        uint256 devBuyValue,
        uint256 minTokensOut,
        uint256 clogFloorX18,
        SnowballTerms calldata t,
        uint256 minSpend
    ) external payable nonReentrant returns (address vault, address token, uint256 devBuyTokens) {
        (uint16 tax, uint16 excess,) = termsFor(t);
        if (input.creatorTaxBps != tax || input.excessToCreatorBps != excess) revert TermsMismatch();
        address predictedVault = predictVault(msg.sender, input.salt);
        if (input.vaultInput.creator != predictedVault) revert CreatorMustBeVault();

        token = ISnowballOrchestrator(orchestrator).predictLaunchToken(predictedVault, input.variant, input.salt);
        address executor = ISnowballOrchestrator(orchestrator).liquidityExecutor();
        SnowballPoolKey memory key = ISnowballLiquidityExecutor(executor).poolKeyFor(token);
        address quote = ISnowballLiquidityExecutor(executor).quoteToken();
        vault = _deploy(input.salt, token, quote, key, address(0), t, tax, excess, minSpend);

        PeddlesSnowballVault v = PeddlesSnowballVault(payable(vault));
        bytes memory ret = v.exec{value: msg.value}(
            orchestrator, abi.encodeCall(ISnowballOrchestrator.launchAndBuy, (input, devBuyValue, minTokensOut))
        );
        (address launched) = abi.decode(ret, (address));
        if (launched != token) revert PredictionMismatch();

        address clog;
        address cf = ISnowballOrchestrator(orchestrator).clogVaultFactory();
        if (cf != address(0)) clog = ISnowballClogVaultFactory(cf).vaultOf(orchestrator, token);
        if (clog != address(0)) {
            if (clogFloorX18 == 0) revert ClogFloorRequired();
            v.exec(clog, abi.encodeWithSignature("setReleaseFloor(uint256)", clogFloorX18));
        }

        devBuyTokens = v.bind(clog);
        _record(vault, token, key, quote, t, tax, excess, minSpend, clog, devBuyTokens);
    }

    // =========================================================================================
    // Views
    // =========================================================================================

    function vaultSalt(address creator, bytes32 salt) public pure returns (bytes32) {
        return keccak256(abi.encode(SALT_DOMAIN, creator, salt));
    }

    /// @notice The vault a launch by `creator` with `salt` deploys, whatever the type or terms.
    function predictVault(address creator, bytes32 salt) public view returns (address) {
        return address(
            uint160(
                uint256(
                    keccak256(abi.encodePacked(bytes1(0xff), vaultDeployer, vaultSalt(creator, salt), vaultInitCodeHash))
                )
            )
        );
    }

    /// @notice Where `launchStock` puts the token for `creator` with `salt`, `name`, `symbol`.
    function predictStockToken(address creator, bytes32 salt, string calldata name, string calldata symbol)
        external
        view
        returns (address)
    {
        return ISnowballLaunchpad(stockLaunchpad).predictCoin(predictVault(creator, salt), salt, name, symbol);
    }

    /// @notice Where `launchQuote` puts the token for `creator` with launch type `variant` and `salt`.
    function predictQuoteToken(address creator, uint8 variant, bytes32 salt) external view returns (address) {
        return ISnowballOrchestrator(orchestrator).predictLaunchToken(predictVault(creator, salt), variant, salt);
    }

    // =========================================================================================
    // Owner
    // =========================================================================================

    function setOperator(address operator_) external onlyOwner {
        operator = operator_;
        emit OperatorUpdated(operator_);
    }

    function transferOwnership(address next) external onlyOwner {
        if (next == address(0)) revert ZeroAddress();
        pendingOwner = next;
        emit OwnershipTransferStarted(owner, next);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert NotPendingOwner();
        emit OwnershipTransferred(owner, msg.sender);
        owner = msg.sender;
        pendingOwner = address(0);
    }

    // ---- stray-asset exits: the factory holds nothing in normal use; both pay `owner` ---------

    function sweepToken(address asset) external nonReentrant returns (uint256 amount) {
        amount = ISnowballStrayERC20(asset).balanceOf(address(this));
        if (amount == 0) revert NothingToSweep();
        (bool ok, bytes memory ret) =
            asset.call(abi.encodeWithSelector(ISnowballStrayERC20.transfer.selector, owner, amount));
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert TransferFailed();
        emit Swept(asset, owner, amount);
    }

    function sweepNative() external nonReentrant returns (uint256 amount) {
        amount = address(this).balance;
        if (amount == 0) revert NothingToSweep();
        (bool ok,) = payable(owner).call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit Swept(address(0), owner, amount);
    }

    // =========================================================================================
    // Internals
    // =========================================================================================

    function _deploy(
        bytes32 salt,
        address token,
        address quote,
        SnowballPoolKey memory key,
        address launchpad,
        SnowballTerms calldata t,
        uint16 tax,
        uint16 excess,
        uint256 minSpend
    ) private returns (address vault) {
        if (minSpend == 0) revert ZeroMinSpend();
        if (key.hooks != feeHook) revert WrongHook();
        vault = PeddlesSnowballVaultDeployer(vaultDeployer).deploy(
            vaultSalt(msg.sender, salt),
            ISnowballDeployer.Parameters({
                factory: address(this),
                creator: msg.sender,
                feeHook: feeHook,
                poolManager: poolManager,
                token: token,
                quote: quote,
                key: key,
                stockLaunchpad: launchpad,
                terms: t,
                taxBps: tax,
                excessToCreatorBps: excess,
                minSpend: minSpend
            })
        );
    }

    function _record(
        address vault,
        address token,
        SnowballPoolKey memory key,
        address quote,
        SnowballTerms calldata t,
        uint16 tax,
        uint16 excess,
        uint256 minSpend,
        address clog,
        uint256 devBuyTokens
    ) private {
        vaultOf[token] = vault;
        creatorOf[vault] = msg.sender;
        emit SnowballLaunched(
            vault,
            msg.sender,
            token,
            keccak256(abi.encode(key)),
            quote,
            t.burnBps,
            t.lpBps,
            t.creatorBps,
            t.holderBps,
            tax,
            excess,
            minSpend,
            clog,
            devBuyTokens
        );
    }

    function _pull(address asset, address from, address to, uint256 amount) private {
        (bool ok, bytes memory ret) =
            asset.call(abi.encodeWithSelector(ISnowballStrayERC20.transferFrom.selector, from, to, amount));
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert TransferFailed();
    }
}

/// @title PeddlesSnowballVaultDeployer
/// @notice The CREATE2 host of every Snowball vault. It exists only because the factory cannot also
/// carry the vault's init code under EIP-170. Deployed by the factory's constructor, it serves that
/// factory alone, holds nothing, and has no owner.
contract PeddlesSnowballVaultDeployer is ISnowballDeployer {
    address public immutable factory;
    Parameters private _params;

    error NotFactory();

    constructor() {
        factory = msg.sender;
    }

    function vaultInitCodeHash() external pure returns (bytes32) {
        return keccak256(type(PeddlesSnowballVault).creationCode);
    }

    function deploy(bytes32 salt, Parameters calldata p) external returns (address vault) {
        if (msg.sender != factory) revert NotFactory();
        _params = p;
        vault = address(new PeddlesSnowballVault{salt: salt}());
        delete _params;
    }

    /// @inheritdoc ISnowballDeployer
    function parameters() external view returns (Parameters memory) {
        return _params;
    }
}
