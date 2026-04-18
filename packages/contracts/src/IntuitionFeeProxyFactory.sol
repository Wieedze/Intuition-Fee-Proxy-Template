// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {IIntuitionFeeProxyV2} from "./interfaces/IIntuitionFeeProxyV2.sol";
import {Errors} from "./libraries/Errors.sol";

/// @title IntuitionFeeProxyFactory
/// @notice Permissionless factory that deploys ERC1967 proxies pointing at an
///         `IntuitionFeeProxyV2` implementation and initializes them in one shot.
/// @dev
///  - Deployment is free and unrestricted. Anyone may create their own fee-proxy instance.
///  - `setImplementation` only affects *future* deployments; existing proxies manage their
///    own upgrade path via UUPS.
///  - No CREATE2 — addresses are discoverable via the `ProxyCreated` event.
contract IntuitionFeeProxyFactory is Ownable {
    // ============ Storage ============

    /// @notice Implementation used for new deployments
    address public currentImplementation;

    /// @notice Proxies deployed by a given caller, in chronological order
    mapping(address => address[]) public proxiesByDeployer;

    /// @notice Flat list of every proxy ever created by this factory
    address[] public allProxies;

    /// @notice Quick membership check for consumers that verify provenance
    mapping(address => bool) public isProxyFromFactory;

    // ============ Events ============

    event ProxyCreated(
        address indexed proxy,
        address indexed deployer,
        address indexed implementation,
        address ethMultiVault,
        uint256 depositFixedFee,
        uint256 depositPercentageFee
    );

    event ImplementationUpdated(address indexed oldImpl, address indexed newImpl);

    // ============ Constructor ============

    /// @param initialImplementation_ First `IntuitionFeeProxyV2` implementation pointer
    constructor(address initialImplementation_) Ownable(msg.sender) {
        _setImplementation(initialImplementation_);
    }

    // ============ Admin (owner) ============

    /// @notice Update the implementation used for subsequent `createProxy` calls.
    /// @dev Existing proxies are unaffected — each manages its own UUPS upgrade.
    function setImplementation(address newImpl) external onlyOwner {
        _setImplementation(newImpl);
    }

    function _setImplementation(address newImpl) internal {
        if (newImpl == address(0) || newImpl.code.length == 0) {
            revert Errors.IntuitionFeeProxyFactory_InvalidImplementation();
        }
        address old = currentImplementation;
        currentImplementation = newImpl;
        emit ImplementationUpdated(old, newImpl);
    }

    // ============ Deployment ============

    /// @notice Deploy a new fee-proxy instance and initialize it.
    /// @param ethMultiVault MultiVault target for the instance (fixed for its lifetime)
    /// @param depositFixedFee Initial fixed fee per deposit (wei)
    /// @param depositPercentageFee Initial percentage fee (base 10000)
    /// @param initialAdmins Whitelist admins for the new instance (at least one non-zero)
    /// @return proxy Address of the freshly deployed ERC1967 proxy
    function createProxy(
        address ethMultiVault,
        uint256 depositFixedFee,
        uint256 depositPercentageFee,
        address[] calldata initialAdmins
    ) external returns (address proxy) {
        address impl = currentImplementation;
        bytes memory initData = abi.encodeCall(
            IIntuitionFeeProxyV2.initialize,
            (ethMultiVault, depositFixedFee, depositPercentageFee, initialAdmins)
        );

        proxy = address(new ERC1967Proxy(impl, initData));

        proxiesByDeployer[msg.sender].push(proxy);
        allProxies.push(proxy);
        isProxyFromFactory[proxy] = true;

        emit ProxyCreated(
            proxy,
            msg.sender,
            impl,
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
