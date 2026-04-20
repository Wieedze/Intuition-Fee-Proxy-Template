import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  formatEther,
  hexToString,
  type Address as AddrType,
  type Hex,
} from 'viem'
import { useReadContracts } from 'wagmi'

import { IntuitionVersionedFeeProxyABI } from '@intuition-fee-proxy/sdk'
import { useAllProxies } from '../hooks/useFactory'
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

const versionedAbi = IntuitionVersionedFeeProxyABI as any

/**
 * Minimal per-call ABI for the `version()` string getter exposed by
 * V2Sponsored impls (and absent on V2 standard, where the call reverts).
 * Used to detect the channel family for filtering / badging.
 */
const CHANNEL_DETECT_ABI = [
  {
    type: 'function',
    name: 'version',
    stateMutability: 'pure',
    inputs: [],
    outputs: [{ type: 'string' }],
  },
] as const

type Channel = 'standard' | 'sponsored'
type ChannelFilter = 'all' | Channel
type SortMode = 'chronological' | 'version-asc' | 'version-desc'

type ProxyMeta = {
  name: string
  channel: Channel
  /** Display label, with the `-sponsored` suffix stripped. */
  versionLabel: string | undefined
  /** Raw label used for sort comparison (suffix already stripped). */
  versionSortKey: string
}

/**
 * Batched multicall reading name + channel + defaultVersion for every proxy
 * in one go. Single RPC round-trip regardless of how many proxies the
 * Factory has registered. Parent aggregator for the Explore filter + sort UI.
 */
function useProxiesMeta(addresses: AddrType[]): {
  metaByAddr: Map<AddrType, ProxyMeta>
  isLoading: boolean
} {
  const contracts = useMemo(
    () =>
      addresses.flatMap((addr) => [
        { abi: versionedAbi, address: addr, functionName: 'getName' },
        { abi: versionedAbi, address: addr, functionName: 'getDefaultVersion' },
        { abi: CHANNEL_DETECT_ABI, address: addr, functionName: 'version' },
      ]),
    [addresses],
  )

  const result = useReadContracts({
    contracts: contracts as any,
    allowFailure: true,
    query: { enabled: addresses.length > 0 },
  })

  const metaByAddr = useMemo(() => {
    const map = new Map<AddrType, ProxyMeta>()
    if (!result.data) return map
    addresses.forEach((addr, i) => {
      const base = i * 3
      const nameRes = result.data![base]
      const verRes = result.data![base + 1]
      const chanRes = result.data![base + 2]

      const name =
        nameRes.status === 'success' && nameRes.result
          ? safeDecodeBytes32(nameRes.result as Hex)
          : ''

      // `version()` reverts on standard V2 → treat as standard. Only
      // sponsored impls return a "...-sponsored" string.
      const versionStr =
        chanRes.status === 'success' ? (chanRes.result as string) : ''
      const channel: Channel = versionStr.includes('-sponsored')
        ? 'sponsored'
        : 'standard'

      const rawLabel =
        verRes.status === 'success' && verRes.result
          ? safeDecodeBytes32(verRes.result as Hex)
          : ''
      const stripped = rawLabel.replace(/-sponsored$/i, '')
      map.set(addr, {
        name,
        channel,
        versionLabel: stripped || undefined,
        versionSortKey: stripped,
      })
    })
    return map
  }, [addresses, result.data])

  return { metaByAddr, isLoading: result.isLoading }
}

function safeDecodeBytes32(raw: Hex): string {
  try {
    return hexToString(raw, { size: 32 }).replace(/\0+$/, '')
  } catch {
    return ''
  }
}

/** Natural-sort labels like `v2.0.0 < v2.1.0 < v10.0.0`. */
function compareVersionLabels(a: string, b: string): number {
  // Empty string last — proxies with no version go to the bottom either way.
  if (!a && !b) return 0
  if (!a) return 1
  if (!b) return -1
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}

