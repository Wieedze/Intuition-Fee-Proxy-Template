// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import {IntuitionVersionedFeeProxy} from "./IntuitionVersionedFeeProxy.sol";
import {IIntuitionFeeProxyV2} from "./interfaces/IIntuitionFeeProxyV2.sol";
import {Errors} from "./libraries/Errors.sol";

/// @title IntuitionFeeProxyFactory
/// @notice Permissionless factory that deploys ERC-7936 versioned proxies
///         (`IntuitionVersionedFeeProxy`) pointing at a `IntuitionFeeProxyV2`
///         logic implementation and initializes them in one shot.
/// @dev
///  - Upgradeable (UUPS). `_authorizeUpgrade` is `onlyOwner` — the factory owner
///    is meant to be the project Gnosis Safe.
///  - Deployment of new fee-proxies is free and unrestricted. Anyone may create
///    their own instance.
///  - `setImplementation` updates the impl pointer + version label used by
///    future `createProxy` calls. Existing proxies are untouched — each manages
///    its own versioning via the ERC-7936 interface on the proxy itself.
///  - No CREATE2 — addresses are discoverable via `ProxyCreated` events.
contract IntuitionFeeProxyFactory is
    Initializable,
    OwnableUpgradeable,
    UUPSUpgradeable
{
    // ============ Storage ============

    /// @notice Implementation used for new deployments
    address public currentImplementation;

    /// @notice Version identifier under which `currentImplementation` is
    ///         registered in freshly deployed versioned proxies
    bytes32 public currentVersion;

    /// @notice Proxies deployed by a given caller, in chronological order
    mapping(address => address[]) public proxiesByDeployer;

    /// @notice Flat list of every proxy ever created by this factory
    address[] public allProxies;

    /// @notice Quick membership check for consumers that verify provenance
    mapping(address => bool) public isProxyFromFactory;

    /// @dev Reserved slots for future upgrades (5 slots used above → 45 gap)
    uint256[45] private __gap;

    // ============ Events ============

    event ProxyCreated(
        address indexed proxy,
        address indexed deployer,
        address indexed implementation,
        bytes32 initialVersion,
        address ethMultiVault,
        uint256 depositFixedFee,
        uint256 depositPercentageFee
    );

    event ImplementationUpdated(
        address indexed oldImpl,
        address indexed newImpl,
        bytes32 oldVersion,
        bytes32 newVersion
    );

    // ============ Constructor / Initializer ============

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @notice Initialize the factory behind an ERC-1967 proxy.
    /// @param initialImpl First `IntuitionFeeProxyV2` logic implementation
    /// @param initialVersion Version label for `initialImpl` (e.g. bytes32("v2.0.0"))
    /// @param owner_ Factory owner (recommend: project Gnosis Safe)
    function initialize(
        address initialImpl,
        bytes32 initialVersion,
        address owner_
    ) external initializer {
        __Ownable_init(owner_);
        _setImplementation(initialImpl, initialVersion);
    }

    // ============ UUPS ============

    function _authorizeUpgrade(address) internal override onlyOwner {}

    // ============ Admin (owner) ============

    /// @notice Update the implementation + version used for subsequent
    ///         `createProxy` calls. Existing proxies are unaffected.
    function setImplementation(address newImpl, bytes32 newVersion) external onlyOwner {
        _setImplementation(newImpl, newVersion);
    }

    function _setImplementation(address newImpl, bytes32 newVersion) internal {
        if (newImpl == address(0) || newImpl.code.length == 0) {
            revert Errors.IntuitionFeeProxyFactory_InvalidImplementation();
        }
        if (newVersion == bytes32(0)) {
            revert Errors.IntuitionFeeProxyFactory_InvalidVersion();
        }
        address oldImpl = currentImplementation;
        bytes32 oldVersion = currentVersion;
        currentImplementation = newImpl;
        currentVersion = newVersion;
        emit ImplementationUpdated(oldImpl, newImpl, oldVersion, newVersion);
    }

    // ============ Deployment ============

    /// @notice Deploy a new fee-proxy instance and initialize it.
    /// @dev The first admin in `initialAdmins` becomes the proxy-admin of the
    ///      versioned proxy (gated for `registerVersion` / `setDefaultVersion`).
    ///      All admins in the list are whitelisted on the logic impl.
    /// @param ethMultiVault MultiVault target for the instance (fixed for its lifetime)
    /// @param depositFixedFee Initial fixed fee per deposit (wei)
    /// @param depositPercentageFee Initial percentage fee (base 10000)
    /// @param initialAdmins Whitelist admins (at least one non-zero)
    /// @return proxy Address of the freshly deployed versioned proxy
    function createProxy(
        address ethMultiVault,
        uint256 depositFixedFee,
        uint256 depositPercentageFee,
        address[] calldata initialAdmins
    ) external returns (address proxy) {
        address impl = currentImplementation;
        bytes32 version = currentVersion;

        bytes memory initData = abi.encodeCall(
            IIntuitionFeeProxyV2.initialize,
            (ethMultiVault, depositFixedFee, depositPercentageFee, initialAdmins)
        );

        address proxyAdmin_ = initialAdmins.length > 0 ? initialAdmins[0] : address(0);

        proxy = address(
            new IntuitionVersionedFeeProxy(proxyAdmin_, version, impl, initData)
        );

        proxiesByDeployer[msg.sender].push(proxy);
        allProxies.push(proxy);
        isProxyFromFactory[proxy] = true;

        emit ProxyCreated(
            proxy,
            msg.sender,
            impl,
            version,
            ethMultiVault,
            depositFixedFee,
            depositPercentageFee
        );
    }

    // ============ Views ============

    function getProxiesByDeployer(address deployer) external view returns (address[] memory) {
        return proxiesByDeployer[deployer];
    }

    function allProxiesLength() external view returns (uint256) {
        return allProxies.length;
    }

    function getAllProxies() external view returns (address[] memory) {
        return allProxies;
    }
}
