// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

/// @title IIntuitionVersionedFeeProxy
/// @notice ERC-7936 compliant interface for the Intuition versioned fee-proxy.
/// @dev The proxy stores a registry of implementations indexed by `bytes32` version
///      identifiers. A caller may either:
///       - omit the version (normal call → fallback → default version), or
///       - pin explicitly to a version via `executeAtVersion`.
interface IIntuitionVersionedFeeProxy {
    // ============ Events (ERC-7936) ============

    event VersionRegistered(bytes32 indexed version, address indexed implementation);
    event VersionRemoved(bytes32 indexed version);
    event DefaultVersionChanged(bytes32 indexed oldVersion, bytes32 indexed newVersion);
    event ProxyAdminTransferred(address indexed oldAdmin, address indexed newAdmin);

    // ============ Admin (proxy-admin gated) ============

    function registerVersion(bytes32 version, address implementation) external;
    function removeVersion(bytes32 version) external;
    function setDefaultVersion(bytes32 version) external;
    function transferProxyAdmin(address newAdmin) external;

    // ============ Views ============

    function getImplementation(bytes32 version) external view returns (address);
    function getDefaultVersion() external view returns (bytes32);
    function getVersions() external view returns (bytes32[] memory);
    function proxyAdmin() external view returns (address);

    // ============ ERC-7936 execute-at-version ============

    /// @notice Call a specific version with arbitrary calldata.
    /// @dev Delegatecalls `implementations[version]` with `data`. Reverts if the
    ///      version is not registered or if the delegatecall reverts.
    function executeAtVersion(bytes32 version, bytes calldata data)
        external
        payable
        returns (bytes memory);
}
