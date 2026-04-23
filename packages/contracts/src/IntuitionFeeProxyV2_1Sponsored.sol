// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IntuitionFeeProxyV2Sponsored} from "./IntuitionFeeProxyV2Sponsored.sol";

/// @title IntuitionFeeProxyV2_1Sponsored
/// @notice Minimal-diff successor to V2Sponsored used to validate ERC-7936
///         version routing on sponsored proxies. Behaviour is identical to
///         V2Sponsored; the only observable differences are:
///           1. A `VersionUsed(bytes32, address)` event emitted on every
///              write-path call (via the inherited `_accrueFee` hook).
///           2. `version()` returns `"v2.1.0-sponsored"`.
/// @dev    Inherits V2Sponsored, which inherits V2. Overrides only the
///         internal `_accrueFee` hook and the `version()` label — storage
///         layout (V2 inline + V2Sponsored ERC-7201 namespaced) is untouched,
///         making it safe to register on any existing V2Sponsored proxy.
contract IntuitionFeeProxyV2_1Sponsored is IntuitionFeeProxyV2Sponsored {
    /// @notice Version label, kept in a constant for easy off-chain checks.
    bytes32 public constant VERSION_LABEL = bytes32("v2.1.0-sponsored");

    /// @notice Emitted before fee accounting on every write-path call.
    event VersionUsed(bytes32 indexed version, address indexed user);

    /// @inheritdoc IntuitionFeeProxyV2Sponsored
    function version() external pure override returns (string memory) {
        return "v2.1.0-sponsored";
    }

    /// @dev Overrides the V2 `_accrueFee` hook (reachable via V2Sponsored's
    ///      inheritance chain) to emit a version marker before fee accrual.
    function _accrueFee(uint256 fee, bytes32 operation, uint256 mvValue)
        internal
        virtual
        override
    {
        emit VersionUsed(VERSION_LABEL, msg.sender);
        super._accrueFee(fee, operation, mvValue);
    }
}
