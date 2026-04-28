import { useEffect, useState } from 'react'
import { formatEther, parseEther, type Address } from 'viem'
import { useWaitForTransactionReceipt } from 'wagmi'

import { ops } from '@intuition-fee-proxy/safe-tx'
import { useSetFees } from '../hooks/useProxy'
import { useSafeAdmin } from '../hooks/useSafeAdmin'
import { useSafePropose } from '../hooks/useSafePropose'
import { SafeProposeFeedback } from './SafeProposeFeedback'

interface Props {
  proxy: Address
  currentFixed: bigint
  currentPct: bigint
  onDone: () => void
}

export function SetFeesPanel({ proxy, currentFixed, currentPct, onDone }: Props) {
  const [fixedEth, setFixedEth] = useState<string>(formatEther(currentFixed))
  const [pctBps, setPctBps] = useState<string>(currentPct.toString())

  const { setDepositFixedFee, setDepositPercentageFee, hash, isPending, error } =
    useSetFees(proxy)
  const receipt = useWaitForTransactionReceipt({ hash })

  const { safe } = useSafeAdmin(proxy)
  const safePropose = useSafePropose({ safeAddress: safe })

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

  async function onProposeFixed() {
    if (!fixedValid || !safe) return
    safePropose.reset()
    try {
      await safePropose.propose(ops.v2Admin.setDepositFixedFee(proxy, parseEther(fixedEth)))
    } catch (e) {
      console.error(e)
    }
  }

  async function onProposePct() {
    if (!pctValid || !safe) return
    safePropose.reset()
    try {
      await safePropose.propose(ops.v2Admin.setDepositPercentageFee(proxy, BigInt(pctBps)))
    } catch (e) {
      console.error(e)
    }
  }

  return (
    <section className="card space-y-4">
      <div>
        <h2 className="font-semibold">Update fees</h2>
        <p className="text-xs text-subtle">
          Admin-only. Direct write takes effect immediately. Safe propose
          opens a multisig transaction for owners to co-sign in Den.
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
            disabled={!fixedValid || isPending || safePropose.isProposing}
            className="btn-primary w-full mt-1"
          >
            Update fixed
          </button>
          {safe && (
            <button
              type="button"
              onClick={onProposeFixed}
              disabled={!fixedValid || isPending || safePropose.isProposing}
              className="btn-secondary w-full mt-1 text-xs"
            >
              {safePropose.isProposing ? 'Proposing…' : 'Propose via Safe'}
            </button>
          )}
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
            disabled={!pctValid || isPending || safePropose.isProposing}
            className="btn-primary w-full mt-1"
          >
            Update percentage
          </button>
          {safe && (
            <button
              type="button"
              onClick={onProposePct}
              disabled={!pctValid || isPending || safePropose.isProposing}
              className="btn-secondary w-full mt-1 text-xs"
            >
              {safePropose.isProposing ? 'Proposing…' : 'Propose via Safe'}
            </button>
          )}
        </label>
      </div>

      <SafeProposeFeedback proposed={safePropose.proposed} error={safePropose.error} />

      {error && (
        <p className="text-xs text-rose-400 font-mono">
          {error.message.split('\n')[0]}
        </p>
      )}
    </section>
  )
}
