import { useEffect, useState } from 'react'
import { isAddress, type Address } from 'viem'
import { useWaitForTransactionReceipt } from 'wagmi'

import { ops } from '@intuition-fee-proxy/safe-tx'
import {
  useAcceptProxyAdmin,
  useTransferProxyAdmin,
} from '../hooks/useVersionedProxy'
import { useSafePropose } from '../hooks/useSafePropose'
import { useSafeStatus } from '../hooks/useSafeStatus'
import AddressDisplay from './Address'
import { useProxyAdminRotation } from '../hooks/useProxyAdminRotation'
import { usePostTxRefreshing } from '../hooks/usePostTxRefreshing'
import { ProxyAdminSafeBanner } from './ProxyAdminSafeBanner'
import { SafeBadge } from './SafeBadge'
import { SafeProposeFeedback } from './SafeProposeFeedback'
import { Spinner } from './Spinner'

const ZERO = '0x0000000000000000000000000000000000000000'

interface Props {
  proxy: Address
  proxyAdmin: Address | undefined
  pendingProxyAdmin: Address | undefined
  account: Address | undefined
  isConnectedFeeAdmin: boolean
  onTransferred: () => void
  isRefreshing: boolean
}

export function UpgradeAuthorityPanel({
  proxy,
  proxyAdmin,
  pendingProxyAdmin,
  account,
  isConnectedFeeAdmin,
  onTransferred,
  isRefreshing,
}: Props) {
  const isYou = Boolean(
    account &&
      proxyAdmin &&
      account.toLowerCase() === proxyAdmin.toLowerCase(),
  )
  const hasPending = Boolean(
    pendingProxyAdmin && pendingProxyAdmin.toLowerCase() !== ZERO,
  )
  const isPendingYou = Boolean(
    account &&
      pendingProxyAdmin &&
      account.toLowerCase() === pendingProxyAdmin.toLowerCase(),
  )
  const hasBothRoles = isYou && isConnectedFeeAdmin

  // Detect if proxyAdmin is itself a Safe — then we can propose
  // transferProxyAdmin / acceptProxyAdmin via that Safe.
  const proxyAdminStatus = useSafeStatus(proxyAdmin)
  const proxyAdminSafe = proxyAdminStatus.kind === 'safe' ? proxyAdmin : undefined
  // Same for the pending admin — useful when the new owner is a Safe
  // and needs to acceptProxyAdmin via that Safe's quorum.
  const pendingStatus = useSafeStatus(pendingProxyAdmin)
  const pendingIsSafe = pendingStatus.kind === 'safe'
  const safePropose = useSafePropose({
    safeAddress: proxyAdminSafe ?? (pendingIsSafe ? pendingProxyAdmin : undefined),
  })

  // Standalone "Grant Role 1" — separate write instance from the rotation.
  const [newAdminInput, setNewAdminInput] = useState('')
  const {
    transferAdmin,
    hash: transferHash,
    isPending: transferPending,
    error: transferError,
    reset: resetTransfer,
  } = useTransferProxyAdmin(proxy)
  const transferReceipt = useWaitForTransactionReceipt({ hash: transferHash })

  // Step 2 — pending admin accepts
  const {
    acceptAdmin,
    hash: acceptHash,
    isPending: acceptPending,
    error: acceptError,
    reset: resetAccept,
  } = useAcceptProxyAdmin(proxy)
  const acceptReceipt = useWaitForTransactionReceipt({ hash: acceptHash })

  // Bridges the window between "tx mined" and "useProxyVersions reflects
  // the new on-chain state" — drives the card-title spinner.
  const postTx = usePostTxRefreshing(isRefreshing)

  // Rotation state machine (grant + transfer + external-accept detection).
  const rotation = useProxyAdminRotation({
    proxy,
    proxyAdmin,
    account,
    onWriteSuccess: () => {
      onTransferred()
      postTx.start()
    },
  })

  // Transient success flash after acceptProxyAdmin lands — tells the
  // new admin visually that they now hold the role. Auto-dismisses.
  const [acceptedFlash, setAcceptedFlash] = useState(false)

  // Standalone transfer: clear input, refetch parent, bridge spinner.
  useEffect(() => {
    if (transferReceipt.isSuccess) {
      setNewAdminInput('')
      resetTransfer()
      onTransferred()
      postTx.start()
    }
  }, [transferReceipt.isSuccess])

  // Accept: refetch parent, flash success, bridge spinner.
  useEffect(() => {
    if (acceptReceipt.isSuccess) {
      resetAccept()
      onTransferred()
      postTx.start()
      setAcceptedFlash(true)
      const t = setTimeout(() => setAcceptedFlash(false), 6000)
      return () => clearTimeout(t)
    }
  }, [acceptReceipt.isSuccess])

  const inputValid = isAddress(newAdminInput.trim())

  const titleBusy =
    postTx.active ||
    transferPending ||
    transferReceipt.isLoading ||
    acceptPending ||
    acceptReceipt.isLoading ||
    rotation.busy

  return (
    <section className="card border-l-4 border-l-brand/70 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-baseline gap-3">
          <span className="text-[10px] font-mono uppercase tracking-widest text-brand">
            Role 1
          </span>
          <h2 className="font-semibold inline-flex items-baseline gap-2">
            Upgrade authority (proxyAdmin)
            {titleBusy && <Spinner ariaLabel="Refreshing" />}
          </h2>
        </div>
        <span className="text-[10px] uppercase tracking-wide text-subtle">
          Single slot · 2-step grant
        </span>
      </div>

      <p className="text-[11px] text-muted leading-relaxed -mt-2">
        Single slot. Controls implementation registration only — fees and
        withdrawals are Role 2. Use a Safe for production.
      </p>

      <ProxyAdminSafeBanner proxyAdmin={proxyAdmin} />

      {acceptedFlash && (
        <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 animate-fade-in">
          <span className="text-sm text-emerald-300">
            You are now <strong>proxyAdmin</strong> — transfer finalised
            on-chain.
          </span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] uppercase tracking-wide text-subtle mr-1">
          current
        </span>
        {proxyAdmin ? (
          <>
            <AddressDisplay value={proxyAdmin} variant="short" />
            <SafeBadge
              address={proxyAdmin}
              safeUiUrl={`https://safe.onchainden.com/home?safe=int:${proxyAdmin}`}
            />
            {isYou && (
              <span className="text-[10px] px-2 py-0.5 rounded bg-brand/10 text-brand uppercase tracking-wide">
                you
              </span>
            )}
          </>
        ) : (
          <span className="text-sm text-subtle">—</span>
        )}
      </div>

      {hasPending && (
        <div className="rounded border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] uppercase tracking-wide text-amber-400 mr-1">
              pending
            </span>
            <AddressDisplay value={pendingProxyAdmin as Address} variant="short" />
            {isPendingYou && (
              <span className="text-[10px] px-2 py-0.5 rounded bg-brand/10 text-brand uppercase tracking-wide">
                you
              </span>
            )}
          </div>
          <p className="text-xs text-subtle leading-relaxed">
            Pending must call{' '}
            <code className="font-mono text-ink">acceptProxyAdmin()</code> to
            finalise. Current admin can still overwrite.
          </p>
          {isPendingYou && (
            <button
              type="button"
              onClick={() => acceptAdmin()}
              disabled={acceptPending || acceptReceipt.isLoading}
              className="btn-primary text-xs px-3 py-1.5"
            >
              {acceptPending
                ? 'Sign…'
                : acceptReceipt.isLoading
                  ? 'Mining…'
                  : 'Accept proxyAdmin role'}
            </button>
          )}
          {pendingIsSafe && pendingProxyAdmin && (
            <button
              type="button"
              onClick={async () => {
                safePropose.reset()
                try {
                  await safePropose.propose(ops.versionedProxy.acceptProxyAdmin(proxy))
                } catch (e) {
                  console.error(e)
                }
              }}
              disabled={safePropose.isProposing}
              className="btn-secondary text-xs px-3 py-1.5"
            >
              {safePropose.isProposing ? 'Proposing…' : 'Propose acceptProxyAdmin via Safe'}
            </button>
          )}
          {acceptError && (
            <p className="text-xs text-rose-400 font-mono break-words">
              {acceptError.message.split('\n')[0]}
            </p>
          )}
        </div>
      )}

      {(isYou || proxyAdminSafe) && (
        <div className="space-y-2 pt-3 border-t border-line">
          <div className="flex items-baseline justify-between gap-2 flex-wrap">
            <label className="block text-[10px] uppercase tracking-wide text-subtle">
              Grant Role 1 to a new address
            </label>
            <span className="text-[10px] text-subtle">
              2-step · target then signs <code className="font-mono">acceptProxyAdmin()</code>
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              spellCheck={false}
              placeholder="0x…"
              value={newAdminInput}
              onChange={(e) => setNewAdminInput(e.target.value)}
              className="input flex-1 min-w-[18rem] font-mono text-xs"
            />
            {isYou && (
              <button
                type="button"
                onClick={() =>
                  inputValid && transferAdmin(newAdminInput.trim() as Address)
                }
                disabled={!inputValid || transferPending || transferReceipt.isLoading}
                className="btn-primary text-xs px-3 py-1.5"
              >
                {transferPending
                  ? 'Sign…'
                  : transferReceipt.isLoading
                    ? 'Mining…'
                    : hasPending
                      ? 'Replace pending'
                      : 'Grant'}
              </button>
            )}
            {proxyAdminSafe && (
              <button
                type="button"
                onClick={async () => {
                  if (!inputValid) return
                  safePropose.reset()
                  try {
                    await safePropose.propose(
                      ops.versionedProxy.transferProxyAdmin(
                        proxy,
                        newAdminInput.trim() as Address,
                      ),
                    )
                  } catch (e) {
                    console.error(e)
                  }
                }}
                disabled={!inputValid || safePropose.isProposing}
                className="btn-secondary text-xs px-3 py-1.5"
              >
                {safePropose.isProposing ? 'Proposing…' : 'Propose via Safe'}
              </button>
            )}
          </div>
          {transferError && (
            <p className="text-xs text-rose-400 font-mono break-words">
              {transferError.message.split('\n')[0]}
            </p>
          )}
        </div>
      )}

      {hasBothRoles && (
        <details className="group rounded-md border border-line bg-surface open:bg-brand/5 open:border-brand/30 transition-colors">
          <summary className="cursor-pointer list-none px-3 py-2 flex items-center justify-between gap-2 text-xs select-none">
            <span className="inline-flex items-baseline gap-2">
              <span className="text-[10px] font-mono uppercase tracking-widest text-brand">
                Advanced
              </span>
              <span className="font-medium text-ink">
                Grant both roles to a single address
              </span>
            </span>
            <span className="text-[10px] text-subtle group-open:hidden">expand</span>
            <span className="text-[10px] text-subtle hidden group-open:inline">collapse</span>
          </summary>
          <div className="border-t border-line/60 p-3">
            <RotateBothRolesForm rotation={rotation} />
          </div>
        </details>
      )}

      <SafeProposeFeedback proposed={safePropose.proposed} error={safePropose.error} />
    </section>
  )
}

/**
 * Subcomponent for the "grant both roles" convenience flow. Pure renderer
 * over the rotation state machine — no local state of its own.
 */
function RotateBothRolesForm({
  rotation,
}: {
  rotation: ReturnType<typeof useProxyAdminRotation>
}) {
  const buttonLabel = (() => {
    switch (rotation.stage) {
      case 'grant':
        return rotation.grantPending ? 'Sign Role 2…' : 'Granting Role 2…'
      case 'transfer':
        return rotation.transferPending ? 'Sign Role 1…' : 'Granting Role 1…'
      case 'done':
        return 'Waiting for accept…'
      default:
        return 'Grant both roles'
    }
  })()

  const stepDone = (s: 'grant' | 'transfer' | 'accept') => {
    if (s === 'grant')
      return rotation.grantConfirmed || rotation.stage === 'transfer' || rotation.stage === 'done'
    if (s === 'transfer') return rotation.stage === 'done'
    return false
  }

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-subtle leading-relaxed">
        Two signatures: <code className="font-mono text-ink">setWhitelistedAdmin</code>{' '}
        then <code className="font-mono text-ink">transferProxyAdmin</code>. The
        new admin then calls{' '}
        <code className="font-mono text-ink">acceptProxyAdmin()</code>.
      </p>
      {rotation.stage !== 'complete' && (
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            spellCheck={false}
            placeholder="0x…"
            value={rotation.input}
            onChange={(e) => rotation.setInput(e.target.value)}
            disabled={rotation.stage !== 'idle' && rotation.stage !== 'done'}
            className="input flex-1 min-w-[18rem] font-mono text-xs"
          />
          <button
            type="button"
            onClick={() => rotation.start()}
            disabled={!rotation.isValid || rotation.busy}
            className="btn-primary text-xs px-3 py-1.5"
          >
            {buttonLabel}
          </button>
        </div>
      )}
      {rotation.stage !== 'idle' && rotation.stage !== 'complete' && (
        <ol className="text-[11px] space-y-1 list-decimal list-inside">
          <li className={stepDone('grant') ? 'text-emerald-400' : rotation.stage === 'grant' ? 'text-ink' : 'text-subtle'}>
            Grant fee admin (immediate)
          </li>
          <li className={stepDone('transfer') ? 'text-emerald-400' : (rotation.stage === 'transfer' || rotation.stage === 'done') ? 'text-ink' : 'text-subtle'}>
            Transfer proxyAdmin (pending)
          </li>
          <li className={rotation.stage === 'done' ? 'text-ink' : 'text-subtle'}>
            New admin calls{' '}
            <code className="font-mono text-ink">acceptProxyAdmin()</code>
          </li>
        </ol>
      )}
      {rotation.stage === 'complete' && (
        <div className="space-y-2">
          <p className="text-xs text-emerald-400">
            Rotation complete. Optionally revoke your fee admin rights from
            the new admin&apos;s wallet.
          </p>
          <button
            type="button"
            onClick={rotation.reset}
            className="btn-secondary text-xs px-3 py-1.5"
          >
            Start new rotation
          </button>
        </div>
      )}
      {rotation.error && (
        <p className="text-xs text-rose-400 font-mono break-words">
          {rotation.error.split('\n')[0]}
        </p>
      )}
    </div>
  )
}
