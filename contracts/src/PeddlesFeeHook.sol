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

/// ============================================================================
/// PEDDLES FEE HOOK — a REAL Uniswap v4 hook that taxes every swap, forever,
/// no matter which router (or aggregator, or bot) initiates it.
///
/// ---------------------------------------------------------------------------
/// WHY THIS EXISTS
/// ---------------------------------------------------------------------------
/// Peddles stock pools were previously created with `hooks: address(0)`. Fees
/// were charged inside the Peddles routers, so anybody could `unlock` the
/// PoolManager directly and swap for free. Aggregators and arbitrage bots do
/// exactly that. A fee that only exists in a router is not a fee; it is a
/// suggestion. This hook moves the fee into the pool itself.
///
/// ---------------------------------------------------------------------------
/// v4-core IS NOT VENDORED IN THIS REPO
/// ---------------------------------------------------------------------------
/// `contracts/lib/` contains ONLY `forge-std`; there is no `.gitmodules` and no
/// copy of `v4-core` anywhere in the tree. Every v4 type used by this codebase
/// (`PoolKey`, `SwapParams`, the PoolManager interface) is hand-rolled per file
/// — see `IV4PoolManagerMinimal` in PeddlesStockLaunchpad.sol and
/// `PeddlesV4PoolKey` in PeddlesV4SwapRouter.sol. This file follows that
/// convention and hand-rolls the `IHooks` surface too.
///
/// Because there is no local copy to diff against, the constants below are
/// pinned from canonical v4-core (`src/libraries/Hooks.sol`) and are ASSERTED
/// at construction: the deployed address must carry exactly `HOOK_FLAGS` in its
/// low 14 bits or the constructor reverts. If this ever gets deployed against a
/// v4 fork with a different flag layout, it fails CLOSED at deploy time — it
/// can never silently mis-register.
///
///     BEFORE_INITIALIZE_FLAG                     = 1 << 13   (0x2000)
///     AFTER_INITIALIZE_FLAG                      = 1 << 12   (0x1000)
///     BEFORE_ADD_LIQUIDITY_FLAG                  = 1 << 11   (0x0800)
///     AFTER_ADD_LIQUIDITY_FLAG                   = 1 << 10   (0x0400)
///     BEFORE_REMOVE_LIQUIDITY_FLAG               = 1 <<  9   (0x0200)
///     AFTER_REMOVE_LIQUIDITY_FLAG                = 1 <<  8   (0x0100)
///     BEFORE_SWAP_FLAG                           = 1 <<  7   (0x0080)  <= used
///     AFTER_SWAP_FLAG                            = 1 <<  6   (0x0040)  <= used
///     BEFORE_DONATE_FLAG                         = 1 <<  5   (0x0020)
///     AFTER_DONATE_FLAG                          = 1 <<  4   (0x0010)
///     BEFORE_SWAP_RETURNS_DELTA_FLAG             = 1 <<  3   (0x0008)  <= used
///     AFTER_SWAP_RETURNS_DELTA_FLAG              = 1 <<  2   (0x0004)  <= used
///     AFTER_ADD_LIQUIDITY_RETURNS_DELTA_FLAG     = 1 <<  1   (0x0002)
///     AFTER_REMOVE_LIQUIDITY_RETURNS_DELTA_FLAG  = 1 <<  0   (0x0001)
///     ALL_HOOK_MASK                              = (1 << 14) - 1
///
/// v4-core also requires that a "returns delta" flag is never set without its
/// parent call flag, which is why AFTER_SWAP_FLAG is set alongside
/// AFTER_SWAP_RETURNS_DELTA_FLAG. HOOK_FLAGS = 0x80|0x40|0x08|0x04 = 0xCC.
///
/// ---------------------------------------------------------------------------
/// THE FEE IS ALWAYS TAKEN IN THE POOL'S QUOTE ASSET
/// ---------------------------------------------------------------------------
/// Holder rewards are paid pro-rata in the quote (a TSLA-paired launch pays
/// TSLA), so the fee must be collected in the quote in all four swap shapes.
/// v4 splits a swap into a "specified" currency (the one `amountSpecified`
/// refers to) and an "unspecified" one:
///
///     specified = exactInput ? input currency : output currency
///
/// `beforeSwap` can only move the SPECIFIED side (its `deltaSpecified` adjusts
/// `amountToSwap`, which must be known before the swap runs). `afterSwap` can
/// only move the UNSPECIFIED side, but by then the realised amount IS known.
/// So the two callbacks between them cover every case, and they are mutually
/// exclusive — exactly one charges on any given swap:
///
///  # | direction        | exactness | specified cur | quote is    | charged in
///  --+------------------+-----------+---------------+-------------+------------
///  1 | quote -> token   | exact-in  | quote (in)    | specified   | beforeSwap
///  2 | quote -> token   | exact-out | token (out)   | unspecified | afterSwap
///  3 | token -> quote   | exact-in  | token (in)    | unspecified | afterSwap
///  4 | token -> quote   | exact-out | quote (out)   | specified   | beforeSwap
///
/// In every case the fee is `totalBps` of the GROSS quote amount crossing the
/// pool boundary for that swap. Concretely:
///   * quote is the INPUT  -> the trader pays `gross`, the pool receives
///                            `gross - fee`  (fee inclusive of what they sent)
///   * quote is the OUTPUT -> the pool releases `gross`, the trader receives
///                            `gross - fee`  (fee inclusive of what left)
/// For the two exact-* legs where the trader pins the NET amount (#2 and #4),
/// the gross is grossed UP: `fee = net * bps / (BPS - bps)`, so the effective
/// rate on the gross is still exactly `bps`. Rounding is floor throughout, in
/// the trader's favour.
///
/// KNOWN EDGE (#4, exact-output with the quote specified): the fee is committed
/// in `beforeSwap` against the REQUESTED output. If `sqrtPriceLimitX96` binds
/// and the pool fills only part of it, the trader still pays the fee on the
/// full request. v4 gives no way to revise a specified-side delta after the
/// fact. Traders who care should use exact-input, which cannot partially fill
/// in this way.
///
/// ---------------------------------------------------------------------------
/// HOW THE FEE IS SETTLED (and why nothing moves during a swap)
/// ---------------------------------------------------------------------------
/// The hook does NOT `take()` real ERC20 inside the swap. `take()` would move
/// tokens out of the PoolManager mid-swap — before the trader has settled their
/// own input — and would run arbitrary quote-token code inside the swap. It
/// instead `mint()`s ERC-6909 claim tokens against its own positive delta:
/// pure accounting, no external call, cannot fail on PoolManager liquidity.
/// The claims are redeemed later by a PERMISSIONLESS `sweep`, which burns them
/// and takes the real ERC20 out in its own `unlock`.
///
/// ---------------------------------------------------------------------------
/// FEE MODEL  (all-in bounded to [1.00%, 10.00%])
/// ---------------------------------------------------------------------------
///     total = creatorTaxBps   — the creator's ALL-IN rate, and the ONLY input
///                               to what a trader pays. Nothing is added on top.
///
/// so the all-in can never leave [MIN_TOTAL_FEE_BPS, MAX_TOTAL_FEE_BPS] =
/// [100, 1000] STRUCTURALLY: the total IS a single `uint16` field bounded by two
/// `constant`s, on its ONLY write path. There is no second addend to smuggle
/// basis points in through, and therefore no path outside that band.
///
/// THE LAUNCH TERMS ARE CHOSEN AT LAUNCH AND NEVER CHANGE. `registerPool` takes
/// two numbers from the launch — `creatorTaxBps` (the all-in) and
/// `excessToCreatorBps` (who gets the part above 1%) — checks both, and writes
/// them once, together with the pool's holder-rewards distributor. Nothing else
/// in this contract writes any of the three: no creator setter, no owner setter,
/// no default a later registration could inherit. A trader who buys at a pool's
/// terms sells at the same terms, and holders are paid by the same rule for the
/// life of the pool.
///
/// THE SPLIT IS TWO FIXED LEGS PLUS AN EXCESS, AND THE LAUNCH DIVIDES THE EXCESS.
///
///     platform = 0.50% OF VOLUME, FIXED   (PLATFORM_FEE_BPS, a `constant`)
///     creator  = 0.50% OF VOLUME, FIXED   (CREATOR_FEE_BPS,  a `constant`)
///     excess   = EVERYTHING ABOVE 1%      (fee - platform - creator)
///       creator += excess * excessToCreatorBps / 10000   (floored)
///       holders  = the rest of the excess                (absorbs all dust)
///
/// The two fixed legs do not move with the tax level, and the creator always
/// keeps their 0.50%. MIN_TOTAL_FEE_BPS is exactly PLATFORM_FEE_BPS +
/// CREATOR_FEE_BPS because below 1% the two fixed legs do not fit.
///
///     all-in  excessToCreator   platform   creator   holders
///      1.00%        any           0.50%     0.50%     0.00%   <- no excess
///      3.00%          0           0.50%     0.50%     2.00%
///      3.00%       5000           0.50%     1.50%     1.00%
///     10.00%          0           0.50%     0.50%     9.00%
///     10.00%      10000           0.50%     9.50%     0.00%   <- all excess to creator
///
/// `excessToCreatorBps` exists because a utility project may want the revenue.
/// It never changes what a trader pays — only who receives the excess — and it
/// is part of the terms a buyer reads before buying, fixed like the tax.
///
/// Rounding: both fixed legs floor, the creator's excess share floors, and
/// holders take the remainder, so the legs sum to the fee EXACTLY at every
/// setting. At `excessToCreatorBps == 10000` the holder leg is exactly zero; at
/// the 1.00% floor it is at most the odd base unit the two floored legs leave,
/// which lands in the holder bucket and is swept to the distributor like any
/// other holder slice — never stranded.
///
/// THE DISTRIBUTOR EXISTS FROM THE FIRST SWAP. `registerPool` deploys the pool's
/// `PeddlesHolderRewards` through the immutable `holderRewardsFactory` and binds
/// it write-once, so the holder slice is charged from the first trade and no
/// later step — owner, registrar or creator — can switch it on or repoint it.
///
/// ---------------------------------------------------------------------------
/// OWNER POWERS (deliberately minimal)
/// ---------------------------------------------------------------------------
/// The owner may: move the platform's own treasury/flywheel destinations and
/// their split, authorise/deauthorise pool registrars, and SHORTEN (never
/// lengthen) the opening-tax window for FUTURE registrations. The owner CANNOT:
/// set or change any pool's terms (there is no default and no setter), bind or
/// repoint a pool's distributor, redirect the opening tax's liquidity leg
/// (`liquidityReceiver` is immutable), take a user's funds, touch an accrued
/// creator or holder bucket, or change the platform's own 0.50% leg.
///
/// ---------------------------------------------------------------------------
/// MIGRATION CONSEQUENCE — READ THIS
/// ---------------------------------------------------------------------------
/// The hook address is part of the PoolKey, and a PoolKey is immutable. Every
/// pool already launched with `hooks: address(0)` is a DIFFERENT pool from the
/// hooked one and can NEVER be taxed by this or any other hook. Existing
/// launches are permanently fee-free at the pool level. Every launcher now takes
/// this hook as an immutable and registration is mandatory, so no new pool can be
/// created unhooked.
/// ============================================================================

