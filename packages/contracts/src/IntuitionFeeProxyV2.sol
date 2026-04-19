// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
// OZ v5.5+ removed `ReentrancyGuardUpgradeable` because `ReentrancyGuard` now uses
// ERC-7201 namespaced storage and is proxy-safe out of the box.
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IEthMultiVault} from "./interfaces/IEthMultiVault.sol";
import {IIntuitionFeeProxyV2} from "./interfaces/IIntuitionFeeProxyV2.sol";
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
contract IntuitionFeeProxyV2 is
    IIntuitionFeeProxyV2,
    Initializable,
    ReentrancyGuard
{
    // ============ Constants ============

    uint256 public constant FEE_DENOMINATOR = 10000;
    uint256 public constant MAX_FEE_PERCENTAGE = 10000;

    // ============ Storage (50 slots reserved) ============

    /// @dev slot 0 — was immutable in V1, now storage (upgradeable requirement)
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

    /// @dev 14 slots used — 36 left to reserve for future upgrades (total 50)
    uint256[36] private __gap;

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
    ) external initializer {
        if (ethMultiVault_ == address(0)) {
            revert Errors.IntuitionFeeProxy_InvalidMultiVaultAddress();
        }
        if (depositPercentageFee_ > MAX_FEE_PERCENTAGE) {
            revert Errors.IntuitionFeeProxy_FeePercentageTooHigh();
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
    function withdraw(address to, uint256 amount) external onlyWhitelistedAdmin nonReentrant {
        if (to == address(0)) revert Errors.IntuitionFeeProxy_ZeroAddress();
        if (amount == 0) revert Errors.IntuitionFeeProxy_NothingToWithdraw();
        if (amount > accumulatedFees) revert Errors.IntuitionFeeProxy_InsufficientAccumulatedFees();

        accumulatedFees -= amount;

        (bool ok, ) = to.call{value: amount}("");
        if (!ok) revert Errors.IntuitionFeeProxy_WithdrawFailed();

        emit FeesWithdrawn(to, amount, msg.sender);
    }

    /// @inheritdoc IIntuitionFeeProxyV2
    function withdrawAll(address to) external onlyWhitelistedAdmin nonReentrant {
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
    function createAtoms(
        bytes[] calldata data,
        uint256[] calldata assets,
        uint256 curveId
    ) external payable returns (bytes32[] memory atomIds) {
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
        return atomIds;
    }

    /// @inheritdoc IIntuitionFeeProxyV2
    function createTriples(
        bytes32[] calldata subjectIds,
        bytes32[] calldata predicateIds,
        bytes32[] calldata objectIds,
        uint256[] calldata assets,
        uint256 curveId
    ) external payable returns (bytes32[] memory tripleIds) {
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
        return tripleIds;
    }

    /// @inheritdoc IIntuitionFeeProxyV2
    function deposit(
        bytes32 termId,
        uint256 curveId,
        uint256 minShares
    ) external payable returns (uint256 shares) {
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
    ) external payable returns (uint256[] memory shares) {
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

    function calculateAtomId(bytes calldata data) external pure returns (bytes32) {
        return keccak256(data);
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

    function _accrueFee(uint256 fee, string memory operation, uint256 mvValue) internal {
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

    // NOTE: no `receive()` / `fallback()`. Direct ETH transfers revert (V1 foot-gun removed).
}
