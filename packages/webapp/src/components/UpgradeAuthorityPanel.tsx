import { useEffect, useState } from 'react'
import { isAddress, type Address } from 'viem'
import { useWaitForTransactionReceipt } from 'wagmi'

import { ops } from '@intuition-fee-proxy/safe-tx'
import { useSetWhitelistedAdmin } from '../hooks/useProxy'
import { usePostTxRefreshing } from '../hooks/usePostTxRefreshing'
import { useSafePropose } from '../hooks/useSafePropose'
import { useSafeStatuses } from '../hooks/useSafeStatus'
import {
  useProxyAdmins,
  useSetProxyAdmin,
} from '../hooks/useVersionedProxy'
import AddressDisplay from './Address'
import { ProxyAdminSafeBanner } from './ProxyAdminSafeBanner'
import { SafeBadge } from './SafeBadge'
import { SafeProposeFeedback } from './SafeProposeFeedback'
import { Spinner } from './Spinner'

interface Props {
  proxy: Address
  account: Address | undefined
  isConnectedFeeAdmin: boolean
  onTransferred: () => void
  isRefreshing: boolean
}

/**
 * Role 1 panel — multi-admin whitelist (post 2-step retirement). Mirrors
 * `AdminsPanel` (Role 2) in structure: list + per-row revoke + grant
 * form. Direct write for current proxyAdmins, "Propose via Safe" path
 * when at least one Safe sits in the whitelist.
 *
 * Default visible: the list and grant form.
 * Advanced (collapsible, closed by default): the "grant both roles in
 * one click" convenience + the Role 1 vs Role 2 explainer.
 */
