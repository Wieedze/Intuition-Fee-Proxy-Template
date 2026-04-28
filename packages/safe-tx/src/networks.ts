import type { Address, Chain } from 'viem'
import { defineChain, getAddress } from 'viem'
import type { NetworkName, SafeNetworkConfig } from './types.js'

/**
 * Intuition mainnet (chain id 1155).
 *
 * Safe singleton addresses verified on-chain 2026-04-23. ProxyFactory and
 * fallbackHandler discovered from the Den-indexed creation tx of the
 * reference Safe (0xf10D442D0fB934D4037DC30769a6EfCf2f54F7B6, deployed
 * 2025-12-05).
 */
export const INTUITION_MAINNET: SafeNetworkConfig = {
  chainId: 1155,
  name: 'Intuition',
  shortName: 'int',
  rpcUrl: 'https://rpc.intuition.systems',
  blockExplorerUrl: 'https://explorer.intuition.systems',
  txServiceUrl: 'https://safe-transaction-intuition.onchainden.com',
  safeUiBaseUrl: 'https://safe.onchainden.com',
  safeContracts: {
    singletonV1_3_0_L2: getAddress('0xfb1bffC9d739B8D520DaF37dF666da4C687191EA'),
    singletonV1_4_1_L2: getAddress('0x29fcB43b46531BcA003ddC8FCB67FFE91900C762'),
    proxyFactory: getAddress('0xC22834581EbC8527d974F8a1c97E1bEA4EF910BC'),
    fallbackHandler: getAddress('0x017062a1dE2FE6b99BE3d9d37841FeD19F573804'),
  },
}

export const NETWORKS: Record<NetworkName, SafeNetworkConfig> = {
  'intuition-mainnet': INTUITION_MAINNET,
}

export function getNetwork(name: NetworkName): SafeNetworkConfig {
  return NETWORKS[name]
}

/**
 * Build a Den UI deep link for a given Safe on a given network.
 * Example: `https://safe.onchainden.com/home?safe=int:0xf10D...`
 */
export function buildSafeUiUrl(network: SafeNetworkConfig, safeAddress: Address): string {
  return `${network.safeUiBaseUrl}/home?safe=${network.shortName}:${safeAddress}`
}

/**
 * Build the Safe Transaction Service base path for the api-kit SDK.
 * api-kit expects URLs without a trailing slash and appends `/api/v1/...` itself.
 */
export function buildTxServiceApiUrl(network: SafeNetworkConfig): string {
  return network.txServiceUrl
}

/** Convert a SafeNetworkConfig into a viem Chain for createPublicClient / createWalletClient. */
export function getViemChain(network: SafeNetworkConfig): Chain {
  return defineChain({
    id: network.chainId,
    name: network.name,
    nativeCurrency: { name: 'Trust', symbol: 'TRUST', decimals: 18 },
    rpcUrls: {
      default: { http: [network.rpcUrl] },
      public: { http: [network.rpcUrl] },
    },
    blockExplorers: {
      default: { name: 'Explorer', url: network.blockExplorerUrl },
    },
  })
}
