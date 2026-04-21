import { MULTIVAULT_ADDRESSES, V2_ADDRESSES } from '@intuition-fee-proxy/sdk'
import type { Address } from 'viem'

type Network = 'mainnet' | 'testnet'

const DEV_FACTORY = import.meta.env.VITE_FACTORY_ADDRESS as Address | undefined
const DEV_MULTIVAULT = import.meta.env.VITE_MULTIVAULT_ADDRESS as
  | Address
  | undefined

/**
 * Factory + MultiVault addresses per network. Standard / sponsored impls
 * are read live from the Factory on-chain — no SDK snapshot (single
 * source of truth).
 * Dev overrides via `VITE_FACTORY_ADDRESS` and `VITE_MULTIVAULT_ADDRESS`
 * take precedence on testnet so you can point the webapp at a
 * local/hardhat deploy without touching the SDK. On a fresh local node,
 * the real testnet MV has no code — using its address would trip the
 * V2 initializer's `code.length > 0` guard and revert.
 */
export function addressesFor(network: Network): {
  factory: Address
  multiVault: Address
} {
  if (network === 'testnet') {
    return {
      factory: (DEV_FACTORY ?? V2_ADDRESSES[network].factory) as Address,
      multiVault: (DEV_MULTIVAULT ?? MULTIVAULT_ADDRESSES[network]) as Address,
    }
  }
  return {
    factory: V2_ADDRESSES[network].factory as Address,
    multiVault: MULTIVAULT_ADDRESSES[network] as Address,
  }
}

/** Pick the active network based on the connected chainId (fallback: testnet). */
export function networkFor(chainId: number | undefined): Network {
  return chainId === 1155 ? 'mainnet' : 'testnet'
}
