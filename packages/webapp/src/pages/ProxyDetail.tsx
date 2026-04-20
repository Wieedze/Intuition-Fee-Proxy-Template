import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  formatEther,
  hexToString,
  isAddress,
  isHex,
  parseEther,
  stringToHex,
  type Address,
  type Hex,
} from 'viem'
import { useAccount, useBlock, useBlockNumber, useChainId, useWaitForTransactionReceipt } from 'wagmi'

import {
  getLatestVersion,
  listVersionsByFamily,
  type NetworkName,
  type ProxyFamily,
} from '@intuition-fee-proxy/sdk'
import { networkFor } from '../lib/addresses'
import {
  useAdmins,
  useIsAdmin,
  useProxyChannel,
  useProxyMetrics,
  useProxyStats,
  useSetFees,
  useSetWhitelistedAdmin,
  useWithdraw,
  type ProxyMetrics,
} from '../hooks/useProxy'
import {
  useProxyName,
  useProxyVersions,
  useRegisterVersion,
  useSetDefaultVersion,
  useSetProxyName,
} from '../hooks/useVersionedProxy'
import {
  useClaimLimits,
  useClaimStatus,
  useFundPool,
  usePoolBurnRate,
  useReclaimFromPool,
  useSetClaimLimits,
  useSponsoredMetrics,
  useSponsorPool,
  type PoolBurnStats,
} from '../hooks/useSponsoredProxy'
import Address from '../components/Address'

type TabId = 'overview' | 'fee' | 'sponsoring' | 'metrics' | 'admins'

export default function ProxyDetailPage() {
  const { address: proxyParam } = useParams()
  const proxy = proxyParam && isAddress(proxyParam) ? (proxyParam as Address) : undefined

  const { address: account } = useAccount()
  const { stats, refetch, isLoading } = useProxyStats(proxy)
  const { isAdmin } = useIsAdmin(proxy, account)
  const { versions, defaultVersion, proxyAdmin, refetch: refetchVersions } =
    useProxyVersions(proxy)
  const { metrics, unsupported: metricsUnsupported, isLoading: metricsLoading } =
    useProxyMetrics(proxy)
  const { name, unsupported: nameUnsupported, refetch: refetchName } =
    useProxyName(proxy)
  const { channel } = useProxyChannel(proxy)
  const chainId = useChainId()
  const network: NetworkName = networkFor(chainId)
  const family: ProxyFamily = channel === 'sponsored' ? 'sponsored' : 'standard'
  const isProxyAdmin =
    account && proxyAdmin && account.toLowerCase() === proxyAdmin.toLowerCase()

  const [tab, setTab] = useState<TabId>('overview')

  if (!proxy) {
    return (
      <div className="max-w-xl mx-auto">
        <h1 className="text-3xl font-bold">Proxy</h1>
        <p className="text-rose-400 mt-2 font-mono text-sm">Invalid proxy address in URL.</p>
      </div>
    )
  }

  return (
    <div className="space-y-8 max-w-3xl mx-auto">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-ink">
          {name || (
            <span className="text-subtle">Untitled proxy</span>
          )}
        </h1>
        <div className="flex items-center gap-3 flex-wrap">
          <Address value={proxy} variant="short" />
          {isProxyAdmin && (
            <RenameButton
              proxy={proxy}
              currentName={name}
              onDone={refetchName}
            />
          )}
        </div>
        {nameUnsupported && isProxyAdmin && (
          <p className="text-xs text-subtle">
            This proxy was deployed with an older bytecode that doesn&apos;t
            support on-chain names. Redeploy from the Factory, or register and
            promote a newer implementation that exposes{' '}
            <code className="font-mono text-muted">setName</code>.
          </p>
        )}
      </header>

      <NewVersionBanner
        proxy={proxy}
        network={network}
        family={family}
        versions={versions}
        defaultVersion={defaultVersion}
        isProxyAdmin={Boolean(isProxyAdmin)}
        onDone={refetchVersions}
      />

      <Tabs active={tab} onChange={setTab} isSponsored={channel === 'sponsored'} />

      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton h-20 rounded-xl" />
          ))}
        </div>
      )}

      {tab === 'overview' && stats && (
        <div className="space-y-10">
          <section className="grid gap-4 sm:grid-cols-3">
            <Stat
              label="Channel"
              value={channel === 'sponsored' ? 'Sponsored' : 'Standard'}
            />
            <Stat label="Admins" value={stats.adminCount.toString()} />
            <Stat label="MultiVault" value={stats.ethMultiVault} mono />
          </section>

          <VersionsPanel
            proxy={proxy}
            network={network}
            family={family}
            versions={versions}
            defaultVersion={defaultVersion}
            isProxyAdmin={Boolean(isProxyAdmin)}
            onDone={refetchVersions}
          />
        </div>
      )}

      {tab === 'fee' && stats && (
        <div className="space-y-10">
          <section className="grid gap-4 sm:grid-cols-2">
            <Stat
              label="Accumulated fees"
              value={`${formatEther(stats.accumulatedFees)} TRUST`}
              emphasize
            />
            <Stat
              label="All-time collected"
              value={`${formatEther(stats.totalFeesCollectedAllTime)} TRUST`}
            />
            <Stat
              label="Fixed fee / deposit"
              value={`${formatEther(stats.depositFixedFee)} TRUST`}
            />
            <Stat
              label="Percentage fee"
              value={`${(Number(stats.depositPercentageFee) / 100).toFixed(2)} %`}
            />
          </section>

          {isAdmin ? (
            <div className="space-y-8">
              <WithdrawPanel
                proxy={proxy}
                accumulated={stats.accumulatedFees}
                onDone={refetch}
              />
              <SetFeesPanel
                proxy={proxy}
                currentFixed={stats.depositFixedFee}
                currentPct={stats.depositPercentageFee}
                onDone={refetch}
              />
            </div>
          ) : (
            <p className="text-sm text-subtle border-l-2 border-line pl-3">
              Connect as a whitelisted admin to withdraw fees or change config.
            </p>
          )}
        </div>
      )}

      {tab === 'metrics' && (
        <MetricsPanel
          metrics={metrics}
          isLoading={metricsLoading}
          unsupported={Boolean(metricsUnsupported)}
        />
      )}

      {tab === 'admins' && (
        <div className="space-y-8">
          <UpgradeAuthorityPanel proxyAdmin={proxyAdmin} account={account} />
          <AdminsPanel proxy={proxy} connectedAccount={account} />
        </div>
      )}

      {tab === 'sponsoring' && channel === 'sponsored' && (
        <SponsoringPanel proxy={proxy} isAdmin={isAdmin} />
      )}
    </div>
  )
}

