import type { Address } from 'viem'

/**
 * Safe contract addresses deployed on a given chain.
 *
 * Intuition mainnet uses the canonical Safe v1.3.0 L2 singleton, but the
 * ProxyFactory was redeployed by Den at a non-canonical address. MultiSend
 * is omitted until batch support lands.
 */
export type SafeContracts = {
  singletonV1_3_0_L2: Address
  singletonV1_4_1_L2: Address
  proxyFactory: Address
  fallbackHandler: Address
}

/**
 * Per-network configuration for the Safe admin tooling.
 *
 * `txServiceUrl` is the base URL of a Safe Transaction Service compatible
 * backend. For Intuition mainnet this is hosted by Den.
 */
export type SafeNetworkConfig = {
  chainId: number
  name: string
  shortName: string
  rpcUrl: string
  blockExplorerUrl: string
  txServiceUrl: string
  safeUiBaseUrl: string
  safeContracts: SafeContracts
}

/**
 * Identifier for a known network. Only mainnet is supported — testnet
 * Intuition (13579) has no Safe infrastructure.
 */
export type NetworkName = 'intuition-mainnet'
