import { formatEther, type Address } from 'viem'
import { useBlock, useBlockNumber } from 'wagmi'

import type { ProxyMetrics } from '../hooks/useProxy'
import { useSponsoredMetrics } from '../hooks/useSponsoredProxy'
import { formatAbsoluteDate, formatRelativeTime } from '../lib/format'
import { Metric } from './Metric'

interface Props {
  proxy: Address
  metrics: ProxyMetrics | undefined
  isLoading: boolean
  unsupported: boolean
  isSponsored: boolean
}

export function MetricsTab({
  proxy,
  metrics,
  isLoading,
  unsupported,
  isSponsored,
}: Props) {
  const { metrics: sponsoredMetrics } = useSponsoredMetrics(
    isSponsored ? proxy : undefined,
  )
  const { data: currentBlock } = useBlockNumber({ watch: true })

  // Fetch the block the proxy last wrote to — gives us the wall-clock time
  // of the last write. Skipped when there's no activity yet (block 0 is
  // genesis and would return a meaningless timestamp).
  const lastBlockQuery = useBlock({
    blockNumber: metrics?.lastActivityBlock,
    query: { enabled: Boolean(metrics && metrics.lastActivityBlock > 0n) },
  })
  const lastActivityTs =
    lastBlockQuery.data?.timestamp !== undefined
      ? Number(lastBlockQuery.data.timestamp)
      : undefined

  const fmtBig = (v: bigint | undefined) =>
    v === undefined ? '—' : v.toString()

  const lastActivity =
    metrics === undefined
      ? '—'
      : metrics.lastActivityBlock === 0n
        ? 'never'
        : lastActivityTs !== undefined
          ? formatAbsoluteDate(lastActivityTs)
          : `block ${metrics.lastActivityBlock.toString()}`

  const lastActivityHint =
    metrics === undefined
      ? undefined
      : metrics.lastActivityBlock === 0n
        ? 'no writes yet'
        : lastActivityTs !== undefined
          ? `${formatRelativeTime(Math.floor(Date.now() / 1000) - lastActivityTs)} · block ${metrics.lastActivityBlock.toString()}`
          : currentBlock && metrics.lastActivityBlock > 0n
            ? `${(currentBlock - metrics.lastActivityBlock).toString()} block(s) ago`
            : undefined

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-sm font-medium uppercase tracking-wider text-subtle">
          On-chain metrics
        </h2>
        <p className="mt-1 text-sm text-muted">
          Aggregate counters read from the proxy itself. Every write-path
          call updates these and emits a{' '}
          <code className="font-mono text-ink">MetricsUpdated</code> event —
          single-source-of-truth for dashboards and off-chain indexers.
        </p>
      </div>

      {unsupported && (
        <div className="rounded-lg border-l-4 border-l-brand border border-line bg-surface p-4 text-sm text-ink">
          <b>Metrics not available on this proxy.</b>{' '}
          <span className="text-muted">
            The currently-pinned implementation doesn&apos;t expose{' '}
            <code className="font-mono">getMetrics()</code>. Register a
            metrics-aware version (v2.1.0+) and set it as default to start
            collecting aggregates. Existing proxies won&apos;t lose their
            storage — the counters simply start at zero the first time a
            metrics-aware impl runs.
          </span>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Metric
          label="Atoms created"
          value={fmtBig(metrics?.totalAtomsCreated)}
          loading={isLoading}
        />
        <Metric
          label="Triples created"
          value={fmtBig(metrics?.totalTriplesCreated)}
          loading={isLoading}
        />
        <Metric
          label="Deposits"
          value={fmtBig(metrics?.totalDeposits)}
          loading={isLoading}
          emphasize
        />
        <Metric
          label="Volume forwarded"
          value={metrics ? `${formatEther(metrics.totalVolume)} TRUST` : '—'}
          loading={isLoading}
        />
        <Metric
          label="Unique users"
          value={fmtBig(metrics?.totalUniqueUsers)}
          loading={isLoading}
        />
        <Metric
          label="Last activity"
          value={lastActivity}
          hint={lastActivityHint}
          loading={isLoading}
        />
      </div>

      {isSponsored && (
        <div className="space-y-4 pt-4 border-t border-line">
          <div>
            <h3 className="text-sm font-medium uppercase tracking-wider text-subtle">
              Sponsored activity
            </h3>
            <p className="mt-1 text-sm text-muted">
              Subset of the metrics above that went through the sponsor pool
              (fully or partially covered by{' '}
              <code className="font-mono text-ink">sponsorPool</code>).
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Metric
              label="Sponsored deposits"
              value={
                sponsoredMetrics
                  ? sponsoredMetrics.sponsoredDeposits.toString()
                  : '—'
              }
              loading={isLoading}
            />
            <Metric
              label="Unique receivers"
              value={
                sponsoredMetrics
                  ? sponsoredMetrics.uniqueSponsoredReceivers.toString()
                  : '—'
              }
              loading={isLoading}
            />
            <Metric
              label="Sponsored volume"
              value={
                sponsoredMetrics
                  ? `${formatEther(sponsoredMetrics.sponsoredVolume)} TRUST`
                  : '—'
              }
              loading={isLoading}
            />
          </div>
        </div>
      )}
    </section>
  )
}
