import { useEffect, useState } from 'react'
import { formatEther, isAddress, parseEther, type Address } from 'viem'
import { useWaitForTransactionReceipt } from 'wagmi'

import { useReclaimFromPool } from '../hooks/useSponsoredProxy'

interface Props {
  proxy: Address
  poolBalance: bigint | undefined
  onDone: () => void
}

export function ReclaimFromPoolPanel({ proxy, poolBalance, onDone }: Props) {
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
        disabled={!toValid || !amountValid || isPending || receipt.isLoading}
        className="btn-primary"
      >
        {isPending ? 'Sign…' : receipt.isLoading ? 'Mining…' : 'Reclaim from pool'}
      </button>

      {error && (
        <p className="text-xs text-rose-400 font-mono">
          {error.message.split('\n')[0]}
        </p>
      )}
    </section>
  )
}