function Tabs({
  active,
  onChange,
  isSponsored,
}: {
  active: TabId
  onChange: (t: TabId) => void
  isSponsored: boolean
}) {
  const items: { id: TabId; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'fee', label: 'Fee' },
    ...(isSponsored ? [{ id: 'sponsoring' as TabId, label: 'Sponsoring' }] : []),
    { id: 'metrics', label: 'Metrics' },
    { id: 'admins', label: 'Admins' },
  ]
  return (
    <div className="flex items-center gap-6 border-b border-line">
      {items.map((item) => {
        const isActive = active === item.id
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={`relative pb-3 text-sm transition-colors ${
              isActive ? 'text-ink' : 'text-muted hover:text-ink'
            }`}
          >
            {item.label}
            <span
              className={`absolute inset-x-0 -bottom-px h-px transition-opacity ${
                isActive ? 'bg-ink opacity-100' : 'opacity-0'
              }`}
            />
          </button>
        )
      })}
    </div>
  )
}

function MetricsPanel({
  metrics,
  isLoading,
  unsupported,
}: {
  metrics: ProxyMetrics | undefined
  isLoading: boolean
  unsupported: boolean
}) {
  const { data: currentBlock } = useBlockNumber({ watch: true })

  // Fetch the block the proxy last wrote to — gives us the wall-clock time of
  // the last write. Skipped when there's no activity yet (block 0 is genesis
  // and would return a meaningless timestamp).
  const lastBlockQuery = useBlock({
    blockNumber: metrics?.lastActivityBlock,
    query: {
      enabled: Boolean(metrics && metrics.lastActivityBlock > 0n),
    },
  })
  const lastActivityTs =
    lastBlockQuery.data?.timestamp !== undefined
      ? Number(lastBlockQuery.data.timestamp)
      : undefined

  const fmtBig = (v: bigint | undefined) => (v === undefined ? '—' : v.toString())

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
          Aggregate counters read from the proxy itself. Every write-path call
          updates these and emits a{' '}
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
          value={
            metrics ? `${formatEther(metrics.totalVolume)} TRUST` : '—'
          }
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
    </section>
  )
}

function Metric({
  label,
  value,
  hint,
  loading = false,
  emphasize = false,
}: {
  label: string
  value: string
  hint?: string
  loading?: boolean
  emphasize?: boolean
}) {
  return (
    <div className={`card ${emphasize ? 'border-brand/30' : ''}`}>
      <div className="text-xs text-subtle">{label}</div>
      {loading ? (
        <div className="mt-2 skeleton h-6 w-16" />
      ) : (
        <div
          className={`mt-2 text-lg font-semibold ${
            emphasize ? 'text-brand' : 'text-ink'
          }`}
        >
          {value}
        </div>
      )}
      {hint && !loading && (
        <div className="mt-1 text-xs text-subtle">{hint}</div>
      )}
    </div>
  )
}

function Stat({
  label,
  value,
  mono = false,
  emphasize = false,
}: {
  label: string
  value: string
  mono?: boolean
  emphasize?: boolean
}) {
  return (
    <div className={`card ${emphasize ? 'border-brand/30' : ''}`}>
      <div className="text-xs text-subtle">{label}</div>
      <div
        className={`mt-2 ${
          mono
            ? 'font-mono text-xs text-muted break-all'
            : `text-lg ${emphasize ? 'text-brand font-semibold' : 'text-ink font-semibold'}`
        }`}
      >
        {value}
      </div>
    </div>
  )
}

function WithdrawPanel({
  proxy,
  accumulated,
  onDone,
}: {
  proxy: Address
  accumulated: bigint
  onDone: () => void
}) {
  const { address } = useAccount()
  const [to, setTo] = useState<string>(address ?? '')
  const [amount, setAmount] = useState<string>('')

  const { withdraw, withdrawAll, hash, isPending, error } = useWithdraw(proxy)
  const receipt = useWaitForTransactionReceipt({ hash })

  useEffect(() => {
    if (receipt.isSuccess) onDone()
    // Re-run per confirmed hash, not per render.
  }, [hash, receipt.isSuccess])

  const toValid = isAddress(to)
  const amountValid = amount ? Number(amount) > 0 : false

  async function onPartial() {
    if (!toValid || !amountValid) return
    try {
      await withdraw(to as Address, parseEther(amount))
    } catch (e) {
      console.error(e)
    }
  }

  async function onAll() {
    if (!toValid) return
    try {
      await withdrawAll(to as Address)
    } catch (e) {
      console.error(e)
    }
  }

  return (
    <section className="card space-y-4">
      <div>
        <h2 className="font-semibold">Withdraw fees</h2>
        <p className="text-xs text-subtle">
          Pull accumulated fees to any address. Admin-only.
        </p>
      </div>

      <label className="block space-y-1">
        <div className="text-xs text-muted">Recipient</div>
        <input
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="input font-mono text-xs"
          placeholder="0x…"
        />
      </label>

      <label className="block space-y-1">
        <div className="text-xs text-muted">
          Amount (TRUST) — leave empty and use “Withdraw all” to drain
        </div>
        <input
          type="number"
          step="any"
          min="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="input"
          placeholder="0.0"
        />
        <div className="text-xs text-subtle">
          Available: {formatEther(accumulated)} TRUST
        </div>
      </label>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onPartial}
          disabled={!toValid || !amountValid || isPending}
          className="btn-primary"
        >
          Withdraw
        </button>
        <button
          type="button"
          onClick={onAll}
          disabled={!toValid || accumulated === 0n || isPending}
          className="btn-secondary"
        >
          Withdraw all
        </button>
      </div>

      {isPending && <p className="text-xs text-muted">Confirm in wallet…</p>}
      {receipt.isLoading && <p className="text-xs text-muted">Mining…</p>}
      {error && <p className="text-xs text-rose-400 font-mono">{error.message.split('\n')[0]}</p>}
    </section>
  )
}

