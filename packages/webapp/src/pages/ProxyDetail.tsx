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
import { useAccount, useWaitForTransactionReceipt } from 'wagmi'

import { useIsAdmin, useProxyStats, useSetFees, useWithdraw } from '../hooks/useProxy'
import {
  useProxyVersions,
  useRegisterVersion,
  useSetDefaultVersion,
} from '../hooks/useVersionedProxy'
import Address from '../components/Address'

export default function ProxyDetailPage() {
  const { address: proxyParam } = useParams()
  const proxy = proxyParam && isAddress(proxyParam) ? (proxyParam as Address) : undefined

  const { address: account } = useAccount()
  const { stats, refetch, isLoading } = useProxyStats(proxy)
  const { isAdmin } = useIsAdmin(proxy, account)
  const { versions, defaultVersion, proxyAdmin, refetch: refetchVersions } =
    useProxyVersions(proxy)
  const isProxyAdmin =
    account && proxyAdmin && account.toLowerCase() === proxyAdmin.toLowerCase()

  if (!proxy) {
    return (
      <div className="max-w-xl">
        <h1 className="text-3xl font-bold">Proxy</h1>
        <p className="text-rose-400 mt-2 font-mono text-sm">Invalid proxy address in URL.</p>
      </div>
    )
  }

  return (
    <div className="space-y-10 max-w-3xl">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-ink">
          Fee proxy
        </h1>
        <Address value={proxy} variant="short" />
      </header>

      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton h-20 rounded-xl" />
          ))}
        </div>
      )}

      {stats && (
        <>
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
        </>
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
