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

interface IPeddlesStockLaunchpadGrad {
    function createCoin(
        string calldata name,
        string calldata symbol,
        address quote,
        uint16 creatorTaxBps,
        uint16 excessToCreatorBps
    )
        external
        payable
        returns (address token);
    function feeHook() external view returns (address);
    function launchFee() external view returns (uint256);
    function vaultsOf(address token)
        external
        view
        returns (address liquidityVault, address airdropVault, address vestingVault, address burnVault);
    function coins(address token)
        external
        view
        returns (
            address creator,
            address quote,
            bytes32 poolId,
            uint256 positionId,
            uint64 createdAt,
            bool tokenIsCurrency0
        );
    function collectAndClaim(address token) external returns (uint256 quoteAmount, uint256 tokenAmount);
    function treasury() external view returns (address);
    function swapRouter() external view returns (address);
}

/// @dev The stock swap router's public buy, used for the atomic dev buy exactly as
/// `PeddlesStockLaunchpad.createCoinAndBuy` uses it.
interface IStockRouterBuyGrad {
    function buy(address token, uint256 quoteIn, uint256 minTokenOut, address to) external returns (uint256);
}

/// @notice The canonical-distributor proof (`PeddlesNftFeeDistributorFactory`).
interface INftFeeDistributorFactoryGrad {
    function isDistributor(address distributor) external view returns (bool);
}

/// @notice The two calls a graduation makes into a collection's `PeddlesNftFeeDistributor`.
interface INftFeeDistributorGrad {
    function collection() external view returns (address);
    function initAssets(address quote, address token, address tokenHolderRewards, uint16 holderShareBps) external;
}

/// @dev Byte-identical layout to `PeddlesFeeHook.PoolConfig`.
struct GradHookPoolConfig {
    address quote;
    uint16 creatorTaxBps;
    uint16 excessToCreatorBps;
    bool registered;
    address token;
    uint32 startBlock;
    uint32 sniperWindow;
    address creator;
    address creatorPayout;
    address rewards;
}

/// @notice The four functions a Peddles NFT collection must expose to launch a stock-paired coin.
/// @dev BOTH collection kinds implement it, and this contract cannot tell them apart — which is the
/// point. `PeddlesBondingCollection` is ready when its curve sells out or its mint window closes;
/// `PeddlesArtCollection` is ready when its creator has armed a launch and at least one piece is
/// held. Readiness is the collection's own business; consent, fee binding and the one-shot latch
/// below are identical for both.
interface IPeddlesGraduatableCollection {
    function owner() external view returns (address);
    function graduationReady() external view returns (bool);
    function graduated() external view returns (bool);
    function recordPeddlesGraduation(
        address token,
        address liquidityVault,
        address vestingVault,
        address airdropVault,
        address burnVault
    ) external;
}

/// @notice The one `onlyPoolCreator` call this contract makes on `PeddlesFeeHook`. It needs it
/// because, for a graduated coin, the launchpad records THIS contract as the pool's creator.
interface IPeddlesFeeHookPoolCreator {
    function setCreatorPayout(bytes32 poolId, address payout) external;
    function poolConfig(bytes32 poolId) external view returns (GradHookPoolConfig memory);
}

