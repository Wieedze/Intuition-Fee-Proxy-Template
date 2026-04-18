// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

/// @title Errors
/// @notice Custom errors for IntuitionFeeProxy (V1 + V2) and Factory
library Errors {
    // ============ V1 errors (kept for backward compatibility) ============

    /// @notice Caller is not a whitelisted admin
    error IntuitionFeeProxy_NotWhitelistedAdmin();

    /// @notice Insufficient ETH value sent with transaction
    error IntuitionFeeProxy_InsufficientValue();

    /// @notice Invalid multisig address (zero address) — V1 legacy
    error IntuitionFeeProxy_InvalidMultisigAddress();

    /// @notice Invalid MultiVault address (zero address)
    error IntuitionFeeProxy_InvalidMultiVaultAddress();

    /// @notice ETH transfer to fee recipient failed — V1 legacy
    error IntuitionFeeProxy_TransferFailed();

    /// @notice Array lengths do not match
    error IntuitionFeeProxy_WrongArrayLengths();

    /// @notice Zero address provided where not allowed
    error IntuitionFeeProxy_ZeroAddress();

    /// @notice Fee percentage exceeds maximum allowed (100%)
    error IntuitionFeeProxy_FeePercentageTooHigh();

    // ============ V2 errors ============

    /// @notice `receiver` parameter differs from `msg.sender` — V2 fee-layer is pure, no sponsoring
    error IntuitionFeeProxy_ReceiverNotSender();

    /// @notice Withdraw attempted while `accumulatedFees` is zero
    error IntuitionFeeProxy_NothingToWithdraw();

    /// @notice Withdraw amount exceeds `accumulatedFees`
    error IntuitionFeeProxy_InsufficientAccumulatedFees();

    /// @notice Low-level call to withdraw recipient failed
    error IntuitionFeeProxy_WithdrawFailed();

    /// @notice `initialize` received an empty admin list
    error IntuitionFeeProxy_NoAdminsProvided();

    /// @notice Admin tried to revoke themselves while being the last remaining admin
    error IntuitionFeeProxy_LastAdminCannotRevoke();

    /// @notice Direct ETH transfer rejected (no `receive()` in V2) — kept for documentation
    error IntuitionFeeProxy_DirectTransferNotAllowed();

    // ============ Factory errors ============

    /// @notice Factory received an invalid implementation (zero address or not a contract)
    error IntuitionFeeProxyFactory_InvalidImplementation();
}
