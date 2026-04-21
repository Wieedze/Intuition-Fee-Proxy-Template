import { useEffect, useState } from 'react'

/**
 * Bridges the window between "tx mined" and "dependent read-query has
 * refetched fresh data". Useful when a write triggers a refetch whose
 * loading state should drive UI (spinner, row lock) — but by itself the
 * receipt settling too early leaves a gap where the old data is still
 * shown as if nothing changed.
 *
 * The caller:
 *   1. Watches a receipt's `isSuccess` and flips the returned `start()`
 *      once when the tx lands, to open the bridge.
 *   2. Passes the downstream query's `isFetching` (or `isLoading`) flag —
 *      the hook will clear the bridge once it goes false.
 *
 * Returns `{ active, start }` — `active` stays true across the gap.
 */
export function usePostTxRefreshing(
  isFetching: boolean,
): { active: boolean; start: () => void } {
  const [active, setActive] = useState(false)

  useEffect(() => {
    if (active && !isFetching) setActive(false)
  }, [active, isFetching])

  return { active, start: () => setActive(true) }
}
