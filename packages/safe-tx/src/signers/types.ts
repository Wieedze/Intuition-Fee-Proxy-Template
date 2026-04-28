import type { LocalAccount } from 'viem'

/**
 * A signer is anything that can produce EIP-712 signatures for Safe
 * transactions. We alias viem's `LocalAccount` so all strategies (env,
 * ledger, walletconnect) expose the same shape and can be passed
 * uniformly to protocol-kit / api-kit / our direct-sign mode.
 */
export type Signer = LocalAccount
