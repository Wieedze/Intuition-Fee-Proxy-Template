import { Link } from 'react-router-dom'
import { formatEther, type Address as AddrType } from 'viem'

import { useAllProxies } from '../hooks/useFactory'
import { useProxyName } from '../hooks/useVersionedProxy'
import {
  useProxyChannel,
  useProxyMetrics,
  useProxyStats,
} from '../hooks/useProxy'
import {
  useSponsorPool,
  useSponsoredMetrics,
} from '../hooks/useSponsoredProxy'
import Address from '../components/Address'

export default function ExplorePage() {
  const { proxies, isLoading, factory, error } = useAllProxies()

  if (!factory) {
    return (
      <div className="max-w-xl mx-auto space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-ink">
          Explore
        </h1>
        <p className="text-muted">
          Factory address not configured for this network.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <p className="text-muted max-w-2xl">
        Every proxy ever deployed through the factory. Read-only —
        open one to inspect its fees, admins and full metrics.
      </p>

      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton h-44" />
          ))}
        </div>
      )}

      {error && (
        <p className="text-sm font-mono text-rose-400">
          {error.message.split('\n')[0]}
        </p>
      )}

      {!isLoading && proxies.length === 0 && (
        <div className="rounded-xl border border-dashed border-line bg-surface p-10 text-center text-sm text-subtle">
          No proxies deployed yet.
        </div>
      )}

      {proxies.length > 0 && (
        <>
          <div className="text-xs font-mono uppercase tracking-wider text-subtle">
            {proxies.length} {proxies.length === 1 ? 'proxy' : 'proxies'}
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {proxies.map((addr) => (
              <ExploreCard key={addr} addr={addr} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function ExploreCard({ addr }: { addr: AddrType }) {
  const { name } = useProxyName(addr)
  const { channel } = useProxyChannel(addr)
  const { metrics } = useProxyMetrics(addr)
  const { stats } = useProxyStats(addr)
  const { balance: poolBalance } = useSponsorPool(addr)
  const { metrics: sMetrics } = useSponsoredMetrics(addr)

  const isSponsored = channel === 'sponsored'
  const badgeBorder = isSponsored ? 'border-[#e8a04a]/60' : 'border-brand/50'
  const badgeBg = isSponsored ? 'bg-[#e8a04a]/[0.08]' : 'bg-brand/[0.06]'
  const badgeText = isSponsored ? 'text-[#e8a04a]' : 'text-brand'

  return (
    <Link
      to={`/proxy/${addr}`}
      className="group rounded-xl border border-line bg-surface p-5 hover:border-line-strong transition-colors flex flex-col gap-4"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex flex-col gap-0.5">
          {name ? (
            <span className="truncate font-medium text-ink">{name}</span>
          ) : null}
          <Address value={addr} variant="short" copy={false} />
        </div>
        <span
          className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider ${badgeBorder} ${badgeBg} ${badgeText}`}
        >
          {isSponsored ? 'Sponsored' : 'Fee'}
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-y-3 gap-x-4">
        {isSponsored ? (
          <>
            <Stat
              label="Pool balance"
              value={
                poolBalance !== undefined ? formatTrustShort(poolBalance) : '—'
              }
            />
            <Stat
              label="Sponsored deposits"
              value={sMetrics ? formatCount(sMetrics.sponsoredDeposits) : '—'}
            />
            <Stat
              label="Receivers"
              value={
                sMetrics ? formatCount(sMetrics.uniqueSponsoredReceivers) : '—'
              }
            />
            <Stat
              label="Sponsored volume"
              value={sMetrics ? formatTrustShort(sMetrics.sponsoredVolume) : '—'}
            />
          </>
        ) : (
          <>
            <Stat
              label="Deposits"
              value={metrics ? formatCount(metrics.totalDeposits) : '—'}
            />
            <Stat
              label="Volume"
              value={metrics ? formatTrustShort(metrics.totalVolume) : '—'}
            />
            <Stat
              label="Users"
              value={metrics ? formatCount(metrics.totalUniqueUsers) : '—'}
            />
            <Stat
              label="Fees accrued"
              value={stats ? formatTrustShort(stats.accumulatedFees) : '—'}
            />
          </>
        )}
      </dl>

      <div className="flex items-center justify-between pt-3 border-t border-line text-xs text-subtle">
        <span>
          {stats ? stats.adminCount.toString() : '—'}{' '}
          {stats && stats.adminCount === 1n ? 'admin' : 'admins'}
        </span>
        <span className="text-muted group-hover:text-ink transition-colors">
          View →
        </span>
      </div>
    </Link>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-mono uppercase tracking-wider text-subtle">
        {label}
      </dt>
      <dd className="mt-0.5 font-mono text-sm text-ink">{value}</dd>
    </div>
  )
}

function formatCount(n: bigint): string {
  return Number(n).toLocaleString()
}

function formatTrustShort(wei: bigint): string {
  if (wei === 0n) return '0'
  const eth = Number(formatEther(wei))
  if (eth < 0.001) return '<0.001'
  if (eth >= 1000) return `${(eth / 1000).toFixed(1)}K`
  if (eth >= 1) return eth.toFixed(2).replace(/\.?0+$/, '')
  return eth.toFixed(3).replace(/\.?0+$/, '')
}