export function UpgradeAuthorityPanel({
  proxy,
  account,
  isConnectedFeeAdmin,
  onTransferred,
  isRefreshing,
}: Props) {
  const { admins: proxyAdmins, isLoading, refetch } = useProxyAdmins(proxy)
  const adminStatuses = useSafeStatuses(proxyAdmins)
  const safeAdmin = proxyAdmins.find(
    (a) => adminStatuses[a.toLowerCase()]?.kind === 'safe',
  )
  const safePropose = useSafePropose({ safeAddress: safeAdmin })

  const isYou = Boolean(
    account &&
      proxyAdmins.some(
        (a) => account.toLowerCase() === a.toLowerCase(),
      ),
  )

  const {
    setProxyAdmin,
    hash,
    isPending,
    error: writeError,
    reset,
  } = useSetProxyAdmin(proxy)
  const receipt = useWaitForTransactionReceipt({ hash })

  const [addDraft, setAddDraft] = useState('')
  const [pendingTarget, setPendingTarget] = useState<Address | 'ADD' | null>(null)
  const postTx = usePostTxRefreshing(isRefreshing)

  useEffect(() => {
    if (receipt.isSuccess) {
      refetch()
      reset()
      setAddDraft('')
      onTransferred()
      postTx.start()
    }
  }, [hash, receipt.isSuccess])

  useEffect(() => {
    if (
      !isPending &&
      !receipt.isLoading &&
      !receipt.isSuccess &&
      pendingTarget
    ) {
      setPendingTarget(null)
    }
  }, [isPending, receipt.isLoading, receipt.isSuccess, writeError])

  const addValid =
    isAddress(addDraft) &&
    !proxyAdmins.some((a) => a.toLowerCase() === addDraft.toLowerCase())

  const busy = isPending || receipt.isLoading || safePropose.isProposing

  async function onGrant() {
    if (!addValid) return
    setPendingTarget('ADD')
    try {
      await setProxyAdmin(addDraft as Address, true)
    } catch (e) {
      console.error(e)
      setPendingTarget(null)
    }
  }

  async function onRevoke(addr: Address) {
    setPendingTarget(addr)
    try {
      await setProxyAdmin(addr, false)
    } catch (e) {
      console.error(e)
      setPendingTarget(null)
    }
  }

  async function onProposeGrant() {
    if (!addValid || !safeAdmin) return
    safePropose.reset()
    try {
      await safePropose.propose(
        ops.versionedProxy.setProxyAdmin(proxy, addDraft as Address, true),
      )
    } catch (e) {
      console.error(e)
    }
  }

  async function onProposeRevoke(addr: Address) {
    if (!safeAdmin) return
    safePropose.reset()
    try {
      await safePropose.propose(
        ops.versionedProxy.setProxyAdmin(proxy, addr, false),
      )
    } catch (e) {
      console.error(e)
    }
  }

  const canInteract = isYou || Boolean(safeAdmin)

  return (
    <section className="card border-l-4 border-l-brand/70 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-baseline gap-3">
          <span className="text-[10px] font-mono uppercase tracking-widest text-brand">
            Role 1
          </span>
          <h2 className="font-semibold inline-flex items-baseline gap-2">
            Upgrade authority (proxyAdmins)
            {(postTx.active || (isLoading && proxyAdmins.length > 0)) && (
              <Spinner ariaLabel="Refreshing" />
            )}
          </h2>
        </div>
        <span className="text-[10px] uppercase tracking-wide text-subtle">
          {proxyAdmins.length} address{proxyAdmins.length === 1 ? '' : 'es'} ·
          instant grant/revoke
        </span>
      </div>

      <p className="text-[11px] text-muted leading-relaxed -mt-2">
        Controls implementation registration and default version. Mirrors
        Role 2's pattern (whitelist + last-admin guard). Use a Safe for
        production — its internal quorum is the safety net we used to
        get from the 2-step transfer.
      </p>

      <ProxyAdminSafeBanner proxyAdmin={safeAdmin ?? proxyAdmins[0]} />

      {isLoading && proxyAdmins.length === 0 && (
        <div className="space-y-2">
          <div className="skeleton h-12 w-full" />
          <div className="skeleton h-12 w-full" />
        </div>
      )}

      {proxyAdmins.length > 0 && (
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface overflow-hidden">
          {proxyAdmins.map((addr) => {
            const isSelf =
              account && addr.toLowerCase() === account.toLowerCase()
            const isLast = proxyAdmins.length === 1
            const canDirectRevoke = isYou && !isLast
            const canProposeRevoke = Boolean(safeAdmin) && !isLast
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
                    <span className="text-[10px] font-mono uppercase tracking-wider text-brand border border-brand/40 rounded px-1.5 py-0.5">
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
                  {isLast && (
                    <span className="text-[11px] text-subtle">
                      Last admin — cannot revoke
                    </span>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {canInteract && (
        <div className="rounded-xl border border-line bg-surface p-5 space-y-3">
          <div>
            <div className="text-sm font-medium text-ink">
              Grant Role 1 to a new address
            </div>
            <div className="text-xs text-subtle">
              Adds an address to the proxyAdmins whitelist. Use a Safe
              for production deployments.
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              value={addDraft}
              onChange={(e) => setAddDraft(e.target.value)}
              placeholder="0x…"
              className="input font-mono text-xs flex-1 min-w-[260px]"
            />
            {isYou && (
              <button
                type="button"
                onClick={onGrant}
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
            {safeAdmin && (
              <button
                type="button"
                onClick={onProposeGrant}
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
            <p className="text-xs text-subtle">Already a proxyAdmin.</p>
          )}
          {writeError && (
            <p className="text-xs text-rose-400 font-mono">
              {writeError.message.split('\n')[0]}
            </p>
          )}
        </div>
      )}

      <SafeProposeFeedback proposed={safePropose.proposed} error={safePropose.error} />

      <AdvancedSection
        proxy={proxy}
        canGrantBoth={isYou && isConnectedFeeAdmin}
        onWriteDone={() => {
          refetch()
          onTransferred()
          postTx.start()
        }}
      />
    </section>
  )
}

/**
 * Collapsible "Advanced" section — closed by default.
 *
 * Houses two things:
 *  1. The grant-both-roles convenience (only enabled when the caller is
 *     a direct admin on BOTH roles — granting both via Safe is just two
 *     separate ProposeViaSafe flows, no point bundling).
 *  2. The Role 1 vs Role 2 explainer paragraph (operational reference,
 *     not needed in the main flow once the user is familiar).
 */
function AdvancedSection({
  proxy,
  canGrantBoth,
  onWriteDone,
}: {
  proxy: Address
  canGrantBoth: boolean
  onWriteDone: () => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="border-t border-line pt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-[11px] uppercase tracking-wider text-subtle hover:text-ink transition-colors inline-flex items-center gap-1"
      >
        <span aria-hidden>{open ? '▾' : '▸'}</span>
        Advanced
      </button>

      {open && (
        <div className="mt-3 space-y-4">
          {canGrantBoth && <GrantBothRolesForm proxy={proxy} onDone={onWriteDone} />}
          <p className="text-xs text-subtle leading-relaxed">
            <strong className="text-muted">Role 1 vs Role 2.</strong>{' '}
            Role 1 (proxyAdmins) controls <em>which logic</em> the proxy
            delegates to — register new implementations, change default
            version, rename. It <strong>cannot</strong> touch fees,
            withdrawals, or the sponsor pool; those are Role 2 below.
            Both roles use the same whitelist model with last-admin
            guard. Keep them disjoint if your dev team and ops team
            are distinct.
          </p>
        </div>
      )}
    </div>
  )
}

/**
 * Convenience: grant Role 1 + Role 2 to a new address in two back-to-back
 * transactions. Only available when the caller currently holds both roles
 * (direct admin on each). For Safe-mediated grants, use the per-role
 * Propose via Safe buttons — each goes through its own quorum anyway.
 */
function GrantBothRolesForm({
  proxy,
  onDone,
}: {
  proxy: Address
  onDone: () => void
}) {
  const [input, setInput] = useState('')
  const [stage, setStage] = useState<'idle' | 'role1' | 'role2'>('idle')

  const role1 = useSetProxyAdmin(proxy)
  const role1Receipt = useWaitForTransactionReceipt({ hash: role1.hash })
  const role2 = useSetWhitelistedAdmin(proxy)
  const role2Receipt = useWaitForTransactionReceipt({ hash: role2.hash })

  const inputValid = isAddress(input.trim())

  useEffect(() => {
    if (stage === 'role1' && role1Receipt.isSuccess) {
      setStage('role2')
      role2.setAdmin(input.trim() as Address, true).catch(() => setStage('idle'))
    }
  }, [stage, role1Receipt.isSuccess])

  useEffect(() => {
    if (stage === 'role2' && role2Receipt.isSuccess) {
      setStage('idle')
      setInput('')
      onDone()
    }
  }, [stage, role2Receipt.isSuccess])

  const busy = stage !== 'idle'

  function start() {
    if (!inputValid) return
    setStage('role1')
    role1.setProxyAdmin(input.trim() as Address, true).catch(() => setStage('idle'))
  }

  const label = (() => {
    if (stage === 'role1') {
      return role1.isPending ? 'Sign Role 1…' : 'Granting Role 1…'
    }
    if (stage === 'role2') {
      return role2.isPending ? 'Sign Role 2…' : 'Granting Role 2…'
    }
    return 'Grant both roles'
  })()

  return (
    <div className="rounded-md border border-brand/30 bg-brand/5 p-3 space-y-2">
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-[10px] font-mono uppercase tracking-widest text-brand">
          Convenience
        </span>
        <strong className="text-sm">
          Grant both roles to a single address
        </strong>
      </div>
      <p className="text-[11px] text-subtle leading-relaxed">
        You currently hold both roles. This runs{' '}
        <code className="font-mono text-ink">setProxyAdmin(new, true)</code>{' '}
        then{' '}
        <code className="font-mono text-ink">setWhitelistedAdmin(new, true)</code>{' '}
        back-to-back (2 signatures). Both grants are instant — no
        2-step ceremony.
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          spellCheck={false}
          placeholder="0x…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={busy}
          className="input flex-1 min-w-[18rem] font-mono text-xs"
        />
        <button
          type="button"
          onClick={start}
          disabled={!inputValid || busy}
          className="btn-primary text-xs px-3 py-1.5"
        >
          {label}
        </button>
      </div>
      {(role1.error || role2.error) && (
        <p className="text-xs text-rose-400 font-mono break-words">
          {(role1.error ?? role2.error)!.message.split('\n')[0]}
        </p>
      )}
    </div>
  )
}
