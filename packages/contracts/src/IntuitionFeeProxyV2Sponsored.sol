// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IntuitionFeeProxyV2} from "./IntuitionFeeProxyV2.sol";
import {Errors} from "./libraries/Errors.sol";

/// @title IntuitionFeeProxyV2Sponsored
/// @notice V2 + shared sponsorship pool. The proxy itself acts as the sponsor:
///         whitelisted admins top up the shared `sponsorPool` slot whenever
///         they need to, and any user interacting with the proxy draws from
///         it transparently on their regular `deposit` / `createAtoms` /
///         `createTriples` / `depositBatch` calls (reduced or zero
///         `msg.value`). Four admin-configurable knobs bound the drain per
///         user per configurable window:
///           - `maxClaimPerTx`              — max TRUST drawn in a single call
///           - `maxClaimsPerWindow`         — max pool-drawing calls / user / window
///           - `maxClaimVolumePerWindow`    — max cumulative TRUST / user / window
///           - `claimWindowSeconds`         — window length in seconds (default 86400 = 1 day)
///         Defaults: 1 TRUST per call, 10 pool-drawing calls per day per user,
///         10 TRUST cumulative per day per user, window = 1 day.
/// @dev
///  - All sponsored state lives in an ERC-7201 namespaced slot
///    (`keccak256("intuition.feeproxy.sponsored.v1")`) so V2's and future V3's
///    inline storage layouts stay independent.
///  - Admin surface is minimal by design: `fundPool` / `reclaimFromPool` /
///    `setClaimLimits` + the inherited V2 admin actions (fees, whitelist,
///    withdraw). The admin cannot mint on behalf of users — no `depositFor`
///    family. Every on-chain action that touches the MultiVault originates
///    from the user's own wallet (msg.sender = receiver), guaranteeing that
///    the admin can never force shares onto an unwilling address. If a dApp
///    needs custodial onboarding (user without wallet), it is a frontend
///    concern: use an embedded-AA kit (Privy, Thirdweb, Turnkey) that signs
///    for the user. The wallet still belongs to the user conceptually.
///  - For tiered-subscription scenarios (free / pro / premium), deploy one
///    sponsored proxy per tier rather than encoding tiers on-chain. Each
///    proxy has its own pool, limits and admins — isolation is cleaner and
///    keeps this contract simple.
///  - NEVER `registerVersion` a V2-standard impl on a sponsored proxy (or vice
///    versa). Storage layouts differ, cross-family switching orphans the pool.
///    The Factory enforces the split via its two-channel design.
contract IntuitionFeeProxyV2Sponsored is IntuitionFeeProxyV2 {
    // ============ Namespaced storage ============

    /// @dev ERC-7201 namespaced storage slot for the sponsored-credit layout.
    /// Matches the canonical formula — tooling (Slither, OZ upgrades plugin)
    /// recognises this shape and verifies layout neighbourhood.
    bytes32 private constant SPONSORED_STORAGE_LOCATION = keccak256(
        abi.encode(uint256(keccak256("intuition.feeproxy.sponsored.v1")) - 1)
    ) & ~bytes32(uint256(0xff));

    struct ClaimWindow {
        // Packed into a single storage slot: 8 + 8 + 16 = 32 bytes.
        uint64 windowStart;  // unix timestamp of the current window's start
        uint64 count;        // pool-drawing calls so far in the current window
        uint128 volume;      // cumulative TRUST drawn from the pool in this window (wei)
    }

    struct SponsoredLayout {
        // ── Shared sponsorship pool ──
        // A single pool admins top up whenever they need to. Any user
        // interacting with the proxy can draw from it transparently via the
        // normal entry points (reduced msg.value). Rate limits below keep any
        // one user from draining the whole pool at once.
        uint256 sponsorPool;
        // ── Rate limits (all must be > 0 after init; never "unlimited") ──
        uint256 maxClaimPerTx;              // cap per call — default 1 ether
        uint256 maxClaimsPerWindow;         // cap on pool-drawing calls / user / window — default 10
        mapping(address user => ClaimWindow) claimWindows;
        // ── Sponsored metrics (additive to V2's base metrics) ──
        uint256 totalSponsoredDeposits;
        uint256 totalSponsoredVolume;
        uint256 totalSponsoredUniqueReceivers;
        mapping(address => bool) hasReceivedSponsored;
        // ── Appended in the same ERC-7201 layout (append-only) ──
        uint256 maxClaimVolumePerWindow;    // cap on cumulative TRUST / user / window — default 10 ether
        uint256 claimWindowSeconds;         // window length in seconds — default 86400 (1 day)
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

    /// @dev Override V2's public initializer to chain base init + set default
    ///      claim limits under the same `initializer` guard.
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

    // ============ Identification ============

    function version() external pure virtual returns (string memory) {
        return "v2.0.0-sponsored";
    }

    // ============ Views ============

    /// @notice Current balance of the shared sponsorship pool.
    function sponsorPool() external view returns (uint256) {
        return _s().sponsorPool;
    }

    function maxClaimPerTx() external view returns (uint256) {
        return _s().maxClaimPerTx;
    }

    function maxClaimsPerWindow() external view returns (uint256) {
        return _s().maxClaimsPerWindow;
    }

    function maxClaimVolumePerWindow() external view returns (uint256) {
        return _s().maxClaimVolumePerWindow;
    }

    function claimWindowSeconds() external view returns (uint256) {
        return _s().claimWindowSeconds;
    }

    /// @notice Returns the live claim state for a given user.
    /// @return claimsUsed How many pool-drawing calls have fired in the current window.
    /// @return volumeUsed Cumulative TRUST (wei) drawn from the pool in the current window.
    /// @return windowResetsAt Unix timestamp when the window will roll over.
    function getClaimStatus(address user)
        external
        view
        returns (uint256 claimsUsed, uint256 volumeUsed, uint256 windowResetsAt)
    {
        SponsoredLayout storage $ = _s();
        ClaimWindow storage w = $.claimWindows[user];
        if (uint256(w.windowStart) == 0) return (0, 0, 0);
        // If the window already expired, effectively reset.
        if (block.timestamp >= uint256(w.windowStart) + $.claimWindowSeconds) return (0, 0, 0);
        return (uint256(w.count), uint256(w.volume), uint256(w.windowStart) + $.claimWindowSeconds);
    }

    function totalSponsoredDeposits() external view returns (uint256) {
        return _s().totalSponsoredDeposits;
    }

    function totalSponsoredVolume() external view returns (uint256) {
        return _s().totalSponsoredVolume;
    }

    function totalSponsoredUniqueReceivers() external view returns (uint256) {
        return _s().totalSponsoredUniqueReceivers;
    }

    function hasReceivedSponsored(address user) external view returns (bool) {
        return _s().hasReceivedSponsored[user];
    }

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

    /// @notice Update all four per-user rate-limit knobs atomically.
    /// @param maxPerTx           Cap on TRUST drawn from the pool in a single call (wei).
    /// @param maxPerWindow       Cap on pool-drawing calls per user per window.
    /// @param maxVolumePerWindow Cap on cumulative TRUST per user per window (wei).
    /// @param windowSec          Window length in seconds (e.g. 86400 = 1 day, 604800 = 1 week).
    /// @dev All four values must be strictly > 0. Zero is never "unlimited"; to lift a cap
    ///      in practice, set it high (e.g. `type(uint128).max` for volume).
    function setClaimLimits(
        uint256 maxPerTx,
        uint256 maxPerWindow,
        uint256 maxVolumePerWindow,
        uint256 windowSec
    ) external onlyWhitelistedAdmin {
        if (maxPerTx == 0 || maxPerWindow == 0 || maxVolumePerWindow == 0 || windowSec == 0) {
            revert Errors.Sponsored_InvalidLimit();
        }
        // ClaimWindow.volume is packed as uint128. Capping the per-window
        // volume at uint128.max prevents silent truncation on `w.volume =
        // uint128(currentVolume + consumed)` if an admin sets an absurdly
        // high cap. uint128.max wei ≈ 3.4e20 ETH — far beyond any real pool.
        if (maxVolumePerWindow > type(uint128).max) {
            revert Errors.Sponsored_InvalidLimit();
        }
        SponsoredLayout storage $ = _s();
        $.maxClaimPerTx = maxPerTx;
        $.maxClaimsPerWindow = maxPerWindow;
        $.maxClaimVolumePerWindow = maxVolumePerWindow;
        $.claimWindowSeconds = windowSec;
        emit ClaimLimitsSet(maxPerTx, maxPerWindow, maxVolumePerWindow, windowSec);
    }

    // ============ Admin: pool top-up / reclaim ============

    /// @notice Fund the shared sponsorship pool with `msg.value` TRUST.
    /// @dev Single-pool model: all users of this proxy draw from the same
    ///      bucket. Admins manage fairness via the per-user rate limits
    ///      (`maxClaimPerTx`, `maxClaimsPerWindow`, `maxClaimVolumePerWindow`,
    ///      `claimWindowSeconds`), not per-user allocations. For tiered
    ///      sponsorship (free / pro / premium), deploy one proxy per tier
    ///      rather than encoding tiers on-chain.
    function fundPool() external payable onlyWhitelistedAdmin {
        if (msg.value == 0) revert Errors.Sponsored_NothingToCredit();

        SponsoredLayout storage $ = _s();
        $.sponsorPool += msg.value;
        emit PoolFunded(msg.value, msg.sender);
    }

    /// @notice Admin reclaims `amount` from the pool, sending it to `to`.
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

        // Effects
        $.sponsorPool = remaining - amount;

        // Interaction
        (bool ok, ) = to.call{value: amount}("");
        if (!ok) revert Errors.Sponsored_RefundFailed();

        emit PoolReclaimed(amount, to, msg.sender);
    }

    // ============ User entry points (override V2) ============

    function deposit(
        bytes32 termId,
        uint256 curveId,
        uint256 minShares
    ) external payable override nonReentrant returns (uint256 shares) {
        uint256 consumed = _consumeCredit(0);
        uint256 effective = msg.value + consumed;

        if (effective <= depositFixedFee) revert Errors.IntuitionFeeProxy_InsufficientValue();

        uint256 multiVaultAmount = (effective - depositFixedFee) * FEE_DENOMINATOR
                                   / (FEE_DENOMINATOR + depositPercentageFee);
        uint256 fee = effective - multiVaultAmount;

        _accrueFee(fee, "deposit", multiVaultAmount);
        _finaliseCredit(consumed);

        shares = _ethMultiVault.deposit{value: multiVaultAmount}(msg.sender, termId, curveId, minShares);
        _trackActivity(0, 0, 1, multiVaultAmount);
        emit MultiVaultSuccess("deposit", 1);
        // No refund: the inverse-formula path splits `effective` entirely between fee and MV forward.
    }

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
        uint256 fee = calculateDepositFee(nonZero, totalDeposit);

        uint256 multiVaultCost = (atomCost * count) + totalDeposit;
        uint256 totalRequired = fee + multiVaultCost;

        uint256 consumed = _consumeCredit(totalRequired);
        uint256 effective = msg.value + consumed;
        if (effective < totalRequired) revert Errors.IntuitionFeeProxy_InsufficientValue();

        _accrueFee(fee, "createAtoms", multiVaultCost);
        _finaliseCredit(consumed);

        uint256[] memory minAssets = new uint256[](count);
        for (uint256 i = 0; i < count; i++) minAssets[i] = atomCost;
        atomIds = _ethMultiVault.createAtoms{value: atomCost * count}(data, minAssets);

        for (uint256 i = 0; i < count; i++) {
            if (assets[i] > 0) {
                _ethMultiVault.deposit{value: assets[i]}(msg.sender, atomIds[i], curveId, 0);
            }
        }

        _trackActivity(count, 0, nonZero, totalDeposit);
        emit MultiVaultSuccess("createAtoms", count);
        // ETH actually spent = totalRequired - consumed (the rest came from credit pool).
        // `_refundExcess` returns msg.value minus that — 0 if credit covered the gap.
        _refundExcess(totalRequired - consumed);
    }

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
        uint256 fee = calculateDepositFee(nonZero, totalDeposit);

        uint256 multiVaultCost = (tripleCost * count) + totalDeposit;
        uint256 totalRequired = fee + multiVaultCost;

        uint256 consumed = _consumeCredit(totalRequired);
        uint256 effective = msg.value + consumed;
        if (effective < totalRequired) revert Errors.IntuitionFeeProxy_InsufficientValue();

        _accrueFee(fee, "createTriples", multiVaultCost);
        _finaliseCredit(consumed);

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
        emit MultiVaultSuccess("createTriples", count);
        _refundExcess(totalRequired - consumed);
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
        uint256 fee = calculateDepositFee(termIds.length, totalDeposit);
        uint256 totalRequired = totalDeposit + fee;

        uint256 consumed = _consumeCredit(totalRequired);
        uint256 effective = msg.value + consumed;
        if (effective < totalRequired) revert Errors.IntuitionFeeProxy_InsufficientValue();

        _accrueFee(fee, "depositBatch", totalDeposit);
        _finaliseCredit(consumed);

        shares = _ethMultiVault.depositBatch{value: totalDeposit}(
            msg.sender, termIds, curveIds, assets, minShares
        );
        _trackActivity(0, 0, termIds.length, totalDeposit);
        emit MultiVaultSuccess("depositBatch", shares.length);
        _refundExcess(totalRequired - consumed);
    }

    // ============ Admin: withdraw with credit-invariant protection ============

    function withdraw(address to, uint256 amount) external override onlyWhitelistedAdmin nonReentrant {
        if (to == address(0)) revert Errors.IntuitionFeeProxy_ZeroAddress();
        if (amount == 0) revert Errors.IntuitionFeeProxy_NothingToWithdraw();
        if (amount > accumulatedFees) revert Errors.IntuitionFeeProxy_InsufficientAccumulatedFees();

        accumulatedFees -= amount;
        _assertCreditInvariant(amount);

        (bool ok, ) = to.call{value: amount}("");
        if (!ok) revert Errors.IntuitionFeeProxy_WithdrawFailed();

        emit FeesWithdrawn(to, amount, msg.sender);
    }

    function withdrawAll(address to) external override onlyWhitelistedAdmin nonReentrant {
        if (to == address(0)) revert Errors.IntuitionFeeProxy_ZeroAddress();
        uint256 amount = accumulatedFees;
        if (amount == 0) revert Errors.IntuitionFeeProxy_NothingToWithdraw();

        accumulatedFees = 0;
        _assertCreditInvariant(amount);

        (bool ok, ) = to.call{value: amount}("");
        if (!ok) revert Errors.IntuitionFeeProxy_WithdrawFailed();

        emit FeesWithdrawn(to, amount, msg.sender);
    }

    function _assertCreditInvariant(uint256 amount) internal view {
        uint256 bal = address(this).balance;
        uint256 locked = _s().sponsorPool;
        if (bal < amount || bal - amount < locked) {
            revert Errors.Sponsored_WithdrawBreachesCreditInvariant();
        }
    }

    // ============ Internal: pool consumption + rate limiting ============

    /// @dev Read-only: returns how much would be drawn from the shared sponsor
    ///      pool to cover the caller's `required` amount. The cap is
    ///      `maxClaimPerTx` — a caller asking for more than the cap will still
    ///      only get `cap` from the pool and must top up the rest via
    ///      `msg.value`. If `msg.value >= required`, no pool draw.
    function _consumeCredit(uint256 required) internal view returns (uint256) {
        SponsoredLayout storage $ = _s();
        uint256 avail = $.sponsorPool;
        if (avail == 0) return 0;
        uint256 cap = $.maxClaimPerTx;
        uint256 usable = avail > cap ? cap : avail;
        if (required == 0) return usable;
        if (msg.value >= required) return 0;
        uint256 missing = required - msg.value;
        return missing >= usable ? usable : missing;
    }

    /// @dev Commits a pool draw + enforces the per-user rate limits (count +
    ///      cumulative volume, both over the configurable window) on
    ///      msg.sender + bumps the sponsored metrics. No-op if `consumed == 0`
    ///      (the user paid fully from msg.value, pool untouched).
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

        // Pool accounting.
        $.sponsorPool -= consumed;
        emit CreditConsumed(msg.sender, consumed);

        // Sponsored metrics: every pool-funded call is a sponsored deposit.
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

    /// @dev Enforces both per-user caps over a sliding window and bumps the
    ///      per-user counters atomically. Called only when `consumed > 0`.
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
            // Fresh window. Count always starts at 1 and capCount > 0 is
            // enforced by setClaimLimits / initialize, so the count check is
            // trivially satisfied. The single `consumed` draw must itself
            // respect the volume cap — otherwise a single fat call could
            // silently bypass it on a cold user.
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
