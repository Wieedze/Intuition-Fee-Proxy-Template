import { useEffect, useState } from 'react'
import { isAddress, parseEther, type Address } from 'viem'
import { useWaitForTransactionReceipt } from 'wagmi'

import { ops } from '@intuition-fee-proxy/safe-tx'
import { useReclaimFromPool } from '../hooks/useSponsoredProxy'
import { useSafeAdmin } from '../hooks/useSafeAdmin'
import { useSafePropose } from '../hooks/useSafePropose'
import { SafeProposeFeedback } from './SafeProposeFeedback'

interface Props {
  proxy: Address
  onDone: () => void
}

export function ReclaimFromPoolPanel({ proxy, onDone }: Props) {
  const [amount, setAmount] = useState('')
  const [to, setTo] = useState('')
  const { reclaim, hash, isPending, error, reset } = useReclaimFromPool(proxy)
  const receipt = useWaitForTransactionReceipt({ hash })

  const { safe } = useSafeAdmin(proxy)
  const safePropose = useSafePropose({ safeAddress: safe })

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

  async function onProposeReclaim() {
    if (!toValid || !amountValid || !safe) return
    safePropose.reset()
    try {
      await safePropose.propose(
        ops.sponsored.reclaimFromPool(proxy, parseEther(amount), to as Address),
      )
    } catch (e) {
      console.error(e)
    }
  }

  return (
    <section className="card flex flex-col gap-4 h-full">
      <div className="flex items-baseline gap-3 flex-wrap">
        <span className="text-[10px] font-mono uppercase tracking-widest text-muted">
          Admin only
        </span>
        <div>
          <h2 className="font-semibold">Reclaim from pool</h2>
          <p className="text-xs text-subtle">
            Withdraw unspent TRUST you previously funded.
          </p>
        </div>
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
      </label>

      <div className="mt-auto space-y-2">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onSubmit}
            disabled={!toValid || !amountValid || isPending || receipt.isLoading || safePropose.isProposing}
            className="btn-primary"
          >
            {isPending ? 'Sign…' : receipt.isLoading ? 'Mining…' : 'Reclaim from pool'}
          </button>
          {safe && (
            <button
              type="button"
              onClick={onProposeReclaim}
              disabled={!toValid || !amountValid || isPending || receipt.isLoading || safePropose.isProposing}
              className="btn-secondary text-xs px-3"
            >
              {safePropose.isProposing ? 'Proposing…' : 'Propose via Safe'}
            </button>
          )}
        </div>

        <SafeProposeFeedback proposed={safePropose.proposed} error={safePropose.error} />

        {error && (
          <p className="text-xs text-rose-400 font-mono">
            {error.message.split('\n')[0]}
          </p>
        )}
      </div>
    </section>
  )
}
