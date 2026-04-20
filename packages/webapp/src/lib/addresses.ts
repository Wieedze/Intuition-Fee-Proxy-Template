import { V2_ADDRESSES } from '@intuition-fee-proxy/sdk'
import type { Address } from 'viem'

type Network = 'mainnet' | 'testnet'

const DEV_FACTORY = import.meta.env.VITE_FACTORY_ADDRESS as Address | undefined

/**
 * Factory address per network. Standard / sponsored impls are read live
 * from the Factory on-chain — no SDK snapshot (single source of truth).
 * Dev override via `VITE_FACTORY_ADDRESS` takes precedence on testnet so
 * you can point the webapp at a local/hardhat deploy without touching
 * the SDK.
 */
export function addressesFor(network: Network): {
  factory: Address
} {
  if (network === 'testnet' && DEV_FACTORY) {
    return { factory: DEV_FACTORY }
  }
  const entry = V2_ADDRESSES[network]
  return {
    factory: entry.factory as Address,
  }
}

/** Pick the active network based on the connected chainId (fallback: testnet). */
export function networkFor(chainId: number | undefined): Network {
  return chainId === 1155 ? 'mainnet' : 'testnet'
}
