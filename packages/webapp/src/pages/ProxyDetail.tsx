import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { isAddress, type Address } from 'viem'
import { useAccount, useChainId } from 'wagmi'

import type { NetworkName, ProxyFamily } from '@intuition-fee-proxy/sdk'
import { networkFor } from '../lib/addresses'
import {
  useIsAdmin,
  useProxyChannel,
  useProxyMetrics,
  useProxyStats,
} from '../hooks/useProxy'
import {
  useProxyName,
  useProxyVersions,
} from '../hooks/useVersionedProxy'
import AddressDisplay from '../components/Address'
import { EditableName } from '../components/EditableName'
import { NewVersionBanner } from '../components/NewVersionBanner'
import { AdminsTab } from '../components/AdminsTab'
import { FeeTab } from '../components/FeeTab'
import { MetricsTab } from '../components/MetricsTab'
import { OverviewTab } from '../components/OverviewTab'
import { SponsoringTab } from '../components/SponsoringTab'
import { HistoryTab } from '../components/HistoryTab'
import { Tabs } from '../components/Tabs'
import { ViewerBanner } from '../components/ViewerBanner'
import { useProxyRoles } from '../hooks/useProxyRoles'
import { useTabAutoSnap } from '../hooks/useTabAutoSnap'
import type { TabId } from '../types'

export default function ProxyDetailPage() {
  const { address: proxyParam } = useParams()
  const proxy =
    proxyParam && isAddress(proxyParam) ? (proxyParam as Address) : undefined

  if (!proxy) {
    return (
      <div className="max-w-xl mx-auto">
        <h1 className="text-3xl font-bold">Proxy</h1>
        <p className="text-rose-400 mt-2 font-mono text-sm">
          Invalid proxy address in URL.
        </p>
      </div>
    )
  }

  return <ProxyDetail proxy={proxy} />
}

function ProxyDetail({ proxy }: { proxy: Address }) {
  const { address: account } = useAccount()
  const chainId = useChainId()
  const network: NetworkName = networkFor(chainId)

  const { stats, refetch: refetchStats, isLoading } = useProxyStats(proxy)
  const { isAdmin: isFeeAdmin } = useIsAdmin(proxy, account)
  const {
    versions,
    defaultVersion,
    proxyAdmin,
    pendingProxyAdmin,
    refetch: refetchVersions,
    isFetching: isVersionsFetching,
  } = useProxyVersions(proxy)
  const {
    metrics,
    unsupported: metricsUnsupported,
    isLoading: metricsLoading,
  } = useProxyMetrics(proxy)
  const {
    name,
    unsupported: nameUnsupported,
    refetch: refetchName,
  } = useProxyName(proxy)
  const { channel } = useProxyChannel(proxy)
  const family: ProxyFamily = channel === 'sponsored' ? 'sponsored' : 'standard'

  const { isProxyAdmin, isViewer } = useProxyRoles({
    account,
    proxyAdmin,
    isFeeAdmin,
  })

  const [tab, setTab] = useState<TabId>('overview')
  useTabAutoSnap({ isViewer, tab, setTab })

  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      <header className="space-y-1">
        <EditableName
          proxy={proxy}
          currentName={name}
          canEdit={isProxyAdmin}
          onDone={refetchName}
        />
        <div className="flex items-center gap-3 flex-wrap">
          <AddressDisplay value={proxy} variant="short" />
        </div>
        {nameUnsupported && isProxyAdmin && (
          <p className="text-xs text-subtle">
            This proxy was deployed with an older bytecode that doesn&apos;t
            support on-chain names. Redeploy from the Factory, or register
            and promote a newer implementation that exposes{' '}
            <code className="font-mono text-muted">setName</code>.
          </p>
        )}
      </header>

      {!isViewer && (
        <NewVersionBanner
          proxy={proxy}
          network={network}
          family={family}
          versions={versions}
          defaultVersion={defaultVersion}
          isProxyAdmin={isProxyAdmin}
          onDone={refetchVersions}
        />
      )}

      {isViewer && <ViewerBanner connected={Boolean(account)} />}

      <Tabs
        active={tab}
        onChange={setTab}
        isSponsored={channel === 'sponsored'}
        isViewer={isViewer}
      />

      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton h-20 rounded-xl" />
          ))}
        </div>
      )}

      {tab === 'overview' && stats && (
        <OverviewTab
          proxy={proxy}
          stats={stats}
          channel={channel}
          network={network}
          family={family}
          versions={versions}
          defaultVersion={defaultVersion}
          isProxyAdmin={isProxyAdmin}
          onVersionChange={refetchVersions}
        />
      )}

      {tab === 'fee' && stats && (
        <FeeTab
          proxy={proxy}
          stats={stats}
          isAdmin={isFeeAdmin}
          onWriteDone={refetchStats}
        />
      )}

      {tab === 'metrics' && (
        <MetricsTab
          proxy={proxy}
          metrics={metrics}
          isLoading={metricsLoading}
          unsupported={Boolean(metricsUnsupported)}
          isSponsored={channel === 'sponsored'}
        />
      )}

      {tab === 'admins' && (
        <AdminsTab
          proxy={proxy}
          proxyAdmin={proxyAdmin}
          pendingProxyAdmin={pendingProxyAdmin}
          account={account}
          isFeeAdmin={isFeeAdmin}
          isVersionsFetching={isVersionsFetching}
          onWriteDone={refetchVersions}
        />
      )}

      {tab === 'sponsoring' && channel === 'sponsored' && (
        <SponsoringTab proxy={proxy} isAdmin={isFeeAdmin} />
      )}

      {tab === 'history' && channel === 'sponsored' && (
        <HistoryTab proxy={proxy} isAdmin={isFeeAdmin} />
      )}
    </div>
  )
}
