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

interface IPartnerFwdERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address owner) external view returns (uint256);
}

/// @dev Layout-identical to `RoutePoolKey` / `PathHop` in `PeddlesRouteSwapRouter` (and to
/// `FwdPoolKey` / `FwdPathHop` in `PeddlesFeeForwarder`). ABI encoding is by layout, so the route
/// router's selectors are the same whatever these structs are called.
struct PartnerFwdPoolKey {
    address currency0;
    address currency1;
    uint24 fee;
    int24 tickSpacing;
    address hooks;
}

struct PartnerFwdPathHop {
    PartnerFwdPoolKey key;
    bool zeroForOne;
}

/// @dev Layout-identical to `PancakeHop` in `PeddlesRouteSwapRouter`.
struct PartnerFwdPancakeHop {
    address tokenIn;
    address tokenOut;
    uint24 fee;
}

/// @notice Who routed the trade, what they charge on top, and Peddles' proof that they are registered.
/// @param partner where the partner's money is paid. Named by the voucher.
/// @param partnerFeeBps the partner's OWN fee on top, in bps of the native leg; 0..`maxPartnerFeeBps`.
/// It is not part of the voucher: the trader's wallet signs the calldata that carries it.
/// @param expiry the voucher's last valid second (`block.timestamp <= expiry`).
/// @param signature `partnerSigner`'s 65-byte EIP-712 signature over `PartnerVoucher(partner, expiry)`.
struct FwdPartner {
    address partner;
    uint16 partnerFeeBps;
    uint256 expiry;
    bytes signature;
}

/// @dev `PeddlesV4SwapRouter`: a WETH-paired launch, native in and out.
interface IPartnerFwdV4SwapRouter {
    function buy(address token, uint256 minOut, address to) external payable returns (uint256);
    function sell(address token, uint256 amountInGross, uint256 minOut, address to) external returns (uint256);
}

/// @dev `PeddlesRouteSwapRouter`: every launch type (and, externally, any v4 token), native in and out.
interface IPartnerFwdRouteSwapRouter {
    function v4SwapRouter() external view returns (address);
    function buyWithNative(
        address token,
        PartnerFwdPathHop[] calldata hops,
        uint256 minTokensOut,
        address to,
        uint256 deadline
    ) external payable returns (uint256);
    function sellForNative(
        address token,
        uint256 amountIn,
        PartnerFwdPathHop[] calldata hops,
        uint256 minNativeOut,
        address to,
        uint256 deadline
    ) external returns (uint256);
    function buyExternalWithNative(
        address token,
        PartnerFwdPathHop[] calldata hops,
        uint256 minTokensOut,
        address to,
        uint256 deadline
    ) external payable returns (uint256);
    function sellExternalForNative(
        address token,
        uint256 amountIn,
        PartnerFwdPathHop[] calldata hops,
        uint256 minNativeOut,
        address to,
        uint256 deadline
    ) external returns (uint256);
    function buyWithNativePancake(
        address token,
        PartnerFwdPancakeHop[] calldata hops,
        uint256 minTokensOut,
        address to,
        uint256 deadline
    ) external payable returns (uint256);
    function sellForNativePancake(
        address token,
        uint256 amountIn,
        PartnerFwdPancakeHop[] calldata hops,
        uint256 minNativeOut,
        address to,
        uint256 deadline
    ) external returns (uint256);
}

