import type { Address } from 'viem'
import { usePendingSafeTxs } from '../hooks/usePendingSafeTxs'
import AddressDisplay from './Address'
import { Spinner } from './Spinner'

interface Props {
  safe: Address
}

/**
 * Read-only listing of Safe transactions currently waiting on owner
 * co-signatures or execution. Each row links to Den's UI for that Safe
 * + tx, where owners actually confirm and execute.
 *
 * Webapp's role here is "you can see what's queued and where to act
 * on it" — it deliberately does not duplicate Den's signing surface.
 */
export function PendingSafeTxsPanel({ safe }: Props) {
  const { txs, isLoading, error, refetch } = usePendingSafeTxs(safe)

  const denBaseUrl = `https://safe.onchainden.com/transactions/queue?safe=int:${safe}`

  return (
    <section className="card border-l-4 border-l-line-strong space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-baseline gap-3">
          <span className="text-[10px] font-mono uppercase tracking-widest text-muted">
            Safe queue
          </span>
          <h2 className="font-semibold inline-flex items-baseline gap-2">
            Pending Safe transactions
            {isLoading && <Spinner ariaLabel="Loading" />}
          </h2>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={refetch}
            disabled={isLoading}
            className="text-[11px] text-muted hover:text-ink transition-colors"
          >
            Refresh
          </button>
          <a
            href={denBaseUrl}
            target="_blank"
            rel="noreferrer"
            className="text-[11px] text-brand underline decoration-brand/60 hover:decoration-brand"
          >
            Open in Den ↗
          </a>
        </div>
      </div>
      <p className="text-xs text-muted leading-relaxed">
        Read-only view of transactions awaiting signatures or execution
        on the Safe that admins this proxy. Co-sign and execute happen in
        Den UI — click any row to jump there.
      </p>

      {error && (
        <p className="text-sm font-mono text-rose-400">
          Failed to load: {error}
        </p>
      )}

      {!isLoading && !error && txs.length === 0 && (
        <p className="text-xs text-subtle border-l-2 border-line pl-3">
          No pending transactions.
        </p>
      )}

      {txs.length > 0 && (
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface overflow-hidden">
          {txs.map((tx) => {
            const denUrl = `https://safe.onchainden.com/transactions/tx?safe=int:${safe}&id=multisig_${safe}_${tx.contractTransactionHash}`
            return (
              <li key={tx.contractTransactionHash} className="px-5 py-3 space-y-1">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-[10px] font-mono uppercase text-subtle tracking-wider border border-line rounded px-1.5 py-0.5">
                      nonce {tx.nonce}
                    </span>
                    <span className="text-xs text-muted">to</span>
                    <AddressDisplay value={tx.to} variant="short" />
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] text-subtle">
                      {tx.confirmations.length} confirmation{tx.confirmations.length === 1 ? '' : 's'}
                    </span>
                    <a
                      href={denUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] text-brand underline decoration-brand/60 hover:decoration-brand"
                    >
                      Sign in Den ↗
                    </a>
                  </div>
                </div>
                <div className="text-[10px] font-mono text-subtle break-all">
                  {tx.contractTransactionHash}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
