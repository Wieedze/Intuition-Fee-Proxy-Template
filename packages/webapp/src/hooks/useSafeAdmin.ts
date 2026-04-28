import type { Address } from 'viem'
import { useAdmins } from './useProxy'
import { useSafeStatuses } from './useSafeStatus'

/**
 * Find the first Safe address in a proxy's admins list. Used by panels
 * to decide whether to surface a "Propose via Safe" path next to (or
 * instead of) the direct EOA write.
 *
 * Returns `safe = undefined` when no admin in the list resolves to a
 * known Safe singleton. Multiple Safes in the list are rare; we take
 * the first match — a future iteration can offer a picker if needed.
 */
export function useSafeAdmin(proxy: Address | undefined): {
  safe: Address | undefined
  isLoading: boolean
} {
  const { admins, isLoading } = useAdmins(proxy)
  const statuses = useSafeStatuses(admins)

  const safe = admins.find((addr) => statuses[addr.toLowerCase()]?.kind === 'safe')

  return { safe, isLoading }
}