export default function ExplorePage() {
  const { proxies, isLoading, factory, error } = useAllProxies()
  const { metaByAddr, isLoading: metaLoading } = useProxiesMeta(proxies)

  const [search, setSearch] = useState('')
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>('all')
  const [sortMode, setSortMode] = useState<SortMode>('chronological')

  const displayed = useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = proxies.filter((addr) => {
      const meta = metaByAddr.get(addr)
      if (channelFilter !== 'all') {
        if (!meta) return false // hide until meta resolves when filter is active
        if (meta.channel !== channelFilter) return false
      }
      if (q) {
        const hitAddr = addr.toLowerCase().includes(q)
        const hitName = meta?.name.toLowerCase().includes(q) ?? false
        if (!hitAddr && !hitName) return false
      }
      return true
    })

    if (sortMode !== 'chronological') {
      list = [...list].sort((a, b) => {
        const ma = metaByAddr.get(a)?.versionSortKey ?? ''
        const mb = metaByAddr.get(b)?.versionSortKey ?? ''
        const cmp = compareVersionLabels(ma, mb)
        return sortMode === 'version-asc' ? cmp : -cmp
      })
    }

    return list
  }, [proxies, metaByAddr, search, channelFilter, sortMode])

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
    <div className="space-y-6 max-w-5xl mx-auto">
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
          <Controls
            search={search}
            onSearch={setSearch}
            channelFilter={channelFilter}
            onChannelFilter={setChannelFilter}
            sortMode={sortMode}
            onSortMode={setSortMode}
            disabledMeta={metaLoading}
          />

          <div className="flex items-center justify-between text-xs font-mono uppercase tracking-wider text-subtle">
            <span>
              {displayed.length}
              {displayed.length !== proxies.length ? ` / ${proxies.length}` : ''}{' '}
              {displayed.length === 1 ? 'proxy' : 'proxies'}
            </span>
            {(search || channelFilter !== 'all' || sortMode !== 'chronological') && (
              <button
                type="button"
                onClick={() => {
                  setSearch('')
                  setChannelFilter('all')
                  setSortMode('chronological')
                }}
                className="text-muted normal-case tracking-normal hover:text-ink transition-colors"
              >
                Reset
              </button>
            )}
          </div>

          {displayed.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line bg-surface p-10 text-center text-sm text-subtle">
              No matches.
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {displayed.map((addr) => (
                <ExploreCard
                  key={addr}
                  addr={addr}
                  meta={metaByAddr.get(addr)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Controls({
  search,
  onSearch,
  channelFilter,
  onChannelFilter,
  sortMode,
  onSortMode,
  disabledMeta,
}: {
  search: string
  onSearch: (v: string) => void
  channelFilter: ChannelFilter
  onChannelFilter: (v: ChannelFilter) => void
  sortMode: SortMode
  onSortMode: (v: SortMode) => void
  disabledMeta: boolean
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <input
        type="search"
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        placeholder="Search by name or address…"
        className="input flex-1 min-w-[200px] text-sm"
      />

      <SegmentedChannel
        value={channelFilter}
        onChange={onChannelFilter}
        disabled={disabledMeta}
      />

      <label className="flex items-center gap-2 text-xs text-subtle">
        <span className="uppercase tracking-wider text-[10px] font-mono">
          Sort
        </span>
        <select
          value={sortMode}
          onChange={(e) => onSortMode(e.target.value as SortMode)}
          className="input text-xs py-1.5"
          disabled={disabledMeta && sortMode !== 'chronological'}
        >
          <option value="chronological">Newest first</option>
          <option value="version-asc">Version ↑</option>
          <option value="version-desc">Version ↓</option>
        </select>
      </label>
    </div>
  )
}

function SegmentedChannel({
  value,
  onChange,
  disabled,
}: {
  value: ChannelFilter
  onChange: (v: ChannelFilter) => void
  disabled: boolean
}) {
  const items: { id: ChannelFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'standard', label: 'Standard' },
    { id: 'sponsored', label: 'Sponsored' },
  ]
  return (
    <div
      role="tablist"
      aria-label="Filter by channel"
      className={`inline-flex items-center rounded-lg border border-line bg-surface overflow-hidden ${
        disabled ? 'opacity-60' : ''
      }`}
    >
      {items.map((it) => {
        const active = value === it.id
        return (
          <button
            key={it.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(it.id)}
            disabled={disabled}
            className={`px-3 py-1.5 text-xs uppercase font-mono tracking-wider transition-colors ${
              active
                ? 'bg-ink text-surface'
                : 'text-muted hover:text-ink'
            } disabled:cursor-not-allowed`}
          >
            {it.label}
          </button>
        )
      })}
    </div>
  )
}

function ExploreCard({
  addr,
  meta,
}: {
  addr: AddrType
  meta: ProxyMeta | undefined
}) {
  // Falls back to the per-card channel hook if the parent meta hasn't
  // resolved yet (keeps badge/layout stable during initial load).
  const { channel: liveChannel } = useProxyChannel(addr)
  const channel = meta?.channel ?? liveChannel
  const name = meta?.name ?? ''
  const versionLabel = meta?.versionLabel

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
        <div className="min-w-0 flex flex-col gap-1">
          {name ? (
            <span className="truncate font-medium text-ink">{name}</span>
          ) : null}
          <div className="flex items-center gap-2 flex-wrap">
            <Address value={addr} variant="short" copy={false} />
            {versionLabel && (
              <span
                className="text-[10px] font-mono uppercase tracking-wider text-subtle border border-line rounded px-1.5 py-0.5"
                title="Currently-active version (defaultVersion)"
              >
                {versionLabel}
              </span>
            )}
          </div>
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
