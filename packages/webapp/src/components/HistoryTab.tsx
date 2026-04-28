import { useMemo, useState } from 'react'
import { formatEther, parseEther, type Address } from 'viem'
import { useChainId, useWaitForTransactionReceipt } from 'wagmi'

import { useFeeWithdrawals } from '../hooks/useProxy'
import {
  matchRefunds,
  usePoolReclaims,
  usePoolTopUps,
  useReclaimFromPool,
  useSponsorPool,
} from '../hooks/useSponsoredProxy'
import AddressDisplay from './Address'
import { formatDateParts } from '../lib/format'

interface Props {
  proxy: Address
  isAdmin: boolean
  channel: 'standard' | 'sponsored' | 'unknown'
}

type TopUpRow = {
  kind: 'topup'
  blockNumber: bigint
  logIndex: number
  timestamp: number | undefined
  txHash: `0x${string}`
  funder: Address
  amount: bigint
  refunded: boolean
  refundTxHash: `0x${string}` | undefined
}

type WithdrawalRow = {
  kind: 'withdrawal'
  blockNumber: bigint
  logIndex: number
  timestamp: number | undefined
  txHash: `0x${string}`
  to: Address
  amount: bigint
  by: Address
}

type HistoryRow = TopUpRow | WithdrawalRow

/**
 * Unified proxy history — chronological feed of meaningful public events.
 * Currently surfaces three event types:
 *   - PoolFunded         (sponsored only) "top-up"     — refundable by admins
 *   - PoolReclaimed      (sponsored only) attached as "refunded" on top-ups
 *   - FeesWithdrawn      (both channels)  "withdrawal"
 *
 * Visible to everyone. Only whitelisted admins see the Refund button on
 * top-ups; withdrawals are informational only.
 */
