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

    /// @notice Fixed fee exceeds `MAX_FIXED_FEE` — caps admin rug potential by
    ///         blocking unreasonable fixed fees that would freeze user deposits.
    error IntuitionFeeProxy_FixedFeeTooHigh();

    // ============ V2 errors ============

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

    /// @notice Refund of excess `msg.value` to the caller failed
    error IntuitionFeeProxy_RefundFailed();

    // ============ Factory errors ============

    /// @notice Factory received an invalid implementation (zero address or not a contract)
    error IntuitionFeeProxyFactory_InvalidImplementation();

    /// @notice Factory received an invalid version identifier (bytes32(0))
    error IntuitionFeeProxyFactory_InvalidVersion();

    // ============ VersionedFeeProxy (ERC-7936) errors ============

    /// @notice Caller is not the proxy-admin (the address gated for registerVersion / setDefaultVersion / removeVersion)
    error VersionedFeeProxy_NotProxyAdmin();

    /// @notice Implementation address is zero or not a contract
    error VersionedFeeProxy_InvalidImplementation();

    /// @notice Version identifier is zero (reserved as "none")
    error VersionedFeeProxy_InvalidVersion();

    /// @notice Version already registered — use a new identifier
    error VersionedFeeProxy_VersionExists();

    /// @notice No implementation registered for this version
    error VersionedFeeProxy_VersionNotFound();

    /// @notice Cannot remove the current default version — switch default first
    error VersionedFeeProxy_CannotRemoveDefault();

    /// @notice Delegatecall into the versioned implementation failed without returndata
    error VersionedFeeProxy_DelegateCallFailed();

    /// @notice `acceptProxyAdmin` called by an address that is not the pending admin
    error VersionedFeeProxy_NotPendingProxyAdmin();

    // ============ Sponsored-proxy errors ============

    /// @notice Admin tried to credit / uncredit zero amount
    error Sponsored_NothingToCredit();

    /// @notice Admin tried to reclaim more credit than the user currently holds
    error Sponsored_InsufficientClaim();

    /// @notice Refund of unspent credit failed
    error Sponsored_RefundFailed();

    /// @notice Withdraw would breach the totalSponsoredCredit invariant (balance - amount < totalSponsoredCredit)
    error Sponsored_WithdrawBreachesCreditInvariant();

    /// @notice User has hit `maxClaimsPerWindow` in the current window
    error Sponsored_RateLimited();

    /// @notice User has hit `maxClaimVolumePerWindow` (cumulative TRUST) in the current window
    error Sponsored_VolumeLimited();

    /// @notice setClaimLimits called with zero max — zero is never "unlimited", it's zero
    error Sponsored_InvalidLimit();

    /// @notice The inverse-formula `deposit(3 args)` is disabled on the sponsored
    ///         channel — use `depositSponsored(4 args)` with an explicit `assets`
    ///         so the pool can finance the full tx cost (full-sponsorship).
    error Sponsored_UseDepositSponsored();

    /// @notice The tx's `totalRequired` cost exceeds `maxClaimPerTx` — admin must
    ///         raise the cap or the caller must request a smaller operation.
    error Sponsored_ExceedsMaxPerTx();

    /// @notice The shared pool holds less than `totalRequired` — admin must
    ///         top up via `fundPool` before this tx can go through.
    error Sponsored_InsufficientPool();
}
