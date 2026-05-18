import { useEffect, useState } from 'react'
import { parseEther, type Address } from 'viem'
import { useWaitForTransactionReceipt } from 'wagmi'

import { useFundPool } from '../hooks/useSponsoredProxy'

interface Props {
  proxy: Address
  onDone: () => void
}

export function FundPoolPanel({ proxy, onDone }: Props) {
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
    <section className="card flex flex-col gap-4 h-full">
      <div className="flex items-baseline gap-3 flex-wrap">
        <span className="text-[10px] font-mono uppercase tracking-widest text-muted">
          Public
        </span>
        <div>
          <h2 className="font-semibold">Fund the pool</h2>
          <p className="text-xs text-subtle">
            Permissionless — anyone can top up the shared pool.
          </p>
        </div>
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

      <div className="mt-auto space-y-2">
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
      </div>
    </section>
  )
}
