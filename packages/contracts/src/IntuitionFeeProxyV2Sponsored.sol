// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IntuitionFeeProxyV2} from "./IntuitionFeeProxyV2.sol";
import {Errors} from "./libraries/Errors.sol";

/// @title IntuitionFeeProxyV2Sponsored
/// @notice V2 + sponsoring support. The proxy itself acts as the sponsor: only
///         whitelisted admins can fund user credit balances, and any user with
///         credit can later call `deposit` / `createAtoms` / `createTriples` /
///         `depositBatch` with reduced (or zero) `msg.value` — the proxy pulls
///         from their `sponsoredCredit[user]` automatically. Two rate-limit
///         knobs (`maxClaimPerTx`, `maxClaimsPerDay`) protect the pool from
///         drain / spam. Defaults: 1 TRUST / 10 claims per 24h window.
/// @dev
///  - All sponsored state lives in an ERC-7201 namespaced slot
///    (`keccak256("intuition.feeproxy.sponsored.v1")`) so V2's and future V3's
///    inline storage layouts stay independent.
///  - `creditUser` / `creditUsers` / `uncreditUser` / `setClaimLimits` are
///    `onlyWhitelistedAdmin`. There is no "sponsor" role distinct from admin:
///    the proxy itself is the sponsor entity. Anyone wanting to gift credit to
///    a user can just wire TRUST to the user wallet directly.
///  - `depositFor` / `createAtomsFor` / `createTriplesFor` / `depositBatchFor`
///    are open — they are economically neutral (caller pays msg.value, receiver
///    gets the shares), so no gating.
///  - No EIP-712 receiver consent. See roadmap `depositForWithSig` for the
///    evolution path.
///  - NEVER `registerVersion` a V2-standard impl on a sponsored proxy (or vice
///    versa). Storage layouts differ, cross-family switching orphans the credit
///    pool. The Factory enforces the split via its two-channel design.
contract IntuitionFeeProxyV2Sponsored is IntuitionFeeProxyV2 {
    // ============ Namespaced storage ============

    /// @dev Storage slot — keccak256("intuition.feeproxy.sponsored.v1").
    bytes32 private constant SPONSORED_STORAGE_LOCATION =
        keccak256("intuition.feeproxy.sponsored.v1");

    struct ClaimWindow {
        uint128 count;        // claims so far in the current window
        uint128 windowStart;  // timestamp when the current window began
    }

    struct SponsoredLayout {
        // ── Credit pool ──
        mapping(address user => uint256 credit) sponsoredCredit;
        uint256 totalSponsoredCredit;
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

    event UserCredited(address indexed user, uint256 amount, address indexed by);
    event CreditReclaimed(address indexed user, uint256 amount, address indexed to);
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

    function sponsoredCredit(address user) external view returns (uint256) {
        return _s().sponsoredCredit[user];
    }

    function totalSponsoredCredit() external view returns (uint256) {
        return _s().totalSponsoredCredit;
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

    // ============ Admin: credit-balance top-up / reclaim ============

    /// @notice Fund `user`'s sponsored-credit balance with `msg.value` TRUST.
    function creditUser(address user) external payable onlyWhitelistedAdmin {
        if (user == address(0)) revert Errors.IntuitionFeeProxy_ZeroAddress();
        if (msg.value == 0) revert Errors.Sponsored_NothingToCredit();

        SponsoredLayout storage $ = _s();
        $.sponsoredCredit[user] += msg.value;
        $.totalSponsoredCredit += msg.value;
        emit UserCredited(user, msg.value, msg.sender);
    }

    /// @notice Batch top-up. `sum(amounts) == msg.value`.
    function creditUsers(address[] calldata users, uint256[] calldata amounts)
        external
        payable
        onlyWhitelistedAdmin
    {
        if (users.length != amounts.length) revert Errors.IntuitionFeeProxy_WrongArrayLengths();

        SponsoredLayout storage $ = _s();
        uint256 total;
        uint256 len = users.length;
        for (uint256 i = 0; i < len; i++) {
            address u = users[i];
            uint256 a = amounts[i];
            if (u == address(0)) revert Errors.IntuitionFeeProxy_ZeroAddress();
            if (a == 0) revert Errors.Sponsored_NothingToCredit();

            $.sponsoredCredit[u] += a;
            unchecked { total += a; }
            emit UserCredited(u, a, msg.sender);
        }

        if (msg.value != total) revert Errors.IntuitionFeeProxy_InsufficientValue();
        $.totalSponsoredCredit += total;
    }

    /// @notice Admin reclaims `amount` of a user's unspent credit, sending it to `to`.
    function uncreditUser(address user, uint256 amount, address to)
        external
        onlyWhitelistedAdmin
        nonReentrant
    {
        if (user == address(0) || to == address(0)) revert Errors.IntuitionFeeProxy_ZeroAddress();
        if (amount == 0) revert Errors.Sponsored_NothingToCredit();

        SponsoredLayout storage $ = _s();
        uint256 remaining = $.sponsoredCredit[user];
        if (amount > remaining) revert Errors.Sponsored_InsufficientClaim();

        // Effects
        $.sponsoredCredit[user] = remaining - amount;
        $.totalSponsoredCredit -= amount;

        // Interaction
        (bool ok, ) = to.call{value: amount}("");
        if (!ok) revert Errors.Sponsored_RefundFailed();

        emit CreditReclaimed(user, amount, to);
    }

    // ============ User entry points (override V2) ============

    function deposit(
        bytes32 termId,
        uint256 curveId,
        uint256 minShares
    ) external payable override nonReentrant returns (uint256 shares) {
        uint256 consumed = _consumeCredit(msg.sender, 0);
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

        uint256 consumed = _consumeCredit(msg.sender, totalRequired);
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

        uint256 consumed = _consumeCredit(msg.sender, totalRequired);
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

        uint256 consumed = _consumeCredit(msg.sender, totalRequired);
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

    // ============ Sponsor-acting entry points (D3) ============
    //
    // `*For(receiver, …)` — caller pays msg.value, `receiver` gets shares.
    // Open to anyone: economically equivalent to the caller depositing on
    // their own and transferring shares (minus the transfer step).

    function depositFor(
        address receiver,
        bytes32 termId,
        uint256 curveId,
        uint256 minShares
    ) external payable nonReentrant returns (uint256 shares) {
        if (receiver == address(0)) revert Errors.Sponsored_ZeroReceiver();
        if (msg.value <= depositFixedFee) revert Errors.IntuitionFeeProxy_InsufficientValue();

        uint256 multiVaultAmount = (msg.value - depositFixedFee) * FEE_DENOMINATOR
                                   / (FEE_DENOMINATOR + depositPercentageFee);
        uint256 fee = msg.value - multiVaultAmount;

        _accrueFee(fee, "depositFor", multiVaultAmount);

        shares = _ethMultiVault.deposit{value: multiVaultAmount}(receiver, termId, curveId, minShares);

        _trackSponsoredActivity(receiver, 1, multiVaultAmount);
        emit MultiVaultSuccess("depositFor", 1);
    }

    function createAtomsFor(
        address receiver,
        bytes[] calldata data,
        uint256[] calldata assets,
        uint256 curveId
    ) external payable nonReentrant returns (bytes32[] memory atomIds) {
        if (receiver == address(0)) revert Errors.Sponsored_ZeroReceiver();
        if (data.length != assets.length) revert Errors.IntuitionFeeProxy_WrongArrayLengths();

        uint256 count = data.length;
        uint256 atomCost = _ethMultiVault.getAtomCost();
        uint256 totalDeposit = _sumArray(assets);
        uint256 nonZero = _countNonZero(assets);
        uint256 fee = calculateDepositFee(nonZero, totalDeposit);

        uint256 multiVaultCost = (atomCost * count) + totalDeposit;
        uint256 totalRequired = fee + multiVaultCost;
        if (msg.value < totalRequired) revert Errors.IntuitionFeeProxy_InsufficientValue();

        _accrueFee(fee, "createAtomsFor", multiVaultCost);

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
    ) external payable nonReentrant returns (bytes32[] memory tripleIds) {
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
        if (msg.value < totalRequired) revert Errors.IntuitionFeeProxy_InsufficientValue();

        _accrueFee(fee, "createTriplesFor", multiVaultCost);

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
    ) external payable nonReentrant returns (uint256[] memory shares) {
        if (receiver == address(0)) revert Errors.Sponsored_ZeroReceiver();
        if (
            termIds.length != curveIds.length ||
            curveIds.length != assets.length ||
            assets.length != minShares.length
        ) revert Errors.IntuitionFeeProxy_WrongArrayLengths();

        uint256 totalDeposit = _sumArray(assets);
        uint256 fee = calculateDepositFee(termIds.length, totalDeposit);
        uint256 totalRequired = totalDeposit + fee;
        if (msg.value < totalRequired) revert Errors.IntuitionFeeProxy_InsufficientValue();

        _accrueFee(fee, "depositBatchFor", totalDeposit);

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
        uint256 locked = _s().totalSponsoredCredit;
        if (bal < amount || bal - amount < locked) {
            revert Errors.Sponsored_WithdrawBreachesCreditInvariant();
        }
    }

    // ============ Internal: credit consumption + rate limiting ============

    /// @dev Read-only: returns how much credit would be consumed for a given required amount.
    /// @dev Capped at `maxClaimPerTx`: a user with more credit than the cap only draws `cap` wei
    ///      per call. Remaining credit stays available for later txs (subject to the daily count
    ///      limit). If `msg.value` already covers `required`, no credit is consumed at all.
    function _consumeCredit(address user, uint256 required) internal view returns (uint256) {
        SponsoredLayout storage $ = _s();
        uint256 avail = $.sponsoredCredit[user];
        if (avail == 0) return 0;
        uint256 cap = $.maxClaimPerTx;
        uint256 usable = avail > cap ? cap : avail;
        if (required == 0) return usable;
        if (msg.value >= required) return 0;
        uint256 missing = required - msg.value;
        return missing >= usable ? usable : missing;
    }

    /// @dev Commits a credit consumption + enforces the daily-count rate limit.
    ///      No-op if `consumed == 0` (user paid fully from msg.value — no pool touched).
    function _finaliseCredit(uint256 consumed) internal {
        if (consumed == 0) return;
        SponsoredLayout storage $ = _s();

        _applyRateLimit(msg.sender, $.maxClaimsPerDay);

        $.sponsoredCredit[msg.sender] -= consumed;
        $.totalSponsoredCredit -= consumed;
        emit CreditConsumed(msg.sender, consumed);
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
