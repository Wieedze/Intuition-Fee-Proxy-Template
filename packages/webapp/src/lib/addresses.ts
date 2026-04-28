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
 *
 * Dev overrides via `VITE_FACTORY_ADDRESS` and `VITE_MULTIVAULT_ADDRESS`
 * take precedence on either network when set — set them in
 * packages/webapp/.env.local to point the webapp at a local hardhat /
 * Anvil-fork deploy without touching the SDK. The .env.local is
 * gitignored and never ships in a prod build.
 */
export function addressesFor(network: Network): {
  factory: Address
  multiVault: Address
} {
  return {
    factory: (DEV_FACTORY ?? V2_ADDRESSES[network].factory) as Address,
    multiVault: (DEV_MULTIVAULT ?? MULTIVAULT_ADDRESSES[network]) as Address,
  }
}

/** Pick the active network based on the connected chainId (fallback: testnet). */
export function networkFor(chainId: number | undefined): Network {
  return chainId === 1155 ? 'mainnet' : 'testnet'
}
