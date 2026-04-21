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
    <section className="card space-y-4">
      <div>
        <h3 className="font-semibold">Fund the pool</h3>
        <p className="text-xs text-subtle">
          Top up the shared sponsorship pool with TRUST from your wallet.
          Any user interacting with this proxy will draw from the pool
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
