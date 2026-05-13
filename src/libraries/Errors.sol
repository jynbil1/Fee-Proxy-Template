// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

/// @title Errors
/// @notice Custom errors for IntuitionFeeProxy contract
library Errors {
    /// @notice Caller is not a whitelisted admin
    error IntuitionFeeProxy_NotWhitelistedAdmin();

    /// @notice Insufficient ETH value sent with transaction
    error IntuitionFeeProxy_InsufficientValue();

    /// @notice Invalid multisig address (zero address)
    error IntuitionFeeProxy_InvalidMultisigAddress();

    /// @notice Invalid MultiVault address (zero address)
    error IntuitionFeeProxy_InvalidMultiVaultAddress();

    /// @notice ETH transfer to fee recipient failed
    error IntuitionFeeProxy_TransferFailed();

    /// @notice Array lengths do not match
    error IntuitionFeeProxy_WrongArrayLengths();

    /// @notice Zero address provided where not allowed
    error IntuitionFeeProxy_ZeroAddress();

    /// @notice Fee percentage exceeds maximum allowed (100%)
    error IntuitionFeeProxy_FeePercentageTooHigh();

    /// @notice Receiver must match the transaction sender
    error IntuitionFeeProxy_ReceiverMustBeSender();
}
