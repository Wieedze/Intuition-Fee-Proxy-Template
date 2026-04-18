import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  formatEther,
  isAddress,
  parseEther,
  type Address,
} from 'viem'
import { useAccount, useWaitForTransactionReceipt } from 'wagmi'

import { useIsAdmin, useProxyStats, useSetFees, useWithdraw } from '../hooks/useProxy'

export default function ProxyDetailPage() {
  const { address: proxyParam } = useParams()
  const proxy = proxyParam && isAddress(proxyParam) ? (proxyParam as Address) : undefined

  const { address: account } = useAccount()
  const { stats, refetch, isLoading } = useProxyStats(proxy)
  const { isAdmin } = useIsAdmin(proxy, account)

  if (!proxy) {
    return (
      <div className="max-w-xl">
        <h1 className="text-3xl font-bold">Proxy</h1>
        <p className="text-red-700 mt-2">Invalid proxy address in URL.</p>
      </div>
    )
  }

  return (
    <div className="space-y-8 max-w-3xl">
      <header>
        <div className="text-xs text-gray-500">Proxy address</div>
        <div className="font-mono text-sm break-all">{proxy}</div>
      </header>

      {isLoading && <p className="text-gray-600 text-sm">Loading stats…</p>}

      {stats && (
        <>
          <section className="grid gap-4 sm:grid-cols-3">
            <Stat label="Accumulated fees" value={`${formatEther(stats.accumulatedFees)} TRUST`} />
            <Stat label="Total collected (all-time)" value={`${formatEther(stats.totalFeesCollectedAllTime)} TRUST`} />
            <Stat label="Admins" value={stats.adminCount.toString()} />
            <Stat label="Fixed fee / deposit" value={`${formatEther(stats.depositFixedFee)} TRUST`} />
            <Stat label="Percentage fee" value={`${(Number(stats.depositPercentageFee) / 100).toFixed(2)}%`} />
            <Stat label="MultiVault" value={stats.ethMultiVault} mono />
          </section>

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
            <p className="text-sm text-gray-600">
              Connect as a whitelisted admin to withdraw fees or change config.
            </p>
          )}
        </>
      )}
    </div>
  )
}

function Stat({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-md border bg-white p-4">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`mt-1 text-sm ${mono ? 'font-mono break-all' : 'font-semibold'}`}>
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
    <section className="rounded-md border bg-white p-5 space-y-4">
      <div>
        <h2 className="font-semibold">Withdraw fees</h2>
        <p className="text-xs text-gray-500">
          Pull accumulated fees to any address. Admin-only.
        </p>
      </div>

      <label className="block space-y-1">
        <div className="text-xs text-gray-600">Recipient</div>
        <input
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="input font-mono text-xs"
          placeholder="0x…"
        />
      </label>

      <label className="block space-y-1">
        <div className="text-xs text-gray-600">
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
        <div className="text-xs text-gray-500">
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

      {isPending && <p className="text-xs text-gray-600">Confirm in wallet…</p>}
      {receipt.isLoading && <p className="text-xs text-gray-600">Mining…</p>}
      {error && <p className="text-xs text-red-700">{error.message.split('\n')[0]}</p>}
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
    <section className="rounded-md border bg-white p-5 space-y-4">
      <div>
        <h2 className="font-semibold">Update fees</h2>
        <p className="text-xs text-gray-500">
          Admin-only. Takes effect immediately.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1">
          <div className="text-xs text-gray-600">Fixed fee (TRUST)</div>
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
          <div className="text-xs text-gray-600">Percentage fee (bps)</div>
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

      {error && <p className="text-xs text-red-700">{error.message.split('\n')[0]}</p>}
    </section>
  )
}
