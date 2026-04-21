// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {Ownable2StepUpgradeable} from "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";

import {IntuitionVersionedFeeProxy} from "./IntuitionVersionedFeeProxy.sol";
import {IIntuitionFeeProxyV2} from "./interfaces/IIntuitionFeeProxyV2.sol";
import {Errors} from "./libraries/Errors.sol";

/// @dev Channel flavor a caller can select on `createProxy`.
enum ProxyChannel {
    Standard,
    Sponsored
}

/// @title IntuitionFeeProxyFactory
/// @notice Permissionless factory that deploys ERC-7936 versioned proxies
///         (`IntuitionVersionedFeeProxy`) pointing at one of two channels of
///         `IntuitionFeeProxyV2`-family logic (standard or sponsored), and
///         initializes them in one shot.
/// @dev
///  - Upgradeable (UUPS). `_authorizeUpgrade` is `onlyOwner` — the factory owner
///    is meant to be the project Gnosis Safe.
///  - Deployment of new fee-proxies is free and unrestricted. Anyone may create
///    their own instance.
///  - Two channels:
///      * standard   = `IntuitionFeeProxyV2` (fee-layer, msg.sender is always receiver)
///      * sponsored  = `IntuitionFeeProxyV2Sponsored` (adds credit-balance sponsoring + depositFor)
///    A caller picks one at deploy time via the `sponsored` flag on `createProxy`.
///    Cross-channel registerVersion on a proxy is possible but FORBIDDEN in practice:
///    standard storage layout and sponsored storage layout use ERC-7201 namespacing,
///    but switching strips away the credit-invariant protection and orphans sponsor
///    funds. Proxy-admins must only register versions from the same channel family.
///  - `setImplementation` / `setSponsoredImplementation` update the impl pointer
///    used by future `createProxy` calls in their respective channels. Existing
///    proxies are untouched — each manages its own versioning via the ERC-7936
///    interface on the proxy itself.
///  - No CREATE2 — addresses are discoverable via `ProxyCreated` events.
contract IntuitionFeeProxyFactory is
    Initializable,
    Ownable2StepUpgradeable,
    UUPSUpgradeable
{
    // ============ Metadata ============

    /// @notice Human-readable semver of the Factory's own logic. Bumped on
    ///         each UUPS upgrade (`_authorizeUpgrade` gated by `onlyOwner`).
    ///         Consumers read this to prove which bytecode is actually live
    ///         behind the Factory proxy.
    string public constant VERSION = "1.0.0";

    // ============ Storage ============

    /// @notice Standard-channel implementation used for new deployments
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

    /// @notice Sponsored-channel implementation used for new deployments
    ///         (IntuitionFeeProxyV2Sponsored). `address(0)` = sponsored channel
    ///         not configured yet; createProxy with sponsored=true will revert.
    address public sponsoredImplementation;

    /// @notice Version identifier for the sponsored-channel implementation
    bytes32 public sponsoredVersion;

    /// @dev 7 slots used above → 43 gap
    uint256[43] private __gap;

    // ============ Events ============

    event ProxyCreated(
        address indexed proxy,
        address indexed deployer,
        address indexed implementation,
        bytes32 initialVersion,
        address ethMultiVault,
        uint256 depositFixedFee,
        uint256 depositPercentageFee,
        bytes32 name,
        ProxyChannel channel
    );

    event ImplementationUpdated(
        address indexed oldImpl,
        address indexed newImpl,
        bytes32 oldVersion,
        bytes32 newVersion
    );

    event SponsoredImplementationUpdated(
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

    /// @notice Update the standard-channel implementation + version used for
    ///         subsequent `createProxy(..., Standard)` calls.
    function setImplementation(address newImpl, bytes32 newVersion) external onlyOwner {
        _setImplementation(newImpl, newVersion);
    }

    /// @notice Update the sponsored-channel implementation + version used for
    ///         subsequent `createProxy(..., Sponsored)` calls. Passing
    ///         `address(0)` disables the channel (not recommended — prefer
    ///         pointing at a retiring version).
    function setSponsoredImplementation(address newImpl, bytes32 newVersion) external onlyOwner {
        if (newImpl != address(0)) {
            if (newImpl.code.length == 0) {
                revert Errors.IntuitionFeeProxyFactory_InvalidImplementation();
            }
            if (newVersion == bytes32(0)) {
                revert Errors.IntuitionFeeProxyFactory_InvalidVersion();
            }
        }
        address oldImpl = sponsoredImplementation;
        bytes32 oldVersion = sponsoredVersion;
        sponsoredImplementation = newImpl;
        sponsoredVersion = newVersion;
        emit SponsoredImplementationUpdated(oldImpl, newImpl, oldVersion, newVersion);
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
    /// @param name Optional human-readable label (bytes32(0) for none; editable later by proxy-admin)
    /// @param channel `Standard` or `Sponsored` — picks the implementation family
    /// @return proxy Address of the freshly deployed versioned proxy
    function createProxy(
        address ethMultiVault,
        uint256 depositFixedFee,
        uint256 depositPercentageFee,
        address[] calldata initialAdmins,
        bytes32 name,
        ProxyChannel channel
    ) external returns (address proxy) {
        (address impl, bytes32 version) = _implFor(channel);

        bytes memory initData = abi.encodeCall(
            IIntuitionFeeProxyV2.initialize,
            (ethMultiVault, depositFixedFee, depositPercentageFee, initialAdmins)
        );

        address proxyAdmin_ = initialAdmins.length > 0 ? initialAdmins[0] : address(0);

        proxy = address(
            new IntuitionVersionedFeeProxy(proxyAdmin_, version, impl, initData, name)
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
            depositPercentageFee,
            name,
            channel
        );
    }

    function _implFor(ProxyChannel channel) internal view returns (address impl, bytes32 version) {
        if (channel == ProxyChannel.Sponsored) {
            impl = sponsoredImplementation;
            version = sponsoredVersion;
        } else {
            impl = currentImplementation;
            version = currentVersion;
        }
        if (impl == address(0)) {
            revert Errors.IntuitionFeeProxyFactory_InvalidImplementation();
        }
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
