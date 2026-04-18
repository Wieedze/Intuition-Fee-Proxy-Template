import { V2_ADDRESSES } from '@intuition-fee-proxy/sdk'
import type { Address } from 'viem'

type Network = 'mainnet' | 'testnet'

const DEV_FACTORY = import.meta.env.VITE_FACTORY_ADDRESS as Address | undefined
const DEV_IMPL = import.meta.env.VITE_IMPLEMENTATION_ADDRESS as Address | undefined

/**
 * Factory + implementation addresses per network.
 * Dev override via env vars takes precedence on testnet so you can point the
 * webapp at a local/hardhat deploy without touching the SDK.
 */
export function addressesFor(network: Network): {
  factory: Address
  implementation: Address
} {
  if (network === 'testnet' && DEV_FACTORY && DEV_IMPL) {
    return { factory: DEV_FACTORY, implementation: DEV_IMPL }
  }
  const entry = V2_ADDRESSES[network]
  return {
    factory: entry.factory as Address,
    implementation: entry.implementation as Address,
  }
}

/** Pick the active network based on the connected chainId (fallback: testnet). */
export function networkFor(chainId: number | undefined): Network {
  return chainId === 1155 ? 'mainnet' : 'testnet'
}
