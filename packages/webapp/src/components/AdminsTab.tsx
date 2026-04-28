import type { Address } from 'viem'

import { useSafeAdmin } from '../hooks/useSafeAdmin'
import { AdminsPanel } from './AdminsPanel'
import { PendingSafeTxsPanel } from './PendingSafeTxsPanel'
import { UpgradeAuthorityPanel } from './UpgradeAuthorityPanel'

interface Props {
  proxy: Address
  proxyAdmin: Address | undefined
  pendingProxyAdmin: Address | undefined
  account: Address | undefined
  isFeeAdmin: boolean
  isVersionsFetching: boolean
  onWriteDone: () => void
}

export function AdminsTab({
  proxy,
  proxyAdmin,
  pendingProxyAdmin,
  account,
  isFeeAdmin,
  isVersionsFetching,
  onWriteDone,
}: Props) {
  const { safe: feeAdminSafe } = useSafeAdmin(proxy)
  return (
    <div className="space-y-6">
      <p className="text-xs text-muted leading-relaxed max-w-3xl">
        Two independent admin roles — disjoint by design so that a compromise
        of one cannot be leveraged into the other. Most setups use a single
        Safe for both; splitting is an option if your dev team and ops team
        are distinct.
      </p>
      <UpgradeAuthorityPanel
        proxy={proxy}
        proxyAdmin={proxyAdmin}
        pendingProxyAdmin={pendingProxyAdmin}
        account={account}
        isConnectedFeeAdmin={isFeeAdmin}
        onTransferred={onWriteDone}
        isRefreshing={isVersionsFetching}
      />
      <AdminsPanel proxy={proxy} connectedAccount={account} />
      {feeAdminSafe && <PendingSafeTxsPanel safe={feeAdminSafe} />}
    </div>
  )
}
