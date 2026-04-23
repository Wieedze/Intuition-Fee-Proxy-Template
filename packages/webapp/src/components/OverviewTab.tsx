import type { Address, Hex } from 'viem'

import type { NetworkName, ProxyFamily } from '@intuition-fee-proxy/sdk'
import type { ProxyStats } from '../hooks/useProxy'
import { IntuitionAtomCard } from './IntuitionAtomCard'
import { Stat } from './Stat'
import { VersionsPanel } from './VersionsPanel'

interface Props {
  proxy: Address
  stats: ProxyStats
  channel: 'standard' | 'sponsored' | 'unknown'
  network: NetworkName
  family: ProxyFamily
  versions: Hex[]
  defaultVersion: Hex | undefined
  isProxyAdmin: boolean
  onVersionChange: () => void
}

export function OverviewTab({
  proxy,
  stats,
  channel,
  network,
  family,
  versions,
  defaultVersion,
  isProxyAdmin,
  onVersionChange,
}: Props) {
  return (
    <div className="space-y-10">
      <section className="grid gap-4 sm:grid-cols-3">
        <Stat
          label="Channel"
          value={channel === 'sponsored' ? 'Sponsored' : 'Standard'}
        />
        <Stat label="Admins" value={stats.adminCount.toString()} />
        <Stat label="MultiVault" value={stats.ethMultiVault} mono />
      </section>

      <IntuitionAtomCard proxy={proxy} multiVault={stats.ethMultiVault} />

      <VersionsPanel
        proxy={proxy}
        network={network}
        family={family}
        versions={versions}
        defaultVersion={defaultVersion}
        isProxyAdmin={isProxyAdmin}
        onDone={onVersionChange}
      />
    </div>
  )
}