export function HistoryTab({ proxy, isAdmin, channel }: Props) {
  const chainId = useChainId()
  const explorerRoot = EXPLORER_BY_CHAIN[chainId]

  const isSponsored = channel === 'sponsored'

  const {
    topUps,
    isLoading: topUpsLoading,
    error: topUpsError,
    refetch: refetchTopUps,
  } = usePoolTopUps(isSponsored ? proxy : undefined)
  const { reclaims, refetch: refetchReclaims } = usePoolReclaims(
    isSponsored ? proxy : undefined,
  )
  const {
    withdrawals,
    isLoading: withdrawalsLoading,
    error: withdrawalsError,
    refetch: refetchWithdrawals,
  } = useFeeWithdrawals(proxy)
  const { balance: poolBalance } = useSponsorPool(
    isSponsored ? proxy : undefined,
  )

  const rows: HistoryRow[] = useMemo(() => {
    const topUpRows: TopUpRow[] = matchRefunds(topUps, reclaims).map((t) => ({
      kind: 'topup',
      blockNumber: t.blockNumber,
      logIndex: t.logIndex,
      timestamp: t.timestamp,
      txHash: t.txHash,
      funder: t.funder,
      amount: t.amount,
      refunded: t.refunded,
      refundTxHash: t.refundTxHash,
    }))
    const withdrawalRows: WithdrawalRow[] = withdrawals.map((w) => ({
      kind: 'withdrawal',
      blockNumber: w.blockNumber,
      logIndex: w.logIndex,
      timestamp: w.timestamp,
      txHash: w.txHash,
      to: w.to,
      amount: w.amount,
      by: w.by,
    }))
    const merged = [...topUpRows, ...withdrawalRows]
    merged.sort((a, b) => {
      if (a.blockNumber !== b.blockNumber)
        return Number(b.blockNumber - a.blockNumber)
      return b.logIndex - a.logIndex
    })
    return merged
  }, [topUps, reclaims, withdrawals])

  const isLoading = topUpsLoading || withdrawalsLoading
  const error = topUpsError ?? withdrawalsError

  const [refundingId, setRefundingId] = useState<string | null>(null)

  const refetchAll = () => {
    refetchTopUps()
    refetchReclaims()
    refetchWithdrawals()
  }

  return (
    <section className="space-y-4">
      <div className="card space-y-2">
        <h3 className="font-semibold">History</h3>
        <p className="text-sm text-subtle leading-relaxed">
          Chronological log of every public event on this proxy — pool
          contributions, refunds, and fee withdrawals.
        </p>
        {isSponsored && (
          <div className="text-xs text-muted">
            Current pool balance:{' '}
            <span className="font-mono text-ink">
              {poolBalance !== undefined ? formatEther(poolBalance) : '—'}
            </span>{' '}
            TRUST
          </div>
        )}
      </div>

      {isLoading && (
        <div className="card">
          <div className="skeleton h-8 rounded-md" />
        </div>
      )}

      {error && (
        <div className="card">
          <p className="text-xs text-rose-400 font-mono">
            Error loading history: {error.message}
          </p>
        </div>
      )}

      {!isLoading && !error && rows.length === 0 && (
        <div className="card">
          <p className="text-sm text-subtle">
            No activity yet. As soon as someone{' '}
            {isSponsored ? (
              <>
                funds the pool via{' '}
                <code className="font-mono text-muted text-xs">fundPool()</code>{' '}
                or an admin withdraws fees, it will show up here.
              </>
            ) : (
              <>
                an admin withdraws fees, it will show up here.
              </>
            )}
          </p>
        </div>
      )}

      {!isLoading && rows.length > 0 && (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-muted border-b border-line">
                <th className="px-4 py-2.5 font-medium">Date</th>
                <th className="px-4 py-2.5 font-medium">Event</th>
                <th className="px-4 py-2.5 font-medium">From</th>
                <th className="px-4 py-2.5 font-medium text-right">Amount</th>
                <th className="px-4 py-2.5 font-medium text-right">Tx</th>
                <th className="px-4 py-2.5 font-medium text-right">
                  {isAdmin ? 'Actions' : ''}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const rowId = `${r.txHash}-${r.logIndex}`
                if (r.kind === 'topup') {
                  return (
                    <TopUpRowView
                      key={rowId}
                      rowId={rowId}
                      proxy={proxy}
                      row={r}
                      explorerRoot={explorerRoot}
                      isAdmin={isAdmin}
                      isEditing={refundingId === rowId}
                      onStartRefund={() => setRefundingId(rowId)}
                      onCancelRefund={() => setRefundingId(null)}
                      onRefundDone={() => {
                        setRefundingId(null)
                        refetchAll()
                      }}
                    />
                  )
                }
                return (
                  <WithdrawalRowView
                    key={rowId}
                    row={r}
                    explorerRoot={explorerRoot}
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

// ============ Row renderers ============

function EventBadge({
  kind,
}: {
  kind: 'topup' | 'withdrawal'
}) {
  if (kind === 'topup') {
    return (
      <span className="inline-flex items-center rounded-full border border-brand/40 bg-brand/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-brand">
        Top-up
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-full border border-line-strong bg-canvas px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted">
      Withdrawal
    </span>
  )
}

function ExplorerIcon() {
  return <span aria-hidden="true">↗</span>
}

interface TopUpRowProps {
  rowId: string
  proxy: Address
  row: TopUpRow
  explorerRoot: string | undefined
  isAdmin: boolean
  isEditing: boolean
  onStartRefund: () => void
  onCancelRefund: () => void
  onRefundDone: () => void
}

function TopUpRowView({
  rowId: _rowId,
  proxy,
  row,
  explorerRoot,
  isAdmin,
  isEditing,
  onStartRefund,
  onCancelRefund,
  onRefundDone,
}: TopUpRowProps) {
  const { funder, amount, timestamp, txHash, refunded, refundTxHash } = row
  const { reclaim, hash, isPending, error, reset } = useReclaimFromPool(proxy)
  const receipt = useWaitForTransactionReceipt({ hash })

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

  if (receipt.isSuccess) {
    reset()
    onRefundDone()
  }

  const dateParts = timestamp ? formatDateParts(timestamp) : null
  const txShort = `${txHash.slice(0, 6)}…${txHash.slice(-4)}`

  return (
    <>
      <tr className="border-b border-line/60 last:border-b-0">
        <td className="px-4 py-2.5 text-muted whitespace-nowrap">
          {dateParts ? (
            <div className="leading-tight">
              <div>{dateParts.date}</div>
              <div className="text-[10px] text-subtle">{dateParts.time}</div>
            </div>
          ) : (
            '—'
          )}
        </td>
        <td className="px-4 py-2.5">
          <EventBadge kind="topup" />
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
                <ExplorerIcon />
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
              {txShort} <ExplorerIcon />
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
                  <ExplorerIcon />
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
          <td colSpan={6} className="px-4 py-3">
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

interface WithdrawalRowProps {
  row: WithdrawalRow
  explorerRoot: string | undefined
}

function WithdrawalRowView({ row, explorerRoot }: WithdrawalRowProps) {
  const { to, amount, by, timestamp, txHash } = row
  const dateParts = timestamp ? formatDateParts(timestamp) : null
  const txShort = `${txHash.slice(0, 6)}…${txHash.slice(-4)}`

  return (
    <tr className="border-b border-line/60 last:border-b-0">
      <td className="px-4 py-2.5 text-muted whitespace-nowrap">
        {dateParts ? (
          <div className="leading-tight">
            <div>{dateParts.date}</div>
            <div className="text-[10px] text-subtle">{dateParts.time}</div>
          </div>
        ) : (
          '—'
        )}
      </td>
      <td className="px-4 py-2.5">
        <EventBadge kind="withdrawal" />
      </td>
      <td className="px-4 py-2.5">
        <div className="text-xs text-subtle space-y-0.5">
          <div className="inline-flex items-center gap-2">
            <span className="text-muted">to</span>
            <AddressDisplay value={to} variant="short" />
            {explorerRoot && (
              <a
                href={`${explorerRoot}/address/${to}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-subtle hover:text-brand"
                aria-label="View recipient on explorer"
              >
                <ExplorerIcon />
              </a>
            )}
          </div>
          <div className="inline-flex items-center gap-2">
            <span className="text-muted">by admin</span>
            <AddressDisplay value={by} variant="short" />
          </div>
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
            {txShort} <ExplorerIcon />
          </a>
        ) : (
          <span className="text-xs font-mono text-muted">{txShort}</span>
        )}
      </td>
      <td className="px-4 py-2.5 text-right" />
    </tr>
  )
}

const EXPLORER_BY_CHAIN: Record<number, string> = {
  1155: 'https://explorer.intuition.systems',
  13579: 'https://testnet.explorer.intuition.systems',
}
