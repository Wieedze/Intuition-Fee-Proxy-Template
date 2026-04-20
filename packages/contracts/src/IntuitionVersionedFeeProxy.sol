// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {IIntuitionVersionedFeeProxy} from "./interfaces/IIntuitionVersionedFeeProxy.sol";
import {Errors} from "./libraries/Errors.sol";

/// @title IntuitionVersionedFeeProxy
/// @notice ERC-7936 versioned proxy for Intuition fee-proxy implementations.
/// @dev
///  - Maintains a registry `version → implementation` and a current `defaultVersion`.
///  - Standard fallback routes calls to the default version (normal UX).
///  - `executeAtVersion` lets advanced users pin to a specific (reviewed, immutable)
///    version of the logic.
///  - Proxy-level state is stored in a custom namespace slot so it never collides
///    with the logic implementation's regular storage.
///  - No `receive()`: direct ETH transfers revert (intentional foot-gun removal).
///  - Admin gating is a single `proxyAdmin` address; users should point it at a
///    multisig. Transferable via `transferProxyAdmin`.
contract IntuitionVersionedFeeProxy is IIntuitionVersionedFeeProxy {
    // ============ Namespaced storage ============

    /// @dev ERC-7201 namespaced storage slot for the versioned-proxy registry.
    /// Matches the canonical formula: tooling (Slither, OZ upgrades plugin)
    /// recognises this exact shape and checks neighbouring slots are free.
    /// The `- 1` + low-byte mask guarantees the slot can't collide with a
    /// mapping/array base computed from any other keccak256 preimage.
    bytes32 private constant _STORAGE_SLOT = keccak256(
        abi.encode(uint256(keccak256("intuition.VersionedFeeProxy")) - 1)
    ) & ~bytes32(uint256(0xff));

    struct Layout {
        bytes32 defaultVersion;
        bytes32[] versionList;
        mapping(bytes32 => address) implementations;
        mapping(bytes32 => bool) versionExists;
        address proxyAdmin;
        bytes32 name;
        // 2-step admin transfer: `pendingProxyAdmin` holds the candidate set by
        // the current admin via `transferProxyAdmin`. Only that address can
        // promote itself via `acceptProxyAdmin`. Prevents fat-fingered
        // transfers to lost / wrong addresses. Appended — ERC-7201 namespaced
        // slot mask (~0xff) reserves 256 slots, plenty of room.
        address pendingProxyAdmin;
    }

    function _layout() private pure returns (Layout storage s) {
        bytes32 slot = _STORAGE_SLOT;
        assembly {
            s.slot := slot
        }
    }

    // ============ Modifiers ============

    modifier onlyProxyAdmin() {
        if (msg.sender != _layout().proxyAdmin) {
            revert Errors.VersionedFeeProxy_NotProxyAdmin();
        }
        _;
    }

    // ============ Constructor ============

    /// @param admin Proxy-admin authorized for version management (recommend: Safe)
    /// @param initialVersion Identifier for the initial registered version (e.g. bytes32("v2.0.0"))
    /// @param initialImpl Address of the initial logic implementation
    /// @param initData Calldata forwarded via delegatecall to initialize the logic
    /// @param initialName Optional human-readable name (bytes32 — empty for none, editable by proxyAdmin via setName)
    constructor(
        address admin,
        bytes32 initialVersion,
        address initialImpl,
        bytes memory initData,
        bytes32 initialName
    ) {
        if (admin == address(0)) revert Errors.IntuitionFeeProxy_ZeroAddress();
        if (initialVersion == bytes32(0)) revert Errors.VersionedFeeProxy_InvalidVersion();
        if (initialImpl == address(0) || initialImpl.code.length == 0) {
            revert Errors.VersionedFeeProxy_InvalidImplementation();
        }

        Layout storage s = _layout();
        s.proxyAdmin = admin;
        s.implementations[initialVersion] = initialImpl;
        s.versionExists[initialVersion] = true;
        s.versionList.push(initialVersion);
        s.defaultVersion = initialVersion;
        s.name = initialName;

        emit ProxyAdminTransferred(address(0), admin);
        emit VersionRegistered(initialVersion, initialImpl);
        emit DefaultVersionChanged(bytes32(0), initialVersion);
        if (initialName != bytes32(0)) {
            emit NameChanged(bytes32(0), initialName);
        }

        if (initData.length > 0) {
            (bool ok, bytes memory ret) = initialImpl.delegatecall(initData);
            if (!ok) _revertFromReturndata(ret);
        }
    }

    // ============ Admin: version management ============

    /// @inheritdoc IIntuitionVersionedFeeProxy
    function registerVersion(bytes32 version, address implementation)
        external
        onlyProxyAdmin
    {
        if (version == bytes32(0)) revert Errors.VersionedFeeProxy_InvalidVersion();
        if (implementation == address(0) || implementation.code.length == 0) {
            revert Errors.VersionedFeeProxy_InvalidImplementation();
        }

        Layout storage s = _layout();
        if (s.versionExists[version]) revert Errors.VersionedFeeProxy_VersionExists();

        s.implementations[version] = implementation;
        s.versionExists[version] = true;
        s.versionList.push(version);
        emit VersionRegistered(version, implementation);
    }

    /// @inheritdoc IIntuitionVersionedFeeProxy
    function removeVersion(bytes32 version) external onlyProxyAdmin {
        Layout storage s = _layout();
        if (!s.versionExists[version]) revert Errors.VersionedFeeProxy_VersionNotFound();
        if (version == s.defaultVersion) revert Errors.VersionedFeeProxy_CannotRemoveDefault();

        s.versionExists[version] = false;
        delete s.implementations[version];

        // Swap-and-pop removal from the list (order-preserving not required).
        uint256 len = s.versionList.length;
        for (uint256 i = 0; i < len; i++) {
            if (s.versionList[i] == version) {
                s.versionList[i] = s.versionList[len - 1];
                s.versionList.pop();
                break;
            }
        }
        emit VersionRemoved(version);
    }

    /// @inheritdoc IIntuitionVersionedFeeProxy
    function setDefaultVersion(bytes32 version) external onlyProxyAdmin {
        Layout storage s = _layout();
        if (!s.versionExists[version]) revert Errors.VersionedFeeProxy_VersionNotFound();
        bytes32 old = s.defaultVersion;
        if (version == old) return;
        s.defaultVersion = version;
        emit DefaultVersionChanged(old, version);
    }

    /// @inheritdoc IIntuitionVersionedFeeProxy
    function transferProxyAdmin(address newAdmin) external onlyProxyAdmin {
        if (newAdmin == address(0)) revert Errors.IntuitionFeeProxy_ZeroAddress();
        Layout storage s = _layout();
        s.pendingProxyAdmin = newAdmin;
        emit ProxyAdminTransferStarted(s.proxyAdmin, newAdmin);
    }

    /// @inheritdoc IIntuitionVersionedFeeProxy
    function acceptProxyAdmin() external {
        Layout storage s = _layout();
        address pending = s.pendingProxyAdmin;
        if (msg.sender != pending) revert Errors.VersionedFeeProxy_NotPendingProxyAdmin();
        address old = s.proxyAdmin;
        s.proxyAdmin = pending;
        delete s.pendingProxyAdmin;
        emit ProxyAdminTransferred(old, pending);
    }

    /// @inheritdoc IIntuitionVersionedFeeProxy
    function setName(bytes32 newName) external onlyProxyAdmin {
        Layout storage s = _layout();
        bytes32 old = s.name;
        if (old == newName) return;
        s.name = newName;
        emit NameChanged(old, newName);
    }

    // ============ Views ============

    /// @inheritdoc IIntuitionVersionedFeeProxy
    function getName() external view returns (bytes32) {
        return _layout().name;
    }

    /// @inheritdoc IIntuitionVersionedFeeProxy
    function getImplementation(bytes32 version) external view returns (address) {
        return _layout().implementations[version];
    }

    /// @inheritdoc IIntuitionVersionedFeeProxy
    function getDefaultVersion() external view returns (bytes32) {
        return _layout().defaultVersion;
    }

    /// @inheritdoc IIntuitionVersionedFeeProxy
    function getVersions() external view returns (bytes32[] memory) {
        return _layout().versionList;
    }

    /// @inheritdoc IIntuitionVersionedFeeProxy
    function proxyAdmin() external view returns (address) {
        return _layout().proxyAdmin;
    }

    /// @notice The candidate admin awaiting acceptance, or address(0) if none.
    function pendingProxyAdmin() external view returns (address) {
        return _layout().pendingProxyAdmin;
    }

    // ============ Execute at version ============

    /// @inheritdoc IIntuitionVersionedFeeProxy
    function executeAtVersion(bytes32 version, bytes calldata data)
        external
        payable
        returns (bytes memory)
    {
        Layout storage s = _layout();
        if (!s.versionExists[version]) revert Errors.VersionedFeeProxy_VersionNotFound();
        address impl = s.implementations[version];
        (bool ok, bytes memory ret) = impl.delegatecall(data);
        if (!ok) _revertFromReturndata(ret);
        return ret;
    }

    // ============ Fallback (ERC-7936 default routing) ============

    fallback() external payable {
        address impl = _layout().implementations[_layout().defaultVersion];
        assembly {
            calldatacopy(0, 0, calldatasize())
            let result := delegatecall(gas(), impl, 0, calldatasize(), 0, 0)
            returndatacopy(0, 0, returndatasize())
            switch result
            case 0 { revert(0, returndatasize()) }
            default { return(0, returndatasize()) }
        }
    }

    // NOTE: no `receive()` — ETH transfers without calldata revert. Fee flows
    // all come with calldata (createAtoms / deposit / …), so this is fine.
    // Rejecting bare ETH transfers keeps the V1 foot-gun removed.

    // ============ Internal ============

    function _revertFromReturndata(bytes memory ret) private pure {
        if (ret.length > 0) {
            assembly {
                let size := mload(ret)
                revert(add(ret, 0x20), size)
            }
        }
        revert Errors.VersionedFeeProxy_DelegateCallFailed();
    }
}
