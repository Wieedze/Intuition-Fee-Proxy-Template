import { useEffect, useState } from 'react'
import { isAddress, type Address } from 'viem'
import { useWaitForTransactionReceipt } from 'wagmi'

import { ops } from '@intuition-fee-proxy/safe-tx'
import {
  useAdmins,
  useIsAdmin,
  useSetWhitelistedAdmin,
} from '../hooks/useProxy'
import { useSafeAdmin } from '../hooks/useSafeAdmin'
import { useSafePropose } from '../hooks/useSafePropose'
import AddressDisplay from './Address'
import { SafeBadge } from './SafeBadge'
import { SafeProposeFeedback } from './SafeProposeFeedback'
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
  const [pendingTarget, setPendingTarget] = useState<Address | 'ADD' | null>(
    null,
  )
  const [postTxRefreshing, setPostTxRefreshing] = useState(false)

  const { safe } = useSafeAdmin(proxy)
  const safePropose = useSafePropose({ safeAddress: safe })

  const busy = isPending || receipt.isLoading || postTxRefreshing || safePropose.isProposing

  useEffect(() => {
    if (receipt.isSuccess) {
      refetch()
      reset()
      setAddDraft('')
      setPostTxRefreshing(true)
    }
  }, [hash, receipt.isSuccess])

  useEffect(() => {
    if (postTxRefreshing && !isLoading) {
      setPostTxRefreshing(false)
      setPendingTarget(null)
    }
  }, [postTxRefreshing, isLoading])

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

  async function onProposeAdd() {
    if (!addValid || !safe) return
    safePropose.reset()
    try {
      await safePropose.propose(
        ops.v2Admin.setWhitelistedAdmin(proxy, addDraft as Address, true),
      )
    } catch (e) {
      console.error(e)
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

  async function onProposeRevoke(addr: Address) {
    if (!safe) return
    safePropose.reset()
    try {
      await safePropose.propose(
        ops.v2Admin.setWhitelistedAdmin(proxy, addr, false),
      )
    } catch (e) {
      console.error(e)
    }
  }

  // The form is visible if the user can either direct-write (already an
  // admin) or propose via Safe (a Safe is in the admin list — Safe owners
  // who aren't direct admins can still propose).
  const canInteract = connectedIsAdmin || Boolean(safe)

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
        Controls fees, withdrawals and (sponsored) pool funding. Cannot
        register new implementations.
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
            const canDirectRevoke = connectedIsAdmin && !(isSelf && isLastAdmin)
            const canProposeRevoke = Boolean(safe) && !isLastAdmin
            return (
              <li
                key={addr}
                className="flex items-center justify-between gap-3 px-5 py-3 flex-wrap"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <AddressDisplay value={addr} variant="short" />
                  <SafeBadge
                    address={addr}
                    safeUiUrl={`https://safe.onchainden.com/home?safe=int:${addr}`}
                  />
                  {isSelf && (
                    <span className="text-[10px] font-mono uppercase tracking-wider text-subtle border border-line rounded px-1.5 py-0.5">
                      you
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {canDirectRevoke && (
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
                  {canProposeRevoke && (
                    <button
                      type="button"
                      onClick={() => onProposeRevoke(addr)}
                      disabled={busy}
                      className="text-xs text-muted hover:text-ink transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Propose revoke via Safe
                    </button>
                  )}
                  {isSelf && isLastAdmin && (
                    <span className="text-[11px] text-subtle">
                      Last admin — cannot self-revoke
                    </span>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {canInteract ? (
        <div className="rounded-xl border border-line bg-surface p-5 space-y-3">
          <div className="flex items-baseline justify-between gap-2 flex-wrap">
            <div className="text-sm font-medium text-ink">
              Grant Role 2 to a new address
            </div>
            <div className="text-[10px] text-subtle">
              Prefer a Safe — granting to an EOA concentrates trust
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              value={addDraft}
              onChange={(e) => setAddDraft(e.target.value)}
              placeholder="0x…"
              className="input font-mono text-xs flex-1 min-w-[260px]"
            />
            {connectedIsAdmin && (
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
            )}
            {safe && (
              <button
                type="button"
                onClick={onProposeAdd}
                disabled={!addValid || busy}
                className="btn-secondary text-xs px-4 py-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {safePropose.isProposing ? 'Proposing…' : 'Propose via Safe'}
              </button>
            )}
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
          Connect as a whitelisted admin (or as a Safe owner of a Safe in the admin list) to add or revoke admins.
        </p>
      )}

      <SafeProposeFeedback proposed={safePropose.proposed} error={safePropose.error} />
    </section>
  )
}
