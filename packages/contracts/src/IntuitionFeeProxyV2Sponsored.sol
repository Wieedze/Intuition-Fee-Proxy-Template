// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IntuitionFeeProxyV2} from "./IntuitionFeeProxyV2.sol";
import {Errors} from "./libraries/Errors.sol";

/// @title IntuitionFeeProxyV2Sponsored
/// @notice V2 + shared sponsorship pool. The proxy itself acts as the sponsor:
///         a whitelisted admin funds a single `sponsorPool` slot once, and any
///         user interacting with the proxy draws from it transparently on
///         their regular `deposit` / `createAtoms` / `createTriples` /
///         `depositBatch` calls (reduced or zero `msg.value`). Admin can also
///         trigger actions on behalf of a user via `depositFor` / etc. Two
///         rate-limit knobs (`maxClaimPerTx` cap per call, `maxClaimsPerDay`
///         per-user tumbling 24h window) protect the pool from drain / spam.
///         Defaults: 1 TRUST per call, 10 claims per 24h per user.
/// @dev
///  - All sponsored state lives in an ERC-7201 namespaced slot
///    (`keccak256("intuition.feeproxy.sponsored.v1")`) so V2's and future V3's
///    inline storage layouts stay independent.
///  - `fundPool` / `reclaimFromPool` / `setClaimLimits` are
///    `onlyWhitelistedAdmin`. The proxy is the sole sponsor entity — no
///    multi-sponsor tracking. Per-user quotas are not enforced here (first
///    come, first served within the daily-count cap); when tier differentiation
///    is needed, ship a V2.2Sponsored variant via the version registry.
///  - `depositFor` / `createAtomsFor` / `createTriplesFor` / `depositBatchFor`
///    are also `onlyWhitelistedAdmin`. They draw from the shared pool (same
///    source as the D1 user-initiated path); `msg.value` is accepted as an
///    optional top-up if the pool is short. Rate limits apply to the receiver,
///    not the admin.
///  - No EIP-712 receiver consent. See roadmap `depositForWithSig` for the
///    evolution path.
///  - NEVER `registerVersion` a V2-standard impl on a sponsored proxy (or vice
///    versa). Storage layouts differ, cross-family switching orphans the credit
///    pool. The Factory enforces the split via its two-channel design.
contract IntuitionFeeProxyV2Sponsored is IntuitionFeeProxyV2 {
    // ============ Namespaced storage ============

    /// @dev ERC-7201 namespaced storage slot for the sponsored-credit layout.
    /// Matches the canonical formula — tooling (Slither, OZ upgrades plugin)
    /// recognises this shape and verifies layout neighbourhood.
    bytes32 private constant SPONSORED_STORAGE_LOCATION = keccak256(
        abi.encode(uint256(keccak256("intuition.feeproxy.sponsored.v1")) - 1)
    ) & ~bytes32(uint256(0xff));

    struct ClaimWindow {
        uint128 count;        // claims so far in the current window
        uint128 windowStart;  // timestamp when the current window began
    }

    struct SponsoredLayout {
        // ── Shared sponsorship pool ──
        // A single pool funded once by the admin. Any user interacting with
        // the proxy can draw from it transparently via the normal entry points
        // (reduced msg.value). Rate limits below keep one user from draining
        // the whole pool at once.
        uint256 sponsorPool;
        // ── Rate limits (all must be > 0 after init; never "unlimited") ──
        uint256 maxClaimPerTx;     // default 1 ether
        uint256 maxClaimsPerDay;   // default 10
        mapping(address user => ClaimWindow) claimWindows;
        // ── Sponsored metrics (additive to V2's base metrics) ──
        uint256 totalSponsoredDeposits;
        uint256 totalSponsoredVolume;
        uint256 totalSponsoredUniqueReceivers;
        mapping(address => bool) hasReceivedSponsored;
    }

    function _s() private pure returns (SponsoredLayout storage $) {
        bytes32 slot = SPONSORED_STORAGE_LOCATION;
        assembly {
            $.slot := slot
        }
    }

    // ============ Constants ============

    uint256 public constant CLAIM_WINDOW = 1 days;
    uint256 private constant DEFAULT_MAX_CLAIM_PER_TX = 1 ether;
    uint256 private constant DEFAULT_MAX_CLAIMS_PER_DAY = 10;

    // ============ Events ============

    event PoolFunded(uint256 amount, address indexed by);
    event PoolReclaimed(uint256 amount, address indexed to, address indexed by);
    event CreditConsumed(address indexed user, uint256 amount);
    event ClaimLimitsSet(uint256 maxClaimPerTx, uint256 maxClaimsPerDay);
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
        $.maxClaimsPerDay = DEFAULT_MAX_CLAIMS_PER_DAY;
        emit ClaimLimitsSet(DEFAULT_MAX_CLAIM_PER_TX, DEFAULT_MAX_CLAIMS_PER_DAY);
    }

    // ============ Identification ============

    function version() external pure returns (string memory) {
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

    function maxClaimsPerDay() external view returns (uint256) {
        return _s().maxClaimsPerDay;
    }

    /// @notice Returns the live claim state for a given user.
    /// @return claimsUsed How many claims have fired in the current 24h window.
    /// @return windowResetsAt Unix timestamp when the window will roll over.
    function getClaimStatus(address user)
        external
        view
        returns (uint256 claimsUsed, uint256 windowResetsAt)
    {
        ClaimWindow storage w = _s().claimWindows[user];
        if (uint256(w.windowStart) == 0) return (0, 0);
        // If the window already expired, effectively reset.
        if (block.timestamp >= uint256(w.windowStart) + CLAIM_WINDOW) return (0, 0);
        return (uint256(w.count), uint256(w.windowStart) + CLAIM_WINDOW);
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

    function setClaimLimits(uint256 maxPerTx, uint256 maxPerDay) external onlyWhitelistedAdmin {
        if (maxPerTx == 0 || maxPerDay == 0) revert Errors.Sponsored_InvalidLimit();
        SponsoredLayout storage $ = _s();
        $.maxClaimPerTx = maxPerTx;
        $.maxClaimsPerDay = maxPerDay;
        emit ClaimLimitsSet(maxPerTx, maxPerDay);
    }

    // ============ Admin: pool top-up / reclaim ============

    /// @notice Fund the shared sponsorship pool with `msg.value` TRUST.
    /// @dev Single-pool model: all users of this proxy draw from the same
    ///      bucket. Admins manage fairness via the per-user rate limits
    ///      (`maxClaimPerTx`, `maxClaimsPerDay`), not per-user allocations.
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
        _finaliseCredit(msg.sender, consumed);

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
        _finaliseCredit(msg.sender, consumed);

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
        _finaliseCredit(msg.sender, consumed);

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
        _finaliseCredit(msg.sender, consumed);

        shares = _ethMultiVault.depositBatch{value: totalDeposit}(
            msg.sender, termIds, curveIds, assets, minShares
        );
        _trackActivity(0, 0, termIds.length, totalDeposit);
        emit MultiVaultSuccess("depositBatch", shares.length);
        _refundExcess(totalRequired - consumed);
    }

    // ============ Sponsor-acting entry points (D3) ============
    //
    // `*For(receiver, …)` — admin-initiated deposits on behalf of `receiver`.
    // Funds are drawn from `receiver`'s sponsored credit bucket, not from the
    // admin's wallet. `msg.value` is accepted as an optional top-up if the
    // bucket is short. Rate limits (`maxClaimPerTx` cap + `maxClaimsPerDay`)
    // apply to the receiver, not the admin.
    //
    // Gated `onlyWhitelistedAdmin` so a random caller cannot force a drain of
    // a pre-credited user's bucket without their consent.

    function depositFor(
        address receiver,
        bytes32 termId,
        uint256 curveId,
        uint256 minShares
    ) external payable onlyWhitelistedAdmin nonReentrant returns (uint256 shares) {
        if (receiver == address(0)) revert Errors.Sponsored_ZeroReceiver();

        uint256 consumed = _consumeCredit(0);
        uint256 effective = msg.value + consumed;

        if (effective <= depositFixedFee) revert Errors.IntuitionFeeProxy_InsufficientValue();

        uint256 multiVaultAmount = (effective - depositFixedFee) * FEE_DENOMINATOR
                                   / (FEE_DENOMINATOR + depositPercentageFee);
        uint256 fee = effective - multiVaultAmount;

        _accrueFee(fee, "depositFor", multiVaultAmount);
        _finaliseCredit(receiver, consumed);

        shares = _ethMultiVault.deposit{value: multiVaultAmount}(receiver, termId, curveId, minShares);

        _trackSponsoredActivity(receiver, 1, multiVaultAmount);
        emit MultiVaultSuccess("depositFor", 1);
    }

    function createAtomsFor(
        address receiver,
        bytes[] calldata data,
        uint256[] calldata assets,
        uint256 curveId
    ) external payable onlyWhitelistedAdmin nonReentrant returns (bytes32[] memory atomIds) {
        if (receiver == address(0)) revert Errors.Sponsored_ZeroReceiver();
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

        _accrueFee(fee, "createAtomsFor", multiVaultCost);
        _finaliseCredit(receiver, consumed);

        uint256[] memory minAssets = new uint256[](count);
        for (uint256 i = 0; i < count; i++) minAssets[i] = atomCost;
        atomIds = _ethMultiVault.createAtoms{value: atomCost * count}(data, minAssets);

        for (uint256 i = 0; i < count; i++) {
            if (assets[i] > 0) {
                _ethMultiVault.deposit{value: assets[i]}(receiver, atomIds[i], curveId, 0);
            }
        }

        _trackSponsoredActivity(receiver, nonZero, totalDeposit);
        emit MultiVaultSuccess("createAtomsFor", count);
        _refundExcess(totalRequired);
    }

    function createTriplesFor(
        address receiver,
        bytes32[] calldata subjectIds,
        bytes32[] calldata predicateIds,
        bytes32[] calldata objectIds,
        uint256[] calldata assets,
        uint256 curveId
    ) external payable onlyWhitelistedAdmin nonReentrant returns (bytes32[] memory tripleIds) {
        if (receiver == address(0)) revert Errors.Sponsored_ZeroReceiver();
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

        _accrueFee(fee, "createTriplesFor", multiVaultCost);
        _finaliseCredit(receiver, consumed);

        uint256[] memory minAssets = new uint256[](count);
        for (uint256 i = 0; i < count; i++) minAssets[i] = tripleCost;
        tripleIds = _ethMultiVault.createTriples{value: tripleCost * count}(
            subjectIds, predicateIds, objectIds, minAssets
        );

        for (uint256 i = 0; i < count; i++) {
            if (assets[i] > 0) {
                _ethMultiVault.deposit{value: assets[i]}(receiver, tripleIds[i], curveId, 0);
            }
        }

        _trackSponsoredActivity(receiver, nonZero, totalDeposit);
        emit MultiVaultSuccess("createTriplesFor", count);
        _refundExcess(totalRequired);
    }

    function depositBatchFor(
        address receiver,
        bytes32[] calldata termIds,
        uint256[] calldata curveIds,
        uint256[] calldata assets,
        uint256[] calldata minShares
    ) external payable onlyWhitelistedAdmin nonReentrant returns (uint256[] memory shares) {
        if (receiver == address(0)) revert Errors.Sponsored_ZeroReceiver();
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

        _accrueFee(fee, "depositBatchFor", totalDeposit);
        _finaliseCredit(receiver, consumed);

        shares = _ethMultiVault.depositBatch{value: totalDeposit}(
            receiver, termIds, curveIds, assets, minShares
        );
        _trackSponsoredActivity(receiver, termIds.length, totalDeposit);
        emit MultiVaultSuccess("depositBatchFor", shares.length);
        _refundExcess(totalRequired);
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

    /// @dev Commits a pool draw + enforces the per-user daily-count rate limit.
    ///      `forUser` is whoever's quota should be charged — msg.sender in D1
    ///      (user-initiated), receiver in D3 (admin-initiated on behalf of).
    ///      No-op if `consumed == 0` (no pool touched).
    function _finaliseCredit(address forUser, uint256 consumed) internal {
        if (consumed == 0) return;
        SponsoredLayout storage $ = _s();

        _applyRateLimit(forUser, $.maxClaimsPerDay);

        $.sponsorPool -= consumed;
        emit CreditConsumed(forUser, consumed);
    }

    function _applyRateLimit(address user, uint256 capPerDay) internal {
        ClaimWindow storage w = _s().claimWindows[user];
        uint256 start = uint256(w.windowStart);
        if (start == 0 || block.timestamp >= start + CLAIM_WINDOW) {
            // Fresh window
            w.windowStart = uint128(block.timestamp);
            w.count = 1;
        } else {
            uint256 current = uint256(w.count);
            if (current >= capPerDay) revert Errors.Sponsored_RateLimited();
            w.count = uint128(current + 1);
        }
    }

    // ============ Internal: sponsored metrics ============

    function _trackSponsoredActivity(
        address receiver,
        uint256 depositsDelta,
        uint256 volumeDelta
    ) internal {
        SponsoredLayout storage $ = _s();
        if (!$.hasReceivedSponsored[receiver]) {
            $.hasReceivedSponsored[receiver] = true;
            unchecked { ++$.totalSponsoredUniqueReceivers; }
        }
        if (depositsDelta > 0) $.totalSponsoredDeposits += depositsDelta;
        if (volumeDelta > 0) $.totalSponsoredVolume += volumeDelta;

        emit SponsoredMetricsUpdated(
            $.totalSponsoredDeposits,
            $.totalSponsoredVolume,
            $.totalSponsoredUniqueReceivers
        );
    }
}
