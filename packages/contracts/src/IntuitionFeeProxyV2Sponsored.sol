// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IntuitionFeeProxyV2} from "./IntuitionFeeProxyV2.sol";
import {ProxyChannel} from "./interfaces/IIntuitionFeeProxyV2.sol";
import {Errors} from "./libraries/Errors.sol";

/// @title IntuitionFeeProxyV2Sponsored
/// @notice V2 + shared sponsorship pool. The pool funds the FULL tx cost for
///         every user, regardless of wallet balance — "sponsor everyone equally".
///         Admins top up `sponsorPool` and bound the spend via four knobs:
///           - `maxClaimPerTx`              — max TRUST drawn in a single call
///           - `maxClaimsPerWindow`         — max pool-drawing calls / user / window
///           - `maxClaimVolumePerWindow`    — max cumulative TRUST / user / window
///           - `claimWindowSeconds`         — window length in seconds (default 86400 = 1 day)
///         Defaults: 1 TRUST per call, 10 pool-drawing calls per day per user,
///         10 TRUST cumulative per day per user, window = 1 day.
/// @dev
///  - Sponsorship model is **full-coverage**: the pool pays `totalRequired =
///    assets + Sofia fee`. Users never spend TRUST from their wallet — any
///    `msg.value` a caller may send is refunded at the end of the call
///    (tolerant UX, `nonReentrant`-protected). Fees accrue to
///    `accumulatedFees` exactly like the standard channel — the fundPool
///    being permissionless means public donors effectively fund both the
///    user deposit AND Sofia's cut, making the fee model non-circular.
///  - The inverse-formula `deposit(3 args)` is **disabled** on this channel —
///    the pool cannot finance an intent that is only implicit in `msg.value`.
///    Callers must use `depositSponsored(4 args)` with an explicit `assets`.
///  - All sponsored state lives in an ERC-7201 namespaced slot
///    (`keccak256("intuition.feeproxy.sponsored.v1")`) so V2's and future V3's
///    inline storage layouts stay independent.
///  - Admin surface: `fundPool` / `reclaimFromPool` / `setClaimLimits` +
///    inherited V2 admin actions (whitelist). The admin cannot mint on behalf
///    of users — every on-chain action that touches the MultiVault originates
///    from the user's own wallet (msg.sender = receiver), guaranteeing that
///    the admin can never force shares onto an unwilling address.
///  - For tiered-subscription scenarios (free / pro / premium), deploy one
///    sponsored proxy per tier rather than encoding tiers on-chain.
///  - NEVER `registerVersion` a V2-standard impl on a sponsored proxy (or vice
///    versa). Storage layouts differ, cross-family switching orphans the pool.
///    The Factory enforces the split via its two-channel design.
contract IntuitionFeeProxyV2Sponsored is IntuitionFeeProxyV2 {
    // ============ Namespaced storage ============

    /// @dev ERC-7201 namespaced storage slot for the sponsored-credit layout.
    bytes32 private constant SPONSORED_STORAGE_LOCATION = keccak256(
        abi.encode(uint256(keccak256("intuition.feeproxy.sponsored.v1")) - 1)
    ) & ~bytes32(uint256(0xff));

    struct ClaimWindow {
        uint64 windowStart;
        uint64 count;
        uint128 volume;
    }

    struct SponsoredLayout {
        uint256 sponsorPool;
        uint256 maxClaimPerTx;
        uint256 maxClaimsPerWindow;
        mapping(address user => ClaimWindow) claimWindows;
        uint256 totalSponsoredDeposits;
        uint256 totalSponsoredVolume;
        uint256 totalSponsoredUniqueReceivers;
        mapping(address => bool) hasReceivedSponsored;
        uint256 maxClaimVolumePerWindow;
        uint256 claimWindowSeconds;
    }

    function _s() private pure returns (SponsoredLayout storage $) {
        bytes32 slot = SPONSORED_STORAGE_LOCATION;
        assembly {
            $.slot := slot
        }
    }

    // ============ Constants ============

    uint256 private constant DEFAULT_MAX_CLAIM_PER_TX = 1 ether;
    uint256 private constant DEFAULT_MAX_CLAIMS_PER_WINDOW = 10;
    uint256 private constant DEFAULT_MAX_CLAIM_VOLUME_PER_WINDOW = 10 ether;
    uint256 private constant DEFAULT_CLAIM_WINDOW_SECONDS = 1 days;

    /// @notice Minimum accepted `claimWindowSeconds` (1 hour). Shorter windows
    ///         let the per-user count / volume caps reset too fast to be
    ///         meaningful — a 1-second window would let a bot do
    ///         `maxClaimsPerWindow` calls every single second and drain the
    ///         pool. 1 hour is the product-level "bot threshold": legitimate
    ///         users never hit a 10/hour cap in normal usage.
    uint256 public constant MIN_CLAIM_WINDOW_SECONDS = 1 hours;

    // ============ Events ============

    event PoolFunded(uint256 amount, address indexed by);
    event PoolReclaimed(uint256 amount, address indexed to, address indexed by);
    event CreditConsumed(address indexed user, uint256 amount);
    event ClaimLimitsSet(
        uint256 maxClaimPerTx,
        uint256 maxClaimsPerWindow,
        uint256 maxClaimVolumePerWindow,
        uint256 claimWindowSeconds
    );
    event SponsoredMetricsUpdated(
        uint256 totalSponsoredDeposits,
        uint256 totalSponsoredVolume,
        uint256 totalSponsoredUniqueReceivers
    );

    // ============ Init override ============

    function initialize(
        address ethMultiVault_,
        uint256 depositFixedFee_,
        uint256 depositPercentageFee_,
        address[] calldata initialAdmins_
    ) external override initializer {
        _initializeV2(ethMultiVault_, depositFixedFee_, depositPercentageFee_, initialAdmins_);

        SponsoredLayout storage $ = _s();
        $.maxClaimPerTx = DEFAULT_MAX_CLAIM_PER_TX;
        $.maxClaimsPerWindow = DEFAULT_MAX_CLAIMS_PER_WINDOW;
        $.maxClaimVolumePerWindow = DEFAULT_MAX_CLAIM_VOLUME_PER_WINDOW;
        $.claimWindowSeconds = DEFAULT_CLAIM_WINDOW_SECONDS;
        emit ClaimLimitsSet(
            DEFAULT_MAX_CLAIM_PER_TX,
            DEFAULT_MAX_CLAIMS_PER_WINDOW,
            DEFAULT_MAX_CLAIM_VOLUME_PER_WINDOW,
            DEFAULT_CLAIM_WINDOW_SECONDS
        );
    }

    // ============ Channel + storage markers (override V2) ============

    /// @inheritdoc IntuitionFeeProxyV2
    function channel() external pure override returns (ProxyChannel) {
        return ProxyChannel.Sponsored;
    }

    /// @inheritdoc IntuitionFeeProxyV2
    /// @dev Sponsored family: V2 inline slots + the ERC-7201 namespaced
    ///      sponsored layout. Distinct from the standard ID so the versioned
    ///      proxy rejects cross-family registration.
    function STORAGE_COMPAT_ID() external pure override returns (bytes32) {
        return keccak256("intuition.feeproxy.v2.sponsored");
    }

    // ============ Identification ============

    function version() external pure virtual returns (string memory) {
        return "v2.0.0-sponsored";
    }

    // ============ Views ============

    function sponsorPool() external view returns (uint256) { return _s().sponsorPool; }
    function maxClaimPerTx() external view returns (uint256) { return _s().maxClaimPerTx; }
    function maxClaimsPerWindow() external view returns (uint256) { return _s().maxClaimsPerWindow; }
    function maxClaimVolumePerWindow() external view returns (uint256) { return _s().maxClaimVolumePerWindow; }
    function claimWindowSeconds() external view returns (uint256) { return _s().claimWindowSeconds; }

    function getClaimStatus(address user)
        external
        view
        returns (uint256 claimsUsed, uint256 volumeUsed, uint256 windowResetsAt)
    {
        SponsoredLayout storage $ = _s();
        ClaimWindow storage w = $.claimWindows[user];
        if (uint256(w.windowStart) == 0) return (0, 0, 0);
        if (block.timestamp >= uint256(w.windowStart) + $.claimWindowSeconds) return (0, 0, 0);
        return (uint256(w.count), uint256(w.volume), uint256(w.windowStart) + $.claimWindowSeconds);
    }

    function totalSponsoredDeposits() external view returns (uint256) { return _s().totalSponsoredDeposits; }
    function totalSponsoredVolume() external view returns (uint256) { return _s().totalSponsoredVolume; }
    function totalSponsoredUniqueReceivers() external view returns (uint256) { return _s().totalSponsoredUniqueReceivers; }
    function hasReceivedSponsored(address user) external view returns (bool) { return _s().hasReceivedSponsored[user]; }

    function getSponsoredMetrics()
        external
        view
        returns (
            uint256 sponsoredDeposits,
            uint256 sponsoredVolume,
            uint256 uniqueSponsoredReceivers
        )
    {
        SponsoredLayout storage $ = _s();
        return ($.totalSponsoredDeposits, $.totalSponsoredVolume, $.totalSponsoredUniqueReceivers);
    }

    // ============ Admin: claim limits ============

    /// @dev Mutating `windowSec` does NOT reset existing per-user
    ///      `claimWindows` — they keep their stored `windowStart` and are
    ///      compared against the new `windowSec` on the next call. Shrinking
    ///      `windowSec` may cause some users to roll into a fresh window
    ///      earlier than they would have; lengthening it may keep them
    ///      capped longer. Admins should announce window changes off-chain.
    function setClaimLimits(
        uint256 maxPerTx,
        uint256 maxPerWindow,
        uint256 maxVolumePerWindow,
        uint256 windowSec
    ) external onlyWhitelistedAdmin {
        if (maxPerTx == 0 || maxPerWindow == 0 || maxVolumePerWindow == 0 || windowSec == 0) {
            revert Errors.Sponsored_InvalidLimit();
        }
        if (windowSec < MIN_CLAIM_WINDOW_SECONDS) {
            revert Errors.Sponsored_InvalidLimit();
        }
        if (maxVolumePerWindow > type(uint128).max) {
            revert Errors.Sponsored_InvalidLimit();
        }
        // Coherence: a single tx that hits `maxPerTx` must fit inside the
        // per-window volume cap, otherwise `_applyRateLimit` would always
        // revert on a fresh window and the proxy would be unusable.
        if (maxPerTx > maxVolumePerWindow) {
            revert Errors.Sponsored_InvalidLimit();
        }
        SponsoredLayout storage $ = _s();
        $.maxClaimPerTx = maxPerTx;
        $.maxClaimsPerWindow = maxPerWindow;
        $.maxClaimVolumePerWindow = maxVolumePerWindow;
        $.claimWindowSeconds = windowSec;
        emit ClaimLimitsSet(maxPerTx, maxPerWindow, maxVolumePerWindow, windowSec);
    }

    // ============ Pool top-up (public) / reclaim (admin) ============

    /// @notice Contribute TRUST to the shared sponsor pool.
    /// @dev    Permissionless by design — anyone can donate. Contributions
    ///         are one-way: only whitelisted admins can `reclaimFromPool`,
    ///         so from the donor's perspective this is a public donation.
    ///         The `PoolFunded(amount, by)` event makes every top-up
    ///         publicly traceable (funder address + amount), which enables
    ///         a permissionless "top-ups log" UI + an admin-gated per-entry
    ///         refund flow that pre-fills the donor address.
    function fundPool() external payable {
        if (msg.value == 0) revert Errors.Sponsored_NothingToCredit();

        SponsoredLayout storage $ = _s();
        $.sponsorPool += msg.value;
        emit PoolFunded(msg.value, msg.sender);
    }

    function reclaimFromPool(uint256 amount, address to)
        external
        onlyWhitelistedAdmin
        nonReentrant
    {
        if (to == address(0)) revert Errors.IntuitionFeeProxy_ZeroAddress();
        if (amount == 0) revert Errors.Sponsored_NothingToCredit();

        SponsoredLayout storage $ = _s();
        uint256 remaining = $.sponsorPool;
        if (amount > remaining) revert Errors.Sponsored_InsufficientClaim();

        $.sponsorPool = remaining - amount;

        (bool ok, ) = to.call{value: amount}("");
        if (!ok) revert Errors.Sponsored_RefundFailed();

        emit PoolReclaimed(amount, to, msg.sender);
    }

    // ============ User entry points (override V2) ============

    /// @notice Disabled on the sponsored channel — the inverse-formula
    ///         `deposit(3 args)` cannot convey an explicit `assets` intent to
    ///         the pool. Callers MUST use `depositSponsored(4 args)` instead.
    function deposit(
        bytes32 /* termId */,
        uint256 /* curveId */,
        uint256 /* minShares */
    ) external payable override nonReentrant returns (uint256) {
        revert Errors.Sponsored_UseDepositSponsored();
    }

    /// @notice Full-sponsorship deposit. User declares `assets` as their
    ///         claim intent; the pool covers the entire cost including Sofia's
    ///         fee — `totalRequired = assets + fee(1, assets)`. Any
    ///         `msg.value` is refunded tolerantly at the tail of the call.
    /// @dev    Reverts:
    ///         - `Sponsored_ExceedsMaxPerTx`  if `totalRequired > maxClaimPerTx`
    ///         - `Sponsored_InsufficientPool` if `sponsorPool < totalRequired`
    ///         - `Sponsored_RateLimited` / `Sponsored_VolumeLimited` on per-user caps
    function depositSponsored(
        bytes32 termId,
        uint256 curveId,
        uint256 minShares,
        uint256 assets
    ) external payable nonReentrant returns (uint256 shares) {
        if (assets == 0) revert Errors.IntuitionFeeProxy_InsufficientValue();
        uint256 fee = calculateDepositFee(1, assets);
        uint256 totalRequired = assets + fee;
        _claimFull(totalRequired);

        _accrueFee(fee, DEPOSIT, assets);
        _finaliseCredit(totalRequired);

        shares = _ethMultiVault.deposit{value: assets}(msg.sender, termId, curveId, minShares);
        _trackActivity(0, 0, 1, assets);
        emit MultiVaultSuccess(DEPOSIT, 1);

        _refundMsgValue();
    }

    /// @inheritdoc IntuitionFeeProxyV2
    /// @dev ⚠️ Same MultiVault approval prerequisite as V2: the caller must
    ///      have `multiVault.approve(proxy, DEPOSIT)`. The full-sponsorship
    ///      path doesn't change the receiver — atom seed shares (if any) and
    ///      the per-atom deposit loop still target `msg.sender`, which
    ///      requires that approval.
    function createAtoms(
        bytes[] calldata data,
        uint256[] calldata assets,
        uint256 curveId
    ) external payable override nonReentrant returns (bytes32[] memory atomIds) {
        if (data.length != assets.length) revert Errors.IntuitionFeeProxy_WrongArrayLengths();

        uint256 count = data.length;
        uint256 atomCost = _ethMultiVault.getAtomCost();
        uint256 totalDeposit = _sumArray(assets);
        uint256 nonZero = _countNonZero(assets);

        uint256 multiVaultCost = (atomCost * count) + totalDeposit;
        uint256 fee = calculateDepositFee(nonZero, totalDeposit);
        uint256 totalRequired = multiVaultCost + fee;
        _claimFull(totalRequired);

        _accrueFee(fee, CREATE_ATOMS, multiVaultCost);
        _finaliseCredit(totalRequired);

        uint256[] memory minAssets = new uint256[](count);
        for (uint256 i = 0; i < count; i++) minAssets[i] = atomCost;
        atomIds = _ethMultiVault.createAtoms{value: atomCost * count}(data, minAssets);

        for (uint256 i = 0; i < count; i++) {
            if (assets[i] > 0) {
                _ethMultiVault.deposit{value: assets[i]}(msg.sender, atomIds[i], curveId, 0);
            }
        }

        _trackActivity(count, 0, nonZero, totalDeposit);
        emit MultiVaultSuccess(CREATE_ATOMS, count);
        _refundMsgValue();
    }

    /// @inheritdoc IntuitionFeeProxyV2
    /// @dev ⚠️ Same MultiVault approval prerequisite as V2 — see the V2
    ///      contract-level NatSpec.
    function createTriples(
        bytes32[] calldata subjectIds,
        bytes32[] calldata predicateIds,
        bytes32[] calldata objectIds,
        uint256[] calldata assets,
        uint256 curveId
    ) external payable override nonReentrant returns (bytes32[] memory tripleIds) {
        if (
            subjectIds.length != predicateIds.length ||
            predicateIds.length != objectIds.length ||
            objectIds.length != assets.length
        ) revert Errors.IntuitionFeeProxy_WrongArrayLengths();

        uint256 count = subjectIds.length;
        uint256 tripleCost = _ethMultiVault.getTripleCost();
        uint256 totalDeposit = _sumArray(assets);
        uint256 nonZero = _countNonZero(assets);

        uint256 multiVaultCost = (tripleCost * count) + totalDeposit;
        uint256 fee = calculateDepositFee(nonZero, totalDeposit);
        uint256 totalRequired = multiVaultCost + fee;
        _claimFull(totalRequired);

        _accrueFee(fee, CREATE_TRIPLES, multiVaultCost);
        _finaliseCredit(totalRequired);

        uint256[] memory minAssets = new uint256[](count);
        for (uint256 i = 0; i < count; i++) minAssets[i] = tripleCost;
        tripleIds = _ethMultiVault.createTriples{value: tripleCost * count}(
            subjectIds, predicateIds, objectIds, minAssets
        );

        for (uint256 i = 0; i < count; i++) {
            if (assets[i] > 0) {
                _ethMultiVault.deposit{value: assets[i]}(msg.sender, tripleIds[i], curveId, 0);
            }
        }

        _trackActivity(0, count, nonZero, totalDeposit);
        emit MultiVaultSuccess(CREATE_TRIPLES, count);
        _refundMsgValue();
    }

    function depositBatch(
        bytes32[] calldata termIds,
        uint256[] calldata curveIds,
        uint256[] calldata assets,
        uint256[] calldata minShares
    ) external payable override nonReentrant returns (uint256[] memory shares) {
        if (
            termIds.length != curveIds.length ||
            curveIds.length != assets.length ||
            assets.length != minShares.length
        ) revert Errors.IntuitionFeeProxy_WrongArrayLengths();

        uint256 totalDeposit = _sumArray(assets);
        if (totalDeposit == 0) revert Errors.IntuitionFeeProxy_InsufficientValue();
        uint256 fee = calculateDepositFee(termIds.length, totalDeposit);
        uint256 totalRequired = totalDeposit + fee;
        _claimFull(totalRequired);

        _accrueFee(fee, DEPOSIT_BATCH, totalDeposit);
        _finaliseCredit(totalRequired);

        shares = _ethMultiVault.depositBatch{value: totalDeposit}(
            msg.sender, termIds, curveIds, assets, minShares
        );
        _trackActivity(0, 0, termIds.length, totalDeposit);
        emit MultiVaultSuccess(DEPOSIT_BATCH, shares.length);
        _refundMsgValue();
    }

    // ============ Internal: pool claim + rate limiting ============

    /// @dev Full-sponsorship claim: pool must cover the entire `required`.
    ///      Reverts if the cap or pool balance cannot accommodate. Does NOT
    ///      mutate state — pool deduction happens in `_finaliseCredit`.
    function _claimFull(uint256 required) internal view {
        SponsoredLayout storage $ = _s();
        if (required > $.maxClaimPerTx) revert Errors.Sponsored_ExceedsMaxPerTx();
        if ($.sponsorPool < required) revert Errors.Sponsored_InsufficientPool();
    }

    /// @dev Refunds the entire `msg.value` if any was sent. Tolerant UX —
    ///      on sponsored paths the pool pays everything, so any ETH the
    ///      caller attached is returned. Guarded by outer `nonReentrant`.
    ///      Shares the `pendingRefunds` fallback with V2: if the direct
    ///      `.call` fails (SCW without payable receive), the excess is
    ///      queued for later pull via `claimRefund`.
    function _refundMsgValue() internal {
        if (msg.value == 0) return;
        (bool ok, ) = msg.sender.call{value: msg.value}("");
        if (!ok) {
            pendingRefunds[msg.sender] += msg.value;
            emit RefundQueued(msg.sender, msg.value);
        }
    }

    /// @dev Commits a pool draw + enforces the per-user rate limits (count +
    ///      cumulative volume, both over the configurable window) on
    ///      msg.sender + bumps the sponsored metrics. Assumes `_claimFull`
    ///      was already called upstream (cap + pool balance validated).
    function _finaliseCredit(uint256 consumed) internal {
        if (consumed == 0) return;
        SponsoredLayout storage $ = _s();

        _applyRateLimit(
            msg.sender,
            $.maxClaimsPerWindow,
            $.maxClaimVolumePerWindow,
            $.claimWindowSeconds,
            consumed
        );

        $.sponsorPool -= consumed;
        emit CreditConsumed(msg.sender, consumed);

        if (!$.hasReceivedSponsored[msg.sender]) {
            $.hasReceivedSponsored[msg.sender] = true;
            unchecked { ++$.totalSponsoredUniqueReceivers; }
        }
        unchecked { ++$.totalSponsoredDeposits; }
        $.totalSponsoredVolume += consumed;

        emit SponsoredMetricsUpdated(
            $.totalSponsoredDeposits,
            $.totalSponsoredVolume,
            $.totalSponsoredUniqueReceivers
        );
    }

    function _applyRateLimit(
        address user,
        uint256 capCount,
        uint256 capVolume,
        uint256 windowSec,
        uint256 consumed
    ) internal {
        ClaimWindow storage w = _s().claimWindows[user];
        uint256 start = uint256(w.windowStart);
        if (start == 0 || block.timestamp >= start + windowSec) {
            if (consumed > capVolume) revert Errors.Sponsored_VolumeLimited();
            w.windowStart = uint64(block.timestamp);
            w.count = 1;
            w.volume = uint128(consumed);
        } else {
            uint256 currentCount = uint256(w.count);
            uint256 currentVolume = uint256(w.volume);
            if (currentCount + 1 > capCount) revert Errors.Sponsored_RateLimited();
            if (currentVolume + consumed > capVolume) revert Errors.Sponsored_VolumeLimited();
            w.count = uint64(currentCount + 1);
            w.volume = uint128(currentVolume + consumed);
        }
    }
}
