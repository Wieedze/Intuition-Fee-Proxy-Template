// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IntuitionFeeProxyV2} from "./IntuitionFeeProxyV2.sol";

/// @title IntuitionFeeProxyV2_1
/// @notice Minimal-diff successor to V2 used to validate ERC-7936 version
///         routing in production. Behaviour is identical to V2; the only
///         observable difference is a `VersionUsed(bytes32,address)` event
///         emitted on every write-path call, which lets off-chain tooling
///         (webapp Metrics panel, indexers, etherscan) prove which impl
///         actually ran for any given tx.
/// @dev    Inherits V2 wholesale. The only override is `_accrueFee`, which
///         every payable entry point in V2 already calls — so a single line
///         of new logic covers deposit / depositBatch / createAtoms /
///         createTriples without duplicating bodies. Storage layout is
///         untouched (V2's `__gap` absorbs any future additions; this
///         contract itself adds zero storage), making it safe to register
///         on any existing V2 proxy via `setDefaultVersion`.
contract IntuitionFeeProxyV2_1 is IntuitionFeeProxyV2 {
    /// @notice Version label, kept in a constant for easy off-chain checks.
    bytes32 public constant VERSION_LABEL = bytes32("v2.1.0");

    /// @notice Emitted before fee accounting on every write-path call.
    /// @param  version  The V2.1 label, so indexers can filter on it.
    /// @param  user     msg.sender — the wallet whose tx ran under v2.1.0.
    event VersionUsed(bytes32 indexed version, address indexed user);

    /// @inheritdoc IntuitionFeeProxyV2
    function _accrueFee(uint256 fee, string memory operation, uint256 mvValue)
        internal
        virtual
        override
    {
        emit VersionUsed(VERSION_LABEL, msg.sender);
        super._accrueFee(fee, operation, mvValue);
    }
}
