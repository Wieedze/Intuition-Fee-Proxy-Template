// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Pulls the OpenZeppelin `ERC1967Proxy` into the compile set so tests
///         can call `ethers.getContractFactory("ERC1967Proxy")`. Nothing else
///         imports it directly (the Factory inherits UUPS via `contracts-upgradeable`),
///         so without this shim Hardhat skips the artifact after `hardhat clean`.
// solhint-disable-next-line no-unused-import
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
