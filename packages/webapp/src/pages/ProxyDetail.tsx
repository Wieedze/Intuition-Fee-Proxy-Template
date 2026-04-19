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
import { useAccount, useBlockNumber, useWaitForTransactionReceipt } from 'wagmi'

import {
  useIsAdmin,
  useProxyMetrics,
  useProxyStats,
  useSetFees,
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
import Address from '../components/Address'

type TabId = 'overview' | 'metrics'

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

      <Tabs active={tab} onChange={setTab} />

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
            <Stat label="Accumulated fees" value={`${formatEther(stats.accumulatedFees)} TRUST`} emphasize />
            <Stat label="All-time collected" value={`${formatEther(stats.totalFeesCollectedAllTime)} TRUST`} />
            <Stat label="Admins" value={stats.adminCount.toString()} />
            <Stat label="Fixed fee / deposit" value={`${formatEther(stats.depositFixedFee)} TRUST`} />
            <Stat label="Percentage fee" value={`${(Number(stats.depositPercentageFee) / 100).toFixed(2)} %`} />
            <Stat label="MultiVault" value={stats.ethMultiVault} mono />
          </section>

          <VersionsPanel
            proxy={proxy}
            versions={versions}
            defaultVersion={defaultVersion}
            isProxyAdmin={Boolean(isProxyAdmin)}
            onDone={refetchVersions}
          />

          {isAdmin ? (
            <div className="space-y-8">
              <WithdrawPanel proxy={proxy} accumulated={stats.accumulatedFees} onDone={refetch} />
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
    </div>
  )
}

function Tabs({
  active,
  onChange,
}: {
  active: TabId
  onChange: (t: TabId) => void
}) {
  const items: { id: TabId; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'metrics', label: 'Metrics' },
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

  const blocksAgo =
    metrics && currentBlock && metrics.lastActivityBlock > 0n
      ? currentBlock - metrics.lastActivityBlock
      : undefined

  const fmtBig = (v: bigint | undefined) => (v === undefined ? '—' : v.toString())

  const lastActivity =
    metrics === undefined
      ? '—'
      : metrics.lastActivityBlock === 0n
        ? 'never'
        : `block ${metrics.lastActivityBlock.toString()}`

  const lastActivityHint =
    blocksAgo !== undefined && blocksAgo >= 0n
      ? blocksAgo === 0n
        ? 'just now'
        : `${blocksAgo.toString()} block${blocksAgo === 1n ? '' : 's'} ago`
      : metrics && metrics.lastActivityBlock === 0n
        ? 'no writes yet'
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

function decodeVersion(v: Hex): string {
  try {
    const decoded = hexToString(v, { size: 32 })
    return decoded || v
  } catch {
    return v
  }
}

function VersionsPanel({
  proxy,
  versions,
  defaultVersion,
  isProxyAdmin,
  onDone,
}: {
  proxy: Address
  versions: Hex[]
  defaultVersion: Hex | undefined
  isProxyAdmin: boolean
  onDone: () => void
}) {
  const [newLabel, setNewLabel] = useState('')
  const [newImpl, setNewImpl] = useState('')
  const [selectedVersion, setSelectedVersion] = useState<Hex | ''>('')

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

  const labelValid = newLabel.length > 0 && newLabel.length <= 32
  const implValid = isAddress(newImpl)

  async function onRegister() {
    if (!labelValid || !implValid) return
    try {
      await register(stringToHex(newLabel, { size: 32 }), newImpl as Address)
      setNewLabel('')
      setNewImpl('')
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
          <div className="space-y-2">
            <div className="text-xs font-medium">Register new version</div>
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
            <button
              type="button"
              onClick={onRegister}
              disabled={
                !labelValid ||
                !implValid ||
                registerPending ||
                registerReceipt.isLoading
              }
              className="btn-primary w-full"
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

          <div className="space-y-2">
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
              className="btn-primary w-full"
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
