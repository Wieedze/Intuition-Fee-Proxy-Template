import { useEffect, useState } from 'react'
import type { Address } from 'viem'

import { modes, type StsTxRecord } from '@intuition-fee-proxy/safe-tx'

const DEN_STS_INTUITION = 'https://safe-transaction-intuition.onchainden.com'

/**
 * Fetch the list of pending (un-executed) Safe transactions for a Safe
 * from Den's Safe Transaction Service. Polls on `refreshKey` change.
 */
export function usePendingSafeTxs(safeAddress: Address | undefined) {
  const [txs, setTxs] = useState<StsTxRecord[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    if (!safeAddress) {
      setTxs([])
      return
    }
    let cancelled = false
    setIsLoading(true)
    setError(null)
    const sts = modes.apiKit.createApiKitClient({ txServiceUrl: DEN_STS_INTUITION })
    sts
      .getPendingTxs(safeAddress)
      .then((list) => {
        if (!cancelled) setTxs(list)
      })
      .catch((e) => {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message.split('\n')[0] : String(e)
          setError(msg)
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [safeAddress, refreshKey])

  return {
    txs,
    isLoading,
    error,
    refetch: () => setRefreshKey((k) => k + 1),
  }
}