/// @title PeddlesPartnerFeeForwarder — the platform trading fee, shared with the developer who routed the trade
/// @notice `PeddlesFeeForwarder` takes the platform fee inside the swap transaction and pays all of it
/// to one wallet. This contract does the same job over the same routers for trades routed by a
/// REGISTERED PARTNER (a developer building on Peddles through the developer portal), and splits
/// the money three ways in that one transaction:
///
///   1. the platform fee, `feeBps` of the native leg — `partnerShareBps` of it (10% at deploy) to
///      the partner, the rest to `feeRecipient`;
///   2. the partner's own fee on top, `partnerFeeBps` of the native leg — all of it to the partner.
///
/// It is an ADD-ON and a SIBLING of `PeddlesFeeForwarder`, which is unchanged and still serves the
/// Terminal and the trade bot. It calls the two Peddles routers through their public functions and
/// nothing in the core stack knows it exists: deploying or redeploying it voids no mined salt.
///
/// THIS IS THE PARTNER PATH ONLY. Every entry point needs a valid voucher; a trade with no partner
/// uses `PeddlesFeeForwarder`.
///
/// THE VOUCHER. A partner is honoured only if Peddles registered it: `partnerSigner` (the API's
/// key) signs the EIP-712 message `PartnerVoucher(address partner,uint256 expiry)` under a domain
/// bound to this chain and this contract. Without it anyone could name themselves partner and
/// rebate a share of the platform fee to themselves. A voucher authorises an ADDRESS, not a trade:
/// it is deliberately reusable on every trade until `expiry`, carries no nonce, and is public once
/// used — which is harmless, because all it can do is pay the address it names. It stops working
/// when it expires, when the owner revokes that partner (`revokePartner`, checked on every trade),
/// or when the owner rotates `partnerSigner` (every voucher the old key signed dies at once).
/// `partnerSigner` has ONE power — vouching. It can never move funds, change a rate or pause.
///
/// TYPED CALLS ONLY. As in `PeddlesFeeForwarder`: no `target`, no `calldata` parameter. Each entry
/// point calls ONE fixed function on ONE immutable router, with the recipient fixed to the caller
/// (a buy) or to this contract and then the caller (a sell). Tokens are only ever pulled from
/// `msg.sender`.
///
/// RATES ARE CALL PARAMETERS, BOUNDED BY IMMUTABLE CAPS. The trader's wallet signs the calldata
/// that carries `feeBps` and `partnerFeeBps`, so the rates a trader pays are the rates they
/// approved. `maxFeeBps` bounds the platform fee and `maxPartnerFeeBps` the partner's, and neither
/// can be raised. The owner can set a FLOOR on the platform fee (`minFeeBps`, never above
/// `maxFeeBps`) so the partner path cannot be used to trade at a zero platform fee, and the
/// partner's share of the platform fee (`partnerShareBps`, never above `MAX_PARTNER_SHARE_BPS`).
/// Neither setter changes what a trader pays in total for a given calldata.
///
/// WHAT EACH FEE IS TAKEN ON. Both fees are taken on the SAME base — the gross native leg — and
/// neither is taken on the other:
///   * BUY (native in): the base is what the buyer actually parted with, `msg.value` minus any
///     native the router refunded. `platformFee = base * feeBps / 10_000`,
///     `partnerFee = base * partnerFeeBps / 10_000`. The router swaps `msg.value` minus the
///     up-front carve-out `msg.value * (feeBps + partnerFeeBps) / 10_000`.
///   * SELL (native out): the base is the gross native the router paid here. Same two formulas;
///     the seller receives `gross - platformFee - partnerFee`, and `minOutNet` floors THAT.
///   * `partnerShare = platformFee * partnerShareBps / 10_000`; the partner receives
///     `partnerShare + partnerFee` and `feeRecipient` receives `platformFee - partnerShare`.
///
/// ROUNDING. Every division rounds DOWN. The two fees round down against the platform and the
/// partner, in the trader's favour, exactly as `PeddlesFeeForwarder` does. The split of the
/// platform fee rounds the partner's share down, so `feeRecipient` never receives less than
/// `1 - partnerShareBps` of it.
///
/// PARTIAL FILLS. As in `PeddlesFeeForwarder`: a router that cannot fill the whole buy refunds the
/// unspent native here; both fees are then re-taken on what the buyer actually parted with, never
/// on the refund, and everything else goes back to the buyer. A quote asset the route router hands
/// back goes to the buyer in kind. Tokens a router did not consume on a sell go back to the seller.
///
/// PAYING THE PARTNER CAN NEVER BLOCK THE TRADE. The partner is paid with a call capped at
/// `PARTNER_PAY_GAS` whose return data is never copied, under the same lock as the trade. If that
/// call fails — the partner is a contract that reverts, burns the gas, or tries to re-enter — the
/// amount is credited to `claimable[partner]` instead and the trade completes. Pull-payment rather
/// than redirecting the money to `feeRecipient`: a developer's earnings are never silently taken
/// because their wallet could not receive them in 50,000 gas. And a trader cannot underfund the
/// transaction to push an honest partner's payment into a credit: the trade reverts `GasTooLow`
/// unless enough gas is left for the partner to be handed the full `PARTNER_PAY_GAS`.
///
/// NO STUCK FUNDS. Per asset, what this contract can hold and the function that gets it out:
///   * native in flight — a buy's `msg.value`, a router's refund, a sell's proceeds, all inside one
///     locked call; leaves in that call as the fee (`feeRecipient`), the partner's payment, and
///     the remainder (the caller). `receive` refuses native from anyone but the two routers, and
///     from them outside a trade.
///   * native owed to a partner — `claimable[partner]`, credited only when the partner's bounded
///     payment failed; summed in `totalClaimable`. Exits: `withdraw()` (to the partner),
///     `withdrawTo(to)` (the partner names another address — for a contract that cannot receive
///     native itself), and, so that no balance waits on a partner that can never call either,
///     `reclaimStale(partner)`: the owner may move a balance to `feeRecipient` once
///     `CLAIM_STALE_AFTER` (30 days) has passed since that partner was last credited. Revoking a
///     partner does not touch what it is already owed.
///   * native forced in (selfdestruct) — `sweep(address(0))`, which moves only the balance ABOVE
///     `totalClaimable`.
///   * the launched / external token — arrives only in a sell (`transferFrom(msg.sender)`), is
///     approved to the router for exactly what arrived, and whatever the router did not take is
///     returned to the seller in the same call; the approval is reset to zero.
///   * a route's quote asset — arrives only as the route router's refund of an unfilled stock leg,
///     and is forwarded to the buyer in the same call.
///   * any ERC-20 pushed here outside a trade — `sweep(asset)`. No ERC-20 is ever owed at rest.
/// `sweep` is permissionless, pays only the immutable `feeRecipient`, and cannot run while a trade
/// is in flight (same lock).
///
/// THE OWNER (the chain's `protocolOwner`; no timelock, as everywhere in this stack) can: rotate
/// `partnerSigner`, revoke or reinstate a partner, set `partnerShareBps` and `minFeeBps` under
/// their caps, reclaim a stale claimable balance to `feeRecipient`, and hand over ownership in two
/// steps. It cannot change `feeRecipient`, either cap or either router, and has no path to funds
/// in flight or to a partner's balance younger than `CLAIM_STALE_AFTER`.
contract PeddlesPartnerFeeForwarder {
    /// @notice The highest platform-fee cap a deployment may be built with: 10%. A sanity bound on
    /// the constructor argument, not the working cap.
    uint16 public constant MAX_FEE_BPS_CEILING = 1_000;
    /// @notice The highest partner-fee cap a deployment may be built with: 5%.
    uint16 public constant MAX_PARTNER_FEE_BPS_CEILING = 500;
    /// @notice The most of the platform fee the owner may ever share with a partner: 50%.
    uint16 public constant MAX_PARTNER_SHARE_BPS = 5_000;
    /// @notice Gas forwarded to the partner's payment. Enough for an EOA or a multisig proxy's
    /// receive; a partner that needs more is credited `claimable` and withdraws.
    uint256 public constant PARTNER_PAY_GAS = 50_000;
    /// @dev What must be left when the partner is paid, so that the call can be handed the whole of
    /// `PARTNER_PAY_GAS`: that amount over 63/64 (EIP-150), plus the call's own worst-case cost
    /// (cold account 2,600 + value 9,000 + new account 25,000).
    uint256 private constant PARTNER_PAY_GAS_FLOOR = 91_000;
    /// @notice How long after a partner's last credit the owner may reclaim its unclaimed balance.
    uint256 public constant CLAIM_STALE_AFTER = 30 days; // owner, 2026-10-05
    /// @notice The EIP-712 type a voucher is signed over.
    bytes32 public constant VOUCHER_TYPEHASH = keccak256("PartnerVoucher(address partner,uint256 expiry)");
    /// @notice This deployment carries `buyRoutePancake` / `sellRoutePancake`.
    bool public constant PANCAKE_ROUTES = true;
    uint256 private constant BPS = 10_000;
    /// @dev secp256k1n / 2: the upper bound of a canonical (non-malleable) `s`.
    uint256 private constant HALF_N = 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0;

    /// @notice Where the platform's part of every fee (and every swept stray) is paid. Immutable.
    address public immutable feeRecipient;
    /// @notice The most any call may charge as the platform fee, in bps of the native leg. Immutable.
    uint16 public immutable maxFeeBps;
    /// @notice The most any call may charge as the partner's own fee, in bps of the native leg. Immutable.
    uint16 public immutable maxPartnerFeeBps;
    /// @notice `PeddlesV4SwapRouter` — the only router `buyV4` / `sellV4` call.
    address public immutable v4SwapRouter;
    /// @notice `PeddlesRouteSwapRouter` — the only router the route entry points call. May be
    /// address(0) on a chain without one; those entry points then refuse (`RouterNotConfigured`).
    address public immutable routeSwapRouter;

    /// @notice Admin: the chain's `protocolOwner`.
    address public owner;
    address public pendingOwner;
    /// @notice The key whose vouchers are honoured. Its only power.
    address public partnerSigner;
    /// @notice The partner's share of the platform fee, in bps of that fee. <= MAX_PARTNER_SHARE_BPS.
    uint16 public partnerShareBps;
    /// @notice The least platform fee a call may carry. <= maxFeeBps.
    uint16 public minFeeBps;

    /// @notice A revoked partner's vouchers are refused on every trade.
    mapping(address partner => bool) public partnerRevoked;
    /// @notice Native owed to a partner whose in-trade payment failed.
    mapping(address partner => uint256) public claimable;
    /// @notice When `claimable[partner]` last grew. The clock `reclaimStale` runs on.
    mapping(address partner => uint256) public lastCreditAt;
    /// @notice The sum of every `claimable` balance: native this contract owes at rest.
    uint256 public totalClaimable;

    uint256 private locked;

    /// @dev One trade's working set, in memory so no entry point runs out of stack.
    struct Trade {
        address token;
        address router;
        address partner;
        uint16 feeBps;
        uint16 partnerFeeBps;
        uint256 nativeBefore;
        uint256 tokenBefore;
        uint256 received;
    }

    error Locked();
    error NotOwner();
    error NotPendingOwner();
    error InvalidAddress();
    error InvalidAmount();
    error InvalidFee();
    error InvalidPartnerFee();
    error InvalidShare();
    error ConfigMismatch();
    error RouterNotConfigured();
    error Expired();
    error Slippage();
    error VoucherExpired();
    error BadVoucher();
    error PartnerIsRevoked();
    error NativeNotAllowed();
    error NothingToSweep();
    error NothingToWithdraw();
    error NotStale();
    error GasTooLow();
    error TransferFailed();
    error NativeTransferFailed();

    /// @notice One buy. `nativeIn` is what the caller sent; `refund` is native returned to the
    /// caller (the router's unfilled remainder plus any fee rebate). The fees are in `PartnerFees`.
    event PartnerBought(
        address indexed payer,
        address indexed token,
        address indexed partner,
        address router,
        uint256 nativeIn,
        uint256 refund,
        uint256 tokensOut
    );
    /// @notice One sell. `nativeGross` is what the router paid here; `nativeNet` went to the caller.
    event PartnerSold(
        address indexed payer,
        address indexed token,
        address indexed partner,
        address router,
        uint256 tokenIn,
        uint256 nativeGross,
        uint256 nativeNet
    );
    /// @notice The money of one trade, emitted exactly once per buy and per sell (zeros included).
    /// `feeRecipient` received `toFeeRecipient == platformFee - partnerShare`; the partner received
    /// `partnerShare + partnerFee`, paid or credited (see `PartnerPaid` / `PartnerCredited`).
    event PartnerFees(
        address indexed payer,
        address indexed token,
        address indexed partner,
        uint256 platformFee,
        uint256 partnerShare,
        uint256 partnerFee,
        uint256 toFeeRecipient,
        uint16 feeBps,
        uint16 partnerFeeBps
    );
    /// @notice The partner's payment reached its address inside the trade.
    event PartnerPaid(address indexed partner, uint256 amount);
    /// @notice The partner's payment failed and was credited to `claimable[partner]` instead.
    event PartnerCredited(address indexed partner, uint256 amount, uint256 claimableAfter);
    event Withdrawn(address indexed partner, address indexed to, uint256 amount);
    event StaleClaimReclaimed(address indexed partner, address indexed to, uint256 amount);
    event StraySwept(address indexed asset, address indexed to, uint256 amount);
    event PartnerSignerSet(address indexed previous, address indexed next);
    event PartnerShareBpsSet(uint16 previous, uint16 next);
    event MinFeeBpsSet(uint16 previous, uint16 next);
    event PartnerRevokedSet(address indexed partner, bool revoked);
    event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier nonReentrant() {
        if (locked != 0) revert Locked();
        locked = 1;
        _;
        locked = 0;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    /// @notice Constructor arguments, as one struct (nine values).
    /// @param owner the admin: the chain's `protocolOwner`. Non-zero.
    /// @param partnerSigner the key whose vouchers are honoured. Non-zero.
    /// @param feeRecipient where the platform's part of fees, and strays, are paid. Non-zero.
    /// @param maxFeeBps the cap on any call's `feeBps`; 1..MAX_FEE_BPS_CEILING.
    /// @param minFeeBps the opening floor on any call's `feeBps`; 0..maxFeeBps.
    /// @param maxPartnerFeeBps the cap on any call's `partnerFeeBps`; 0..MAX_PARTNER_FEE_BPS_CEILING.
    /// @param partnerShareBps the opening share of the platform fee paid to the partner;
    /// 0..MAX_PARTNER_SHARE_BPS.
    /// @param v4SwapRouter `PeddlesV4SwapRouter` for this chain. Non-zero, with code.
    /// @param routeSwapRouter `PeddlesRouteSwapRouter` for this chain, or address(0) where none is
    /// deployed. When set, it must name `v4SwapRouter` as its own V4 router — the two are one
    /// deployment, and a route router built on another stack pays native from a router this
    /// contract would refuse.
    struct Init {
        address owner;
        address partnerSigner;
        address feeRecipient;
        uint16 maxFeeBps;
        uint16 minFeeBps;
        uint16 maxPartnerFeeBps;
        uint16 partnerShareBps;
        address v4SwapRouter;
        address routeSwapRouter;
    }

    constructor(Init memory i) {
        if (i.owner == address(0) || i.partnerSigner == address(0)) revert InvalidAddress();
        if (i.feeRecipient == address(0) || i.v4SwapRouter == address(0)) revert InvalidAddress();
        if (i.maxFeeBps == 0 || i.maxFeeBps > MAX_FEE_BPS_CEILING || i.minFeeBps > i.maxFeeBps) revert InvalidFee();
        if (i.maxPartnerFeeBps > MAX_PARTNER_FEE_BPS_CEILING) revert InvalidPartnerFee();
        if (i.partnerShareBps > MAX_PARTNER_SHARE_BPS) revert InvalidShare();
        if (i.v4SwapRouter.code.length == 0) revert InvalidAddress();
        if (i.routeSwapRouter != address(0)) {
            if (i.routeSwapRouter.code.length == 0) revert InvalidAddress();
            if (IPartnerFwdRouteSwapRouter(i.routeSwapRouter).v4SwapRouter() != i.v4SwapRouter) revert ConfigMismatch();
        }
        owner = i.owner;
        partnerSigner = i.partnerSigner;
        feeRecipient = i.feeRecipient;
        maxFeeBps = i.maxFeeBps;
        minFeeBps = i.minFeeBps;
        maxPartnerFeeBps = i.maxPartnerFeeBps;
        partnerShareBps = i.partnerShareBps;
        v4SwapRouter = i.v4SwapRouter;
        routeSwapRouter = i.routeSwapRouter;
        emit OwnershipTransferred(address(0), i.owner);
        emit PartnerSignerSet(address(0), i.partnerSigner);
        emit PartnerShareBpsSet(0, i.partnerShareBps);
        emit MinFeeBpsSet(0, i.minFeeBps);
    }

    /// @dev Native arrives only from the two routers (a buy's refund, a sell's proceeds) and only
    /// while one of this contract's own trades is running. Everything else is refused.
    receive() external payable {
        if (locked == 0 || (msg.sender != v4SwapRouter && msg.sender != routeSwapRouter)) revert NativeNotAllowed();
    }

    // ---- The voucher ---------------------------------------------------------------------------

    /// @notice The EIP-712 domain: bound to this chain and this contract, so a voucher signed for
    /// one deployment is worthless on any other.
    function domainSeparator() public view returns (bytes32) {
        return keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("PeddlesPartnerFeeForwarder"),
                keccak256("1"),
                block.chainid,
                address(this)
            )
        );
    }

    /// @notice The digest `partnerSigner` signs to vouch for `partner` until `expiry`.
    function voucherDigest(address partner, uint256 expiry) public view returns (bytes32) {
        return keccak256(
            abi.encodePacked("\x19\x01", domainSeparator(), keccak256(abi.encode(VOUCHER_TYPEHASH, partner, expiry)))
        );
    }

    /// @notice Whether a trade naming `partner` with this voucher would be accepted right now.
    function voucherValid(address partner, uint256 expiry, bytes calldata signature) external view returns (bool) {
        return partner != address(0) && partner != address(this) && !partnerRevoked[partner]
            && block.timestamp <= expiry && _signed(partner, expiry, signature);
    }

    // ---- PeddlesV4SwapRouter: WETH-paired launches ------------------------------------------

    /// @notice Buy `token` with native through `PeddlesV4SwapRouter`. `feeBps` (platform) and
    /// `p.partnerFeeBps` (partner) are both taken on the native the buyer parts with, in the same
    /// call. Tokens go straight to the caller.
    /// @param minOut the floor on tokens out, enforced by the router.
    function buyV4(address token, uint256 minOut, uint16 feeBps, FwdPartner calldata p, uint256 deadline)
        external
        payable
        nonReentrant
        returns (uint256 tokensOut)
    {
        (Trade memory t, uint256 swapIn) = _openBuy(token, v4SwapRouter, feeBps, p, deadline);
        tokensOut = IPartnerFwdV4SwapRouter(t.router).buy{value: swapIn}(token, minOut, msg.sender);
        _closeBuy(t, tokensOut);
    }

    /// @notice Sell exactly `amountIn` of the caller's `token` through `PeddlesV4SwapRouter`; both
    /// fees come out of the native proceeds and the rest goes to the caller.
    /// @param minOutNet the floor on what reaches the caller, AFTER both fees, in native wei.
    function sellV4(
        address token,
        uint256 amountIn,
        uint256 minOutNet,
        uint16 feeBps,
        FwdPartner calldata p,
        uint256 deadline
    ) external nonReentrant returns (uint256 nativeNet) {
        Trade memory t = _openSell(token, amountIn, v4SwapRouter, feeBps, p, deadline);
        IPartnerFwdV4SwapRouter(t.router).sell(token, t.received, minOutNet, address(this));
        nativeNet = _closeSell(t, minOutNet);
    }

    // ---- PeddlesRouteSwapRouter: every launch type ------------------------------------------

    /// @notice `PeddlesRouteSwapRouter.buyWithNative` with both fees taken in the same call.
    /// @param hops as the route router takes them (empty for a WETH-paired launch).
    function buyRoute(
        address token,
        PartnerFwdPathHop[] calldata hops,
        uint256 minOut,
        uint16 feeBps,
        FwdPartner calldata p,
        uint256 deadline
    ) external payable nonReentrant returns (uint256 tokensOut) {
        (Trade memory t, uint256 swapIn) = _openBuy(token, _route(), feeBps, p, deadline);
        // A stock-paired buy whose last (Peddles) leg partially fills hands the unspent QUOTE back
        // to its caller — here. The quote is the last hop's output.
        address quote = hops.length == 0 ? address(0) : _hopOutput(hops[hops.length - 1]);
        uint256 quoteBefore = quote == address(0) ? 0 : IPartnerFwdERC20(quote).balanceOf(address(this));
        tokensOut =
            IPartnerFwdRouteSwapRouter(t.router).buyWithNative{value: swapIn}(token, hops, minOut, msg.sender, deadline);
        _returnQuote(quote, quoteBefore);
        _closeBuy(t, tokensOut);
    }

    /// @notice `PeddlesRouteSwapRouter.sellForNative` with both fees taken from the proceeds.
    /// @param minOutNet the floor on what reaches the caller, AFTER both fees, in native wei.
    function sellRoute(
        address token,
        uint256 amountIn,
        PartnerFwdPathHop[] calldata hops,
        uint256 minOutNet,
        uint16 feeBps,
        FwdPartner calldata p,
        uint256 deadline
    ) external nonReentrant returns (uint256 nativeNet) {
        Trade memory t = _openSell(token, amountIn, _route(), feeBps, p, deadline);
        IPartnerFwdRouteSwapRouter(t.router).sellForNative(token, t.received, hops, minOutNet, address(this), deadline);
        nativeNet = _closeSell(t, minOutNet);
    }

    /// @notice `PeddlesRouteSwapRouter.buyExternalWithNative` (a token the launchpad does not know)
    /// with both fees taken in the same call.
    function buyExternal(
        address token,
        PartnerFwdPathHop[] calldata hops,
        uint256 minOut,
        uint16 feeBps,
        FwdPartner calldata p,
        uint256 deadline
    ) external payable nonReentrant returns (uint256 tokensOut) {
        (Trade memory t, uint256 swapIn) = _openBuy(token, _route(), feeBps, p, deadline);
        tokensOut = IPartnerFwdRouteSwapRouter(t.router).buyExternalWithNative{value: swapIn}(
            token, hops, minOut, msg.sender, deadline
        );
        _closeBuy(t, tokensOut);
    }

    /// @notice `PeddlesRouteSwapRouter.sellExternalForNative` with both fees taken from the proceeds.
    function sellExternal(
        address token,
        uint256 amountIn,
        PartnerFwdPathHop[] calldata hops,
        uint256 minOutNet,
        uint16 feeBps,
        FwdPartner calldata p,
        uint256 deadline
    ) external nonReentrant returns (uint256 nativeNet) {
        Trade memory t = _openSell(token, amountIn, _route(), feeBps, p, deadline);
        IPartnerFwdRouteSwapRouter(t.router).sellExternalForNative(
            token, t.received, hops, minOutNet, address(this), deadline
        );
        nativeNet = _closeSell(t, minOutNet);
    }

    /// @notice `PeddlesRouteSwapRouter.buyWithNativePancake` (a stock-paired launch whose quote
    /// trades on PancakeSwap) with both fees taken in the same call.
    function buyRoutePancake(
        address token,
        PartnerFwdPancakeHop[] calldata hops,
        uint256 minOut,
        uint16 feeBps,
        FwdPartner calldata p,
        uint256 deadline
    ) external payable nonReentrant returns (uint256 tokensOut) {
        (Trade memory t, uint256 swapIn) = _openBuy(token, _route(), feeBps, p, deadline);
        // A partially filled Peddles leg hands the unspent QUOTE (the last hop's output) back here.
        address quote = hops.length == 0 ? address(0) : hops[hops.length - 1].tokenOut;
        uint256 quoteBefore = quote == address(0) ? 0 : IPartnerFwdERC20(quote).balanceOf(address(this));
        tokensOut = IPartnerFwdRouteSwapRouter(t.router).buyWithNativePancake{value: swapIn}(
            token, hops, minOut, msg.sender, deadline
        );
        _returnQuote(quote, quoteBefore);
        _closeBuy(t, tokensOut);
    }

    /// @notice `PeddlesRouteSwapRouter.sellForNativePancake` with both fees taken from the proceeds.
    /// @param minOutNet the floor on what reaches the caller, AFTER both fees, in native wei.
    function sellRoutePancake(
        address token,
        uint256 amountIn,
        PartnerFwdPancakeHop[] calldata hops,
        uint256 minOutNet,
        uint16 feeBps,
        FwdPartner calldata p,
        uint256 deadline
    ) external nonReentrant returns (uint256 nativeNet) {
        Trade memory t = _openSell(token, amountIn, _route(), feeBps, p, deadline);
        IPartnerFwdRouteSwapRouter(t.router).sellForNativePancake(
            token, t.received, hops, minOutNet, address(this), deadline
        );
        nativeNet = _closeSell(t, minOutNet);
    }

    // ---- The partner's balance -----------------------------------------------------------------

    /// @notice Pay the caller everything it is owed (`claimable[msg.sender]`).
    function withdraw() external nonReentrant returns (uint256 amount) {
        amount = _withdraw(msg.sender);
    }

    /// @notice Pay everything the caller is owed to `to` — for a partner contract that cannot
    /// receive native itself.
    function withdrawTo(address to) external nonReentrant returns (uint256 amount) {
        if (to == address(0) || to == address(this)) revert InvalidAddress();
        amount = _withdraw(to);
    }

    /// @notice OWNER. Move a partner's unclaimed balance to `feeRecipient`, but only once
    /// `CLAIM_STALE_AFTER` has passed since that partner was last credited. This is the exit for a
    /// balance whose partner can never call `withdraw` / `withdrawTo`; it is not a way to take a
    /// live partner's money.
    function reclaimStale(address partner) external onlyOwner nonReentrant returns (uint256 amount) {
        amount = claimable[partner];
        if (amount == 0) revert NothingToWithdraw();
        if (block.timestamp < lastCreditAt[partner] + CLAIM_STALE_AFTER) revert NotStale();
        claimable[partner] = 0;
        totalClaimable -= amount;
        _sendNative(feeRecipient, amount);
        emit StaleClaimReclaimed(partner, feeRecipient, amount);
    }

    // ---- Strays ------------------------------------------------------------------------------

    /// @notice PERMISSIONLESS. Push a stray balance of `asset` (address(0) = native) to
    /// `feeRecipient`. For native, a stray is whatever sits above `totalClaimable` — what partners
    /// are owed is never touched. No ERC-20 is owed here between transactions, so any found at rest
    /// is a stray; and every trade runs under the same lock, so this can never touch funds in flight.
    function sweep(address asset) external nonReentrant returns (uint256 amount) {
        if (asset == address(0)) {
            amount = address(this).balance - totalClaimable;
            if (amount == 0) revert NothingToSweep();
            _sendNative(feeRecipient, amount);
        } else {
            amount = IPartnerFwdERC20(asset).balanceOf(address(this));
            if (amount == 0) revert NothingToSweep();
            _safeTransfer(asset, feeRecipient, amount);
        }
        emit StraySwept(asset, feeRecipient, amount);
    }

    // ---- Owner -------------------------------------------------------------------------------

    /// @notice Rotate the voucher key. Every voucher the previous key signed stops working at once.
    function setPartnerSigner(address next) external onlyOwner {
        if (next == address(0)) revert InvalidAddress();
        emit PartnerSignerSet(partnerSigner, next);
        partnerSigner = next;
    }

    /// @notice Set the partner's share of the platform fee. Never above MAX_PARTNER_SHARE_BPS.
    function setPartnerShareBps(uint16 next) external onlyOwner {
        if (next > MAX_PARTNER_SHARE_BPS) revert InvalidShare();
        emit PartnerShareBpsSet(partnerShareBps, next);
        partnerShareBps = next;
    }

    /// @notice Set the least platform fee a partner trade may carry. Never above `maxFeeBps`.
    function setMinFeeBps(uint16 next) external onlyOwner {
        if (next > maxFeeBps) revert InvalidFee();
        emit MinFeeBpsSet(minFeeBps, next);
        minFeeBps = next;
    }

    /// @notice Refuse `partner` on every trade from now on, whatever voucher it holds. What it is
    /// already owed stays withdrawable.
    function revokePartner(address partner) external onlyOwner {
        partnerRevoked[partner] = true;
        emit PartnerRevokedSet(partner, true);
    }

    /// @notice Undo `revokePartner`. The partner still needs a live voucher.
    function reinstatePartner(address partner) external onlyOwner {
        partnerRevoked[partner] = false;
        emit PartnerRevokedSet(partner, false);
    }

    function transferOwnership(address next) external onlyOwner {
        if (next == address(0)) revert InvalidAddress();
        pendingOwner = next;
        emit OwnershipTransferStarted(owner, next);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert NotPendingOwner();
        emit OwnershipTransferred(owner, msg.sender);
        owner = msg.sender;
        pendingOwner = address(0);
    }

    // ---- Legs ----------------------------------------------------------------------------------

    function _route() private view returns (address router) {
        router = routeSwapRouter;
        if (router == address(0)) revert RouterNotConfigured();
    }

    /// @dev Everything that must hold before a wei or a token moves: the deadline, both rates
    /// inside their bounds, and a partner Peddles vouched for and has not revoked.
    function _check(address token, uint16 feeBps, FwdPartner calldata p, uint256 deadline) private view {
        if (block.timestamp > deadline) revert Expired();
        if (feeBps > maxFeeBps || feeBps < minFeeBps) revert InvalidFee();
        if (p.partnerFeeBps > maxPartnerFeeBps) revert InvalidPartnerFee();
        if (token == address(0)) revert InvalidAddress();
        address partner = p.partner;
        if (partner == address(0) || partner == address(this)) revert InvalidAddress();
        if (partnerRevoked[partner]) revert PartnerIsRevoked();
        if (block.timestamp > p.expiry) revert VoucherExpired();
        if (!_signed(partner, p.expiry, p.signature)) revert BadVoucher();
    }

    function _signed(address partner, uint256 expiry, bytes calldata sig) private view returns (bool) {
        if (sig.length != 65) return false;
        bytes32 r = bytes32(sig[0:32]);
        bytes32 s = bytes32(sig[32:64]);
        uint8 v = uint8(sig[64]);
        if (uint256(s) > HALF_N) return false;
        address signer = ecrecover(voucherDigest(partner, expiry), v, r, s);
        return signer != address(0) && signer == partnerSigner;
    }

    /// @dev Validate, and carve both up-front fees out of `msg.value`. `nativeBefore` is the
    /// balance this call did not bring (partners' claimable, a forced stray), so everything above
    /// it at the end is this trade's.
    function _openBuy(address token, address router, uint16 feeBps, FwdPartner calldata p, uint256 deadline)
        private
        view
        returns (Trade memory t, uint256 swapIn)
    {
        _check(token, feeBps, p, deadline);
        if (msg.value == 0) revert InvalidAmount();
        t.token = token;
        t.router = router;
        t.partner = p.partner;
        t.feeBps = feeBps;
        t.partnerFeeBps = p.partnerFeeBps;
        t.nativeBefore = address(this).balance - msg.value;
        // feeBps + partnerFeeBps <= 1500, so swapIn >= 85% of msg.value and never zero.
        swapIn = msg.value - (msg.value * (uint256(feeBps) + p.partnerFeeBps)) / BPS;
    }

    /// @dev Settle a buy. What is left here is the up-front carve-out plus any router refund. Both
    /// fees are re-taken on what the buyer actually parted with, so a refund never pays a fee; the
    /// rest goes back to the buyer. Leaves the balance at `nativeBefore`, plus the partner's
    /// payment if (and only if) it had to be credited.
    function _closeBuy(Trade memory t, uint256 tokensOut) private {
        uint256 held = address(this).balance - t.nativeBefore; // carve-out + router refund
        uint256 upFront = (msg.value * (uint256(t.feeBps) + t.partnerFeeBps)) / BPS;
        // held >= upFront: the router can only ADD native (a refund) to what was kept back.
        uint256 routerRefund = held - upFront;
        // A refund can only exceed what was sent if native was forced in mid-trade; it is then all
        // returned and no fee is taken rather than reverting.
        uint256 spent = routerRefund >= msg.value ? 0 : msg.value - routerRefund;
        // floor(a) + floor(b) <= floor(a + b) and spent <= msg.value, so the two fees never exceed upFront.
        uint256 fees = _takeFees(t, spent);
        uint256 refund = held - fees;
        if (refund != 0) _sendNative(msg.sender, refund);
        emit PartnerBought(msg.sender, t.token, t.partner, t.router, msg.value, refund, tokensOut);
    }

    /// @dev Pull exactly `amountIn` from the caller — never from anyone else — and approve `router`
    /// for exactly what arrived.
    function _openSell(
        address token,
        uint256 amountIn,
        address router,
        uint16 feeBps,
        FwdPartner calldata p,
        uint256 deadline
    ) private returns (Trade memory t) {
        _check(token, feeBps, p, deadline);
        if (amountIn == 0) revert InvalidAmount();
        t.token = token;
        t.router = router;
        t.partner = p.partner;
        t.feeBps = feeBps;
        t.partnerFeeBps = p.partnerFeeBps;
        t.tokenBefore = IPartnerFwdERC20(token).balanceOf(address(this));
        _safeTransferFrom(token, msg.sender, address(this), amountIn);
        t.received = IPartnerFwdERC20(token).balanceOf(address(this)) - t.tokenBefore;
        if (t.received == 0) revert InvalidAmount();
        _approve(token, router, t.received);
        t.nativeBefore = address(this).balance;
    }

    /// @dev Settle a sell: reset the approval, hand back unconsumed tokens, floor the NET, take
    /// both fees from the native the router paid here, pay everyone.
    function _closeSell(Trade memory t, uint256 minOutNet) private returns (uint256 nativeNet) {
        _approve(t.token, t.router, 0);
        uint256 unspent = IPartnerFwdERC20(t.token).balanceOf(address(this)) - t.tokenBefore;
        if (unspent != 0) _safeTransfer(t.token, msg.sender, unspent);

        uint256 gross = address(this).balance - t.nativeBefore;
        nativeNet = gross - (gross * t.feeBps) / BPS - (gross * t.partnerFeeBps) / BPS;
        if (nativeNet < minOutNet) revert Slippage();
        _takeFees(t, gross);
        if (nativeNet != 0) _sendNative(msg.sender, nativeNet);
        emit PartnerSold(
            msg.sender, t.token, t.partner, t.router, unspent >= t.received ? 0 : t.received - unspent, gross, nativeNet
        );
    }

    /// @dev Both fees on one base, split and paid. Returns `platformFee + partnerFee`.
    function _takeFees(Trade memory t, uint256 base) private returns (uint256 fees) {
        uint256 platformFee = (base * t.feeBps) / BPS;
        uint256 partnerFee = (base * t.partnerFeeBps) / BPS;
        uint256 partnerShare = (platformFee * partnerShareBps) / BPS;
        uint256 toRecipient = platformFee - partnerShare;
        fees = platformFee + partnerFee;
        if (toRecipient != 0) _sendNative(feeRecipient, toRecipient);
        _payPartner(t.partner, partnerShare + partnerFee);
        emit PartnerFees(
            msg.sender, t.token, t.partner, platformFee, partnerShare, partnerFee, toRecipient, t.feeBps, t.partnerFeeBps
        );
    }

    /// @dev The partner cannot make this revert, and is never handed more than `PARTNER_PAY_GAS` —
    /// nor less, which is the one refusal here (`GasTooLow`, the caller's doing, not the partner's).
    /// The return data is not copied, so a partner cannot make this contract pay for it either. A
    /// failed payment stays here, owed to the partner.
    function _payPartner(address partner, uint256 amount) private {
        if (amount == 0) return;
        if (gasleft() < PARTNER_PAY_GAS_FLOOR) revert GasTooLow();
        bool ok;
        uint256 gasCap = PARTNER_PAY_GAS;
        assembly ("memory-safe") {
            ok := call(gasCap, partner, amount, 0, 0, 0, 0)
        }
        if (ok) {
            emit PartnerPaid(partner, amount);
        } else {
            uint256 owed = claimable[partner] + amount;
            claimable[partner] = owed;
            totalClaimable += amount;
            lastCreditAt[partner] = block.timestamp;
            emit PartnerCredited(partner, amount, owed);
        }
    }

    function _withdraw(address to) private returns (uint256 amount) {
        amount = claimable[msg.sender];
        if (amount == 0) revert NothingToWithdraw();
        claimable[msg.sender] = 0;
        totalClaimable -= amount;
        _sendNative(to, amount);
        emit Withdrawn(msg.sender, to, amount);
    }

    function _returnQuote(address quote, uint256 quoteBefore) private {
        if (quote == address(0)) return;
        uint256 back = IPartnerFwdERC20(quote).balanceOf(address(this)) - quoteBefore;
        if (back != 0) _safeTransfer(quote, msg.sender, back);
    }

    function _hopOutput(PartnerFwdPathHop calldata h) private pure returns (address) {
        return h.zeroForOne ? h.key.currency1 : h.key.currency0;
    }

    // ---- Transfers -----------------------------------------------------------------------------

    function _approve(address token, address spender, uint256 amount) private {
        (bool ok, bytes memory data) =
            token.call(abi.encodeWithSelector(IPartnerFwdERC20.approve.selector, spender, amount));
        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) revert TransferFailed();
    }

    function _safeTransfer(address token, address to, uint256 amount) private {
        (bool ok, bytes memory data) = token.call(abi.encodeWithSelector(IPartnerFwdERC20.transfer.selector, to, amount));
        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) revert TransferFailed();
    }

    function _safeTransferFrom(address token, address from, address to, uint256 amount) private {
        (bool ok, bytes memory data) =
            token.call(abi.encodeWithSelector(IPartnerFwdERC20.transferFrom.selector, from, to, amount));
        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) revert TransferFailed();
    }

    function _sendNative(address to, uint256 amount) private {
        (bool ok,) = payable(to).call{value: amount}("");
        if (!ok) revert NativeTransferFailed();
    }
}
