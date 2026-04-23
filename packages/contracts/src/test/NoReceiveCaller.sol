// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

/// @title NoReceiveCaller
/// @notice Test-only stand-in for a smart-contract wallet that CANNOT receive
///         ETH (no `receive()` or payable `fallback()`). Used to exercise the
///         `pendingRefunds` fallback on V2 / V2Sponsored: a refund `.call`
///         targeted at this contract reverts, the outer tx should still
///         succeed and queue the excess for later pull.
contract NoReceiveCaller {
    /// @notice Forwards a call to `target` with `msg.value`, so the outer
    ///         msg.sender seen by `target` is this contract's address.
    /// @dev    Intentionally has no `receive()` / `fallback()` — any ETH
    ///         transfer coming back (e.g. refund) reverts. Callers proving
    ///         that the proxy's refund fallback kicks in rely on this.
    function forward(address target, bytes calldata data) external payable returns (bytes memory) {
        (bool ok, bytes memory ret) = target.call{value: msg.value}(data);
        if (!ok) {
            // bubble up revert data
            assembly {
                revert(add(ret, 0x20), mload(ret))
            }
        }
        return ret;
    }
}
