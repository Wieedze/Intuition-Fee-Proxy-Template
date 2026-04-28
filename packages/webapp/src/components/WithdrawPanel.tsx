import { useEffect, useState } from 'react'
import { formatEther, isAddress, parseEther, type Address } from 'viem'
import { useAccount, useWaitForTransactionReceipt } from 'wagmi'

import { ops } from '@intuition-fee-proxy/safe-tx'
import { useWithdraw } from '../hooks/useProxy'
import { useSafeAdmin } from '../hooks/useSafeAdmin'
import { useSafePropose } from '../hooks/useSafePropose'
import { SafeProposeFeedback } from './SafeProposeFeedback'

interface Props {
  proxy: Address
  accumulated: bigint
  onDone: () => void
}

export function WithdrawPanel({ proxy, accumulated, onDone }: Props) {
  const { address } = useAccount()
  const [to, setTo] = useState<string>(address ?? '')
  const [amount, setAmount] = useState<string>('')

  const { withdraw, hash, isPending, error } = useWithdraw(proxy)
  const receipt = useWaitForTransactionReceipt({ hash })

  const { safe } = useSafeAdmin(proxy)
  const safePropose = useSafePropose({ safeAddress: safe })

  useEffect(() => {
    if (receipt.isSuccess) onDone()
  }, [hash, receipt.isSuccess])

  const toValid = isAddress(to)
  const amountValid = amount ? Number(amount) > 0 : false

  async function onWithdraw() {
    if (!toValid || !amountValid) return
    try {
      await withdraw(to as Address, parseEther(amount))
    } catch (e) {
      console.error(e)
    }
  }

  async function onProposeWithdraw() {
    if (!toValid || !amountValid || !safe) return
    safePropose.reset()
    try {
      await safePropose.propose(
        ops.v2Admin.withdraw(proxy, to as Address, parseEther(amount)),
      )
    } catch (e) {
      console.error(e)
    }
  }

  return (
    <section className="card space-y-4">
      <div>
        <h2 className="font-semibold">Withdraw fees</h2>
        <p className="text-xs text-subtle">
          Pull accumulated fees to any address. Admin-only. Direct write
          takes effect immediately. Safe propose opens a multisig
          transaction for owners to co-sign in Den.
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
        <div className="text-xs text-muted">Amount (TRUST)</div>
        <input
          type="number"
          step="any"
          min="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="input"
          placeholder="0.0"
        />
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="text-xs text-subtle">
            Available: {formatEther(accumulated)} TRUST
          </div>
          <div className="flex gap-1.5">
            {[25, 50, 100].map((pct) => (
              <button
                key={pct}
                type="button"
                onClick={() =>
                  setAmount(
                    formatEther((accumulated * BigInt(pct)) / 100n),
                  )
                }
                disabled={accumulated === 0n}
                className="text-[10px] font-mono uppercase tracking-wider rounded border border-line bg-canvas px-2 py-0.5 text-subtle hover:text-ink hover:border-line-strong transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pct}%
              </button>
            ))}
          </div>
        </div>
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onWithdraw}
          disabled={!toValid || !amountValid || isPending || safePropose.isProposing}
          className="btn-primary"
        >
          Withdraw
        </button>
        {safe && (
          <button
            type="button"
            onClick={onProposeWithdraw}
            disabled={!toValid || !amountValid || isPending || safePropose.isProposing}
            className="btn-secondary text-xs px-3"
          >
            {safePropose.isProposing ? 'Proposing…' : 'Propose via Safe'}
          </button>
        )}
      </div>

      {isPending && <p className="text-xs text-muted">Confirm in wallet…</p>}
      {receipt.isLoading && <p className="text-xs text-muted">Mining…</p>}

      <SafeProposeFeedback proposed={safePropose.proposed} error={safePropose.error} />

      {error && (
        <p className="text-xs text-rose-400 font-mono">
          {error.message.split('\n')[0]}
        </p>
      )}
    </section>
  )
}
