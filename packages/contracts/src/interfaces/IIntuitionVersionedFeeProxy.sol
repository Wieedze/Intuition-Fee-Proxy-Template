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

    /// @notice Emitted when a new proxy-admin transfer is initiated (pending the new admin's acceptance).
    event ProxyAdminTransferStarted(address indexed currentAdmin, address indexed pendingAdmin);

    /// @notice Emitted when the proxy's human-readable name is set or changed.
    event NameChanged(bytes32 indexed oldName, bytes32 indexed newName);

    // ============ Admin (proxy-admin gated) ============

    function registerVersion(bytes32 version, address implementation) external;
    function removeVersion(bytes32 version) external;
    function setDefaultVersion(bytes32 version) external;

    /// @notice Initiate a proxy-admin transfer. The new admin takes over only
    ///         after they call `acceptProxyAdmin`. Passing `address(0)` reverts.
    ///         Calling again before acceptance overwrites the pending admin.
    function transferProxyAdmin(address newAdmin) external;

    /// @notice Finalize a pending proxy-admin transfer. Only callable by the
    ///         address set as `pendingProxyAdmin` via `transferProxyAdmin`.
    function acceptProxyAdmin() external;

    /// @notice Set or rename the proxy's human-readable label. Pass bytes32(0) to clear.
    /// @dev    ⚠️ **The name is NOT a trust anchor.** The proxy-admin can
    ///         rename the proxy at any time — including to mimic a known
    ///         brand. Frontends MUST NOT use `name` to derive an "official"
    ///         / "verified" badge. Use the Factory's `isProxyFromFactory`
    ///         mapping or the proxy address itself (allowlist) as the
    ///         authoritative identity.
    function setName(bytes32 newName) external;

    // ============ Views ============

    function getImplementation(bytes32 version) external view returns (address);
    function getDefaultVersion() external view returns (bytes32);
    function getVersions() external view returns (bytes32[] memory);
    function proxyAdmin() external view returns (address);
    function pendingProxyAdmin() external view returns (address);
    /// @notice Returns the proxy's current human-readable label.
    /// @dev    ⚠️ See the warning on `setName` — a name is admin-controlled
    ///         metadata, never a source of trust.
    function getName() external view returns (bytes32);

    // ============ ERC-7936 execute-at-version ============

    /// @notice Call a specific version with arbitrary calldata.
    /// @dev Delegatecalls `implementations[version]` with `data`. Reverts if the
    ///      version is not registered or if the delegatecall reverts.
    function executeAtVersion(bytes32 version, bytes calldata data)
        external
        payable
        returns (bytes memory);
}
