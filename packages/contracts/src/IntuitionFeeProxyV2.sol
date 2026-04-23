// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
// `ReentrancyGuard` (non-`Upgradeable`) is safe here: OZ v5 uses ERC-7201
// namespaced storage for it, so it cannot collide with the impl's inline slots.
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IEthMultiVault} from "./interfaces/IEthMultiVault.sol";
import {IIntuitionFeeProxyV2, ProxyChannel} from "./interfaces/IIntuitionFeeProxyV2.sol";
import {Errors} from "./libraries/Errors.sol";

/// @title IntuitionFeeProxyV2
/// @notice Fee-layer logic contract on top of the Intuition MultiVault.
/// @dev
///  - Pure logic: no self-upgrade mechanism. The contract is deployed as an
///    implementation behind an ERC-7936 `IntuitionVersionedFeeProxy` which
///    manages version routing and upgrades.
///  - Fees accumulate in the proxy's storage (`accumulatedFees`) and are pulled
///    by admins via `withdraw`/`withdrawAll`. No recipient forwarding.
///  - `receiver` is implicit: always `msg.sender`. The contract is a pure fee
///    layer, not a sponsor.
///  - MultiVault target is fixed at `initialize()` (no setter). Ship a new
///    logic version and register it on the versioned proxy if MultiVault migrates.
///  - **IMPORTANT — MultiVault approval prerequisite**: callers of
///    `createAtoms` / `createTriples` MUST have approved this proxy on the
///    MultiVault for `DEPOSIT` before invoking them. The per-item deposit
///    loop runs AFTER term creation; a missing approval causes the inner
///    call to revert AFTER atoms/triples are created on-chain (user pays
///    the creation cost for nothing). The MultiVault v2 `approvals` mapping
///    is `internal` — we cannot preflight it on-chain, so the check must
///    live in the frontend / SDK. A future upstream PR may expose the
///    mapping; once it does, this proxy will gain an on-chain preflight.
contract IntuitionFeeProxyV2 is
    IIntuitionFeeProxyV2,
    Initializable,
    ReentrancyGuard
{
    // ============ Constants ============

    uint256 public constant FEE_DENOMINATOR = 10000;
    /// @notice Hard upper bound on `depositPercentageFee`. Set to 10% (1000 bps).
    /// @dev Chosen to cap admin-controlled rug potential. An admin can still
    ///      tune fees within [0, 10%], but cannot flip to 100% and drain user
    ///      deposits via the inverse-formula path in `deposit()`. Constant —
    ///      only a fresh impl version registered on the versioned proxy can
    ///      raise it; existing proxies stay bounded forever.
    uint256 public constant MAX_FEE_PERCENTAGE = 1000;

    /// @notice Hard upper bound on `depositFixedFee`. Set to 10 TRUST.
    /// @dev Same rationale as `MAX_FEE_PERCENTAGE`: an admin can tune the
    ///      fixed fee within [0, 10 TRUST] but cannot set it to an absurd
    ///      value that would freeze all `deposit()` calls (`msg.value <=
    ///      depositFixedFee` reverts `InsufficientValue`). Constant — only
    ///      a fresh impl version registered on the versioned proxy can
    ///      raise it; existing proxies stay bounded forever.
    uint256 public constant MAX_FIXED_FEE = 10 ether;


    // ============ Storage (50 slots reserved) ============

    /// @dev slot 0 — MultiVault target. Stored (not immutable) so the address
    ///      survives implementation swaps behind the versioned proxy.
    IEthMultiVault internal _ethMultiVault;

    /// @dev slot 1
    uint256 public depositFixedFee;

    /// @dev slot 2
    uint256 public depositPercentageFee;

    /// @dev slot 3 — balance currently owed to admins, withdrawable
    uint256 public accumulatedFees;

    /// @dev slot 4 — cumulative, never decreases
    uint256 public totalFeesCollectedAllTime;

    /// @dev slot 5
    mapping(address => bool) public whitelistedAdmins;

    /// @dev slot 6 — guards against revoking the last admin
    uint256 public adminCount;

    // ============ Metrics storage (slots 7–13) ============
    // Aggregate counters for dashboards / indexers. Cheap SSTOREs on every
    // entry point. Append-only so existing upgradeable proxies stay safe.

    /// @dev slot 7 — cumulative count of atoms ever created through this proxy
    uint256 public totalAtomsCreated;

    /// @dev slot 8 — cumulative count of triples ever created
    uint256 public totalTriplesCreated;

    /// @dev slot 9 — cumulative count of deposit operations (batch entries count individually)
    uint256 public totalDeposits;

    /// @dev slot 10 — cumulative TRUST/ETH forwarded to the MultiVault (fees excluded)
    uint256 public totalVolume;

    /// @dev slot 11 — unique addresses that have interacted with the proxy
    uint256 public totalUniqueUsers;

    /// @dev slot 12 — block of the last write-path call
    uint256 public lastActivityBlock;

    /// @dev slot 13 — tracks first-time interaction per user (for uniqueUsers)
    mapping(address => bool) private _hasInteracted;

    /// @dev slot 14 — user → unclaimed refund balance (accrued when a direct
    ///      refund `.call` failed because the caller cannot receive ETH, e.g.
    ///      a SCW without a payable `receive()`). Pull-based: the owner
    ///      reclaims via `claimRefund`.
    mapping(address => uint256) public pendingRefunds;

    /// @dev 15 slots used — 35 left to reserve for future upgrades (total 50)
    uint256[35] private __gap;

    // ============ Events ============

    event DepositFixedFeeUpdated(uint256 oldFee, uint256 newFee);
    event DepositPercentageFeeUpdated(uint256 oldFee, uint256 newFee);
    event AdminWhitelistUpdated(address indexed admin, bool status);

    event FeesCollected(address indexed user, uint256 amount, string operation);
    event TransactionForwarded(
        string operation,
        address indexed user,
        uint256 fee,
        uint256 multiVaultValue,
        uint256 totalReceived
    );
    event MultiVaultSuccess(string operation, uint256 resultCount);

    event FeesWithdrawn(address indexed to, uint256 amount, address indexed by);

    /// @notice Emitted when a direct refund `.call` failed (typically a SCW
    ///         caller without payable `receive()`) and the excess was queued
    ///         for later pull via `claimRefund`.
    event RefundQueued(address indexed user, uint256 amount);

    /// @notice Emitted when a caller pulls their queued refund to `to`.
    event RefundClaimed(address indexed user, address indexed to, uint256 amount);

    /// @notice Emitted on every write-path call with a snapshot of the aggregate metrics.
    event MetricsUpdated(
        uint256 totalAtomsCreated,
        uint256 totalTriplesCreated,
        uint256 totalDeposits,
        uint256 totalVolume,
        uint256 totalUniqueUsers,
        uint256 lastActivityBlock
    );

    // ============ Modifiers ============

    modifier onlyWhitelistedAdmin() {
        if (!whitelistedAdmins[msg.sender]) {
            revert Errors.IntuitionFeeProxy_NotWhitelistedAdmin();
        }
        _;
    }

    // ============ Constructor / Initializer ============

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @inheritdoc IIntuitionFeeProxyV2
    function initialize(
        address ethMultiVault_,
        uint256 depositFixedFee_,
        uint256 depositPercentageFee_,
        address[] calldata initialAdmins_
    ) external virtual initializer {
        _initializeV2(ethMultiVault_, depositFixedFee_, depositPercentageFee_, initialAdmins_);
    }

    /// @dev Core initialization body, extracted so a child contract can override
    ///      `initialize`, chain this, and then run its own setup under a single
    ///      `initializer` modifier. Must only be called from within a function
    ///      already guarded by `initializer`.
    function _initializeV2(
        address ethMultiVault_,
        uint256 depositFixedFee_,
        uint256 depositPercentageFee_,
        address[] calldata initialAdmins_
    ) internal {
        if (ethMultiVault_ == address(0) || ethMultiVault_.code.length == 0) {
            revert Errors.IntuitionFeeProxy_InvalidMultiVaultAddress();
        }
        if (depositPercentageFee_ > MAX_FEE_PERCENTAGE) {
            revert Errors.IntuitionFeeProxy_FeePercentageTooHigh();
        }
        if (depositFixedFee_ > MAX_FIXED_FEE) {
            revert Errors.IntuitionFeeProxy_FixedFeeTooHigh();
        }
        if (initialAdmins_.length == 0) {
            revert Errors.IntuitionFeeProxy_NoAdminsProvided();
        }

        // ReentrancyGuard uses ERC-7201 namespaced storage — no initializer needed.

        _ethMultiVault = IEthMultiVault(ethMultiVault_);
        depositFixedFee = depositFixedFee_;
        depositPercentageFee = depositPercentageFee_;

        uint256 added;
        uint256 len = initialAdmins_.length;
        for (uint256 i = 0; i < len; i++) {
            address a = initialAdmins_[i];
            if (a != address(0) && !whitelistedAdmins[a]) {
                whitelistedAdmins[a] = true;
                unchecked { ++added; }
                emit AdminWhitelistUpdated(a, true);
            }
        }
        if (added == 0) {
            revert Errors.IntuitionFeeProxy_NoAdminsProvided();
        }
        adminCount = added;
    }

    // ============ Channel marker ============

    /// @inheritdoc IIntuitionFeeProxyV2
    function channel() external pure virtual returns (ProxyChannel) {
        return ProxyChannel.Standard;
    }

    /// @inheritdoc IIntuitionFeeProxyV2
    /// @dev Any V2-family derivative that reuses the inline slot layout
    ///      (0..13 + __gap[36]) — including V2.1, V3Mock, and future
    ///      append-only versions — MUST inherit this ID. Any fork that
    ///      changes the layout (slot relocation, new inline field before
    ///      __gap, namespace change) MUST bump to a new bytes32.
    function STORAGE_COMPAT_ID() external pure virtual returns (bytes32) {
        return keccak256("intuition.feeproxy.v2.standard");
    }

    // ============ Fee calculation ============

    /// @inheritdoc IIntuitionFeeProxyV2
    function calculateDepositFee(uint256 depositCount, uint256 totalDeposit) public view returns (uint256) {
        uint256 fixedFee = depositFixedFee * depositCount;
        uint256 percentageFee = (totalDeposit * depositPercentageFee) / FEE_DENOMINATOR;
        return fixedFee + percentageFee;
    }

    /// @inheritdoc IIntuitionFeeProxyV2
    function getTotalDepositCost(uint256 depositAmount) external view returns (uint256) {
        return depositAmount + calculateDepositFee(1, depositAmount);
    }

    /// @inheritdoc IIntuitionFeeProxyV2
    function getTotalCreationCost(uint256 depositCount, uint256 totalDeposit, uint256 multiVaultCost)
        external view returns (uint256)
    {
        return multiVaultCost + calculateDepositFee(depositCount, totalDeposit);
    }

    /// @inheritdoc IIntuitionFeeProxyV2
    function getMultiVaultAmountFromValue(uint256 msgValue) public view returns (uint256) {
        if (msgValue <= depositFixedFee) return 0;
        return (msgValue - depositFixedFee) * FEE_DENOMINATOR / (FEE_DENOMINATOR + depositPercentageFee);
    }

    // ============ Admin: fee config ============

    /// @inheritdoc IIntuitionFeeProxyV2
    function setDepositFixedFee(uint256 newFee) external onlyWhitelistedAdmin {
        if (newFee > MAX_FIXED_FEE) {
            revert Errors.IntuitionFeeProxy_FixedFeeTooHigh();
        }
        uint256 oldFee = depositFixedFee;
        depositFixedFee = newFee;
        emit DepositFixedFeeUpdated(oldFee, newFee);
    }

    /// @inheritdoc IIntuitionFeeProxyV2
    function setDepositPercentageFee(uint256 newFee) external onlyWhitelistedAdmin {
        if (newFee > MAX_FEE_PERCENTAGE) {
            revert Errors.IntuitionFeeProxy_FeePercentageTooHigh();
        }
        uint256 oldFee = depositPercentageFee;
        depositPercentageFee = newFee;
        emit DepositPercentageFeeUpdated(oldFee, newFee);
    }

    /// @inheritdoc IIntuitionFeeProxyV2
    function setWhitelistedAdmin(address admin, bool status) external onlyWhitelistedAdmin {
        if (admin == address(0)) {
            revert Errors.IntuitionFeeProxy_ZeroAddress();
        }
        bool current = whitelistedAdmins[admin];
        if (current == status) {
            // no-op, keep event emission off to avoid log noise
            return;
        }
        if (!status) {
            // Removing an admin: forbid the last admin from self-revoking
            if (admin == msg.sender && adminCount == 1) {
                revert Errors.IntuitionFeeProxy_LastAdminCannotRevoke();
            }
            whitelistedAdmins[admin] = false;
            unchecked { --adminCount; }
        } else {
            whitelistedAdmins[admin] = true;
            unchecked { ++adminCount; }
        }
        emit AdminWhitelistUpdated(admin, status);
    }

    // ============ Admin: withdraw ============

    /// @inheritdoc IIntuitionFeeProxyV2
    function withdraw(address to, uint256 amount) external virtual onlyWhitelistedAdmin nonReentrant {
        if (to == address(0)) revert Errors.IntuitionFeeProxy_ZeroAddress();
        if (amount == 0) revert Errors.IntuitionFeeProxy_NothingToWithdraw();
        if (amount > accumulatedFees) revert Errors.IntuitionFeeProxy_InsufficientAccumulatedFees();

        accumulatedFees -= amount;

        (bool ok, ) = to.call{value: amount}("");
        if (!ok) revert Errors.IntuitionFeeProxy_WithdrawFailed();

        emit FeesWithdrawn(to, amount, msg.sender);
    }

    /// @inheritdoc IIntuitionFeeProxyV2
    function withdrawAll(address to) external virtual onlyWhitelistedAdmin nonReentrant {
        if (to == address(0)) revert Errors.IntuitionFeeProxy_ZeroAddress();
        uint256 amount = accumulatedFees;
        if (amount == 0) revert Errors.IntuitionFeeProxy_NothingToWithdraw();

        accumulatedFees = 0;

        (bool ok, ) = to.call{value: amount}("");
        if (!ok) revert Errors.IntuitionFeeProxy_WithdrawFailed();

        emit FeesWithdrawn(to, amount, msg.sender);
    }

    // ============ Proxy payable functions (V2 — no receiver arg) ============

    /// @inheritdoc IIntuitionFeeProxyV2
    /// @dev ⚠️ Caller MUST have `multiVault.approve(proxy, DEPOSIT)` beforehand.
    ///      See contract-level NatSpec for the failure mode when approval is missing.
    function createAtoms(
        bytes[] calldata data,
        uint256[] calldata assets,
        uint256 curveId
    ) external payable virtual nonReentrant returns (bytes32[] memory atomIds) {
        if (data.length != assets.length) {
            revert Errors.IntuitionFeeProxy_WrongArrayLengths();
        }

        uint256 count = data.length;
        uint256 atomCost = _ethMultiVault.getAtomCost();
        uint256 totalDeposit = _sumArray(assets);
        uint256 depositCount = _countNonZero(assets);
        uint256 fee = calculateDepositFee(depositCount, totalDeposit);

        uint256 multiVaultCost = (atomCost * count) + totalDeposit;
        uint256 totalRequired = fee + multiVaultCost;
        if (msg.value < totalRequired) {
            revert Errors.IntuitionFeeProxy_InsufficientValue();
        }

        _accrueFee(fee, "createAtoms", multiVaultCost);

        uint256[] memory minAssets = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            minAssets[i] = atomCost;
        }
        atomIds = _ethMultiVault.createAtoms{value: atomCost * count}(data, minAssets);

        for (uint256 i = 0; i < count; i++) {
            if (assets[i] > 0) {
                _ethMultiVault.deposit{value: assets[i]}(msg.sender, atomIds[i], curveId, 0);
            }
        }

        _trackActivity(count, 0, depositCount, totalDeposit);
        emit MultiVaultSuccess("createAtoms", count);
        _refundExcess(totalRequired);
        return atomIds;
    }

    /// @inheritdoc IIntuitionFeeProxyV2
    /// @dev ⚠️ Caller MUST have `multiVault.approve(proxy, DEPOSIT)` beforehand.
    ///      See contract-level NatSpec for the failure mode when approval is missing.
    function createTriples(
        bytes32[] calldata subjectIds,
        bytes32[] calldata predicateIds,
        bytes32[] calldata objectIds,
        uint256[] calldata assets,
        uint256 curveId
    ) external payable virtual nonReentrant returns (bytes32[] memory tripleIds) {
        if (
            subjectIds.length != predicateIds.length ||
            predicateIds.length != objectIds.length ||
            objectIds.length != assets.length
        ) {
            revert Errors.IntuitionFeeProxy_WrongArrayLengths();
        }

        uint256 count = subjectIds.length;
        uint256 tripleCost = _ethMultiVault.getTripleCost();
        uint256 totalDeposit = _sumArray(assets);
        uint256 depositCount = _countNonZero(assets);
        uint256 fee = calculateDepositFee(depositCount, totalDeposit);

        uint256 multiVaultCost = (tripleCost * count) + totalDeposit;
        uint256 totalRequired = fee + multiVaultCost;
        if (msg.value < totalRequired) {
            revert Errors.IntuitionFeeProxy_InsufficientValue();
        }

        _accrueFee(fee, "createTriples", multiVaultCost);

        uint256[] memory minAssets = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            minAssets[i] = tripleCost;
        }
        tripleIds = _ethMultiVault.createTriples{value: tripleCost * count}(
            subjectIds, predicateIds, objectIds, minAssets
        );

        for (uint256 i = 0; i < count; i++) {
            if (assets[i] > 0) {
                _ethMultiVault.deposit{value: assets[i]}(msg.sender, tripleIds[i], curveId, 0);
            }
        }

        _trackActivity(0, count, depositCount, totalDeposit);
        emit MultiVaultSuccess("createTriples", count);
        _refundExcess(totalRequired);
        return tripleIds;
    }

    /// @inheritdoc IIntuitionFeeProxyV2
    function deposit(
        bytes32 termId,
        uint256 curveId,
        uint256 minShares
    ) external payable virtual nonReentrant returns (uint256 shares) {
        if (msg.value <= depositFixedFee) {
            revert Errors.IntuitionFeeProxy_InsufficientValue();
        }

        uint256 multiVaultAmount = (msg.value - depositFixedFee) * FEE_DENOMINATOR
                                   / (FEE_DENOMINATOR + depositPercentageFee);
        uint256 fee = msg.value - multiVaultAmount;

        _accrueFee(fee, "deposit", multiVaultAmount);

        shares = _ethMultiVault.deposit{value: multiVaultAmount}(msg.sender, termId, curveId, minShares);
        _trackActivity(0, 0, 1, multiVaultAmount);
        emit MultiVaultSuccess("deposit", 1);
    }

    /// @inheritdoc IIntuitionFeeProxyV2
    function depositBatch(
        bytes32[] calldata termIds,
        uint256[] calldata curveIds,
        uint256[] calldata assets,
        uint256[] calldata minShares
    ) external payable virtual nonReentrant returns (uint256[] memory shares) {
        if (
            termIds.length != curveIds.length ||
            curveIds.length != assets.length ||
            assets.length != minShares.length
        ) {
            revert Errors.IntuitionFeeProxy_WrongArrayLengths();
        }

        uint256 totalDeposit = _sumArray(assets);
        uint256 fee = calculateDepositFee(termIds.length, totalDeposit);
        uint256 totalRequired = totalDeposit + fee;
        if (msg.value < totalRequired) {
            revert Errors.IntuitionFeeProxy_InsufficientValue();
        }

        _accrueFee(fee, "depositBatch", totalDeposit);

        shares = _ethMultiVault.depositBatch{value: totalDeposit}(
            msg.sender, termIds, curveIds, assets, minShares
        );
        _trackActivity(0, 0, termIds.length, totalDeposit);
        emit MultiVaultSuccess("depositBatch", shares.length);
        _refundExcess(totalRequired);
    }

    // ============ View: passthrough MultiVault ============

    function ethMultiVault() external view returns (address) {
        return address(_ethMultiVault);
    }

    function getAtomCost() external view returns (uint256) {
        return _ethMultiVault.getAtomCost();
    }

    function getTripleCost() external view returns (uint256) {
        return _ethMultiVault.getTripleCost();
    }

    function calculateAtomId(bytes calldata data) external view returns (bytes32) {
        return _ethMultiVault.calculateAtomId(data);
    }

    function calculateTripleId(
        bytes32 subjectId,
        bytes32 predicateId,
        bytes32 objectId
    ) external view returns (bytes32) {
        return _ethMultiVault.calculateTripleId(subjectId, predicateId, objectId);
    }

    function getTriple(bytes32 tripleId) external view returns (bytes32, bytes32, bytes32) {
        return _ethMultiVault.getTriple(tripleId);
    }

    function getShares(
        address account,
        bytes32 termId,
        uint256 curveId
    ) external view returns (uint256) {
        return _ethMultiVault.getShares(account, termId, curveId);
    }

    function isTermCreated(bytes32 id) external view returns (bool) {
        return _ethMultiVault.isTermCreated(id);
    }

    function previewDeposit(
        bytes32 termId,
        uint256 curveId,
        uint256 assets
    ) external view returns (uint256, uint256) {
        return _ethMultiVault.previewDeposit(termId, curveId, assets);
    }

    // ============ Metrics views ============

    /// @inheritdoc IIntuitionFeeProxyV2
    function hasInteracted(address user) external view returns (bool) {
        return _hasInteracted[user];
    }

    /// @inheritdoc IIntuitionFeeProxyV2
    function getMetrics() external view returns (ProxyMetrics memory) {
        return ProxyMetrics({
            totalAtomsCreated: totalAtomsCreated,
            totalTriplesCreated: totalTriplesCreated,
            totalDeposits: totalDeposits,
            totalVolume: totalVolume,
            totalUniqueUsers: totalUniqueUsers,
            lastActivityBlock: lastActivityBlock
        });
    }

    // ============ Internal ============

    function _accrueFee(uint256 fee, string memory operation, uint256 mvValue) internal virtual {
        if (fee > 0) {
            accumulatedFees += fee;
            totalFeesCollectedAllTime += fee;
        }
        emit FeesCollected(msg.sender, fee, operation);
        emit TransactionForwarded(operation, msg.sender, fee, mvValue, msg.value);
    }

    function _trackActivity(
        uint256 atomsDelta,
        uint256 triplesDelta,
        uint256 depositsDelta,
        uint256 volumeDelta
    ) internal {
        if (!_hasInteracted[msg.sender]) {
            _hasInteracted[msg.sender] = true;
            unchecked { ++totalUniqueUsers; }
        }
        if (atomsDelta > 0) totalAtomsCreated += atomsDelta;
        if (triplesDelta > 0) totalTriplesCreated += triplesDelta;
        if (depositsDelta > 0) totalDeposits += depositsDelta;
        if (volumeDelta > 0) totalVolume += volumeDelta;
        lastActivityBlock = block.number;

        emit MetricsUpdated(
            totalAtomsCreated,
            totalTriplesCreated,
            totalDeposits,
            totalVolume,
            totalUniqueUsers,
            lastActivityBlock
        );
    }

    function _sumArray(uint256[] calldata arr) internal pure returns (uint256 sum) {
        for (uint256 i = 0; i < arr.length; i++) {
            sum += arr[i];
        }
    }

    function _countNonZero(uint256[] calldata arr) internal pure returns (uint256 count) {
        for (uint256 i = 0; i < arr.length; i++) {
            if (arr[i] > 0) count++;
        }
    }

    /// @dev Refunds `msg.value - ethSpent` back to the caller. `ethSpent` is the
    ///      portion of the call budget that came from `msg.value` (in the V2 flow
    ///      that equals `totalRequired`; in the Sponsored flow it is
    ///      `totalRequired - consumedCredit`). Called at the tail of payable entry
    ///      points, after MV forwards + metrics. Must be guarded by
    ///      `nonReentrant` on the caller.
    ///
    ///      Fallback: if the direct `.call` fails (caller is a SCW without
    ///      payable `receive()` / `fallback()`), the excess is credited to
    ///      `pendingRefunds[msg.sender]` and can be pulled later via
    ///      `claimRefund`. The outer tx proceeds instead of reverting — the
    ///      deposit itself would have succeeded regardless.
    function _refundExcess(uint256 ethSpent) internal {
        uint256 excess = msg.value - ethSpent;
        if (excess == 0) return;
        (bool ok, ) = msg.sender.call{value: excess}("");
        if (!ok) {
            pendingRefunds[msg.sender] += excess;
            emit RefundQueued(msg.sender, excess);
        }
    }

    /// @notice Pull any refund that was queued because the direct `.call`
    ///         failed. Sends the caller's entire pending balance to `to`.
    /// @param to Recipient — typically an EOA under the caller's control.
    function claimRefund(address to) external nonReentrant {
        if (to == address(0)) revert Errors.IntuitionFeeProxy_ZeroAddress();
        uint256 amount = pendingRefunds[msg.sender];
        if (amount == 0) revert Errors.IntuitionFeeProxy_NothingToRefund();
        pendingRefunds[msg.sender] = 0;
        (bool ok, ) = to.call{value: amount}("");
        if (!ok) revert Errors.IntuitionFeeProxy_RefundFailed();
        emit RefundClaimed(msg.sender, to, amount);
    }

    // NOTE: no `receive()` / `fallback()` — direct ETH transfers revert. All
    // fee flows carry calldata (createAtoms / deposit / …), so bare transfers
    // would only be mis-sends.
}
