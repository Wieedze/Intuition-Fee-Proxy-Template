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

const projectId =
  (import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined) ??
  'dev-placeholder-project-id'

export const wagmiConfig = getDefaultConfig({
  appName: 'Intuition Fee Proxy Factory',
  projectId,
  chains: [intuitionMainnet, intuitionTestnet],
  ssr: false,
})
