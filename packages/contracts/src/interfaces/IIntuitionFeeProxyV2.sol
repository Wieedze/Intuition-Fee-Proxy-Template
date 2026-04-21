// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

/// @title IIntuitionFeeProxyV2
/// @notice Public signatures of IntuitionFeeProxyV2 — used by the Factory and external tooling.
/// @dev Internal / admin-only functions are also exposed here for typechain consumption by the webapp.
interface IIntuitionFeeProxyV2 {
    // ============ Types ============

    /// @notice Aggregate on-chain metrics, exposed for dashboards / indexers.
    /// @dev All counters are cumulative. `totalVolume` is the sum of amounts
    ///      forwarded to the MultiVault (fees excluded).
    struct ProxyMetrics {
        uint256 totalAtomsCreated;
        uint256 totalTriplesCreated;
        uint256 totalDeposits;
        uint256 totalVolume;
        uint256 totalUniqueUsers;
        uint256 lastActivityBlock;
    }

    // ============ Initializer ============

    /// @notice Initialize a freshly-deployed ERC1967 proxy instance
    /// @param ethMultiVault_ Address of the Intuition MultiVault (set once, no setter)
    /// @param depositFixedFee_ Initial fixed fee per deposit (wei)
    /// @param depositPercentageFee_ Initial percentage fee (base 10000)
    /// @param initialAdmins_ Initial whitelisted admins (must contain at least one non-zero entry)
    function initialize(
        address ethMultiVault_,
        uint256 depositFixedFee_,
        uint256 depositPercentageFee_,
        address[] calldata initialAdmins_
    ) external;

    // ============ Fee calculation ============

    function calculateDepositFee(uint256 depositCount, uint256 totalDeposit) external view returns (uint256);
    function getTotalDepositCost(uint256 depositAmount) external view returns (uint256);
    function getTotalCreationCost(uint256 depositCount, uint256 totalDeposit, uint256 multiVaultCost)
        external view returns (uint256);
    function getMultiVaultAmountFromValue(uint256 msgValue) external view returns (uint256);

    // ============ Admin ============

    function setDepositFixedFee(uint256 newFee) external;
    function setDepositPercentageFee(uint256 newFee) external;
    function setWhitelistedAdmin(address admin, bool status) external;

    function withdraw(address to, uint256 amount) external;
    function withdrawAll(address to) external;

    // ============ Payable proxy functions (V2 — no `receiver` argument) ============

    function createAtoms(
        bytes[] calldata data,
        uint256[] calldata assets,
        uint256 curveId
    ) external payable returns (bytes32[] memory atomIds);

    function createTriples(
        bytes32[] calldata subjectIds,
        bytes32[] calldata predicateIds,
        bytes32[] calldata objectIds,
        uint256[] calldata assets,
        uint256 curveId
    ) external payable returns (bytes32[] memory tripleIds);

    function deposit(
        bytes32 termId,
        uint256 curveId,
        uint256 minShares
    ) external payable returns (uint256 shares);

    function depositBatch(
        bytes32[] calldata termIds,
        uint256[] calldata curveIds,
        uint256[] calldata assets,
        uint256[] calldata minShares
    ) external payable returns (uint256[] memory shares);

    // ============ View / accounting ============

    function ethMultiVault() external view returns (address);
    function depositFixedFee() external view returns (uint256);
    function depositPercentageFee() external view returns (uint256);
    function whitelistedAdmins(address admin) external view returns (bool);
    function adminCount() external view returns (uint256);
    function accumulatedFees() external view returns (uint256);
    function totalFeesCollectedAllTime() external view returns (uint256);

    // ============ Metrics ============

    function totalAtomsCreated() external view returns (uint256);
    function totalTriplesCreated() external view returns (uint256);
    function totalDeposits() external view returns (uint256);
    function totalVolume() external view returns (uint256);
    function totalUniqueUsers() external view returns (uint256);
    function lastActivityBlock() external view returns (uint256);
    function hasInteracted(address user) external view returns (bool);
    function getMetrics() external view returns (ProxyMetrics memory);
}