function SetFeesPanel({
  proxy,
  currentFixed,
  currentPct,
  onDone,
}: {
  proxy: Address
  currentFixed: bigint
  currentPct: bigint
  onDone: () => void
}) {
  const [fixedEth, setFixedEth] = useState<string>(formatEther(currentFixed))
  const [pctBps, setPctBps] = useState<string>(currentPct.toString())

  const { setDepositFixedFee, setDepositPercentageFee, hash, isPending, error } =
    useSetFees(proxy)
  const receipt = useWaitForTransactionReceipt({ hash })

  useEffect(() => {
    if (receipt.isSuccess) onDone()
  }, [hash, receipt.isSuccess])

  const fixedValid = Number(fixedEth) >= 0
  const pctValid = (() => {
    const n = Number(pctBps)
    return Number.isInteger(n) && n >= 0 && n <= 10_000
  })()

  async function onUpdateFixed() {
    if (!fixedValid) return
    try {
      await setDepositFixedFee(parseEther(fixedEth))
    } catch (e) {
      console.error(e)
    }
  }

  async function onUpdatePct() {
    if (!pctValid) return
    try {
      await setDepositPercentageFee(BigInt(pctBps))
    } catch (e) {
      console.error(e)
    }
  }

  return (
    <section className="card space-y-4">
      <div>
        <h2 className="font-semibold">Update fees</h2>
        <p className="text-xs text-subtle">
          Admin-only. Takes effect immediately.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1">
          <div className="text-xs text-muted">Fixed fee (TRUST)</div>
          <input
            type="number"
            step="any"
            min="0"
            value={fixedEth}
            onChange={(e) => setFixedEth(e.target.value)}
            className="input"
          />
          <button
            type="button"
            onClick={onUpdateFixed}
            disabled={!fixedValid || isPending}
            className="btn-primary w-full mt-1"
          >
            Update fixed
          </button>
        </label>

        <label className="block space-y-1">
          <div className="text-xs text-muted">Percentage fee (bps)</div>
          <input
            type="number"
            min="0"
            max="10000"
            step="1"
            value={pctBps}
            onChange={(e) => setPctBps(e.target.value)}
            className="input"
          />
          <button
            type="button"
            onClick={onUpdatePct}
            disabled={!pctValid || isPending}
            className="btn-primary w-full mt-1"
          >
            Update percentage
          </button>
        </label>
      </div>

      {error && <p className="text-xs text-rose-400 font-mono">{error.message.split('\n')[0]}</p>}
    </section>
  )
}

