import { useEffect, useState } from 'react'
import type { Address } from 'viem'
import { usePublicClient } from 'wagmi'
import { detectSafeStatus, type SafeStatus } from '../lib/safeDetection'

/**
 * Reactively detect whether an address is an EOA, a known Gnosis Safe,
 * or some other contract on the connected chain.
 *
 * Light memoization per address — the result for a given address is
 * stable across renders unless the chain changes.
 */
export function useSafeStatus(address: Address | undefined): SafeStatus {
  const client = usePublicClient()
  const [status, setStatus] = useState<SafeStatus>({ kind: 'unknown' })

  useEffect(() => {
    if (!client || !address) {
      setStatus({ kind: 'unknown' })
      return
    }
    let cancelled = false
    setStatus({ kind: 'unknown' })
    detectSafeStatus(client, address)
      .then((s) => {
        if (!cancelled) setStatus(s)
      })
      .catch(() => {
        if (!cancelled) setStatus({ kind: 'unknown' })
      })
    return () => {
      cancelled = true
    }
  }, [client, address])

  return status
}

/**
 * Multi-address variant. Returns a map keyed by lowercased address.
 */
export function useSafeStatuses(
  addresses: readonly Address[] | undefined,
): Record<string, SafeStatus> {
  const client = usePublicClient()
  const [statuses, setStatuses] = useState<Record<string, SafeStatus>>({})

  // Stable key for memo: comma-joined sorted addresses lowercased.
  const key = (addresses ?? []).map((a) => a.toLowerCase()).sort().join(',')

  useEffect(() => {
    if (!client || !addresses || addresses.length === 0) {
      setStatuses({})
      return
    }
    let cancelled = false
    Promise.all(
      addresses.map(async (addr) => {
        try {
          const s = await detectSafeStatus(client, addr)
          return [addr.toLowerCase(), s] as const
        } catch {
          return [addr.toLowerCase(), { kind: 'unknown' as const }] as const
        }
      }),
    ).then((entries) => {
      if (!cancelled) setStatuses(Object.fromEntries(entries))
    })
    return () => {
      cancelled = true
    }
  }, [client, key])

  return statuses
}
