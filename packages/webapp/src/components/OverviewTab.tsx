import type { Address, Hex } from 'viem'

import type { NetworkName, ProxyFamily } from '@intuition-fee-proxy/sdk'
import type { ProxyStats } from '../hooks/useProxy'
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

      {channel === 'sponsored' && (
        <div className="card">
          <div className="text-[10px] font-mono uppercase tracking-widest text-brand mb-2">
            Sponsored channel
          </div>
          <p className="text-sm text-muted leading-relaxed">
            This proxy runs the sponsored-channel implementation. Admins top
            the pool up whenever they need to; any user interacting with the
            proxy draws from it transparently via{' '}
            <code className="font-mono text-ink">deposit</code> /{' '}
            <code className="font-mono text-ink">createAtoms</code> with
            reduced or zero{' '}
            <code className="font-mono text-ink">msg.value</code>. Rate limits
            bound drain per user.
          </p>
        </div>
      )}

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