// ---------------------------------------------------------------------------
// v4 value types (hand-rolled; see header)
// ---------------------------------------------------------------------------

/// @dev v4 `BalanceDelta`: amount0 in the high 128 bits, amount1 in the low 128.
type BalanceDelta is int256;

/// @dev v4 `BeforeSwapDelta`: deltaSpecified in the high 128 bits,
///      deltaUnspecified in the low 128. A POSITIVE value credits the HOOK and
///      is therefore paid by the swapper.
type BeforeSwapDelta is int256;

struct PoolKey {
    address currency0;
    address currency1;
    uint24 fee;
    int24 tickSpacing;
    address hooks;
}

struct SwapParams {
    bool zeroForOne;
    int256 amountSpecified; // < 0 exact input, > 0 exact output
    uint160 sqrtPriceLimitX96;
}

struct ModifyLiquidityParams {
    int24 tickLower;
    int24 tickUpper;
    int256 liquidityDelta;
    bytes32 salt;
}

/// @notice The slice of the v4 PoolManager this hook uses. `Currency` is a
/// user-defined type over `address` in v4-core, so it is `address` here.
interface IV4PoolManagerForHook {
    function unlock(bytes calldata data) external returns (bytes memory);
    function mint(address to, uint256 id, uint256 amount) external;
    function burn(address from, uint256 id, uint256 amount) external;
    function take(address currency, address to, uint256 amount) external;
}

interface IFeeHookERC20 {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function decimals() external view returns (uint8);
}

/// @notice The ONLY thing this hook needs from the holder-rewards distributor.
///
/// `PeddlesHolderRewards` recognises a bare `transfer`
/// from its own balance delta, so the wiring is: transfer the holder slice in,
/// then poke `sync()`. No approval, no bespoke funding path, and `sync()` is
/// permissionless and idempotent there. The poke is best-effort — a distributor
/// that reverts must not be able to strand an already-transferred slice.
interface IPeddlesRewardsSink {
    function sync() external;
}

/// @notice Registration surface, implemented BY this hook and called by an
/// authorised registrar (PeddlesStockLaunchpad, and the two WETH V20
/// orchestrators). Quote-agnostic: the same call registers a stock-paired and a
/// WETH-paired pool.
interface IPeddlesFeeHookRegistrar {
    function registerPool(
        PoolKey calldata key,
        address token,
        address quote,
        address creator,
        uint16 creatorTaxBps,
        uint16 excessToCreatorBps,
        address[] calldata excluded
    ) external returns (address rewards);
}

/// @notice The one call this hook makes into `PeddlesHolderRewardsFactory`.
interface IPeddlesHolderRewardsFactory {
    function create(address token, address quote, address owner_, address[] calldata excluded)
        external
        returns (address rewards);
}