/// @dev Format a UNIX seconds timestamp to a readable local string.
///      Short today ("17:23"), longer yesterday/older ("Apr 18, 17:23").
function formatAbsoluteDate(tsSeconds: number): string {
  const d = new Date(tsSeconds * 1000)
  const now = new Date()
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  if (sameDay) {
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/// @dev Format a positive "seconds ago" delta to a compact relative string.
///      Returns "just now" for < 1 min, or a rounded unit (min / h / d).
function formatRelativeTime(secondsAgo: number): string {
  if (secondsAgo < 0) return 'in the future'
  if (secondsAgo < 60) return 'just now'
  if (secondsAgo < 3600) {
    const m = Math.floor(secondsAgo / 60)
    return `${m} min ago`
  }
  if (secondsAgo < 86400) {
    const h = Math.floor(secondsAgo / 3600)
    return `${h} h ago`
  }
  const d = Math.floor(secondsAgo / 86400)
  return `${d} day${d === 1 ? '' : 's'} ago`
}

function decodeVersion(v: Hex): string {
  try {
    const decoded = hexToString(v, { size: 32 })
    return decoded || v
  } catch {
    return v
  }
}


function UpgradeAuthorityPanel({
  proxyAdmin,
  account,
}: {
  proxyAdmin: Hex | undefined
  account: Address | undefined
}) {
  const isYou =
    account && proxyAdmin && account.toLowerCase() === proxyAdmin.toLowerCase()

  return (
    <section className="card space-y-3">
      <h2 className="font-semibold">Upgrade authority</h2>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] uppercase tracking-wide text-subtle mr-1">
          proxyAdmin
        </span>
        {proxyAdmin ? (
          <>
            <Address value={proxyAdmin as Address} variant="short" />
            {isYou && (
              <span className="text-[10px] px-2 py-0.5 rounded bg-accent/10 text-accent uppercase tracking-wide">
                you
              </span>
            )}
          </>
        ) : (
          <span className="text-sm text-subtle">—</span>
        )}
      </div>

      <p className="text-xs text-subtle leading-relaxed">
        Can register new implementations and switch the default version at
        any time. End users interacting with this proxy should keep their
        MultiVault approval <code className="font-mono text-ink">DEPOSIT</code>-only.
      </p>
    </section>
  )
}

function NewVersionBanner({
  proxy,
  network,
  family,
  versions,
  defaultVersion,
  isProxyAdmin,
  onDone,
}: {
  proxy: Address
  network: NetworkName
  family: ProxyFamily
  versions: Hex[]
  defaultVersion: Hex | undefined
  isProxyAdmin: boolean
  onDone: () => void
}) {
  const latest = getLatestVersion(network, family)
  const registeredLabels = new Set(versions.map((v) => decodeVersion(v)))
  const currentDefaultLabel = defaultVersion
    ? decodeVersion(defaultVersion)
    : undefined

  const dismissKey = latest
    ? `proxy-new-version-dismissed:${proxy.toLowerCase()}:${latest.label}`
    : undefined
  const [dismissed, setDismissed] = useState<boolean>(() =>
    typeof window !== 'undefined' && dismissKey
      ? window.localStorage.getItem(dismissKey) === '1'
      : false,
  )

  const {
    register,
    hash: registerHash,
    isPending: registerPending,
  } = useRegisterVersion(proxy)
  const {
    setDefault,
    hash: defaultHash,
    isPending: defaultPending,
  } = useSetDefaultVersion(proxy)
  const registerReceipt = useWaitForTransactionReceipt({ hash: registerHash })
  const defaultReceipt = useWaitForTransactionReceipt({ hash: defaultHash })

  useEffect(() => {
    if (registerReceipt.isSuccess || defaultReceipt.isSuccess) onDone()
  }, [registerReceipt.isSuccess, defaultReceipt.isSuccess])

  if (!latest || dismissed) return null
  if (currentDefaultLabel === latest.label) return null

  const alreadyRegistered = registeredLabels.has(latest.label)
  const busy =
    registerPending ||
    registerReceipt.isLoading ||
    defaultPending ||
    defaultReceipt.isLoading

  function onDismiss() {
    if (dismissKey && typeof window !== 'undefined') {
      window.localStorage.setItem(dismissKey, '1')
    }
    setDismissed(true)
  }

  async function onRegisterAndPromote() {
    try {
      await register(
        stringToHex(latest!.label, { size: 32 }),
        latest!.impl as Address,
      )
      // Promotion happens in a second click after the register confirms —
      // doing both in one flow would require chaining writeContract calls
      // across receipts, which the current hooks don't expose.
    } catch (e) {
      console.error(e)
    }
  }

  async function onPromote() {
    try {
      await setDefault(stringToHex(latest!.label, { size: 32 }))
    } catch (e) {
      console.error(e)
    }
  }

  const headline = alreadyRegistered
    ? `${latest.label} is registered but not default`
    : `New version available — ${latest.label}`

  const body = alreadyRegistered
    ? `Users on the default path will keep hitting ${currentDefaultLabel ?? 'the current impl'} until you promote ${latest.label}.`
    : `Your proxy's default is ${currentDefaultLabel ?? 'unset'}. Register ${latest.label} to make it available to pinned users; promote it to move everyone over.`

  return (
    <section className="rounded-xl border border-brand/40 bg-brand/[0.06] p-4 flex flex-wrap items-start gap-3">
      <span aria-hidden className="text-brand text-lg leading-none mt-0.5">
        ⚡
      </span>
      <div className="flex-1 min-w-[240px] space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-ink">{headline}</span>
          {latest.review && (
            <a
              href={latest.review.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] font-mono uppercase tracking-wider rounded border border-brand/40 bg-brand/10 text-brand px-1.5 py-0.5 hover:opacity-80 transition-opacity"
            >
              reviewed · {latest.review.date}
            </a>
          )}
        </div>
        <p className="text-xs text-muted leading-relaxed">{body}</p>
        {latest.summary && (
          <p className="text-xs text-subtle leading-relaxed">
            {latest.summary}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {isProxyAdmin && (
          <button
            type="button"
            onClick={alreadyRegistered ? onPromote : onRegisterAndPromote}
            disabled={busy}
            className="btn-primary text-xs px-3 py-1.5"
          >
            {busy
              ? 'Pending…'
              : alreadyRegistered
                ? 'Set as default →'
                : 'Register →'}
          </button>
        )}
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="text-xs text-subtle hover:text-ink transition-colors px-2"
        >
          ✕
        </button>
      </div>
    </section>
  )
}

function VersionsPanel({
  proxy,
  network,
  family,
  versions,
  defaultVersion,
  isProxyAdmin,
  onDone,
}: {
  proxy: Address
  network: NetworkName
  family: ProxyFamily
  versions: Hex[]
  defaultVersion: Hex | undefined
  isProxyAdmin: boolean
  onDone: () => void
}) {
  const canonical = listVersionsByFamily(network, family)
  const [mode, setMode] = useState<'canonical' | 'custom'>(
    canonical.length > 0 ? 'canonical' : 'custom',
  )
  const [selectedCanonical, setSelectedCanonical] = useState<string>('')
  const [newLabel, setNewLabel] = useState('')
  const [newImpl, setNewImpl] = useState('')
  const [selectedVersion, setSelectedVersion] = useState<Hex | ''>('')

  const registeredLabels = new Set(versions.map((v) => decodeVersion(v)))
  const availableCanonical = canonical.filter(
    (v) => !registeredLabels.has(v.label),
  )
  const picked = availableCanonical.find((v) => v.label === selectedCanonical)

  const {
    register,
    hash: registerHash,
    isPending: registerPending,
    error: registerError,
  } = useRegisterVersion(proxy)
  const {
    setDefault,
    hash: defaultHash,
    isPending: defaultPending,
    error: defaultError,
  } = useSetDefaultVersion(proxy)

  const registerReceipt = useWaitForTransactionReceipt({ hash: registerHash })
  const defaultReceipt = useWaitForTransactionReceipt({ hash: defaultHash })

  useEffect(() => {
    if (registerReceipt.isSuccess) onDone()
  }, [registerHash, registerReceipt.isSuccess])

  useEffect(() => {
    if (defaultReceipt.isSuccess) onDone()
  }, [defaultHash, defaultReceipt.isSuccess])

  const customLabelValid = newLabel.length > 0 && newLabel.length <= 32
  const customImplValid = isAddress(newImpl)
  const canRegister =
    mode === 'canonical'
      ? Boolean(picked)
      : customLabelValid && customImplValid

  async function onRegister() {
    try {
      if (mode === 'canonical' && picked) {
        await register(
          stringToHex(picked.label, { size: 32 }),
          picked.impl as Address,
        )
        setSelectedCanonical('')
      } else if (customLabelValid && customImplValid) {
        await register(stringToHex(newLabel, { size: 32 }), newImpl as Address)
        setNewLabel('')
        setNewImpl('')
      }
    } catch (e) {
      console.error(e)
    }
  }

  async function onSetDefault() {
    if (!selectedVersion || !isHex(selectedVersion)) return
    try {
      await setDefault(selectedVersion as Hex)
    } catch (e) {
      console.error(e)
    }
  }

  return (
    <section className="card space-y-4">
      <div>
        <h2 className="font-semibold">Versions (ERC-7936)</h2>
        <p className="text-xs text-subtle">
          Every implementation this proxy has been pinned to. Advanced users can
          call <code className="font-mono">executeAtVersion(v, data)</code> to
          pin to a specific past version.
        </p>
      </div>

      <ul className="divide-y divide-line rounded-lg border border-line bg-canvas overflow-hidden">
        {versions.length === 0 && (
          <li className="px-3 py-2 text-xs text-subtle">No versions registered.</li>
        )}
        {versions.map((v) => {
          const isDefault =
            defaultVersion && v.toLowerCase() === defaultVersion.toLowerCase()
          return (
            <li
              key={v}
              className="px-3 py-2 flex items-center justify-between text-sm"
            >
              <div>
                <span className="font-medium">{decodeVersion(v)}</span>
                {isDefault && (
                  <span className="ml-2 rounded-full border border-brand/40 bg-brand/10 text-brand text-[10px] font-mono uppercase tracking-wider px-2 py-0.5">
                    default
                  </span>
                )}
                <div className="font-mono text-[10px] text-subtle break-all mt-0.5">
                  {v}
                </div>
              </div>
            </li>
          )
        })}
      </ul>

      {isProxyAdmin ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2 h-full">
            <div className="text-xs font-medium">Register new version</div>

            {mode === 'canonical' ? (
              <>
                <select
                  value={selectedCanonical}
                  onChange={(e) => setSelectedCanonical(e.target.value)}
                  className="input"
                  disabled={availableCanonical.length === 0}
                >
                  <option value="">
                    {availableCanonical.length === 0
                      ? canonical.length === 0
                        ? 'No canonical versions published yet'
                        : 'All canonical versions already registered'
                      : `Select a canonical ${family} version…`}
                  </option>
                  {availableCanonical.map((v) => (
                    <option key={v.label} value={v.label}>
                      {v.label}
                      {v.review ? ` — reviewed ${v.review.date}` : ''}
                    </option>
                  ))}
                </select>
                {picked && (
                  <div className="rounded-md border border-line bg-canvas px-3 py-2 text-[11px] font-mono text-subtle break-all">
                    {picked.impl}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setMode('custom')}
                  className="text-left text-[11px] text-subtle hover:text-ink transition-colors"
                >
                  Advanced — paste a custom implementation →
                </button>
              </>
            ) : (
              <>
                <input
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="v2.1.0 (max 32 chars)"
                  className="input"
                />
                <input
                  value={newImpl}
                  onChange={(e) => setNewImpl(e.target.value)}
                  placeholder="0x… (implementation address)"
                  className="input font-mono text-xs"
                />
                <div className="rounded-md border border-rose-500/30 bg-rose-500/5 px-2.5 py-1.5 text-[11px] text-rose-300 leading-snug">
                  ⚠ Third-party implementations fall outside the canonical
                  registry. Use this path only when you&apos;ve deployed and
                  reviewed the impl yourself.
                </div>
                {canonical.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setMode('canonical')}
                    className="text-left text-[11px] text-subtle hover:text-ink transition-colors"
                  >
                    ← Back to canonical versions
                  </button>
                )}
              </>
            )}

            <button
              type="button"
              onClick={onRegister}
              disabled={
                !canRegister || registerPending || registerReceipt.isLoading
              }
              className="btn-primary w-full mt-auto"
            >
              {registerPending
                ? 'Confirm…'
                : registerReceipt.isLoading
                  ? 'Mining…'
                  : 'Register'}
            </button>
            {registerError && (
              <p className="text-xs text-rose-400 font-mono">
                {registerError.message.split('\n')[0]}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2 h-full">
            <div className="text-xs font-medium">Set default version</div>
            <select
              value={selectedVersion}
              onChange={(e) => setSelectedVersion(e.target.value as Hex | '')}
              className="input"
            >
              <option value="">Select a version…</option>
              {versions.map((v) => (
                <option key={v} value={v}>
                  {decodeVersion(v)}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={onSetDefault}
              disabled={
                !selectedVersion || defaultPending || defaultReceipt.isLoading
              }
              className="btn-secondary w-full mt-auto"
            >
              {defaultPending
                ? 'Confirm…'
                : defaultReceipt.isLoading
                  ? 'Mining…'
                  : 'Set as default'}
            </button>
            {defaultError && (
              <p className="text-xs text-rose-400 font-mono">
                {defaultError.message.split('\n')[0]}
              </p>
            )}
          </div>
        </div>
      ) : (
        <p className="text-xs text-subtle">
          Register/swap default is proxy-admin only. Connect as the proxy admin
          to manage versions.
        </p>
      )}
    </section>
  )
}

function RenameButton({
  proxy,
  currentName,
  onDone,
}: {
  proxy: Address
  currentName: string
  onDone: () => void
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(currentName)
  const { setName, hash, isPending, error, reset } = useSetProxyName(proxy)
  const receipt = useWaitForTransactionReceipt({ hash })

  useEffect(() => {
    if (receipt.isSuccess) {
      onDone()
      setOpen(false)
      reset()
    }
  }, [hash, receipt.isSuccess])

  const trimmed = draft.trim()
  const valid = new Blob([trimmed]).size <= 32 && trimmed !== currentName

  async function onConfirm() {
    if (!valid) return
    try {
      await setName(trimmed)
    } catch (e) {
      console.error(e)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(currentName)
          setOpen(true)
        }}
        className="text-xs text-muted hover:text-ink transition-colors underline underline-offset-2 decoration-dotted"
      >
        {currentName ? 'rename' : 'name this proxy'}
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="My DAO Fees"
        maxLength={32}
        className="input max-w-[220px] py-1 text-sm"
      />
      <button
        type="button"
        onClick={onConfirm}
        disabled={!valid || isPending || receipt.isLoading}
        className="btn-primary text-xs px-3 py-1.5"
      >
        {isPending ? 'Sign…' : receipt.isLoading ? 'Mining…' : 'Save'}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="btn-secondary text-xs px-3 py-1.5"
      >
        Cancel
      </button>
      {error && (
        <span className="text-xs text-rose-400 font-mono">
          {error.message.split('\n')[0]}
        </span>
      )}
    </div>
  )
}

// ============ Admins tab ============

function AdminsPanel({
  proxy,
  connectedAccount,
}: {
  proxy: Address
  connectedAccount: Address | undefined
}) {
  const { admins, isLoading, error, refetch } = useAdmins(proxy)
  const { isAdmin: connectedIsAdmin } = useIsAdmin(proxy, connectedAccount)
  const { setAdmin, hash, isPending, error: writeError, reset } = useSetWhitelistedAdmin(proxy)
  const receipt = useWaitForTransactionReceipt({ hash })
  const [addDraft, setAddDraft] = useState('')
  // Tracks which row (or 'ADD') owns the in-flight tx, so only that button
  // shows "Signing…" / "Mining…" state. Other rows stay idle (but disabled).
  const [pendingTarget, setPendingTarget] = useState<Address | 'ADD' | null>(null)

  const busy = isPending || receipt.isLoading

  useEffect(() => {
    if (receipt.isSuccess) {
      refetch()
      reset()
      setAddDraft('')
      setPendingTarget(null)
    }
  }, [hash, receipt.isSuccess])

  // If the write errored or the user rejected the signature, release the
  // per-row pending marker so the buttons become clickable again.
  useEffect(() => {
    if (!isPending && !receipt.isLoading && !receipt.isSuccess && pendingTarget) {
      setPendingTarget(null)
    }
  }, [isPending, receipt.isLoading, receipt.isSuccess, writeError])

  const addValid = isAddress(addDraft) && !admins.some((a) => a.toLowerCase() === addDraft.toLowerCase())

  async function onAdd() {
    if (!addValid) return
    setPendingTarget('ADD')
    try {
      await setAdmin(addDraft as Address, true)
    } catch (e) {
      console.error(e)
      setPendingTarget(null)
    }
  }

  async function onRevoke(addr: Address) {
    setPendingTarget(addr)
    try {
      await setAdmin(addr, false)
    } catch (e) {
      console.error(e)
      setPendingTarget(null)
    }
  }

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-sm font-medium uppercase tracking-wider text-subtle">
          Whitelisted admins
        </h2>
        <p className="mt-1 text-sm text-muted">
          Admins can withdraw accumulated fees, change fee settings, add /
          revoke other admins, and on sponsored proxies fund user credit + set
          claim limits. Reconstructed from on-chain events.
        </p>
      </div>

      {isLoading && (
        <div className="space-y-2">
          <div className="skeleton h-12 w-full" />
          <div className="skeleton h-12 w-full" />
        </div>
      )}

      {error && (
        <p className="text-sm font-mono text-rose-400">
          Failed to load admins: {error.message.split('\n')[0]}
        </p>
      )}

      {!isLoading && admins.length > 0 && (
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface overflow-hidden">
          {admins.map((addr) => {
            const isSelf =
              connectedAccount && addr.toLowerCase() === connectedAccount.toLowerCase()
            const isLastAdmin = admins.length === 1
            const canRevoke =
              connectedIsAdmin && !(isSelf && isLastAdmin)
            return (
              <li
                key={addr}
                className="flex items-center justify-between gap-3 px-5 py-3 flex-wrap"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Address value={addr} variant="short" />
                  {isSelf && (
                    <span className="text-[10px] font-mono uppercase tracking-wider text-subtle border border-line rounded px-1.5 py-0.5">
                      you
                    </span>
                  )}
                </div>
                {canRevoke && (
                  <button
                    type="button"
                    onClick={() => onRevoke(addr)}
                    disabled={busy}
                    className="text-xs text-muted hover:text-rose-400 transition-colors inline-flex items-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {pendingTarget === addr && (
                      <span
                        aria-hidden
                        className="inline-block h-3 w-3 rounded-full border border-current border-r-transparent animate-spin"
                      />
                    )}
                    {pendingTarget === addr
                      ? isPending
                        ? 'Sign…'
                        : 'Revoking…'
                      : 'Revoke'}
                  </button>
                )}
                {isSelf && isLastAdmin && (
                  <span className="text-[11px] text-subtle">
                    Last admin — cannot self-revoke
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {connectedIsAdmin ? (
        <div className="rounded-xl border border-line bg-surface p-5 space-y-3">
          <div>
            <div className="text-sm font-medium text-ink">Add an admin</div>
            <div className="text-xs text-subtle">
              Use a Safe or multisig address for production deployments — adding
              an EOA concentrates trust.
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              value={addDraft}
              onChange={(e) => setAddDraft(e.target.value)}
              placeholder="0x…"
              className="input font-mono text-xs flex-1 min-w-[260px]"
            />
            <button
              type="button"
              onClick={onAdd}
              disabled={!addValid || busy}
              className="btn-primary text-xs px-4 py-2 inline-flex items-center gap-1.5"
            >
              {pendingTarget === 'ADD' && (
                <span
                  aria-hidden
                  className="inline-block h-3 w-3 rounded-full border border-current border-r-transparent animate-spin"
                />
              )}
              {pendingTarget === 'ADD'
                ? isPending
                  ? 'Sign…'
                  : 'Mining…'
                : 'Add admin'}
            </button>
          </div>
          {addDraft && !isAddress(addDraft) && (
            <p className="text-xs text-rose-400">Invalid address.</p>
          )}
          {addDraft && isAddress(addDraft) && !addValid && (
            <p className="text-xs text-subtle">Already an admin.</p>
          )}
          {writeError && (
            <p className="text-xs text-rose-400 font-mono">
              {writeError.message.split('\n')[0]}
            </p>
          )}
        </div>
      ) : (
        <p className="text-sm text-subtle border-l-2 border-line pl-3">
          Connect as a whitelisted admin to add or revoke admins.
        </p>
      )}
    </section>
  )
}

// ============ Sponsoring tab ============

function SponsoringPanel({
  proxy,
  isAdmin,
}: {
  proxy: Address
  isAdmin: boolean
}) {
  const { limits, refetch: refetchLimits } = useClaimLimits(proxy)
  const { balance: poolBalance, refetch: refetchPool } = useSponsorPool(proxy)
  const { metrics: sMetrics, refetch: refetchMetrics } = useSponsoredMetrics(proxy)
  const { stats: burnStats, refetch: refetchBurn } = usePoolBurnRate(proxy)

  function onWriteDone() {
    refetchLimits()
    refetchPool()
    refetchMetrics()
    refetchBurn()
  }

  return (
    <section className="space-y-10">
      <div>
        <h2 className="text-sm font-medium uppercase tracking-wider text-subtle">
          Sponsoring
        </h2>
        <p className="mt-1 text-sm text-muted max-w-2xl">
          This proxy runs the sponsored-channel implementation. Admins top
          the pool up whenever they need to; any user interacting with the
          proxy draws from it transparently via{' '}
          <code className="font-mono text-ink">deposit</code> /{' '}
          <code className="font-mono text-ink">createAtoms</code> with reduced
          or zero <code className="font-mono text-ink">msg.value</code>. Rate
          limits bound drain per user.
        </p>
      </div>

      <PoolHealthBadge balance={poolBalance} burn={burnStats} />

      <section className="grid gap-4 sm:grid-cols-3">
        <Stat
          label="Sponsored deposits"
          value={sMetrics ? sMetrics.sponsoredDeposits.toString() : '—'}
        />
        <Stat
          label="Unique receivers"
          value={sMetrics ? sMetrics.uniqueSponsoredReceivers.toString() : '—'}
        />
        <Stat
          label="Sponsored volume"
          value={
            sMetrics ? `${formatEther(sMetrics.sponsoredVolume)} TRUST` : '—'
          }
        />
        <Stat
          label="Max claim / tx"
          value={limits ? `${formatEther(limits.maxClaimPerTx)} TRUST` : '—'}
        />
        <Stat
          label="Max calls / user / window"
          value={limits ? limits.maxClaimsPerWindow.toString() : '—'}
        />
        <Stat
          label="Max TRUST / user / window"
          value={
            limits
              ? `${formatEther(limits.maxClaimVolumePerWindow)} TRUST`
              : '—'
          }
        />
        <Stat
          label="Window length"
          value={limits ? formatWindow(limits.claimWindowSeconds) : '—'}
        />
      </section>

      {isAdmin ? (
        <>
          <FundPoolPanel proxy={proxy} onDone={onWriteDone} />
          <ReclaimFromPoolPanel
            proxy={proxy}
            poolBalance={poolBalance}
            onDone={onWriteDone}
          />
          <ClaimLimitsPanel proxy={proxy} current={limits} onDone={onWriteDone} />
        </>
      ) : (
        <p className="text-sm text-subtle border-l-2 border-line pl-3">
          Connect as a whitelisted admin to fund the pool, reclaim, or change
          claim limits.
        </p>
      )}
    </section>
  )
}

type PoolHealthState = 'healthy' | 'low' | 'critical' | 'empty' | 'idle'

function PoolHealthBadge({
  balance,
  burn,
}: {
  balance: bigint | undefined
  burn: PoolBurnStats | undefined
}) {
  const hasBalance = balance !== undefined
  const hasRate = burn !== undefined && burn.ratePerDay > 0n

  const runwayDays =
    hasBalance && hasRate ? Number(balance! / burn!.ratePerDay) : undefined

  const state: PoolHealthState = !hasBalance
    ? 'idle'
    : balance === 0n
      ? 'empty'
      : !hasRate
        ? 'idle'
        : runwayDays! >= 7
          ? 'healthy'
          : runwayDays! >= 2
            ? 'low'
            : 'critical'

  const meta = {
    healthy: {
      dot: 'bg-emerald-500',
      label: 'Pool healthy',
      tone: 'text-emerald-400',
      border: 'border-emerald-500/30',
      bg: 'bg-emerald-500/[0.05]',
    },
    low: {
      dot: 'bg-amber-500',
      label: 'Pool low — refill soon',
      tone: 'text-amber-400',
      border: 'border-amber-500/40',
      bg: 'bg-amber-500/[0.06]',
    },
    critical: {
      dot: 'bg-rose-500',
      label: 'Pool critical — refill now',
      tone: 'text-rose-400',
      border: 'border-rose-500/40',
      bg: 'bg-rose-500/[0.06]',
    },
    empty: {
      dot: 'bg-rose-500',
      label: 'Pool empty — sponsored calls blocked',
      tone: 'text-rose-400',
      border: 'border-rose-500/40',
      bg: 'bg-rose-500/[0.06]',
    },
    idle: {
      dot: 'bg-subtle',
      label: 'Pool — not enough activity to estimate runway',
      tone: 'text-subtle',
      border: 'border-line',
      bg: 'bg-surface',
    },
  }[state]

  const rateDisplay = hasRate
    ? `${formatEther(burn!.ratePerDay)} TRUST/day`
    : burn && burn.daysCovered === 0
      ? 'No activity yet'
      : '—'

  const runwayDisplay =
    runwayDays !== undefined
      ? `~${runwayDays} ${runwayDays === 1 ? 'day' : 'days'}`
      : '—'

  return (
    <section className={`rounded-xl border ${meta.border} ${meta.bg} p-5`}>
      <div className="flex items-center gap-2 mb-4">
        <span className={`inline-block h-2 w-2 rounded-full ${meta.dot}`} />
        <span
          className={`text-[11px] font-mono uppercase tracking-wider ${meta.tone}`}
        >
          {meta.label}
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-subtle">
            Balance
          </div>
          <div className="mt-1 text-lg font-semibold text-ink">
            {hasBalance ? `${formatEther(balance!)} TRUST` : '—'}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-subtle">
            Burn rate (7d)
          </div>
          <div className="mt-1 text-lg font-semibold text-ink">
            {rateDisplay}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-subtle">
            Runway
          </div>
          <div className="mt-1 text-lg font-semibold text-ink">
            {runwayDisplay}
          </div>
        </div>
      </div>
    </section>
  )
}

function FundPoolPanel({
  proxy,
  onDone,
}: {
  proxy: Address
  onDone: () => void
}) {
  const [amount, setAmount] = useState('')
  const { fund, hash, isPending, error, reset } = useFundPool(proxy)
  const receipt = useWaitForTransactionReceipt({ hash })

  useEffect(() => {
    if (receipt.isSuccess) {
      onDone()
      setAmount('')
      reset()
    }
  }, [hash, receipt.isSuccess])

  const amountValid = amount !== '' && Number(amount) > 0

  async function onSubmit() {
    if (!amountValid) return
    try {
      await fund(parseEther(amount))
    } catch (e) {
      console.error(e)
    }
  }

  return (
    <section className="card space-y-4">
      <div>
        <h3 className="font-semibold">Fund the pool</h3>
        <p className="text-xs text-subtle">
          Top up the shared sponsorship pool with TRUST from your wallet. Any
          user interacting with this proxy will draw from the pool
          transparently (bounded by the per-user rate limits).
        </p>
      </div>

      <label className="block space-y-1">
        <div className="text-xs text-muted">Amount (TRUST)</div>
        <input
          type="number"
          step="any"
          min="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="10.0"
          className="input"
        />
      </label>

      <button
        type="button"
        onClick={onSubmit}
        disabled={!amountValid || isPending || receipt.isLoading}
        className="btn-primary"
      >
        {isPending ? 'Sign…' : receipt.isLoading ? 'Mining…' : 'Fund pool'}
      </button>

      {error && (
        <p className="text-xs text-rose-400 font-mono">
          {error.message.split('\n')[0]}
        </p>
      )}
    </section>
  )
}

function ReclaimFromPoolPanel({
  proxy,
  poolBalance,
  onDone,
}: {
  proxy: Address
  poolBalance: bigint | undefined
  onDone: () => void
}) {
  const [amount, setAmount] = useState('')
  const [to, setTo] = useState('')
  const { reclaim, hash, isPending, error, reset } = useReclaimFromPool(proxy)
  const receipt = useWaitForTransactionReceipt({ hash })

  useEffect(() => {
    if (receipt.isSuccess) {
      onDone()
      setAmount('')
      reset()
    }
  }, [hash, receipt.isSuccess])

  const toValid = isAddress(to)
  const amountValid = amount !== '' && Number(amount) > 0

  async function onSubmit() {
    if (!toValid || !amountValid) return
    try {
      await reclaim(parseEther(amount), to as Address)
    } catch (e) {
      console.error(e)
    }
  }

  return (
    <section className="card space-y-4">
      <div>
        <div className="text-[10px] font-mono uppercase tracking-wider text-subtle">
          Counterpart to Fund pool
        </div>
        <h3 className="font-semibold mt-1">Reclaim from pool</h3>
        <p className="text-xs text-subtle mt-1 leading-relaxed">
          Withdraw TRUST you previously funded but that users haven&apos;t
          spent yet. Use when scaling sponsorship down, rotating capital to
          a different treasury, or shutting the program down entirely.
          Can&apos;t touch accumulated fees or user shares — only the pool
          balance, and never more than what&apos;s currently there.
        </p>
      </div>

      <label className="block space-y-1">
        <div className="text-xs text-muted">Recipient</div>
        <input
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="0x…"
          className="input font-mono text-xs"
        />
      </label>

      <label className="block space-y-1">
        <div className="text-xs text-muted">Amount (TRUST)</div>
        <input
          type="number"
          step="any"
          min="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="1.0"
          className="input"
        />
        {poolBalance !== undefined && (
          <div className="text-xs text-subtle mt-1">
            Pool balance: {formatEther(poolBalance)} TRUST
          </div>
        )}
      </label>

      <button
        type="button"
        onClick={onSubmit}
        disabled={
          !toValid || !amountValid || isPending || receipt.isLoading
        }
        className="btn-primary"
      >
        {isPending
          ? 'Sign…'
          : receipt.isLoading
            ? 'Mining…'
            : 'Reclaim from pool'}
      </button>

      {error && (
        <p className="text-xs text-rose-400 font-mono">
          {error.message.split('\n')[0]}
        </p>
      )}
    </section>
  )
}

const WINDOW_PRESETS: ReadonlyArray<{ label: string; seconds: bigint }> = [
  { label: '1 hour', seconds: 3600n },
  { label: '1 day', seconds: 86400n },
  { label: '1 week', seconds: 604800n },
  { label: '30 days', seconds: 2592000n },
]

function formatWindow(seconds: bigint): string {
  const match = WINDOW_PRESETS.find((p) => p.seconds === seconds)
  if (match) return match.label
  const n = Number(seconds)
  if (n % 86400 === 0) return `${n / 86400} days`
  if (n % 3600 === 0) return `${n / 3600} hours`
  if (n % 60 === 0) return `${n / 60} min`
  return `${n}s`
}

function ClaimLimitsPanel({
  proxy,
  current,
  onDone,
}: {
  proxy: Address
  current:
    | {
        maxClaimPerTx: bigint
        maxClaimsPerWindow: bigint
        maxClaimVolumePerWindow: bigint
        claimWindowSeconds: bigint
      }
    | undefined
  onDone: () => void
}) {
  const [maxPerTx, setMaxPerTx] = useState('')
  const [maxPerWindow, setMaxPerWindow] = useState('')
  const [maxVolume, setMaxVolume] = useState('')
  const [windowSec, setWindowSec] = useState('')
  const { setClaimLimits, hash, isPending, error, reset } =
    useSetClaimLimits(proxy)
  const receipt = useWaitForTransactionReceipt({ hash })

  useEffect(() => {
    if (current) {
      setMaxPerTx(formatEther(current.maxClaimPerTx))
      setMaxPerWindow(current.maxClaimsPerWindow.toString())
      setMaxVolume(formatEther(current.maxClaimVolumePerWindow))
      setWindowSec(current.claimWindowSeconds.toString())
    }
  }, [
    current?.maxClaimPerTx,
    current?.maxClaimsPerWindow,
    current?.maxClaimVolumePerWindow,
    current?.claimWindowSeconds,
  ])

  useEffect(() => {
    if (receipt.isSuccess) {
      onDone()
      reset()
    }
  }, [hash, receipt.isSuccess])

  const txValid = Number(maxPerTx) > 0
  const windowCountValid =
    Number.isInteger(Number(maxPerWindow)) && Number(maxPerWindow) > 0
  const volumeValid = Number(maxVolume) > 0
  const windowSecNum = Number(windowSec)
  const windowSecValid =
    Number.isInteger(windowSecNum) && windowSecNum > 0 && windowSecNum <= 4_294_967_295
  const allValid = txValid && windowCountValid && volumeValid && windowSecValid

  async function onSubmit() {
    if (!allValid) return
    try {
      await setClaimLimits(
        parseEther(maxPerTx),
        BigInt(maxPerWindow),
        parseEther(maxVolume),
        BigInt(windowSec),
      )
    } catch (e) {
      console.error(e)
    }
  }

  return (
    <section className="card space-y-4">
      <div>
        <h3 className="font-semibold">Claim limits</h3>
        <p className="text-xs text-subtle">
          Per-user caps applied over a configurable rolling window. All four
          values must stay &gt; 0 — there is no &ldquo;unlimited&rdquo; mode
          (set a cap high if you want it effectively open).
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1">
          <div className="text-xs text-muted">Max claim per tx (TRUST)</div>
          <input
            type="number"
            step="any"
            min="0"
            value={maxPerTx}
            onChange={(e) => setMaxPerTx(e.target.value)}
            className="input"
          />
          {!txValid && <p className="text-xs text-rose-400 mt-1">Must be &gt; 0.</p>}
        </label>
        <label className="block space-y-1">
          <div className="text-xs text-muted">
            Max pool-drawing calls per user / window
          </div>
          <input
            type="number"
            step="1"
            min="1"
            value={maxPerWindow}
            onChange={(e) => setMaxPerWindow(e.target.value)}
            className="input"
          />
          {!windowCountValid && (
            <p className="text-xs text-rose-400 mt-1">Integer &gt; 0.</p>
          )}
        </label>
        <label className="block space-y-1">
          <div className="text-xs text-muted">
            Max cumulative TRUST per user / window
          </div>
          <input
            type="number"
            step="any"
            min="0"
            value={maxVolume}
            onChange={(e) => setMaxVolume(e.target.value)}
            className="input"
          />
          {!volumeValid && (
            <p className="text-xs text-rose-400 mt-1">Must be &gt; 0.</p>
          )}
        </label>
        <label className="block space-y-1">
          <div className="text-xs text-muted">Window length (seconds)</div>
          <input
            type="number"
            step="1"
            min="1"
            value={windowSec}
            onChange={(e) => setWindowSec(e.target.value)}
            className="input"
          />
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {WINDOW_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => setWindowSec(p.seconds.toString())}
                className="text-[10px] font-mono uppercase tracking-wider rounded border border-line bg-canvas px-2 py-0.5 text-subtle hover:text-ink hover:border-line-strong transition-colors"
              >
                {p.label}
              </button>
            ))}
          </div>
          {!windowSecValid && (
            <p className="text-xs text-rose-400 mt-1">Integer &gt; 0.</p>
          )}
        </label>
      </div>

      <button
        type="button"
        onClick={onSubmit}
        disabled={!allValid || isPending || receipt.isLoading}
        className="btn-primary"
      >
        {isPending
          ? 'Sign…'
          : receipt.isLoading
            ? 'Mining…'
            : 'Update limits'}
      </button>

      {error && (
        <p className="text-xs text-rose-400 font-mono">
          {error.message.split('\n')[0]}
        </p>
      )}
    </section>
  )
}
