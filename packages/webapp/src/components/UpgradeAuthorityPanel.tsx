import { useEffect, useState } from 'react'
import { isAddress, type Address } from 'viem'
import { useWaitForTransactionReceipt } from 'wagmi'

import {
  useAcceptProxyAdmin,
  useTransferProxyAdmin,
} from '../hooks/useVersionedProxy'
import AddressDisplay from './Address'
import { useProxyAdminRotation } from '../hooks/useProxyAdminRotation'
import { usePostTxRefreshing } from '../hooks/usePostTxRefreshing'
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
        Only <strong>one</strong> address can hold this role at a time.
        For production, put a <strong>Gnosis Safe multisig</strong> here —
        the Safe itself handles N signers / threshold / signer rotation
        internally, so you get &ldquo;multi-human proxyAdmin&rdquo;
        without the contract knowing anything about it.
      </p>

      {acceptedFlash && (
        <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 flex items-center gap-2 animate-fade-in">
          <span
            aria-hidden
            className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400"
          >
            ✓
          </span>
          <span className="text-sm text-emerald-300">
            You are now <strong>proxyAdmin</strong> — the transfer has been
            finalised on-chain.
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
            A transfer has been initiated. The pending address must sign{' '}
            <code className="font-mono text-ink">acceptProxyAdmin()</code> from
            their wallet to finalise. Until then the current admin keeps all
            powers and can overwrite the pending candidate.
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
          {acceptError && (
            <p className="text-xs text-rose-400 font-mono break-words">
              {acceptError.message.split('\n')[0]}
            </p>
          )}
        </div>
      )}

      {isYou && (
        <div className="space-y-2 pt-2 border-t border-line">
          <label className="block text-[10px] uppercase tracking-wide text-subtle">
            Grant Role 1 to a new address (2-step)
          </label>
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              spellCheck={false}
              placeholder="0x…"
              value={newAdminInput}
              onChange={(e) => setNewAdminInput(e.target.value)}
              className="input flex-1 min-w-[18rem] font-mono text-xs"
            />
            <button
              type="button"
              onClick={() =>
                inputValid && transferAdmin(newAdminInput.trim() as Address)
              }
              disabled={!inputValid || transferPending || transferReceipt.isLoading}
              className="btn-secondary text-xs px-3 py-1.5"
            >
              {transferPending
                ? 'Sign…'
                : transferReceipt.isLoading
                  ? 'Mining…'
                  : hasPending
                    ? 'Grant (replace pending)'
                    : 'Grant'}
            </button>
          </div>
          {transferError && (
            <p className="text-xs text-rose-400 font-mono break-words">
              {transferError.message.split('\n')[0]}
            </p>
          )}
          <p className="text-[11px] text-subtle leading-relaxed">
            Grants Role 1 only — the target must then call{' '}
            <code className="font-mono text-ink">acceptProxyAdmin()</code>.
            Fee admin rights (Role 2) are untouched. Use the combined grant
            below if you hold both roles.
          </p>
        </div>
      )}

      {hasBothRoles && <RotateBothRolesForm rotation={rotation} />}

      <p className="text-xs text-subtle leading-relaxed pt-1">
        Role 1 controls <em>which logic</em> the proxy delegates to —
        register new implementations, change default version, rename. It{' '}
        <strong>cannot</strong> touch fees, withdrawals, or the sponsor
        pool; those are Role 2 below.
      </p>
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
        <code className="font-mono text-ink">setWhitelistedAdmin(new, true)</code>{' '}
        then <code className="font-mono text-ink">transferProxyAdmin(new)</code>{' '}
        back-to-back (2 signatures). After the new admin calls{' '}
        <code className="font-mono text-ink">acceptProxyAdmin()</code>, they
        can revoke you as fee admin from their wallet.
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
        <ol className="text-[11px] text-subtle space-y-1 list-decimal list-inside">
          <li className={rotation.stage === 'grant' ? 'text-ink' : ''}>
            {rotation.grantConfirmed ? '✓ ' : ''}Grant fee admin to new
            address (immediate)
          </li>
          <li
            className={
              rotation.stage === 'transfer' || rotation.stage === 'done'
                ? 'text-ink'
                : ''
            }
          >
            {rotation.stage === 'done' ? '✓ ' : ''}Initiate proxyAdmin
            transfer (pending until accepted)
          </li>
          <li className={rotation.stage === 'done' ? 'text-ink' : ''}>
            New admin calls{' '}
            <code className="font-mono text-ink">acceptProxyAdmin()</code>{' '}
            <span className="text-subtle">(auto-detected)</span>
          </li>
          <li>
            (optional) Revoke your old fee admin rights from the new
            admin&apos;s wallet
          </li>
        </ol>
      )}
      {rotation.stage === 'complete' && (
        <div className="space-y-2">
          <p className="text-xs text-ink">
            ✓ Rotation complete — the new address is now proxyAdmin + fee
            admin. You can optionally revoke yourself as fee admin from the
            new admin&apos;s wallet.
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