contract PeddlesFeeHook {
    // =========================================================================
    // v4 hook permission flags — pinned from canonical v4-core Hooks.sol.
    // =========================================================================

    uint160 internal constant BEFORE_INITIALIZE_FLAG = 1 << 13;
    uint160 internal constant AFTER_INITIALIZE_FLAG = 1 << 12;
    uint160 internal constant BEFORE_ADD_LIQUIDITY_FLAG = 1 << 11;
    uint160 internal constant AFTER_ADD_LIQUIDITY_FLAG = 1 << 10;
    uint160 internal constant BEFORE_REMOVE_LIQUIDITY_FLAG = 1 << 9;
    uint160 internal constant AFTER_REMOVE_LIQUIDITY_FLAG = 1 << 8;
    uint160 public constant BEFORE_SWAP_FLAG = 1 << 7;
    uint160 public constant AFTER_SWAP_FLAG = 1 << 6;
    uint160 internal constant BEFORE_DONATE_FLAG = 1 << 5;
    uint160 internal constant AFTER_DONATE_FLAG = 1 << 4;
    uint160 public constant BEFORE_SWAP_RETURNS_DELTA_FLAG = 1 << 3;
    uint160 public constant AFTER_SWAP_RETURNS_DELTA_FLAG = 1 << 2;
    uint160 internal constant AFTER_ADD_LIQUIDITY_RETURNS_DELTA_FLAG = 1 << 1;
    uint160 internal constant AFTER_REMOVE_LIQUIDITY_RETURNS_DELTA_FLAG = 1 << 0;

    /// @notice v4-core's mask over the permission bits of a hook address.
    uint160 public constant ALL_HOOK_MASK = uint160((1 << 14) - 1);

    /// @notice The exact low-14-bit pattern this hook's address MUST carry.
    /// 0xCC = beforeSwap | afterSwap | beforeSwapReturnsDelta | afterSwapReturnsDelta.
    uint160 public constant HOOK_FLAGS =
        BEFORE_SWAP_FLAG | AFTER_SWAP_FLAG | BEFORE_SWAP_RETURNS_DELTA_FLAG | AFTER_SWAP_RETURNS_DELTA_FLAG;

    // =========================================================================
    // Fee constants — `constant`, so no owner and no creator can move them.
    //
    // The all-in is ONE number (`creatorTaxBps`) bounded by TWO constants. The
    // platform's and creator's legs are FIXED absolute rates on volume that come
    // OUT of that all-in, never on top of it: no combination of settings can put
    // a trader above MAX_TOTAL_FEE_BPS or below MIN_TOTAL_FEE_BPS.
    // =========================================================================

    uint256 internal constant BPS = 10_000;

    /// @notice The platform's leg: 0.50% OF VOLUME, FIXED, at every tax level.
    ///
    /// This does NOT scale with the creator's all-in. A 5% pool and a 1% pool
    /// both hand the platform exactly 0.50% of the gross; the difference between
    /// them goes to holders. It is a `constant`, so there is no owner setter and
    /// no upgrade path that raises it.
    ///
    /// Of this leg, `platformFlywheelBps` (default 2000 == 20%) goes to the PEDL
    /// flywheel and the rest to the treasury — 0.10% / 0.40% of volume at the
    /// shipping split. That is a share of a share and never changes the all-in.
    uint16 public constant PLATFORM_FEE_BPS = 50;

    /// @notice The creator's leg: 0.50% OF VOLUME, FIXED, at every tax level.
    ///
    /// Also does not scale with the all-in. The creator always keeps it; what the
    /// creator receives above it is `excessToCreatorBps` of the excess, fixed at
    /// launch.
    uint16 public constant CREATOR_FEE_BPS = 50;

    /// @notice The all-in rate charged on the FIRST BLOCK of a pool's life.
    ///
    /// Deliberately ABOVE MAX_TOTAL_FEE_BPS and deliberately a separate ceiling:
    /// the [1%, 10%] band is a standing promise about a pool's ONGOING cost, and
    /// this does not raise it. It is a time-boxed opening charge that decays to
    /// the pool's normal rate and then stops existing.
    uint16 public constant SNIPER_OPENING_TAX_BPS = 2000;

    /// @notice How the opening charge divides: 5% creator / 10% liquidity / 5%
    /// platform at the peak rate, held as fixed PROPORTIONS (1/4, 1/2, 1/4) all
    /// the way down the decay.
    ///
    /// ── WHY THE CREATOR MAY TAKE A QUARTER, BUT NEVER MORE ──────────────────
    /// A creator sniping their own launch pays the full charge and receives one
    /// quarter of it back, so the round trip still costs them 15% of gross. The
    /// incentive only inverts as the creator's share approaches the whole tax,
    /// which is why this is a `constant` and not a setting: no owner, registrar
    /// or creator can raise it later. The largest leg, half, is earmarked for
    /// liquidity and is PAID OUT by `sweepLiquidityShare` to the immutable
    /// `liquidityReceiver`, which deploys it as liquidity deliberately. Nothing in this contract deposits it
    /// into a pool; see `sweepLiquidityShare` for why a donate would be stolen.
    ///
    /// `_book` derives the in-window split from these three constants, so they
    /// are the split — changing one changes what every sniper pays to whom.
    uint16 public constant SNIPER_CREATOR_BPS = 500;
    uint16 public constant SNIPER_LIQUIDITY_BPS = 1000;
    uint16 public constant SNIPER_PLATFORM_BPS = 500;

    /// @notice Hard ceiling on the opening window, so the tax can never become
    /// long-lived. It bounds the constructor argument; the setter can only lower
    /// the window, so nothing after construction can reach it.
    ///
    /// PER CHAIN, and fixed forever at construction (owner decision D2,
    /// 2026-09-16). It is a duration in units of `block.number`, and what one
    /// unit is differs by ~25x between the shipping chains:
    ///   - Sepolia and Robinhood Chain (4663): ~12 s per unit -> 300 (~60 min).
    ///   - Arc (5042): 0.509 s per block -> 7200 (~61 min).
    /// A single global constant could not be ~1 hour on both: 300 capped Arc at
    /// ~153 s (below its ~3-minute default of 354), and 7200 would have allowed
    /// ~24 HOURS of opening tax on a 12 s chain. `script/PeddlesConfig.sol`
    /// pins the value per chain before any salt is mined.
    ///
    /// Named in capitals and kept as the same getter so every existing reader
    /// (`VerifyLive`, the web) keeps working; it is an immutable, not a constant.
    uint32 public immutable MAX_SNIPER_WINDOW_BLOCKS;

    /// @notice Absolute bound on `MAX_SNIPER_WINDOW_BLOCKS`, whatever the chain.
    /// It exists so a misconfigured deploy cannot set a cap of days. 10,000 units is
    /// ~67 minutes at 0.4 s per block (room for a sub-second chain such as BNB Chain
    /// to express ~1 hour) and ~33 hours at 12 s, which is why the per-chain config
    /// pins the exact cap (300 on a 12 s chain) rather than trusting this bound. No
    /// block-denominated bound can be one hour on every chain at once.
    uint32 public constant SNIPER_WINDOW_CAP_LIMIT = 10_000;

    /// @notice How many blocks the opening tax decays over, for pools registered
    /// FROM NOW ON. The owner may only LOWER it (to 0 turns the opening tax off
    /// for future launches). Raising it would let the owner front-run a launch
    /// with a longer window, and three quarters of every opening charge is paid
    /// to protocol-controlled addresses.
    ///
    /// ── THE SETTER CANNOT REACH A LIVE POOL ─────────────────────────────────
    /// `registerPool` SNAPSHOTS this into `PoolConfig.sniperWindow`, and the
    /// swap path reads only the snapshot. So a pool's opening window is fixed at
    /// the block it launched and can never be changed afterwards — not shortened,
    /// not extended, and above all not re-armed. That is the property traders
    /// actually need: the owner may change the policy for tomorrow's launches,
    /// but nobody can change the rules of a pool that is already trading.
    ///
    /// The switch exists because a 20% opener is a product bet, not a law. If it
    /// turns out to drive creators away it has to be retirable without redeploying
    /// a hook that thousands of live pools already point at. Creators still cannot
    /// touch it at any value.
    ///
    /// It is a constructor argument rather than a constant because it is a
    /// duration in units of `block.number`, and what one unit is differs per
    /// chain. Read live 2026-09-08:
    ///   - Sepolia: block.number is the chain's own height, ~12.6 s apart, so
    ///     ~3 minutes is 14.
    ///   - Robinhood Chain (4663) is an Arbitrum-style rollup: inside the EVM
    ///     block.number is the ETHEREUM L1 block number, not the L2 height, so it
    ///     advances ~every 12 s regardless of how fast L2 blocks are produced.
    ///     ~3 minutes is 15. (The L2 height, ~0.1 s/block, is what eth_blockNumber
    ///     returns and is never visible to this contract.)
    /// A chain added later may differ again, which is why this is per-deploy.
    /// One consequence on 4663: many L2 blocks share one block.number, so the
    /// "launch block" the dev-buy exemption and `startBlock` refer to spans ~12 s
    /// of L2 blocks. The dev-buy exemption is still keyed to the launch
    /// TRANSACTION (transient storage), not the block.
    ///
    /// Blocks, not seconds, because a sniper bundles atomically in the launch
    /// block and because block timestamps carry proposer leeway; a block height
    /// is exact and cannot be nudged.
    uint32 public defaultSniperWindowBlocks;

    /// @notice Hard ceiling on the all-in tax: 10.00%. Together with
    /// MIN_TOTAL_FEE_BPS this is the whole of what bounds a trader's cost,
    /// because the all-in is a single field.
    ///
    /// Raised from 500 on the owner's instruction. The two fixed legs are still
    /// 0.50% each, so the platform and the creator take exactly what they took
    /// before at any given tax level, and the entire headroom accrues to HOLDERS.
    /// At the ceiling a pool charges 0.50% platform / 0.50% creator / 9.00% holders.
    ///
    /// This is a CEILING a creator may choose at launch, not a default. A 10% tax
    /// is a very high rate for a traded asset and nothing here stops a creator
    /// choosing it. The protection a trader has is that the rate is public, fixed
    /// for the life of the pool, and readable from `totalFeeBps(poolId)` before
    /// signing.
    uint16 public constant MAX_TOTAL_FEE_BPS = 1000;

    /// @notice Hard FLOOR on the all-in tax: 1.00%.
    ///
    /// DERIVED, never written as a literal: it is exactly the two fixed legs
    /// added together, so the three constants can never drift apart. Below this
    /// the platform's 0.50% and the creator's 0.50% do not fit inside the fee at
    /// all, and the split would have to start rationing one of them. There is no
    /// sensible behaviour there, so `registerPool` refuses it instead.
    uint16 public constant MIN_TOTAL_FEE_BPS = PLATFORM_FEE_BPS + CREATOR_FEE_BPS;

    /// @notice Hard ceiling on the creator-configured tax. The creator tax IS the
    /// all-in rate under this model — the fixed legs come out of it, not on top
    /// of it — so this is deliberately the SAME constant as MAX_TOTAL_FEE_BPS
    /// rather than a smaller share of it. An alias, so the two cannot drift.
    uint16 public constant MAX_CREATOR_TAX_BPS = MAX_TOTAL_FEE_BPS;

    /// @notice Hard floor on the creator-configured tax; alias of
    /// MIN_TOTAL_FEE_BPS for the same reason.
    uint16 public constant MIN_CREATOR_TAX_BPS = MIN_TOTAL_FEE_BPS;

    /// @dev Largest fee this contract will ever represent in one accrual.
    uint256 internal constant MAX_FEE_AMOUNT = uint256(uint128(type(int128).max));

    // =========================================================================
    // Immutable configuration (external addresses are CONFIG, never constants)
    // =========================================================================

    /// @notice The Uniswap v4 PoolManager. Differs per chain; passed in.
    address public immutable poolManager;

    /// @notice Deploys each pool's holder-rewards distributor inside `registerPool`.
    /// Immutable, so no owner can swap in a factory that builds a distributor with
    /// a different exclusion list or an open owner lever.
    address public immutable holderRewardsFactory;

    // =========================================================================
    // Owner-settable protocol configuration
    // =========================================================================

    address public owner;

    /// @notice Platform revenue destination. Never zero.
    address public treasury;

    /// @notice Where the opening tax's liquidity half is paid. IMMUTABLE: a
    /// settable receiver could redirect a liquidity leg that had already accrued.
    /// @dev Kept separate from `treasury` so the earmark stays visible: this is
    ///      money owed to a pool's depth, not protocol revenue.
    address public immutable liquidityReceiver;

    /// @notice PEDL flywheel. May be zero, in which case the flywheel slice
    /// falls through to the treasury (both are protocol revenue, never user funds).
    address public flywheel;

    /// @notice Flywheel share of the PLATFORM leg, in bps. Default 2000 = 20%,
    /// which reproduces the owner's 0.10% flywheel / 0.40% treasury split of the
    /// fixed 0.50% of volume the platform takes. This is a share of a share: it
    /// never changes what a trader pays, only where platform revenue lands.
    uint16 public platformFlywheelBps = 2000;

    // There is deliberately NO default for either launch term. A pool's tax and
    // excess split come from its launch (`registerPool`). An owner-settable
    // default was a lever over what tomorrow's pools charge that no launch input
    // needed; with both supplied per launch nothing reads a default.

    /// @notice Contracts allowed to register a pool (the launchpad).
    mapping(address => bool) public isRegistrar;

    // =========================================================================
    // Per-pool state
    // =========================================================================

    struct PoolConfig {
        address quote; // the pool currency the fee is taken in
        uint16 creatorTaxBps; // the ALL-IN rate on gross, MIN_ .. MAX_CREATOR_TAX_BPS. WRITE-ONCE.
        uint16 excessToCreatorBps; // creator's fraction of the tax ABOVE 1%, 0 .. BPS. WRITE-ONCE.
        bool registered;
        address token; // the launched coin (informational / off-chain indexing)
        uint32 startBlock; // block registerPool ran; 0 = pre-dates the guard. Write-once.
        // The opening window THIS pool launched under, snapshotted at registration
        // and never rewritten. Costs no storage: 20 + 4 + 4 bytes still fits one
        // slot beside `token` and `startBlock`.
        uint32 sniperWindow;
        address creator; // receives the creator slice
        address creatorPayout; // optional override, creator-controlled
        address rewards; // holder-rewards distributor, deployed at registration; WRITE-ONCE
    }

    /// @dev Accrued in QUOTE base units, held as ERC-6909 claims on the PoolManager.
    struct Accrued {
        uint128 platform;
        uint128 creator;
        uint128 holders;
        /// @dev Opening-tax share owed to the pool's liquidity. Donated by
        ///      `sweepLiquidityShare`, never inside a swap.
        uint128 liquidity;
    }

    mapping(bytes32 => PoolConfig) internal _pools;
    mapping(bytes32 => Accrued) internal _accrued;

    /// @dev Set only for the duration of our own PoolManager unlock.
    bool private _sweeping;

    uint256 private _lock = 1;

    // =========================================================================
    // Events
    // =========================================================================

    /// @notice The pool's permanent launch terms and its distributor. There is no
    /// update event for any of them because there is no update.
    event PoolRegistered(
        bytes32 indexed poolId,
        address indexed token,
        address indexed quote,
        address creator,
        uint16 creatorTaxBps,
        uint16 excessToCreatorBps,
        address rewards
    );

    /// @dev Emitted instead of `FeeAccrued` while the opening window is live —
    ///      a separate event because the destinations are different and an
    ///      indexer must not read an opening charge as creator revenue.
    event SniperFeeAccrued(
        bytes32 indexed poolId,
        address indexed quote,
        uint256 toLiquidity,
        uint256 toCreator,
        uint256 toPlatform,
        bool viaBefore
    );

    event LiquidityShareSwept(
        bytes32 indexed poolId, address indexed quote, address indexed to, uint256 amount
    );
    event CreatorPayoutUpdated(bytes32 indexed poolId, address payout);
    event FeeAccrued(
        bytes32 indexed poolId, address indexed quote, uint256 platform, uint256 creator, uint256 holders, bool viaBefore
    );
    event PlatformSwept(bytes32 indexed poolId, uint256 toTreasury, uint256 toFlywheel);
    event CreatorSwept(bytes32 indexed poolId, address indexed to, uint256 amount);
    event HoldersSwept(bytes32 indexed poolId, address indexed rewards, uint256 amount);
    event RewardsSyncFailed(bytes32 indexed poolId, address indexed rewards, uint256 amount);
    event Skimmed(address indexed currency, address indexed to, uint256 amount);

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event TreasuryUpdated(address treasury);
    event DefaultSniperWindowUpdated(uint32 blocks);
    event FlywheelUpdated(address flywheel);
    event PlatformFlywheelBpsUpdated(uint16 bps);
    event RegistrarUpdated(address indexed registrar, bool allowed);

    // =========================================================================
    // Errors
    // =========================================================================

    error HookAddressFlagsMismatch(uint160 got, uint160 want);
    error NotPoolManager();
    error NotOwner();
    error NotRegistrar();
    error NotPoolCreator();
    error ZeroAddress();
    error AlreadyRegistered();
    error NotRegistered();
    error OpeningTaxBelowCap();
    error SniperWindowTooLong();
    error FeeAboveCap();
    /// @dev The all-in was set below MIN_TOTAL_FEE_BPS, where the two fixed legs
    /// do not fit. Distinct from FeeAboveCap on purpose: the two failures have
    /// opposite causes and a caller must be able to tell them apart.
    error FeeBelowFloor();
    error ReentrantCall();
    error TransferFailed();
    error NothingToSweep();
    error HookNotImplemented();
    error NotSweeping();

    // =========================================================================
    // Construction
    // =========================================================================

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

    /// @param poolManager_ the chain's Uniswap v4 PoolManager (CONFIG)
    /// @param owner_       initial owner, passed EXPLICITLY so this contract stays
    ///                     CREATE2-deployable through the deterministic proxy (a
    ///                     `owner = msg.sender` constructor would hand ownership
    ///                     to the proxy — see script/PeddlesSalts.sol)
    /// @param treasury_    platform revenue destination
    /// @param holderRewardsFactory_ deploys each pool's distributor (CONFIG; immutable)
    /// @param liquidityReceiver_ receives the opening tax's liquidity leg (immutable)
    /// @param maxSniperWindowBlocks_ this chain's ceiling on the opening window, in
    ///                     `block.number` units (~1 hour of wall-clock; <= SNIPER_WINDOW_CAP_LIMIT)
    constructor(
        address poolManager_,
        address owner_,
        address treasury_,
        uint32 sniperWindowBlocks_,
        uint32 maxSniperWindowBlocks_,
        address holderRewardsFactory_,
        address liquidityReceiver_
    ) {
        if (
            poolManager_ == address(0) || owner_ == address(0) || treasury_ == address(0)
                || holderRewardsFactory_ == address(0) || liquidityReceiver_ == address(0)
        ) revert ZeroAddress();

        // The permission bits live in the ADDRESS. If the salt was not mined,
        // this deployment is useless (v4 would reject it at pool init, or worse,
        // silently never call us). Fail here instead.
        uint160 got = uint160(address(this)) & ALL_HOOK_MASK;
        if (got != HOOK_FLAGS) revert HookAddressFlagsMismatch(got, HOOK_FLAGS);

        poolManager = poolManager_;
        holderRewardsFactory = holderRewardsFactory_;
        liquidityReceiver = liquidityReceiver_;
        owner = owner_;
        treasury = treasury_;
        if (maxSniperWindowBlocks_ > SNIPER_WINDOW_CAP_LIMIT || sniperWindowBlocks_ > maxSniperWindowBlocks_) {
            revert SniperWindowTooLong();
        }
        MAX_SNIPER_WINDOW_BLOCKS = maxSniperWindowBlocks_;
        defaultSniperWindowBlocks = sniperWindowBlocks_;

        // LOAD-BEARING AND OTHERWISE UNENFORCED. `_effectiveTaxBps` computes
        // `premium = SNIPER_OPENING_TAX_BPS > normal ? … : 0`, so if the ongoing
        // ceiling were ever raised to meet the opening rate, the premium would
        // floor to zero for the highest-tax pools — the feature would silently
        // no-op for exactly the pools most worth protecting, while `inWindow`
        // stayed true and kept denying the creator their share. Fail at deploy
        // rather than ship a tax that does nothing.
        if (SNIPER_OPENING_TAX_BPS <= MAX_TOTAL_FEE_BPS) revert OpeningTaxBelowCap();

        // The three legs must account for the whole opening charge. `_book`
        // derives the liquidity and creator legs from these constants and gives
        // the platform leg the exact remainder, so the sum is always `fee`; this
        // check makes sure the remainder IS the platform share the constants
        // promise, rather than a silent surplus or shortfall on that leg.
        if (SNIPER_CREATOR_BPS + SNIPER_LIQUIDITY_BPS + SNIPER_PLATFORM_BPS != SNIPER_OPENING_TAX_BPS) {
            revert OpeningTaxBelowCap();
        }

        emit OwnershipTransferred(address(0), owner_);
        emit TreasuryUpdated(treasury_);
    }

    // =========================================================================
    // v4 hook permissions
    // =========================================================================

    struct Permissions {
        bool beforeInitialize;
        bool afterInitialize;
        bool beforeAddLiquidity;
        bool afterAddLiquidity;
        bool beforeRemoveLiquidity;
        bool afterRemoveLiquidity;
        bool beforeSwap;
        bool afterSwap;
        bool beforeDonate;
        bool afterDonate;
        bool beforeSwapReturnDelta;
        bool afterSwapReturnDelta;
        bool afterAddLiquidityReturnDelta;
        bool afterRemoveLiquidityReturnDelta;
    }

    /// @notice The canonical v4 permission descriptor. Kept in lockstep with
    /// `HOOK_FLAGS`; `validateHookAddress()` proves the two agree.
    function getHookPermissions() public pure returns (Permissions memory) {
        return Permissions({
            beforeInitialize: false,
            afterInitialize: false,
            beforeAddLiquidity: false,
            afterAddLiquidity: false,
            beforeRemoveLiquidity: false,
            afterRemoveLiquidity: false,
            beforeSwap: true,
            afterSwap: true,
            beforeDonate: false,
            afterDonate: false,
            beforeSwapReturnDelta: true,
            afterSwapReturnDelta: true,
            afterAddLiquidityReturnDelta: false,
            afterRemoveLiquidityReturnDelta: false
        });
    }

    /// @notice Recompute the required flag word from `getHookPermissions()` and
    /// check it against the deployed address. Anyone can call this to verify.
    function validateHookAddress() public view returns (bool) {
        return (uint160(address(this)) & ALL_HOOK_MASK) == permissionsToFlags(getHookPermissions());
    }

    function permissionsToFlags(Permissions memory p) public pure returns (uint160 flags) {
        if (p.beforeInitialize) flags |= BEFORE_INITIALIZE_FLAG;
        if (p.afterInitialize) flags |= AFTER_INITIALIZE_FLAG;
        if (p.beforeAddLiquidity) flags |= BEFORE_ADD_LIQUIDITY_FLAG;
        if (p.afterAddLiquidity) flags |= AFTER_ADD_LIQUIDITY_FLAG;
        if (p.beforeRemoveLiquidity) flags |= BEFORE_REMOVE_LIQUIDITY_FLAG;
        if (p.afterRemoveLiquidity) flags |= AFTER_REMOVE_LIQUIDITY_FLAG;
        if (p.beforeSwap) flags |= BEFORE_SWAP_FLAG;
        if (p.afterSwap) flags |= AFTER_SWAP_FLAG;
        if (p.beforeDonate) flags |= BEFORE_DONATE_FLAG;
        if (p.afterDonate) flags |= AFTER_DONATE_FLAG;
        if (p.beforeSwapReturnDelta) flags |= BEFORE_SWAP_RETURNS_DELTA_FLAG;
        if (p.afterSwapReturnDelta) flags |= AFTER_SWAP_RETURNS_DELTA_FLAG;
        if (p.afterAddLiquidityReturnDelta) flags |= AFTER_ADD_LIQUIDITY_RETURNS_DELTA_FLAG;
        if (p.afterRemoveLiquidityReturnDelta) flags |= AFTER_REMOVE_LIQUIDITY_RETURNS_DELTA_FLAG;
    }

    // =========================================================================
    // Pool identity
    // =========================================================================

    /// @notice v4's PoolId. `PoolIdLibrary.toId` hashes the five in-memory words
    /// of the key, which is byte-identical to `abi.encode` of a struct of five
    /// value types. `PeddlesStockLaunchpad` already derives its ids this way.
    function toId(PoolKey memory key) public pure returns (bytes32) {
        return keccak256(abi.encode(key));
    }

    function poolConfig(bytes32 poolId) external view returns (PoolConfig memory) {
        return _pools[poolId];
    }

    function accrued(bytes32 poolId) external view returns (Accrued memory) {
        return _accrued[poolId];
    }

    /// @notice The all-in tax a pool currently charges, in bps of the gross.
    ///
    /// This is `creatorTaxBps` verbatim once the opening window has closed: the
    /// creator's launch-time rate IS the all-in, and both fixed legs are carved
    /// OUT of it rather than added to it. Nothing the owner or the creator can
    /// call changes this number after registration.
    ///
    /// During the opening window it reads the decaying opening rate instead; see
    /// `_effectiveTaxBps` and `sniperBlocksRemaining`.
    function totalFeeBps(bytes32 poolId) public view returns (uint256) {
        PoolConfig storage c = _pools[poolId];
        if (!c.registered) return 0;
        (uint256 bps,) = _effectiveTaxBps(poolId, c);
        return bps;
    }

    /// @notice The opening tax, decaying to the pool's OWN rate.
    ///
    /// ── IT DECAYS TO WHATEVER THE POOL CHARGES, NOT TO A CONSTANT ───────────
    /// The floor is `c.creatorTaxBps`, so a pool launched at 3% decays 20% -> 3%
    /// and a pool at 10% decays 20% -> 10%. Nothing here assumes 1%. That rate is
    /// written once at registration, so the floor a pool decays to is the rate
    /// it was launched with and nothing else. Once the window closes this
    /// function is `creatorTaxBps` verbatim and the guard costs one comparison.
    ///
    /// ── LINEAR DECAY, NOT A CLIFF ──────────────────────────────────────────
    /// A cliff just teaches a sniper to wait for the block after it. A ramp
    /// makes every early block progressively less attractive with no clean edge
    /// to time.
    ///
    /// ── IT CANNOT REVERT ───────────────────────────────────────────────────
    /// This is read on the swap path, and a reverting `beforeSwap` bricks a pool
    /// permanently. `sniperWindowBlocks == 0` and `startBlock == 0` both fall
    /// through to the normal rate, `elapsed < w` guards the division, and the
    /// premium is floored at zero in case a pool's own rate ever exceeds the
    /// opening rate.
    function _effectiveTaxBps(bytes32 poolId, PoolConfig storage c)
        internal
        view
        returns (uint256 bps, bool inWindow)
    {
        uint256 normal = uint256(c.creatorTaxBps);
        uint256 w = uint256(c.sniperWindow);
        uint256 start = uint256(c.startBlock);
        if (w == 0 || start == 0 || block.number < start) return (normal, false);
        // The creator's own opening buy pays the ORDINARY rate. TWO independent
        // conditions must hold, and the cheap one is tested first so that every
        // swap after the launch block skips the `tload` entirely:
        //   1. we are still in the very block the pool was registered in, and
        //   2. this transaction is the one that registered it.
        // Either alone would be too weak — (1) admits a same-block sniper in a
        // later transaction, (2) alone would ride along with any swap a caller
        // could bundle after a registration. Together they admit exactly the
        // swaps made in the transaction that registered the pool, in its block.
        //
        // WHAT THAT DOES AND DOES NOT MEAN. The marker is transient storage, so
        // it lives for the whole TRANSACTION, not just the launchpad's dev-buy
        // call: a creator who launches from a contract can `createCoinAndBuy`
        // and then swap the same token again through the router, in the same
        // transaction, at the ordinary rate. That is not a new exemption — the
        // dev buy itself is uncapped, so every unit they could buy that way they
        // could already have bought as the dev buy — but it is wider than "only
        // the launchpad's own call", and it should be read as what it is. No
        // third party can reach it: they are never in the registering
        // transaction.
        if (block.number == start && _isDevBuy(poolId)) return (normal, false);

        uint256 elapsed = block.number - start;
        if (elapsed >= w) return (normal, false);

        uint256 premium = SNIPER_OPENING_TAX_BPS > normal ? SNIPER_OPENING_TAX_BPS - normal : 0;
        return (normal + (premium * (w - elapsed)) / w, true);
    }

    /// @notice Blocks remaining in this pool's opening window; 0 once it closed.
    /// @dev So a client can render the countdown without recomputing the rule.
    function sniperBlocksRemaining(bytes32 poolId) external view returns (uint256) {
        PoolConfig storage c = _pools[poolId];
        uint256 w = uint256(c.sniperWindow);
        uint256 start = uint256(c.startBlock);
        if (!c.registered || w == 0 || start == 0 || block.number < start) return 0;
        uint256 elapsed = block.number - start;
        return elapsed >= w ? 0 : w - elapsed;
    }

    /// @notice Retire, shorten or restore the opening tax FOR FUTURE LAUNCHES.
    /// @param blocks_ new window; 0 turns the opening tax off outright.
    ///
    /// Bounded by MAX_SNIPER_WINDOW_BLOCKS so it can never become a standing 20%,
    /// and it does not reach a single pool that has already registered — those
    /// read their own snapshot. Changing it is therefore a policy change for
    /// tomorrow, never a repricing of a pool someone is trading right now.
    function setDefaultSniperWindowBlocks(uint32 blocks_) external {
        if (msg.sender != owner) revert NotOwner();
        if (blocks_ > defaultSniperWindowBlocks) revert SniperWindowTooLong();
        defaultSniperWindowBlocks = blocks_;
        emit DefaultSniperWindowUpdated(blocks_);
    }

    // =========================================================================
    // The atomic dev buy — transient (EIP-1153), one transaction wide
    // =========================================================================
    //
    // The hook CANNOT SEE THE TRADER: `beforeSwap`/`afterSwap` receive the
    // unlocking router, which is `PeddlesStockSwapRouter` for the creator's dev
    // buy and for a stranger's snipe alike, deliberately so — the dev buy takes
    // the same audited swap path as anyone else. So the creator cannot be
    // identified by address, and this exempts a MOMENT instead: the transaction
    // in which the pool was registered, which only `createCoinAndBuy` can be.
    //
    // Transient storage is what makes that moment expressible. It is written by
    // `registerPool` and discarded at the end of the transaction by the EVM, so
    // no state survives, nothing needs clearing, and there is no path by which a
    // later swap inherits the exemption. Robinhood Chain runs a Uniswap v4
    // PoolManager, which cannot function without EIP-1153, so the opcode is
    // available on every chain this hook can be deployed to.

    /// @dev Keyed by POOL ID, not by token: keyed by token, any registrar that registered a
    /// second pool naming an already-launching token in the same block set the marker for that
    /// token and so skipped the opening tax on the real pool.
    function _markDevBuy(bytes32 poolId) private {
        assembly ("memory-safe") {
            tstore(poolId, 1)
        }
    }

    function _isDevBuy(bytes32 poolId) private view returns (bool hit) {
        assembly ("memory-safe") {
            hit := tload(poolId)
        }
    }

    // =========================================================================
    // Registration — write-once identity, registrar-gated
    // =========================================================================

    /// @notice Bind a pool to its quote asset, creator, launch terms and holder-
    /// rewards distributor. Callable only by an authorised registrar (the
    /// launchpad and the WETH orchestrators), and only ONCE per pool: nothing it
    /// writes can ever be rewritten.
    ///
    /// `creatorTaxBps` is checked against BOTH constant bounds and
    /// `excessToCreatorBps` against 100%, here, on their only write path.
    ///
    /// The distributor is DEPLOYED HERE, through the immutable factory, rather
    /// than accepted as an argument: a registrar cannot bind a distributor this
    /// hook did not build. `excluded` is the launch's own list of addresses that
    /// must never earn (its vaults, the contract holding the LP position, a clog
    /// vault); this hook adds the PoolManager and itself. The distributor's owner
    /// is this hook's owner, and its exclusions are locked before handover.
    ///
    /// The caller must then point the token's transfer notifications at the
    /// returned address, in the same transaction.
    ///
    /// Launches REVERT if this does — registration is not best-effort anywhere.
    function registerPool(
        PoolKey calldata key,
        address token,
        address quote,
        address creator,
        uint16 creatorTaxBps,
        uint16 excessToCreatorBps,
        address[] calldata excluded
    ) external returns (address rewards) {
        if (!isRegistrar[msg.sender]) revert NotRegistrar();
        if (creatorTaxBps > MAX_CREATOR_TAX_BPS || excessToCreatorBps > BPS) revert FeeAboveCap();
        if (creatorTaxBps < MIN_CREATOR_TAX_BPS) revert FeeBelowFloor();
        if (token == address(0) || quote == address(0) || creator == address(0)) revert ZeroAddress();
        // The quote must actually be one of the pool's two currencies, otherwise
        // the fee could never be settled against this pool's deltas.
        if (quote != key.currency0 && quote != key.currency1) revert ZeroAddress();
        if (token != key.currency0 && token != key.currency1) revert ZeroAddress();
        if (key.hooks != address(this)) revert NotRegistered();
        // The token must already exist. Every launcher deploys its token earlier in the same
        // transaction; requiring code means no registrar can occupy a launch's pool key in advance
        // (a launch's token address is predictable) and make that launch revert AlreadyRegistered.
        if (token.code.length == 0) revert NotRegistered();

        bytes32 poolId = toId(key);
        PoolConfig storage c = _pools[poolId];
        if (c.registered) revert AlreadyRegistered();
        // Latched BEFORE the factory call, so no path back into this function for the same pool
        // can get past the check above.
        c.registered = true;

        rewards = _deployRewards(token, quote, excluded);

        c.quote = quote;
        c.token = token;
        c.creator = creator;
        // The launch's own terms, in force from this pool's very first swap: there
        // is no interval in which some default applies before them.
        c.creatorTaxBps = creatorTaxBps;
        c.excessToCreatorBps = excessToCreatorBps;
        c.rewards = rewards;
        // The opening window starts here and is never rewritten: `registerPool`
        // is write-once identity, so there is no path that re-arms it.
        c.startBlock = uint32(block.number);
        c.sniperWindow = defaultSniperWindowBlocks;

        // ── MARK THE ATOMIC DEV BUY ──────────────────────────────────────────
        //
        // The launcher calls this from inside the launch, and a dev buy (if any)
        // runs LATER IN THE SAME TRANSACTION. This is a transient (EIP-1153)
        // marker, so it is visible to every swap in this transaction and gone by
        // the next one — which is exactly the boundary that separates the
        // creator's atomic dev buy from a sniper.
        //
        // A sniper cannot reach it. Nothing can interleave inside a transaction,
        // so a same-BLOCK sniper is in a different transaction and sees a cleared
        // slot; and the marker is keyed by the POOL, so registering one pool
        // never exempts a swap on a different one — not even another pool of the
        // same token. There is no clear-after-use: the transaction boundary does it.
        _markDevBuy(poolId);

        emit PoolRegistered(poolId, token, quote, creator, creatorTaxBps, excessToCreatorBps, rewards);
    }

    /// @dev The launch's exclusions plus the two this hook always knows: the
    /// PoolManager (which holds the pool's side of every launched token) and this
    /// hook. A separate function to keep `registerPool`'s stack shallow.
    function _deployRewards(address token, address quote, address[] calldata excluded)
        private
        returns (address rewards)
    {
        uint256 n = excluded.length;
        address[] memory all = new address[](n + 2);
        for (uint256 i; i < n; ++i) {
            all[i] = excluded[i];
        }
        all[n] = poolManager;
        all[n + 1] = address(this);
        rewards = IPeddlesHolderRewardsFactory(holderRewardsFactory).create(token, quote, owner, all);
        if (rewards == address(0)) revert ZeroAddress();
    }

    // =========================================================================
    // Creator configuration
    // =========================================================================

    modifier onlyPoolCreator(bytes32 poolId) {
        if (_pools[poolId].creator != msg.sender) revert NotPoolCreator();
        _;
    }

    /// @notice Creator-controlled destination for the creator slice. Exists so a
    /// creator whose own address becomes untransferable (a token blocklist, a
    /// contract that cannot receive) still has a reachable exit for their funds.
    function setCreatorPayout(bytes32 poolId, address payout) external onlyPoolCreator(poolId) {
        _pools[poolId].creatorPayout = payout;
        emit CreatorPayoutUpdated(poolId, payout);
    }

    // =========================================================================
    // Owner configuration
    // =========================================================================

    /// @notice Split the platform's own fixed 0.50% leg between the PEDL
    /// flywheel and the treasury. Both destinations are protocol revenue, so
    /// this never changes what a trader pays or what any creator or holder gets.
    function setPlatformFlywheelBps(uint16 bps) external onlyOwner {
        if (bps > BPS) revert FeeAboveCap();
        platformFlywheelBps = bps;
        emit PlatformFlywheelBpsUpdated(bps);
    }

    function setTreasury(address treasury_) external onlyOwner {
        if (treasury_ == address(0)) revert ZeroAddress();
        treasury = treasury_;
        emit TreasuryUpdated(treasury_);
    }

    function setFlywheel(address flywheel_) external onlyOwner {
        flywheel = flywheel_;
        emit FlywheelUpdated(flywheel_);
    }

    function setRegistrar(address registrar, bool allowed) external onlyOwner {
        if (registrar == address(0)) revert ZeroAddress();
        isRegistrar[registrar] = allowed;
        emit RegistrarUpdated(registrar, allowed);
    }

    function transferOwnership(address next) external onlyOwner {
        if (next == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, next);
        owner = next;
    }

    // =========================================================================
    // THE HOOK CALLBACKS
    // =========================================================================

    /// @notice Charges the fee when the QUOTE is the SPECIFIED currency
    /// (rows #1 and #4 of the table in the header).
    ///
    /// Sign convention, straight out of v4-core:
    ///   * `amountToSwap = params.amountSpecified + deltaSpecified`, and v4
    ///     reverts if that flips the swap between exact-in and exact-out.
    ///   * the returned delta is credited to the HOOK and subtracted from the
    ///     swapper's delta, so a POSITIVE `deltaSpecified` is a charge.
    ///
    /// exact-in  (amountSpecified = -G): amountToSwap = -(G - fee). The pool
    ///           swaps G-fee, the trader still pays G, the hook keeps fee.
    /// exact-out (amountSpecified = +N): amountToSwap = N + fee. The pool
    ///           releases N+fee, the trader receives N, the hook keeps fee.
    ///
    /// This function MUST NOT revert for a live pool — a reverting beforeSwap
    /// bricks the pool permanently. Unregistered pools and out-of-range maths
    /// both fall through to a zero delta.
    function beforeSwap(address, PoolKey calldata key, SwapParams calldata params, bytes calldata)
        external
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        if (msg.sender != poolManager) revert NotPoolManager();

        bytes32 poolId = toId(key);
        PoolConfig storage c = _pools[poolId];
        if (!c.registered) return (this.beforeSwap.selector, BeforeSwapDelta.wrap(0), 0);

        bool exactInput = params.amountSpecified < 0;
        // v4: the specified currency is currency0 exactly when
        // (amountSpecified < 0) == zeroForOne.
        bool specifiedIsCurrency0 = (exactInput == params.zeroForOne);
        bool quoteIsCurrency0 = (c.quote == key.currency0);

        // Quote on the unspecified side => afterSwap handles it.
        if (quoteIsCurrency0 != specifiedIsCurrency0) {
            return (this.beforeSwap.selector, BeforeSwapDelta.wrap(0), 0);
        }

        uint256 fee = exactInput
            ? _accrueOnGross(poolId, c, uint256(-params.amountSpecified), true)
            : _accrueOnNet(poolId, c, uint256(params.amountSpecified), true);

        if (fee == 0) return (this.beforeSwap.selector, BeforeSwapDelta.wrap(0), 0);

        // Offset the hook's positive delta with ERC-6909 claims. No token moves,
        // so this cannot fail on PoolManager liquidity or run quote-token code.
        IV4PoolManagerForHook(poolManager).mint(address(this), uint256(uint160(c.quote)), fee);

        return (this.beforeSwap.selector, _toBeforeSwapDelta(int128(int256(fee)), 0), 0);
    }

    /// @notice Charges the fee when the QUOTE is the UNSPECIFIED currency
    /// (rows #2 and #3). The realised amount is known here, which is exactly
    /// what `beforeSwap` could not know.
    ///
    /// The returned int128 is added to v4's `hookDeltaUnspecified`; positive
    /// credits the hook and is paid by the swapper. `delta` is the pool's raw
    /// result for the swapper:
    ///   * quote is the OUTPUT (exact-in)  -> its leg is > 0; charge on that gross.
    ///   * quote is the INPUT  (exact-out) -> its leg is < 0; gross that up so
    ///     the effective rate on the total quote paid is still `totalBps`.
    function afterSwap(address, PoolKey calldata key, SwapParams calldata params, BalanceDelta delta, bytes calldata)
        external
        returns (bytes4, int128)
    {
        if (msg.sender != poolManager) revert NotPoolManager();

        bytes32 poolId = toId(key);
        PoolConfig storage c = _pools[poolId];
        if (!c.registered) return (this.afterSwap.selector, 0);

        bool exactInput = params.amountSpecified < 0;
        bool specifiedIsCurrency0 = (exactInput == params.zeroForOne);
        bool quoteIsCurrency0 = (c.quote == key.currency0);

        // Quote on the specified side => beforeSwap already charged it.
        if (quoteIsCurrency0 == specifiedIsCurrency0) return (this.afterSwap.selector, 0);

        int128 quoteLeg = quoteIsCurrency0 ? _amount0(delta) : _amount1(delta);

        uint256 fee;
        if (quoteLeg > 0) {
            // Quote left the pool to the trader; take our slice out of it.
            fee = _accrueOnGross(poolId, c, uint256(uint128(quoteLeg)), false);
        } else if (quoteLeg < 0) {
            // Quote is the trader's input; gross it up on top of what they owe.
            fee = _accrueOnNet(poolId, c, uint256(uint128(-quoteLeg)), false);
        }

        if (fee == 0) return (this.afterSwap.selector, 0);

        IV4PoolManagerForHook(poolManager).mint(address(this), uint256(uint160(c.quote)), fee);

        return (this.afterSwap.selector, int128(int256(fee)));
    }

    // ---- Unused callbacks. v4 never calls these (the address bits forbid it);
    // ---- they exist so the IHooks surface is complete and any mis-registration
    // ---- fails loudly rather than silently succeeding.

    function beforeInitialize(address, PoolKey calldata, uint160) external pure returns (bytes4) {
        revert HookNotImplemented();
    }

    function afterInitialize(address, PoolKey calldata, uint160, int24) external pure returns (bytes4) {
        revert HookNotImplemented();
    }

    function beforeAddLiquidity(address, PoolKey calldata, ModifyLiquidityParams calldata, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        revert HookNotImplemented();
    }

    function afterAddLiquidity(
        address,
        PoolKey calldata,
        ModifyLiquidityParams calldata,
        BalanceDelta,
        BalanceDelta,
        bytes calldata
    ) external pure returns (bytes4, BalanceDelta) {
        revert HookNotImplemented();
    }

    function beforeRemoveLiquidity(address, PoolKey calldata, ModifyLiquidityParams calldata, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        revert HookNotImplemented();
    }

    function afterRemoveLiquidity(
        address,
        PoolKey calldata,
        ModifyLiquidityParams calldata,
        BalanceDelta,
        BalanceDelta,
        bytes calldata
    ) external pure returns (bytes4, BalanceDelta) {
        revert HookNotImplemented();
    }

    function beforeDonate(address, PoolKey calldata, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        revert HookNotImplemented();
    }

    function afterDonate(address, PoolKey calldata, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        revert HookNotImplemented();
    }

    // =========================================================================
    // Fee maths
    // =========================================================================

    /// @dev Split `fee` into TWO FIXED LEGS plus a remainder, and book it.
    ///
    /// The platform and creator legs are absolute rates on VOLUME
    /// (PLATFORM_FEE_BPS, CREATOR_FEE_BPS — 0.50% each), not shares of the fee.
    /// They are nonetheless computed from `fee` rather than from the gross,
    /// because `fee == gross * total / BPS` gives the identity
    ///
    ///     fee * X / total  ==  gross * X / BPS
    ///
    /// so the gross never has to be threaded down here. `total` is the pool's
    /// all-in (`c.creatorTaxBps`), passed in by the caller that already read it.
    ///
    ///   platformCut  = fee * PLATFORM_FEE_BPS / total   (0.50% of gross, floored)
    ///   creatorBase  = fee * CREATOR_FEE_BPS  / total   (0.50% of gross, floored)
    ///
    /// "Floored" is doubled: `fee` is already a floor of gross*total/BPS, so each
    /// fixed leg can land one base unit BELOW floor(gross*50/BPS), in the trader's
    /// favour. Never above it.
    ///   excess       = fee - platformCut - creatorBase  (everything above 1%)
    ///   creatorCut   = creatorBase + excess * c.excessToCreatorBps / BPS
    ///   holderCut    = fee - platformCut - creatorCut   (the remainder)
    ///
    /// Both fixed legs floor, the creator's excess share floors, and holders take
    /// what is left, so `platform + creator + holders == fee` EXACTLY at every
    /// tax level and every `excessToCreatorBps` — the residue always lands with
    /// holders and nothing is ever stranded. At `total == MIN_TOTAL_FEE_BPS` the
    /// excess is at most the one base unit the two floors leave.
    ///
    /// `platformCut + creatorCut <= fee` is structural, not incidental: both are
    /// floors of quantities summing to `fee * MIN_TOTAL_FEE_BPS / total <= fee`
    /// whenever `total >= MIN_TOTAL_FEE_BPS`, which `registerPool` enforces. The
    /// subtraction for `holderCut` therefore cannot underflow.
    ///
    /// Every registered pool has a distributor (it is deployed by `registerPool`),
    /// so the holder slice is always charged and always has a destination.
    /// Returns the amount charged.
    function _book(
        bytes32 poolId,
        PoolConfig storage c,
        uint256 fee,
        uint256 total,
        bool viaBefore,
        bool inWindow
    ) private returns (uint256 charged) {
        if (fee == 0 || fee > MAX_FEE_AMOUNT) return 0;

        // ── THE OPENING WINDOW: HALF TO LIQUIDITY, A QUARTER EACH ────────────
        //
        // The normal split is suspended and replaced by fixed proportions —
        // SNIPER_LIQUIDITY_BPS / SNIPER_CREATOR_BPS / SNIPER_PLATFORM_BPS out of
        // SNIPER_OPENING_TAX_BPS, i.e. 1/2, 1/4, 1/4 — which at the peak 20%
        // rate is the 10 / 5 / 5 the product promises, and stays that ratio all
        // the way down the decay.
        //
        // DERIVED FROM THE CONSTANTS, NOT RESTATED. This used to hardcode
        // `fee / 2` and `fee / 4` next to constants the constructor checked only
        // against each other, so the constants were decorative: the documented
        // guarantee that SNIPER_CREATOR_BPS caps the creator's take was not the
        // number the code used. Now it is.
        //
        // THE CREATOR'S QUARTER DOES NOT MAKE SELF-SNIPING PAY. They would hand
        // over the full charge to collect a quarter of it, losing 15% of gross on
        // the round trip; the incentive only inverts as the share approaches the
        // whole tax, which is why SNIPER_CREATOR_BPS is a constant nobody can
        // raise. The largest leg is earmarked for liquidity and paid out by
        // `sweepLiquidityShare` to the immutable `liquidityReceiver`; nothing
        // here deposits it into a pool.
        //
        // The odd wei goes to the platform leg rather than being dropped, so
        // `liquidity + creator + platform == fee` exactly and nothing is stranded.
        // `fee <= MAX_FEE_AMOUNT` (int128 max) so the products cannot overflow.
        if (inWindow) {
            uint256 toLiquidity = (fee * SNIPER_LIQUIDITY_BPS) / SNIPER_OPENING_TAX_BPS;
            uint256 toCreator = (fee * SNIPER_CREATOR_BPS) / SNIPER_OPENING_TAX_BPS;
            uint256 toPlatform = fee - toLiquidity - toCreator;
            Accrued storage sa = _accrued[poolId];
            unchecked {
                uint256 l = uint256(sa.liquidity) + toLiquidity;
                uint256 cr = uint256(sa.creator) + toCreator;
                uint256 pf = uint256(sa.platform) + toPlatform;
                // Same discipline as the normal path: fail to a ZERO fee rather
                // than revert, because a reverting beforeSwap bricks the pool.
                if (l > type(uint128).max || cr > type(uint128).max || pf > type(uint128).max) return 0;
                sa.liquidity = uint128(l);
                sa.creator = uint128(cr);
                sa.platform = uint128(pf);
            }
            emit SniperFeeAccrued(poolId, c.quote, toLiquidity, toCreator, toPlatform, viaBefore);
            return fee;
        }
        // Unreachable for any pool registered under this contract's rules — its
        // only write path floors `creatorTaxBps` at MIN_TOTAL_FEE_BPS — but a pool
        // whose config predates that floor would not have room for the two fixed
        // legs. Charge NOTHING rather than revert: a reverting `beforeSwap`
        // bricks the pool permanently, and that discipline outranks the fee.
        if (total < MIN_TOTAL_FEE_BPS) return 0;

        uint256 platformCut = (fee * PLATFORM_FEE_BPS) / total;
        uint256 creatorBase = (fee * CREATOR_FEE_BPS) / total;
        uint256 excess = fee - platformCut - creatorBase;
        uint256 creatorCut = creatorBase + (excess * c.excessToCreatorBps) / BPS;
        uint256 holderCut = fee - platformCut - creatorCut;

        charged = fee;

        Accrued storage a = _accrued[poolId];
        // uint128 headroom is ~3.4e38 base units; a swap large enough to overflow
        // it cannot exist in any pool. Guarded anyway, and fails to ZERO fee
        // rather than reverting, because a reverting beforeSwap bricks the pool.
        unchecked {
            uint256 p = uint256(a.platform) + platformCut;
            uint256 cr = uint256(a.creator) + creatorCut;
            uint256 h = uint256(a.holders) + holderCut;
            if (p > type(uint128).max || cr > type(uint128).max || h > type(uint128).max) return 0;
            a.platform = uint128(p);
            a.creator = uint128(cr);
            a.holders = uint128(h);
        }

        emit FeeAccrued(poolId, c.quote, platformCut, creatorCut, holderCut, viaBefore);
    }

    /// @dev `gross` already includes the fee: fee = gross * total / BPS.
    function _accrueOnGross(bytes32 poolId, PoolConfig storage c, uint256 gross, bool viaBefore)
        private
        returns (uint256)
    {
        (uint256 total, bool inWindow) = _effectiveTaxBps(poolId, c);
        if (total == 0 || gross == 0) return 0;
        return _book(poolId, c, (gross * total) / BPS, total, viaBefore, inWindow);
    }

    /// @dev `net` is what the trader pinned; the fee sits on top of it, such that
    /// fee / (net + fee) == total / BPS  =>  fee = net * total / (BPS - total).
    /// The divisor is never zero: `total` never exceeds SNIPER_OPENING_TAX_BPS.
    function _accrueOnNet(bytes32 poolId, PoolConfig storage c, uint256 net, bool viaBefore)
        private
        returns (uint256)
    {
        (uint256 total, bool inWindow) = _effectiveTaxBps(poolId, c);
        if (total == 0 || net == 0) return 0;
        // `total` peaks at SNIPER_OPENING_TAX_BPS (2000) < BPS, so the divisor
        // stays positive at the opening rate exactly as it does at the capped one.
        return _book(poolId, c, (net * total) / (BPS - total), total, viaBefore, inWindow);
    }

    // =========================================================================
    // Sweeps — PERMISSIONLESS, one leg at a time
    // =========================================================================
    //
    // Each leg redeems and pays out only its own bucket, so a destination that
    // cannot receive (a blocklist, a reverting contract) can never block the
    // other two. Anyone may call any of them, at any time, for any pool: there
    // is no owner-only path to the money and no way for it to sit unreachable.

    function sweepPlatform(bytes32 poolId) public nonReentrant returns (uint256 amount) {
        PoolConfig storage c = _pools[poolId];
        if (!c.registered) revert NotRegistered();
        amount = _accrued[poolId].platform;
        if (amount == 0) revert NothingToSweep();
        _accrued[poolId].platform = 0;

        address quote = c.quote;
        _redeem(quote, amount);

        address fw = flywheel;
        uint256 toFlywheel = fw == address(0) ? 0 : (amount * platformFlywheelBps) / BPS;
        uint256 toTreasury = amount - toFlywheel;

        if (toFlywheel > 0) _safeTransfer(quote, fw, toFlywheel);
        if (toTreasury > 0) _safeTransfer(quote, treasury, toTreasury);

        emit PlatformSwept(poolId, toTreasury, toFlywheel);
    }

    function sweepCreator(bytes32 poolId) public nonReentrant returns (uint256 amount) {
        PoolConfig storage c = _pools[poolId];
        if (!c.registered) revert NotRegistered();
        amount = _accrued[poolId].creator;
        if (amount == 0) revert NothingToSweep();
        _accrued[poolId].creator = 0;

        address to = c.creatorPayout == address(0) ? c.creator : c.creatorPayout;
        _redeem(c.quote, amount);
        _safeTransfer(c.quote, to, amount);

        emit CreatorSwept(poolId, to, amount);
    }

    function sweepHolders(bytes32 poolId) public nonReentrant returns (uint256 amount) {
        PoolConfig storage c = _pools[poolId];
        if (!c.registered) revert NotRegistered();
        // Always set: `registerPool` deploys it before the pool can be traded.
        address rewards = c.rewards;
        amount = _accrued[poolId].holders;
        if (amount == 0) revert NothingToSweep();
        _accrued[poolId].holders = 0;

        _redeem(c.quote, amount);
        _safeTransfer(c.quote, rewards, amount);

        // The distributor recognises a bare transfer from its own balance delta.
        // The poke is best-effort: a distributor that reverts must never be able
        // to strand a slice that has already landed in it.
        try IPeddlesRewardsSink(rewards).sync() {}
        catch {
            emit RewardsSyncFailed(poolId, rewards, amount);
        }

        emit HoldersSwept(poolId, rewards, amount);
    }

    /// @notice Sweep every leg that has something in it. Individual legs that are
    /// empty are skipped rather than reverting the whole call.
    /// @dev Drains EVERY bucket, including the opening tax's liquidity leg.
    ///
    /// The liquidity leg was omitted, and the omission was invisible: a keeper
    /// looping `sweep` would drain three buckets forever while the fourth grew
    /// without bound and nothing anywhere said so. It pays a different
    /// destination (`liquidityReceiver`) than the other three, which is why it
    /// is a separate call — but "sweep everything" has to mean everything, or
    /// the aggregate entry point quietly stops being the aggregate.
    function sweep(bytes32 poolId)
        external
        returns (uint256 platform, uint256 creator, uint256 holders, uint256 liquidity)
    {
        Accrued memory a = _accrued[poolId];
        if (a.platform > 0) platform = sweepPlatform(poolId);
        if (a.creator > 0) creator = sweepCreator(poolId);
        if (a.holders > 0) holders = sweepHolders(poolId);
        if (a.liquidity > 0) liquidity = this.sweepLiquidityShare(poolId);
    }

    /// @notice Redeem ERC-6909 claims for real ERC20 inside our own unlock.
    function _redeem(address currency, uint256 amount) private {
        _sweeping = true;
        IV4PoolManagerForHook(poolManager).unlock(abi.encode(currency, amount));
        _sweeping = false;
    }

    /// @notice PoolManager unlock callback. Burning the claim credits this hook
    /// `+amount`; taking the currency debits `-amount`. Net zero, so the
    /// PoolManager's settlement invariant holds.
    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != poolManager) revert NotPoolManager();
        if (!_sweeping) revert NotSweeping();

        (address currency, uint256 amount) = abi.decode(data, (address, uint256));
        IV4PoolManagerForHook(poolManager).burn(address(this), uint256(uint160(currency)), amount);
        IV4PoolManagerForHook(poolManager).take(currency, address(this), amount);
        return "";
    }

    /// @notice Pay out the opening tax's liquidity half.
    ///
    /// ── WHY THIS IS NOT `poolManager.donate` ────────────────────────────────
    /// It was, and that was exploitable. v4's `donate` credits whoever holds
    /// IN-RANGE liquidity at `slot0.tick` when it executes, and this hook sets
    /// `beforeAddLiquidity: false` — so anyone may add liquidity to a launchpad
    /// pool. A permissionless donate is therefore visible in the mempool and
    /// front-runnable: a searcher adds a tight in-range position, receives the
    /// whole accumulated opening-tax pot pro rata, and removes it in the same
    /// block. The money meant to deepen the pool leaves with a JIT LP.
    ///
    /// Gating the call does not fix it either — an owner-only donate can still
    /// be sandwiched. The primitive is wrong for this, not the caller.
    ///
    /// So the share is PAID OUT, not donated: it goes to `liquidityReceiver`,
    /// which the owner deploys as liquidity deliberately. That keeps the 50/50
    /// economics and the earmark while removing the theft surface entirely. It
    /// mirrors how the NFT liquidity leg already works for art collections.
    ///
    /// Permissionless like the other sweeps: the destination is an immutable,
    /// never `msg.sender`, so there is nothing for anyone to redirect.
    ///
    /// RETURNS 0 ON AN EMPTY BUCKET rather than reverting `NothingToSweep()` like
    /// the other three legs. That asymmetry is deliberate and pinned by
    /// `test_sweepingAnEmptyShareIsANoOp`: this leg is the one a keeper calls on a
    /// schedule, and a revert would make every idle poll a failed transaction.
    /// The consequence is that a NON-REVERTING CALL IS NOT PROOF THE EXIT WORKS —
    /// `VerifyLive` must compare the beneficiary's balance, not merely observe
    /// that the call was accepted, or an untouched bucket reads as EXIT PROVEN.
    function sweepLiquidityShare(bytes32 poolId) external nonReentrant returns (uint256 amount) {
        return _sweepLiquidityShare(poolId, liquidityReceiver);
    }

    /// @notice The RECEIVER itself may take its share to another address — the exit for a receiver
    /// the quote token has blocklisted (tokenised stocks and USDG carry blocklists). Only the
    /// receiver can call it; the hook owner has no path to the liquidity leg at all.
    function sweepLiquidityShareTo(bytes32 poolId, address to) external nonReentrant returns (uint256 amount) {
        if (msg.sender != liquidityReceiver) revert NotOwner();
        if (to == address(0)) revert ZeroAddress();
        return _sweepLiquidityShare(poolId, to);
    }

    function _sweepLiquidityShare(bytes32 poolId, address to) private returns (uint256 amount) {
        PoolConfig storage c = _pools[poolId];
        if (!c.registered) revert NotRegistered();

        amount = uint256(_accrued[poolId].liquidity);
        if (amount == 0) return 0;
        _accrued[poolId].liquidity = 0;

        _redeem(c.quote, amount);
        _safeTransfer(c.quote, to, amount);
        emit LiquidityShareSwept(poolId, c.quote, to, amount);
    }

    /// @notice Permissionless exit for anything that lands here as raw ERC20 —
    /// a force-send, a rebasing quote, an airdrop. It can never touch accrued
    /// fees: those are held as ERC-6909 claims on the PoolManager, and the only
    /// code path that converts them to ERC20 (`_redeem`) pays them out in the
    /// same `nonReentrant` call. Nothing legitimate is ever sitting here as raw
    /// ERC20 between transactions.
    function skim(address currency) external nonReentrant returns (uint256 amount) {
        amount = IFeeHookERC20(currency).balanceOf(address(this));
        if (amount == 0) revert NothingToSweep();
        _safeTransfer(currency, treasury, amount);
        emit Skimmed(currency, treasury, amount);
    }

    /// @notice The same exit for NATIVE currency, which `skim` cannot reach — it is
    /// ERC20-only, and this contract has no `receive`, no `fallback` and no payable
    /// function anywhere.
    ///
    /// That is exactly why it is needed. "Cannot be sent value" is not the same as
    /// "provably holds none": native can be FORCED in by `selfdestruct` or by naming
    /// this address a block's fee recipient, and neither is refusable. Without this
    /// the balance would sit here permanently — a stuck-funds hole in the contract
    /// that handles the most money in the system. `PeddlesStockSwapRouter`,
    /// `PeddlesLaunchRegistry` and `PeddlesTransferValidator` each already carry this
    /// function for this reason; the two fee hooks were the omissions.
    ///
    /// Permissionless, and to `treasury` with no recipient parameter — the same shape
    /// as `skim` above. Nothing here is owed to anyone (no accrual is ever held as
    /// native), so there is nothing for a caller to steal or redirect, and gating it
    /// on the owner would only add a key whose loss makes the rescue impossible.
    function sweepNative() external nonReentrant returns (uint256 amount) {
        amount = address(this).balance;
        if (amount == 0) revert NothingToSweep();
        (bool ok,) = payable(treasury).call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit Skimmed(address(0), treasury, amount);
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    /// @dev v4 `toBeforeSwapDelta`.
    function _toBeforeSwapDelta(int128 deltaSpecified, int128 deltaUnspecified)
        private
        pure
        returns (BeforeSwapDelta)
    {
        return BeforeSwapDelta.wrap((int256(deltaSpecified) << 128) | int256(uint256(uint128(deltaUnspecified))));
    }

    /// @dev v4 `BalanceDeltaLibrary.amount0` — arithmetic shift right by 128.
    function _amount0(BalanceDelta d) private pure returns (int128) {
        return int128(BalanceDelta.unwrap(d) >> 128);
    }

    /// @dev v4 `BalanceDeltaLibrary.amount1` — truncate and sign-extend.
    function _amount1(BalanceDelta d) private pure returns (int128) {
        return int128(BalanceDelta.unwrap(d));
    }

    /// @dev Bool-optional ERC20 transfer. Stock tokens and USDG differ in
    /// decimals (18 vs 6) and in return-value conformance; never assume either.
    function _safeTransfer(address token, address to, uint256 amount) private {
        if (amount == 0) return;
        (bool ok, bytes memory ret) = token.call(abi.encodeWithSelector(IFeeHookERC20.transfer.selector, to, amount));
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert TransferFailed();
    }
}
