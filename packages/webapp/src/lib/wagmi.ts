import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { defineChain } from 'viem'
import { INTUITION_MAINNET, INTUITION_TESTNET } from '@intuition-fee-proxy/sdk'

// Re-wrap the plain SDK chain objects with viem's defineChain so they satisfy
// wagmi's `Chain` type (and benefit from the proper branding).
export const intuitionMainnet = defineChain({
  ...INTUITION_MAINNET,
  rpcUrls: { default: { http: [...INTUITION_MAINNET.rpcUrls.default.http] } },
})

export const intuitionTestnet = defineChain({
  ...INTUITION_TESTNET,
  rpcUrls: { default: { http: [...INTUITION_TESTNET.rpcUrls.default.http] } },
})

/** Local Hardhat node for dev. Enabled automatically when DEV. */
export const hardhatLocal = defineChain({
  id: 31337,
  name: 'Hardhat (local)',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['http://127.0.0.1:8545'] } },
  testnet: true,
})

const projectId =
  (import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined) ??
  'dev-placeholder-project-id'

const chains = import.meta.env.DEV
  ? ([intuitionMainnet, intuitionTestnet, hardhatLocal] as const)
  : ([intuitionMainnet, intuitionTestnet] as const)

export const wagmiConfig = getDefaultConfig({
  appName: 'Intuition Fee Proxy Factory',
  projectId,
  chains,
  ssr: false,
})
