import type { Address } from 'viem'

export interface ProxyRoles {
  /** True when the connected wallet is a whitelisted fee admin (Role 2). */
  isFeeAdmin: boolean
  /** True when the connected wallet is the on-chain proxyAdmin (Role 1). */
  isProxyAdmin: boolean
  /** True when the connected wallet holds both roles simultaneously. */
  hasBothRoles: boolean
  /** True when the connected wallet holds neither role (= read-only view). */
  isViewer: boolean
}

/**
 * Derives the four role booleans from `account` + `proxyAdmin` + a precomputed
 * `isFeeAdmin`. Pure — no side effects, no wagmi calls.
 */
export function useProxyRoles({
  account,
  proxyAdmin,
  isFeeAdmin,
}: {
  account: Address | undefined
  proxyAdmin: Address | undefined
  isFeeAdmin: boolean
}): ProxyRoles {
  const isProxyAdmin = Boolean(
    account && proxyAdmin && account.toLowerCase() === proxyAdmin.toLowerCase(),
  )
  const hasBothRoles = isProxyAdmin && isFeeAdmin
  const isViewer = !isFeeAdmin && !isProxyAdmin

  return { isFeeAdmin, isProxyAdmin, hasBothRoles, isViewer }
}
