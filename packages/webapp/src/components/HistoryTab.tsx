import { useMemo, useState } from 'react'
import { formatEther, parseEther, type Address } from 'viem'
import { useChainId, useWaitForTransactionReceipt } from 'wagmi'

import {
  matchRefunds,
  usePoolReclaims,
  usePoolTopUps,
  useReclaimFromPool,
  useSponsorPool,
} from '../hooks/useSponsoredProxy'
import AddressDisplay from './Address'
import { formatAbsoluteDate } from '../lib/format'

interface Props {
  proxy: Address
  isAdmin: boolean
}

/**
 * Permissionless pool "History" log:
 *   - ANY visitor sees the full list of PoolFunded events (funder + amount + date).
 *   - Admins see a per-row Refund button that pre-fills reclaimFromPool with
 *     the event's amount + funder address (both editable before confirming).
 *   - Refunded rows carry a "Refunded" badge, FIFO-matched against
 *     PoolReclaimed events per funder.
 *
 * Pool balance is shown at the top so the admin can tell at-a-glance if a
 * given refund will exceed what's left on-chain.
 */
export function HistoryTab({ proxy, isAdmin }: Props) {
  const chainId = useChainId()
  const explorerRoot = EXPLORER_BY_CHAIN[chainId]
  const {
    topUps,
    isLoading,
    error,
    refetch: refetchTopUps,
  } = usePoolTopUps(proxy)
  const { reclaims, refetch: refetchReclaims } = usePoolReclaims(proxy)
  const { balance: poolBalance } = useSponsorPool(proxy)

  // Merge top-ups with their refund status (FIFO-matched against reclaims).
  const rows = useMemo(
    () => matchRefunds(topUps, reclaims),
    [topUps, reclaims],
  )

  const refetch = () => {
    refetchTopUps()
    refetchReclaims()
  }

  // Which row is currently expanded into "refund editor" mode. Only one at a
  // time — prevents sending two overlapping txs accidentally.
  const [refundingId, setRefundingId] = useState<string | null>(null)

  return (
    <section className="space-y-4">
      <div className="card space-y-2">
        <h3 className="font-semibold">Pool top-ups</h3>
        <p className="text-sm text-subtle leading-relaxed">
          Anyone can contribute TRUST to this proxy&apos;s sponsor pool by
          calling{' '}
          <code className="font-mono text-muted text-xs">fundPool()</code>.
          Every contribution emits an on-chain{' '}
          <code className="font-mono text-muted text-xs">PoolFunded</code>{' '}
          event — the full list below is reconstructed from those logs.
        </p>
        <p className="text-sm text-subtle leading-relaxed">
          Contributions are one-way for donors: only whitelisted admins of
          this proxy can reclaim TRUST from the pool. An admin looking at
          this page can refund any single top-up in one click — the row
          below pre-fills the donor&apos;s address, the amount is editable.
        </p>
        <div className="text-xs text-muted">
          Current pool balance:{' '}
          <span className="font-mono text-ink">
            {poolBalance !== undefined ? formatEther(poolBalance) : '—'}
          </span>{' '}
          TRUST
        </div>
      </div>

      {isLoading && (
        <div className="card">
          <div className="skeleton h-8 rounded-md" />
        </div>
      )}

      {error && (
        <div className="card">
          <p className="text-xs text-rose-400 font-mono">
            Error loading top-ups: {error.message}
          </p>
        </div>
      )}

      {!isLoading && !error && rows.length === 0 && (
        <div className="card">
          <p className="text-sm text-subtle">
            No top-ups yet. The first person to call{' '}
            <code className="font-mono text-muted text-xs">fundPool()</code>{' '}
            will show up here.
          </p>
        </div>
      )}

      {!isLoading && rows.length > 0 && (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-muted border-b border-line">
                <th className="px-4 py-2.5 font-medium">Date</th>
                <th className="px-4 py-2.5 font-medium">Funder</th>
                <th className="px-4 py-2.5 font-medium text-right">Amount</th>
                <th className="px-4 py-2.5 font-medium text-right">Tx</th>
                <th className="px-4 py-2.5 font-medium text-right">
                  {isAdmin ? 'Actions' : ''}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => {
                const rowId = `${t.txHash}-${t.logIndex}`
                const isEditing = refundingId === rowId
                return (
                  <TopUpRow
                    key={rowId}
                    rowId={rowId}
                    proxy={proxy}
                    funder={t.funder}
                    amount={t.amount}
                    timestamp={t.timestamp}
                    txHash={t.txHash}
                    explorerRoot={explorerRoot}
                    isAdmin={isAdmin}
                    isEditing={isEditing}
                    refunded={t.refunded}
                    refundTxHash={t.refundTxHash}
                    onStartRefund={() => setRefundingId(rowId)}
                    onCancelRefund={() => setRefundingId(null)}
                    onRefundDone={() => {
                      setRefundingId(null)
                      refetch()
                    }}
                  />
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

// ============ Row ============

interface RowProps {
  rowId: string
  proxy: Address
  funder: Address
  amount: bigint
  timestamp: number | undefined
  txHash: `0x${string}`
  explorerRoot: string | undefined
  isAdmin: boolean
  isEditing: boolean
  refunded: boolean
  refundTxHash: `0x${string}` | undefined
  onStartRefund: () => void
  onCancelRefund: () => void
  onRefundDone: () => void
}

function TopUpRow({
  rowId: _rowId,
  proxy,
  funder,
  amount,
  timestamp,
  txHash,
  explorerRoot,
  isAdmin,
  isEditing,
  refunded,
  refundTxHash,
  onStartRefund,
  onCancelRefund,
  onRefundDone,
}: RowProps) {
  const { reclaim, hash, isPending, error, reset } = useReclaimFromPool(proxy)
  const receipt = useWaitForTransactionReceipt({ hash })

  // Editable amount for the refund (pre-filled with the event amount).
  const [amountInput, setAmountInput] = useState('')
  useMemo(() => {
    if (isEditing) setAmountInput(formatEther(amount))
  }, [isEditing, amount])

  const amountValid = (() => {
    const n = Number(amountInput)
    return Number.isFinite(n) && n > 0
  })()

  async function onConfirm() {
    if (!amountValid) return
    try {
      await reclaim(parseEther(amountInput), funder)
    } catch (e) {
      console.error(e)
    }
  }

  // When the reclaim tx is mined, notify parent and reset local state.
  if (receipt.isSuccess) {
    reset()
    onRefundDone()
  }

  const dateLabel = timestamp ? formatAbsoluteDate(timestamp) : '—'
  const txShort = `${txHash.slice(0, 6)}…${txHash.slice(-4)}`

  return (
    <>
      <tr className="border-b border-line/60 last:border-b-0">
        <td className="px-4 py-2.5 text-muted whitespace-nowrap">
          {dateLabel}
        </td>
        <td className="px-4 py-2.5">
          <div className="inline-flex items-center gap-2">
            <AddressDisplay value={funder} variant="short" />
            {explorerRoot && (
              <a
                href={`${explorerRoot}/address/${funder}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-subtle hover:text-brand"
                aria-label="View funder on explorer"
              >
                ↗
              </a>
            )}
          </div>
        </td>
        <td className="px-4 py-2.5 text-right font-mono text-ink">
          {formatEther(amount)} TRUST
        </td>
        <td className="px-4 py-2.5 text-right">
          {explorerRoot ? (
            <a
              href={`${explorerRoot}/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-mono text-subtle hover:text-brand"
            >
              {txShort} ↗
            </a>
          ) : (
            <span className="text-xs font-mono text-muted">{txShort}</span>
          )}
        </td>
        <td className="px-4 py-2.5 text-right">
          {refunded ? (
            <span className="inline-flex items-center gap-1.5">
              <span
                className="inline-flex items-center gap-1 rounded-full border border-brand/40 bg-brand/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-brand"
                title="This top-up has been fully refunded on-chain"
              >
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                >
                  <path
                    d="M20 6L9 17l-5-5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Refunded
              </span>
              {refundTxHash && explorerRoot && (
                <a
                  href={`${explorerRoot}/tx/${refundTxHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-subtle hover:text-brand"
                  aria-label="View refund tx"
                  title="View refund tx"
                >
                  ↗
                </a>
              )}
            </span>
          ) : (
            isAdmin &&
            !isEditing && (
              <button
                type="button"
                onClick={onStartRefund}
                className="text-xs rounded border border-line bg-canvas px-2 py-1 text-subtle hover:text-ink hover:border-line-strong transition-colors"
              >
                Refund
              </button>
            )
          )}
        </td>
      </tr>

      {isEditing && (
        <tr className="border-b border-line/60 last:border-b-0 bg-canvas/40">
          <td colSpan={5} className="px-4 py-3">
            <div className="flex flex-wrap items-end gap-3">
              <label className="block space-y-1">
                <div className="text-xs text-muted">Refund amount (TRUST)</div>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                  className="input w-48"
                />
              </label>
              <div className="text-xs text-subtle flex-1 min-w-[200px]">
                Sending to{' '}
                <span className="font-mono text-muted">
                  {funder.slice(0, 6)}…{funder.slice(-4)}
                </span>
                . If the pool no longer holds this amount, the tx reverts with{' '}
                <code className="font-mono">Sponsored_InsufficientClaim</code>.
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onConfirm}
                  disabled={!amountValid || isPending || receipt.isLoading}
                  className="btn-primary text-xs py-1.5"
                >
                  {isPending
                    ? 'Sign…'
                    : receipt.isLoading
                    ? 'Mining…'
                    : 'Confirm refund'}
                </button>
                <button
                  type="button"
                  onClick={onCancelRefund}
                  disabled={isPending || receipt.isLoading}
                  className="text-xs rounded border border-line bg-canvas px-3 py-1.5 text-subtle hover:text-ink transition-colors"
                >
                  Cancel
                </button>
              </div>
              {error && (
                <p className="w-full text-xs text-rose-400 font-mono">
                  {error.message.split('\n')[0]}
                </p>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// Mirrors the map in Layout.tsx. Kept local here so this component stays a
// self-contained drop-in; if the map grows, promote it to lib/config.
const EXPLORER_BY_CHAIN: Record<number, string> = {
  1155: 'https://explorer.intuition.systems',
  13579: 'https://testnet.explorer.intuition.systems',
}
