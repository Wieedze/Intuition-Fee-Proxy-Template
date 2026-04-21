import { useEffect, useState } from 'react'
import { isAddress, type Address } from 'viem'
import { useWaitForTransactionReceipt } from 'wagmi'

import {
  useAdmins,
  useIsAdmin,
  useSetWhitelistedAdmin,
} from '../hooks/useProxy'
import AddressDisplay from './Address'
import { Spinner } from './Spinner'

interface Props {
  proxy: Address
  connectedAccount: Address | undefined
}

export function AdminsPanel({ proxy, connectedAccount }: Props) {
  const { admins, isLoading, error, refetch } = useAdmins(proxy)
  const { isAdmin: connectedIsAdmin } = useIsAdmin(proxy, connectedAccount)
  const {
    setAdmin,
    hash,
    isPending,
    error: writeError,
    reset,
  } = useSetWhitelistedAdmin(proxy)
  const receipt = useWaitForTransactionReceipt({ hash })
  const [addDraft, setAddDraft] = useState('')
  // Tracks which row (or 'ADD') owns the in-flight tx, so only that button
  // shows "Signing…" / "Mining…" state. Other rows stay idle (but disabled).
  const [pendingTarget, setPendingTarget] = useState<Address | 'ADD' | null>(
    null,
  )
  // True between "receipt mined" and "admins list refetched" — bridges the
  // gap where the tx is done but the event-log-derived list hasn't caught
  // up yet. Drives the discrete title spinner + keeps the row button
  // spinner alive so the UI never looks idle during that window.
  const [postTxRefreshing, setPostTxRefreshing] = useState(false)

  const busy = isPending || receipt.isLoading || postTxRefreshing

  useEffect(() => {
    if (receipt.isSuccess) {
      refetch()
      reset()
      setAddDraft('')
      setPostTxRefreshing(true)
    }
  }, [hash, receipt.isSuccess])

  // Release the spinner once the admins refetch settles.
  useEffect(() => {
    if (postTxRefreshing && !isLoading) {
      setPostTxRefreshing(false)
      setPendingTarget(null)
    }
  }, [postTxRefreshing, isLoading])

  // If the write errored or the user rejected the signature, release the
  // per-row pending marker so the buttons become clickable again.
  useEffect(() => {
    if (
      !isPending &&
      !receipt.isLoading &&
      !receipt.isSuccess &&
      !postTxRefreshing &&
      pendingTarget
    ) {
      setPendingTarget(null)
    }
  }, [isPending, receipt.isLoading, receipt.isSuccess, postTxRefreshing, writeError])

  const addValid =
    isAddress(addDraft) &&
    !admins.some((a) => a.toLowerCase() === addDraft.toLowerCase())

  async function onAdd() {
    if (!addValid) return
    setPendingTarget('ADD')
    try {
      await setAdmin(addDraft as Address, true)
    } catch (e) {
      console.error(e)
      setPendingTarget(null)
    }
  }

  async function onRevoke(addr: Address) {
    setPendingTarget(addr)
    try {
      await setAdmin(addr, false)
    } catch (e) {
      console.error(e)
      setPendingTarget(null)
    }
  }

  return (
    <section className="card border-l-4 border-l-line-strong space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-baseline gap-3">
          <span className="text-[10px] font-mono uppercase tracking-widest text-muted">
            Role 2
          </span>
          <h2 className="font-semibold inline-flex items-baseline gap-2">
            Fee admins (whitelisted)
            {(postTxRefreshing || (isLoading && admins.length > 0)) && (
              <Spinner ariaLabel="Refreshing" />
            )}
          </h2>
        </div>
        <span className="text-[10px] uppercase tracking-wide text-subtle">
          N addresses · instant add/revoke
        </span>
      </div>
      <p className="text-xs text-muted leading-relaxed">
        Controls money flow — withdraw accumulated fees, change fee settings,
        add / revoke other fee admins, and on sponsored proxies fundPool /
        reclaim / setClaimLimits. <strong>Cannot</strong> register new
        implementation versions. List is reconstructed from on-chain events.
      </p>

      {isLoading && admins.length === 0 && (
        <div className="space-y-2">
          <div className="skeleton h-12 w-full" />
          <div className="skeleton h-12 w-full" />
        </div>
      )}

      {error && (
        <p className="text-sm font-mono text-rose-400">
          Failed to load admins: {error.message.split('\n')[0]}
        </p>
      )}

      {admins.length > 0 && (
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface overflow-hidden">
          {admins.map((addr) => {
            const isSelf =
              connectedAccount &&
              addr.toLowerCase() === connectedAccount.toLowerCase()
            const isLastAdmin = admins.length === 1
            const canRevoke = connectedIsAdmin && !(isSelf && isLastAdmin)
            return (
              <li
                key={addr}
                className="flex items-center justify-between gap-3 px-5 py-3 flex-wrap"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <AddressDisplay value={addr} variant="short" />
                  {isSelf && (
                    <span className="text-[10px] font-mono uppercase tracking-wider text-subtle border border-line rounded px-1.5 py-0.5">
                      you
                    </span>
                  )}
                </div>
                {canRevoke && (
                  <button
                    type="button"
                    onClick={() => onRevoke(addr)}
                    disabled={busy}
                    className="text-xs text-muted hover:text-rose-400 transition-colors inline-flex items-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {pendingTarget === addr && <Spinner />}
                    {pendingTarget === addr
                      ? isPending
                        ? 'Sign…'
                        : 'Revoking…'
                      : 'Revoke'}
                  </button>
                )}
                {isSelf && isLastAdmin && (
                  <span className="text-[11px] text-subtle">
                    Last admin — cannot self-revoke
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {connectedIsAdmin ? (
        <div className="rounded-xl border border-line bg-surface p-5 space-y-3">
          <div>
            <div className="text-sm font-medium text-ink">
              Grant Role 2 to a new address
            </div>
            <div className="text-xs text-subtle">
              Grants fee admin rights. Use a Safe or multisig address for
              production deployments — granting to an EOA concentrates trust.
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              value={addDraft}
              onChange={(e) => setAddDraft(e.target.value)}
              placeholder="0x…"
              className="input font-mono text-xs flex-1 min-w-[260px]"
            />
            <button
              type="button"
              onClick={onAdd}
              disabled={!addValid || busy}
              className="btn-primary text-xs px-4 py-2 inline-flex items-center gap-1.5"
            >
              {pendingTarget === 'ADD' && <Spinner />}
              {pendingTarget === 'ADD'
                ? isPending
                  ? 'Sign…'
                  : 'Mining…'
                : 'Grant'}
            </button>
          </div>
          {addDraft && !isAddress(addDraft) && (
            <p className="text-xs text-rose-400">Invalid address.</p>
          )}
          {addDraft && isAddress(addDraft) && !addValid && (
            <p className="text-xs text-subtle">Already an admin.</p>
          )}
          {writeError && (
            <p className="text-xs text-rose-400 font-mono">
              {writeError.message.split('\n')[0]}
            </p>
          )}
        </div>
      ) : (
        <p className="text-sm text-subtle border-l-2 border-line pl-3">
          Connect as a whitelisted admin to add or revoke admins.
        </p>
      )}
    </section>
  )
}