interface IGradERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @title PeddlesNftStockGraduationOrchestrator
/// @notice OPT-IN path (item 4) that graduates an NFT collection into a STOCK-paired coin instead
/// of the default WETH pair. It reuses the existing PeddlesStockLaunchpad machinery (whitelisted
/// stock quote + config-driven allocation + single-sided v4 liquidity) rather than duplicating it,
/// and records the graduation on the collection.
///
/// TWO COLLECTION KINDS, ONE PATH. `PeddlesBondingCollection` reaches its coin by selling out a
/// curve. `PeddlesArtCollection` — flat-priced, open-ended, NO CURVE AT ALL and therefore no
/// sell-out that could ever arrive — reaches the same coin because its creator armed a launch and
/// somebody holds a piece. Both answer `graduationReady()`, so both run through `graduateToStock`
/// below unchanged; nothing here branches on the kind, and nothing here decides readiness.
///
/// The existing WETH graduation (PeddlesNFTBondingGraduationOrchestratorV20) is unchanged and
/// remains the default; a collection uses THIS orchestrator only when its graduationOperator is
/// set to this contract.
///
/// CONSENT: graduation is the collection owner's decision, and ONLY the parameters are theirs to
/// decide — not the moment. Either the collection owner calls `graduateToStock` directly, or they
/// commit the exact launch in advance with `setStockGraduationOptIn` and ANYBODY may then relay it.
/// The protocol can NEVER graduate a collection that has not consented, and a relayer can only ever
/// produce byte-for-byte the launch the collection owner already committed to (`relayParamsHash`).
///
/// WHY PERMISSIONLESS (owner, 2026-09-19). The sell-out of a bonding curve is an objective,
/// unfakeable moment that nobody chooses; the art path's arming is the creator's own switch. Both
/// are already the decision. Leaving the BUTTON with one key meant a collection could sell out
/// completely and its coin never list because the one person who could press it went quiet — the
/// exit gated on a condition that may never arrive, which the no-stuck-funds rule forbids
/// everywhere else. Timing is not a privilege worth withholding a launch for.
///
/// FEES: the launchpad records the coin's creator as msg.sender (this orchestrator), so the 50%
/// creator share of stock LP fees accrues here. (The protocol's own 50% goes straight to the
/// launchpad treasury and never passes through this contract.) `claimAndForwardStockFees` is
/// therefore PERMISSIONLESS and hard-wired: it pays `feeRecipient(token)`, which is the graduated
/// collection's current owner. There is no destination parameter — the protocol owner cannot name
/// the payee at call time.
///
/// HOLDER SHARE: the collection owner may split their own half of that stream with the people who
/// minted the NFTs, by pointing `setHolderRewardsRoute` at a `PeddlesNftHolderRewards` distributor
/// and naming a share in bps. Only the collection's own owner can set it (`NotCollectionOwner`
/// otherwise); the protocol owner has no lever on it whatsoever. The split is applied to the QUOTE
/// leg — the asset the distributor actually pays out in — and both destinations remain derived
/// from state, never from a caller argument, so `claimAndForwardStockFees` stays permissionless
/// and undirectable.
///
/// POOL-TAX CREATOR LEG: the launchpad also registers this contract as the coin's creator in
/// `PeddlesFeeHook`, so the hook's creator leg (0.50% of volume, plus a quarter of any opening tax)
/// would be swept HERE by the permissionless `sweepCreator` -- and this contract cannot tell which
/// collection a raw quote balance belongs to. So it never receives that leg: graduation points the
/// hook's `creatorPayout` at the collection owner in the same transaction that registers the pool,
/// before any swap can exist, and reverts if it cannot. `sweepCreator` then pays the collection
/// owner directly. `syncCreatorPayout` (permissionless) re-points it after the collection changes
/// hands. That leg is paid whole to the collection owner; the NFT holder route above applies to the
/// LP-fee stream only.
///
/// ART->DEX HOLDER COMMITMENT (docs/ART_DEX_DESIGN.md). When the collection's write-once
/// `holderRewards()` is the distributor `nftFeeDistributorFactory` built for it, the launch binds
/// BOTH creator streams -- the hook's creator leg and this contract's LP-fee share, quote and token
/// legs -- to that distributor, permanently, and fixes the creator-chosen `holderShareBps` in it. The
/// distributor pays that share to NFT holders pro rata and the rest to the collection owner.
/// `syncCreatorPayout` then refuses (`PayoutCommitted`), `claimAndForwardStockFees` pays the
/// distributor whole, and `setHolderRewardsRoute` is ignored for that coin. Nothing can re-point it.
///
/// CREATOR TERMS. A DIRECT launch by the collection owner (`graduateToStockWithTerms`) takes the
/// owner's own `creatorTaxBps` / `excessToCreatorBps` and may dev-buy in the same transaction. A
/// RELAYED launch stays at 1% / 0 and must launch exactly the name, symbol, quote and holder share
/// the collection owner hashed into `setStockGraduationOptIn` (N3).
///
/// NO STUCK FUNDS: between transactions this contract is owed nothing and holds nothing. Native is
/// forwarded or refunded inside the launch; the dev buy's quote is measured in, spent through the
/// router with an exact allowance that is zeroed, and any remainder returned in the same call; LP
/// fees are measured and forwarded inside `claimAndForwardStockFees`; the hook's creator leg never
/// arrives. Anything forced in regardless leaves through `rescueNative` / `rescueToken`, both
/// permissionless and paid to `owner`.
contract PeddlesNftStockGraduationOrchestrator {
    address public owner;
    IPeddlesStockLaunchpadGrad public immutable stockLaunchpad;
    /// @notice The `PeddlesNftFeeDistributorFactory` whose distributors count as a holder
    /// commitment. IMMUTABLE.
    INftFeeDistributorFactoryGrad public immutable nftFeeDistributorFactory;

    /// @notice VESTIGIAL — GRANTS NOTHING. Since graduation became permissionless (2026-09-19) no
    /// function in this contract reads this flag: an "operator" can do exactly what a stranger can,
    /// which is relay the launch the collection owner committed to, and nothing else.
    ///
    /// @dev It is kept for ONE reason: `DeployPeddles._notFlagged` and `VerifyLive` read
    /// `operators(address)` / write `setOperator(address,bool)` through string-encoded low-level
    /// calls, and `_notFlagged` fails the deploy closed when the getter is unreadable. Delete this
    /// mapping, `setOperator` and `OperatorUpdated` together with
    /// `script/DeployPeddles.s.sol` (the `operators(address)` role scan) and
    /// `script/VerifyLive.s.sol` (the `setOperator` relay phase and its `_boolSetter` row).
    mapping(address => bool) public operators;

    /// @notice Graduated coin => the bonding collection it came from. This is the ONLY input to
    /// fee routing, and it is write-once at graduation time (never owner-settable).
    mapping(address => address) public collectionOf;
    /// @notice Bonding collection => the coin it graduated into.
    mapping(address => address) public tokenOf;
    /// @notice Collection owner's consent to a RELAYED stock graduation: the `relayParamsHash` of
    /// the one launch a relayer may perform. Zero = no consent. Revocable until graduated.
    mapping(address => bytes32) public stockGraduationOptIn;

    /// @notice Coin => the collection fee distributor its creator streams are committed to, or zero.
    /// Write-once at launch.
    mapping(address => address) public distributorOf;

    /// @notice A direct launch by the collection owner.
    struct DirectGraduation {
        address collection;
        string name;
        string symbol;
        address quote;
        /// @dev All-in pool tax, bps (100..1000), fixed for the life of the pool.
        uint16 creatorTaxBps;
        /// @dev Creator's share of the tax above 1.00%, bps (0..10000), fixed.
        uint16 excessToCreatorBps;
        /// @dev Share of the creator streams paid to NFT holders, bps (0..10000). Must be 0 unless
        /// the collection is bound to its canonical fee distributor. Fixed.
        uint16 holderShareBps;
        /// @dev Quote base units to spend on a dev buy for the caller; 0 for none.
        uint256 devBuyQuoteIn;
        /// @dev Slippage floor for the dev buy, measured as the caller's token balance delta.
        uint256 minTokensOut;
    }

    /// @notice Collection => the `PeddlesNftHolderRewards` distributor its NFT holders are paid
    /// through. Settable ONLY by that collection's own owner.
    mapping(address => address) public holderRewardsOf;
    /// @notice Collection => the share of the collection owner's QUOTE fee leg, in bps, routed to
    /// `holderRewardsOf[collection]`. Settable ONLY by that collection's own owner.
    mapping(address => uint16) public holderShareBps;

    /// @dev The whole of the collection owner's own share may be given to holders, and no more.
    /// A share above 100% is arithmetically meaningless, so this is the natural bound.
    uint16 public constant BPS = 10_000;
    uint16 public constant MAX_HOLDER_SHARE_BPS = 10_000;

    /// @notice The fixed all-in pool tax every graduated coin launches at: 1.00%, the fee hook's
    /// `MIN_CREATOR_TAX_BPS`, with `excessToCreatorBps` 0. Permanent for the coin -- the hook has no
    /// setter for either. At the floor there is no excess to split (at most the odd base unit the
    /// two floored legs leave, which goes to the coin's holders), so 0 is the honest value.
    ///
    /// @dev Why the floor, and why a constant. Neither collection kind carries a tax setting, so
    /// there is no creator-configured value to pass. A caller argument would let a RELAYED
    /// graduation (owner/operator, acting on an opt-in that named no rate) choose a permanent tax the
    /// collection owner never agreed to. The floor is the one rate that needs no such consent: it is
    /// exactly the two fixed legs (0.50% platform / 0.50% creator), sends nothing to the coin's
    /// holders, and is the least any hooked pool can charge. NFT holders are paid through the LP-fee
    /// holder route instead.
    uint16 public constant GRADUATION_CREATOR_TAX_BPS = 100;

    error NotOwner();
    error ShareTooHigh();
    error NotCollectionOwner();
    error NotOptedIn();
    error ZeroAddress();
    error NotReady();
    error UnknownToken();
    error RelayParamsMismatch();
    error PayoutCommitted();
    error NoHolderDistributor();
    error DistributorCollectionMismatch();
    error NoDevBuy();
    error NoSwapRouter();
    error QuotePullFailed();
    error DevBuySlippage();

    event NativeRescued(address indexed to, uint256 amount);
    event TokenRescued(address indexed asset, address indexed to, uint256 amount);
    /// @notice The fee hook now pays `token`'s creator leg straight to `payout`.
    event CreatorPayoutBound(address indexed token, bytes32 indexed poolId, address indexed payout);
    error AlreadyGraduated();
    error Reentrant();
    error TransferFailed();
    error LaunchFeeRequired(uint256 required, uint256 supplied);
    error RefundFailed();

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event OperatorUpdated(address indexed operator, bool allowed);
    event StockGraduationOptInSet(address indexed collection, address indexed collectionOwner, bytes32 paramsHash);
    /// @notice The same commitment, WITH ITS PREIMAGE. A hash authorises a relay; it does not tell
    /// anyone what to send. Publishing the parameters on-chain is what makes the relay permissionless
    /// IN PRACTICE rather than only in principle — a stranger can rebuild the exact call from this
    /// log and needs nothing from Peddles, no API and no off-chain store, to do it.
    event StockGraduationCommitted(
        address indexed collection,
        address indexed collectionOwner,
        bytes32 paramsHash,
        string name,
        string symbol,
        address quote,
        uint16 holderShareBps
    );
    /// @notice The launch committed this coin's creator streams to the collection's distributor,
    /// `holderShareBps` to NFT holders and the rest to the collection owner. Permanent.
    event HolderFeesCommitted(
        address indexed collection,
        address indexed token,
        address indexed distributor,
        bytes32 poolId,
        uint16 holderShareBps
    );
    event DevBought(address indexed token, address indexed buyer, uint256 quoteIn, uint256 tokensOut);
    event NftGraduatedToStock(
        address indexed collection,
        address indexed token,
        address indexed quote,
        address liquidityVault,
        address burnVault
    );
    event StockFeesForwarded(address indexed token, address to, uint256 quoteAmount, uint256 tokenAmount);
    event HolderRewardsRouteSet(
        address indexed collection, address indexed collectionOwner, address indexed distributor, uint16 shareBps
    );
    event HolderRewardsFunded(
        address indexed token, address indexed distributor, uint256 quoteAmount, uint16 shareBps
    );

    uint256 private _locked;

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier nonReentrant() {
        if (_locked != 0) revert Reentrant();
        _locked = 1;
        _;
        _locked = 0;
    }

    constructor(address owner_, address stockLaunchpad_, address nftFeeDistributorFactory_) {
        if (owner_ == address(0) || stockLaunchpad_ == address(0) || nftFeeDistributorFactory_ == address(0)) {
            revert ZeroAddress();
        }
        owner = owner_;
        stockLaunchpad = IPeddlesStockLaunchpadGrad(stockLaunchpad_);
        nftFeeDistributorFactory = INftFeeDistributorFactoryGrad(nftFeeDistributorFactory_);
        emit OwnershipTransferred(address(0), owner_);
    }

    function transferOwnership(address nextOwner) external onlyOwner {
        if (nextOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, nextOwner);
        owner = nextOwner;
    }

    /// @notice Writes the vestigial `operators` flag. It authorises nothing — see the mapping.
    function setOperator(address operator, bool allowed) external onlyOwner {
        if (operator == address(0)) revert ZeroAddress();
        operators[operator] = allowed;
        emit OperatorUpdated(operator, allowed);
    }

    /// @notice The exact launch a relayer may perform for `collection`: its name, symbol, quote and
    /// holder share, on this chain and this orchestrator. The collection owner signs it into
    /// `setStockGraduationOptIn`; a relay whose arguments hash differently reverts.
    function relayParamsHash(
        address collection,
        string calldata name,
        string calldata symbol,
        address quote,
        uint16 holdersBps
    ) public view returns (bytes32) {
        return keccak256(abi.encode(block.chainid, address(this), collection, name, symbol, quote, holdersBps));
    }

    /// @notice Collection owner consents to ONE relayed stock graduation — the one whose
    /// `relayParamsHash` is `paramsHash` — or withdraws consent with `bytes32(0)`. Only the
    /// collection's own owner can set this; the protocol cannot self-authorize, and a relayer can no
    /// longer choose the name, symbol, quote or holder share that permanently latch the collection.
    ///
    /// Once set, ANY caller may relay that exact launch. Consent is revocable at any time until the
    /// collection has graduated, and revoking it puts the launch back in the owner's hands alone.
    function setStockGraduationOptIn(address collection, bytes32 paramsHash) external {
        if (collection == address(0)) revert ZeroAddress();
        address collectionOwner = IPeddlesGraduatableCollection(collection).owner();
        if (msg.sender != collectionOwner) revert NotCollectionOwner();
        stockGraduationOptIn[collection] = paramsHash;
        emit StockGraduationOptInSet(collection, collectionOwner, paramsHash);
    }

    /// @notice Commit a relayed stock graduation AND publish its preimage, in one call. This is the
    /// entry a creator should use; `setStockGraduationOptIn` above remains for revoking
    /// (`bytes32(0)`) and for a creator who would rather not put the parameters in a log.
    ///
    /// @dev The hash is computed here rather than supplied, so the log and the stored commitment
    /// cannot disagree: whatever this event carries IS what a relayer may send.
    function commitStockGraduation(
        address collection,
        string calldata name,
        string calldata symbol,
        address quote,
        uint16 holdersBps
    ) external returns (bytes32 paramsHash) {
        if (collection == address(0) || quote == address(0)) revert ZeroAddress();
        address collectionOwner = IPeddlesGraduatableCollection(collection).owner();
        if (msg.sender != collectionOwner) revert NotCollectionOwner();
        paramsHash = relayParamsHash(collection, name, symbol, quote, holdersBps);
        stockGraduationOptIn[collection] = paramsHash;
        emit StockGraduationOptInSet(collection, collectionOwner, paramsHash);
        emit StockGraduationCommitted(collection, collectionOwner, paramsHash, name, symbol, quote, holdersBps);
    }

    /// @notice Graduate a ready collection — bonding OR art — into a stock-paired coin at the fixed
    /// 1% / 0 terms. PERMISSIONLESS over a parameter commitment the collection owner made in advance.
    /// @dev Consent is mandatory and it is the ONLY gate: the caller is either the collection owner,
    /// or anybody at all relaying EXACTLY the launch the collection owner hashed into
    /// `setStockGraduationOptIn`. No protocol key is involved — a stranger, a keeper, an NFT holder
    /// and the protocol owner are all the same caller here, and none of them can deviate by one byte
    /// from the committed name, symbol, quote or holder share without `RelayParamsMismatch`.
    ///
    /// WHAT A RELAYER STILL CHOOSES: the block. `graduationReady()` bounds it (a bonding collection
    /// must have sold out or closed; an art collection must have been armed by its creator), the
    /// terms are pinned to the 1% floor, and the opening tax decays over the sniper window, so a
    /// relayer who positions around the open pays the opener's rate like anyone else.
    ///
    /// PAYABLE because `PeddlesStockLaunchpad.createCoin` charges the flat anti-spam launch fee,
    /// read from the launchpad at call time. Excess is refunded to the caller.
    /// @param holdersBps share of the creator streams paid to NFT holders; must be 0 unless the
    ///        collection is bound to its canonical fee distributor
    function graduateToStock(
        address collection,
        string calldata name,
        string calldata symbol,
        address quote,
        uint16 holdersBps
    ) external payable nonReentrant returns (address token) {
        if (collection == address(0) || quote == address(0)) revert ZeroAddress();
        address collectionOwner = IPeddlesGraduatableCollection(collection).owner();
        if (collectionOwner == address(0)) revert ZeroAddress();
        if (msg.sender != collectionOwner) {
            bytes32 consent = stockGraduationOptIn[collection];
            if (consent == bytes32(0)) revert NotOptedIn();
            if (consent != relayParamsHash(collection, name, symbol, quote, holdersBps)) {
                revert RelayParamsMismatch();
            }
        }
        token = _graduate(
            collection, collectionOwner, name, symbol, quote, GRADUATION_CREATOR_TAX_BPS, 0, holdersBps
        );
        _refundExcess();
    }

    /// @notice Q1/Q5: the collection owner launches with THEIR OWN terms, and may dev-buy in the
    /// same transaction. Direct only — a relayer has no consent to a rate or a purchase.
    ///
    /// DEV BUY. `devBuyQuoteIn` of the quote is pulled from the caller (approve this contract
    /// first), measured as a balance delta, spent through the launchpad's stock swap router with
    /// an exact allowance that is zeroed afterwards, and delivered straight to the caller. What
    /// the caller received is measured as their own balance delta and held to `minTokensOut`;
    /// anything the router did not consume is returned. It pays the pool's ordinary tax: the fee
    /// hook recognises a swap in the transaction that registered the pool, exactly as for
    /// `PeddlesStockLaunchpad.createCoinAndBuy`.
    function graduateToStockWithTerms(DirectGraduation calldata g)
        external
        payable
        nonReentrant
        returns (address token, uint256 tokensOut)
    {
        if (g.collection == address(0) || g.quote == address(0)) revert ZeroAddress();
        address collectionOwner = IPeddlesGraduatableCollection(g.collection).owner();
        if (collectionOwner == address(0) || msg.sender != collectionOwner) revert NotCollectionOwner();
        token = _graduate(
            g.collection,
            collectionOwner,
            g.name,
            g.symbol,
            g.quote,
            g.creatorTaxBps,
            g.excessToCreatorBps,
            g.holderShareBps
        );
        tokensOut = _devBuy(token, g.quote, g.devBuyQuoteIn, g.minTokensOut);
        _refundExcess();
    }

    /// @dev The shared launch. Readiness, the holder commitment, the launch fee, the hook payout
    /// binding and the one-shot latch are identical for both entry points.
    function _graduate(
        address collection,
        address collectionOwner,
        string calldata name,
        string calldata symbol,
        address quote,
        uint16 creatorTaxBps,
        uint16 excessToCreatorBps,
        uint16 holdersBps
    ) private returns (address token) {
        IPeddlesGraduatableCollection c = IPeddlesGraduatableCollection(collection);
        if (!c.graduationReady()) revert NotReady();
        if (c.graduated()) revert AlreadyGraduated();
        // Resolved BEFORE the coin exists, so a wrong split statement costs nothing.
        address distributor = _holderDistributor(collection, holdersBps);

        uint256 fee = stockLaunchpad.launchFee();
        if (msg.value < fee) revert LaunchFeeRequired(fee, msg.value);
        token = stockLaunchpad.createCoin{value: fee}(name, symbol, quote, creatorTaxBps, excessToCreatorBps);

        // Route the hook's creator leg BEFORE anything else can happen to this pool. Same
        // transaction as registration, so no swap -- and therefore no accrual and no `sweepCreator`
        // to this contract -- can precede it. NOT best-effort: if the pool is not registered to this
        // contract, this reverts and the graduation does not happen.
        if (distributor == address(0)) {
            _bindCreatorPayout(token, collectionOwner);
        } else {
            bytes32 poolId = _bindCreatorPayout(token, distributor);
            distributorOf[token] = distributor;
            address hook = stockLaunchpad.feeHook();
            INftFeeDistributorGrad(distributor).initAssets(
                quote, token, IPeddlesFeeHookPoolCreator(hook).poolConfig(poolId).rewards, holdersBps
            );
            emit HolderFeesCommitted(collection, token, distributor, poolId, holdersBps);
        }

        // Bind the coin's fee stream to the collection BEFORE the graduation is recorded. This is
        // the only writer of `collectionOf`, so the payee can never be re-pointed later.
        collectionOf[token] = collection;
        tokenOf[collection] = token;
        (address liquidityVault, address airdropVault, address vestingVault, address burnVault) =
            stockLaunchpad.vaultsOf(token);

        // Vaults may be address(0) under the 0-airdrop / 0-vesting default; the collection
        // tolerates zero vault addresses.
        c.recordPeddlesGraduation(token, liquidityVault, vestingVault, airdropVault, burnVault);

        emit NftGraduatedToStock(collection, token, quote, liquidityVault, burnVault);
    }

    /// @dev The collection's canonical fee distributor, or zero. Committed means
    /// `collection.holderRewards()` was built by `nftFeeDistributorFactory` FOR this collection. A
    /// foreign or legacy distributor is not a commitment (and then the holder share must be 0); a
    /// canonical distributor of ANOTHER collection is refused outright.
    function _holderDistributor(address collection, uint16 holdersBps) private view returns (address d) {
        if (holdersBps > BPS) revert ShareTooHigh();
        (bool ok, bytes memory ret) = collection.staticcall(abi.encodeWithSignature("holderRewards()"));
        if (ok && ret.length >= 32) d = abi.decode(ret, (address));
        if (d == address(0) || !nftFeeDistributorFactory.isDistributor(d)) {
            if (holdersBps != 0) revert NoHolderDistributor();
            return address(0);
        }
        if (INftFeeDistributorGrad(d).collection() != collection) revert DistributorCollectionMismatch();
    }

    /// @dev Refund whatever native the launch fee did not use. Last, after every state change.
    function _refundExcess() private {
        uint256 refund = msg.value - stockLaunchpad.launchFee();
        if (refund != 0) {
            (bool refunded,) = payable(msg.sender).call{value: refund}("");
            if (!refunded) revert RefundFailed();
        }
    }

    /// @dev Buy `token` with `quoteIn` of the caller's quote, for the caller, leaving nothing here.
    function _devBuy(address token, address quote, uint256 quoteIn, uint256 minTokensOut)
        private
        returns (uint256 tokensOut)
    {
        if (quoteIn == 0) {
            // A slippage floor with nothing to spend is a mistake, not a no-op.
            if (minTokensOut != 0) revert NoDevBuy();
            return 0;
        }
        address router = stockLaunchpad.swapRouter();
        if (router == address(0)) revert NoSwapRouter();

        uint256 quoteBefore = IGradERC20(quote).balanceOf(address(this));
        _safeTransferFrom(quote, msg.sender, address(this), quoteIn);
        uint256 spend = IGradERC20(quote).balanceOf(address(this)) - quoteBefore;
        if (spend == 0) revert QuotePullFailed();

        _safeApprove(quote, router, spend);
        tokensOut = IGradERC20(token).balanceOf(msg.sender);
        IStockRouterBuyGrad(router).buy(token, spend, minTokensOut, msg.sender);
        tokensOut = IGradERC20(token).balanceOf(msg.sender) - tokensOut;
        if (tokensOut < minTokensOut) revert DevBuySlippage();
        _safeApprove(quote, router, 0);

        uint256 leftover = IGradERC20(quote).balanceOf(address(this)) - quoteBefore;
        if (leftover != 0) _safeTransfer(quote, msg.sender, leftover);
        emit DevBought(token, msg.sender, spend, tokensOut);
    }

    /// @notice The ONLY address stock LP fees for `token` can ever be paid to.
    /// @dev For a coin this orchestrator graduated, that is the source collection's current owner
    /// — the NFT creator, or whoever they transferred the collection to (e.g. a holder-pro-rata
    /// distributor). For any other coin that somehow accrued a balance to this contract, the
    /// launchpad treasury is the fallback so no balance is ever stranded. Neither branch takes a
    /// caller-supplied destination, so no privileged role can name the payee.
    function feeRecipient(address token) public view returns (address) {
        address committed = distributorOf[token];
        if (committed != address(0)) return committed;
        address collection = collectionOf[token];
        if (collection == address(0)) return stockLaunchpad.treasury();
        return IPeddlesGraduatableCollection(collection).owner();
    }

    /// @notice Re-point the fee hook's creator payout for `token` at the collection's CURRENT owner.
    /// @dev Graduation binds it to whoever owned the collection then. A collection is transferable,
    /// and `feeRecipient` follows it for LP fees; this lets the hook leg follow it too. Permissionless,
    /// with no destination argument -- it can only ever write `feeRecipient(token)` -- so it waits on
    /// no key: the new owner, a keeper or anyone else may call it.
    function syncCreatorPayout(address token) external nonReentrant {
        if (collectionOf[token] == address(0)) revert UnknownToken();
        // A committed coin's payout is the distributor, forever. Nothing re-points it.
        if (distributorOf[token] != address(0)) revert PayoutCommitted();
        _bindCreatorPayout(token, feeRecipient(token));
    }

    /// @dev Point the hook's creator payout for `token` at `payout`. Every revert bubbles (an
    /// unregistered pool, a pool not registered to this contract), by design. The launchpad's hook is
    /// immutable and registration is mandatory there, so a graduated coin always has a hooked,
    /// registered pool; this is the belt-and-braces check that it is registered to US.
    function _bindCreatorPayout(address token, address payout) private returns (bytes32 poolId) {
        address hook = stockLaunchpad.feeHook();
        if (payout == address(0)) revert ZeroAddress();
        poolId = _poolIdOf(token);
        IPeddlesFeeHookPoolCreator(hook).setCreatorPayout(poolId, payout);
        emit CreatorPayoutBound(token, poolId, payout);
    }

    function _poolIdOf(address token) private view returns (bytes32 poolId) {
        (,, poolId,,,) = stockLaunchpad.coins(token);
    }

    /// @notice The collection owner directs part of THEIR OWN fee stream to the NFT holders who
    /// minted the collection.
    ///
    /// @dev This is the piece that turns "graduates into a token" into something holders actually
    /// receive. Mint proceeds were already split 80/10/10 at mint time and the graduated coin puts
    /// 100% of supply into the pool, so there is nothing left to airdrop — the ongoing fee stream
    /// is what remains, and this routes a slice of it to `PeddlesNftHolderRewards`, which pays it
    /// out pro-rata to whoever HOLDS the pieces while the fees accrue.
    ///
    /// AUTHORITY: only `collection.owner()`. The protocol owner and operators cannot set, raise,
    /// lower, or clear this — they have no code path to it at all. It is not a protocol fee and no
    /// part of it reaches the protocol.
    /// BOUND: `shareBps <= MAX_HOLDER_SHARE_BPS` (100%), enforced here. Above 100% is meaningless.
    /// REVERSIBLE: the collection owner may re-point or zero it at any time. That only affects
    /// FUTURE forwards — quote already delivered to a distributor belongs to holders permanently
    /// and cannot be recalled from here or from anywhere else.
    /// @param collection the graduated (or not yet graduated) bonding collection
    /// @param distributor the `PeddlesNftHolderRewards` deployed for it; may be zero only when
    ///        `shareBps` is zero, i.e. when turning the route off
    /// @param shareBps share of the collection owner's QUOTE fee leg to route there, in bps
    function setHolderRewardsRoute(address collection, address distributor, uint16 shareBps) external {
        if (collection == address(0)) revert ZeroAddress();
        if (shareBps > MAX_HOLDER_SHARE_BPS) revert ShareTooHigh();
        if (shareBps > 0 && distributor == address(0)) revert ZeroAddress();

        address collectionOwner = IPeddlesGraduatableCollection(collection).owner();
        if (msg.sender != collectionOwner) revert NotCollectionOwner();

        holderRewardsOf[collection] = distributor;
        holderShareBps[collection] = shareBps;
        emit HolderRewardsRouteSet(collection, collectionOwner, distributor, shareBps);
    }

    /// @notice The holder-rewards route in force for a graduated coin: where the holder slice goes
    /// and how big it is. Resolves to `(address(0), 0)` when the collection owner has not opted in,
    /// in which case the stream behaves exactly as before.
    function holderRoute(address token) public view returns (address distributor, uint16 shareBps) {
        address collection = collectionOf[token];
        if (collection == address(0)) return (address(0), 0);
        distributor = holderRewardsOf[collection];
        shareBps = holderShareBps[collection];
        if (distributor == address(0)) return (address(0), 0);
    }

    /// @notice Harvest the coin's LP fees and push this orchestrator's creator share to
    /// `feeRecipient(token)`, less the holder slice the collection owner configured, which goes to
    /// their chosen `PeddlesNftHolderRewards`. PERMISSIONLESS — anyone may trigger it (a keeper,
    /// the creator, an NFT holder). BOTH destinations come from state; there is still no
    /// destination parameter, so no caller and no privileged role can name a payee.
    /// Reverts via the launchpad's NOTHING_TO_CLAIM when there is nothing to move.
    ///
    /// @dev Only the QUOTE leg is split. The distributor pays holders in the pool's quote asset —
    /// a TSLA-paired graduation pays TSLA — so sending it the graduated coin instead would put an
    /// asset it cannot distribute into a contract whose rescue path its own owner controls. The
    /// token leg therefore always goes whole to the collection owner, and nothing is ever stranded.
    function claimAndForwardStockFees(address token) external nonReentrant {
        address to = feeRecipient(token);
        if (to == address(0)) revert ZeroAddress();
        (, address quote,,,,) = stockLaunchpad.coins(token);

        // MEASURED BY BALANCE DELTA, not by what collectAndClaim REPORTS.
        //
        // The two differ for a fee-on-transfer or rebasing quote leg: the launchpad reports the
        // amount it sent, this contract receives less, and paying out the reported figure then
        // reverts for want of balance. That is not a failed call that can be retried — the fees
        // have ALREADY moved here by then, so they are stranded, and every future claim for the
        // same token reverts the same way. One hostile or merely unusual quote asset would brick
        // the whole fee stream permanently, with no rescue for the ERC-20 it stranded.
        //
        // Measuring the delta cannot overstate what is here, so every branch below pays out of a
        // balance this contract actually holds.
        uint256 quoteBefore = IGradERC20(quote).balanceOf(address(this));
        uint256 tokenBefore = IGradERC20(token).balanceOf(address(this));
        stockLaunchpad.collectAndClaim(token);
        uint256 quoteAmount = IGradERC20(quote).balanceOf(address(this)) - quoteBefore;
        uint256 tokenAmount = IGradERC20(token).balanceOf(address(this)) - tokenBefore;

        // Committed: both legs go whole to `feeRecipient` -- the distributor, which applies the
        // launch-fixed split. The legacy holder route is ignored for a committed coin.
        (address distributor, uint16 shareBps) =
            distributorOf[token] != address(0) ? (address(0), uint16(0)) : holderRoute(token);
        uint256 holderQuote;
        if (quoteAmount > 0 && shareBps > 0) {
            holderQuote = quoteAmount * shareBps / BPS;
            // Whatever rounding leaves behind stays with the collection owner — never stranded here.
            if (holderQuote > 0) {
                _safeTransfer(quote, distributor, holderQuote);
                emit HolderRewardsFunded(token, distributor, holderQuote, shareBps);
            }
        }

        uint256 ownerQuote = quoteAmount - holderQuote;
        if (ownerQuote > 0) _safeTransfer(quote, to, ownerQuote);
        if (tokenAmount > 0) _safeTransfer(token, to, tokenAmount);
        emit StockFeesForwarded(token, to, ownerQuote, tokenAmount);
    }

    /// @dev ERC-20 transfer that tolerates the non-standard tokens. `require(transfer(...))`
    /// reverts against a token that returns NO data — USDT is the well-known one — because the
    /// decoder cannot produce a bool from an empty return. A tokenised-stock quote leg is a
    /// plausible one, and this contract must be able to pay in whatever the pool is paired to.
    function _safeTransfer(address asset, address to, uint256 amount) private {
        _call(asset, abi.encodeWithSelector(IGradERC20.transfer.selector, to, amount));
    }

    function _safeTransferFrom(address asset, address from, address to, uint256 amount) private {
        _call(asset, abi.encodeWithSelector(IGradERC20.transferFrom.selector, from, to, amount));
    }

    function _safeApprove(address asset, address spender, uint256 amount) private {
        _call(asset, abi.encodeWithSelector(IGradERC20.approve.selector, spender, amount));
    }

    function _call(address asset, bytes memory data) private {
        (bool ok, bytes memory ret) = asset.call(data);
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert TransferFailed();
    }

    /// @notice NATIVE CURRENCY'S EXIT. This contract has no `receive`, no `fallback` and no payable
    /// function, so native is never deposited in the ordinary course — which is exactly why it had
    /// no way out. Native can still be FORCED in by `selfdestruct` or by this address being named a
    /// block's fee recipient, and neither is refusable.
    ///
    /// Nothing here is ever owed in native, so the whole balance is by definition stray. Pays
    /// `owner` with no destination parameter. Permissionless, so the exit does not wait on a key.
    function rescueNative() external nonReentrant returns (uint256 amount) {
        amount = address(this).balance;
        if (amount == 0) revert NotReady();
        address to = owner;
        if (to == address(0)) revert ZeroAddress();
        (bool ok,) = payable(to).call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit NativeRescued(to, amount);
    }

    /// @notice ERC-20 EXIT. Nothing legitimate is held here between transactions: LP fees are
    /// measured and forwarded inside `claimAndForwardStockFees`, and the hook's creator leg is paid to
    /// the collection owner directly (see `_bindCreatorPayout`). So any ERC-20 balance is stray -- a
    /// push by a stranger, an airdrop -- with no collection it could be attributed to. Pays `owner`,
    /// no destination parameter, permissionless.
    ///
    /// @dev `nonReentrant` shares the lock with `claimAndForwardStockFees`, so a hostile quote token
    /// calling back into this from inside a forward cannot sweep a balance that is mid-transfer.
    function rescueToken(address asset) external nonReentrant returns (uint256 amount) {
        amount = IGradERC20(asset).balanceOf(address(this));
        if (amount == 0) revert NotReady();
        address to = owner;
        _safeTransfer(asset, to, amount);
        emit TokenRescued(asset, to, amount);
    }
}
