import { useEffect } from 'react'

import type { TabId } from '../types'

const VIEWER_ALLOWED: ReadonlyArray<TabId> = ['overview', 'metrics']

/**
 * Side-effect: if the user becomes a viewer (wallet disconnect or switched
 * to a non-admin account) while on a management-only tab, snap back to
 * Overview. Prevents stale management UI from lingering post-disconnect.
 */
export function useTabAutoSnap({
  isViewer,
  tab,
  setTab,
}: {
  isViewer: boolean
  tab: TabId
  setTab: (t: TabId) => void
}): void {
  useEffect(() => {
    if (isViewer && !VIEWER_ALLOWED.includes(tab)) {
      setTab('overview')
    }
  }, [isViewer, tab, setTab])
}
