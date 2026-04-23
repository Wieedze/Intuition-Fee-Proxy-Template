/**
 * Compact single-row status strip for the proxy's Intuition identity atom.
 * Slots below the stat grid on the Overview tab. Fits in ~48px vertical.
 *
 * Three distinct states (never conflated):
 *   - checking  → the on-chain read is in flight, or errored (can't tell)
 *   - live      → `isAtom(termId) === true`; portal link shown
 *   - missing   → `isAtom(termId) === false`; inline "Create atom" button
 *
 * Rationale: if we don't know the state yet, don't nudge the user to create
 * an atom that may already exist — the previous version did that and
 * flickered "Not created" while the read was pending.
 */

import { useEffect } from 'react'
import type { Address, Hex } from 'viem'
import { useChainId, useWaitForTransactionReceipt } from 'wagmi'

import {
  calculateProxyTermId,
  toIntuitionCaip10,
} from '@intuition-fee-proxy/sdk'

import {
  useCreateProxyIdentityAtom,
  useProxyAtomExists,
} from '../hooks/useIntuitionAtom'
import { ATOM_PORTAL_BY_CHAIN } from '../lib/explorers'
import { CopyInline } from './CopyInline'
import { Spinner } from './Spinner'

export function IntuitionAtomCard({
  proxy,
  multiVault,
}: {
  proxy: Address
  multiVault: Address
}) {
  const chainId = useChainId()
  const caip10 = toIntuitionCaip10(chainId, proxy)
  const termId: Hex = calculateProxyTermId(chainId, proxy)

  const {
    exists,
    isLoading,
    refetch,
    readError,
  } = useProxyAtomExists({ multiVault, chainId, proxyAddress: proxy })

  const {
    createIdentity,
    hash: atomHash,
    isPending: signing,
    error: writeError,
    reset,
  } = useCreateProxyIdentityAtom()
  const atomReceipt = useWaitForTransactionReceipt({ hash: atomHash })

  useEffect(() => {
    if (atomReceipt.isSuccess) refetch()
  }, [atomReceipt.isSuccess, refetch])

  async function handleCreate() {
    reset()
    try {
      await createIdentity({ multiVault, chainId, proxyAddress: proxy })
    } catch (err) {
      console.error('identity atom creation failed', err)
    }
  }

  const busy = signing || atomReceipt.isLoading
  const atomPortal = ATOM_PORTAL_BY_CHAIN[chainId]
  const portalHref = atomPortal ? `${atomPortal}/${termId}` : undefined

  // One of three modes, derived strictly so the UI never shows "Not created"
  // unless we've actually confirmed that on-chain.
  const mode: 'checking' | 'live' | 'missing' | 'error' = readError
    ? 'error'
    : isLoading || exists === undefined
      ? 'checking'
      : exists
        ? 'live'
        : 'missing'

  return (
    <div className="card py-2.5 px-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="text-[10px] font-mono uppercase tracking-widest text-subtle shrink-0">
          Intuition atom
        </div>

        <StatusPill mode={mode} busy={busy} />

        <div className="flex items-center gap-1 min-w-0 flex-1">
          <code
            className="font-mono text-[11px] text-muted truncate"
            title={caip10}
          >
            {caip10}
          </code>
          <CopyInline value={caip10} />
        </div>

        <div className="shrink-0 flex items-center gap-3 text-xs">
          {mode === 'live' && portalHref && (
            <a
              href={portalHref}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand hover:opacity-80 transition-opacity whitespace-nowrap"
            >
              Portal →
            </a>
          )}
          {mode === 'missing' && !busy && (
            <button
              type="button"
              onClick={handleCreate}
              className="text-brand hover:opacity-80 transition-opacity whitespace-nowrap font-medium"
            >
              Create atom →
            </button>
          )}
          {busy && (
            <span className="text-muted whitespace-nowrap">
              {signing ? 'Sign in wallet…' : 'Mining…'}
            </span>
          )}
          {writeError && !busy && (
            <span
              className="text-rose-400 font-mono truncate max-w-[200px]"
              title={writeError.message}
            >
              {writeError.message.split('\n')[0]}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

function StatusPill({
  mode,
  busy,
}: {
  mode: 'checking' | 'live' | 'missing' | 'error'
  busy: boolean
}) {
  if (busy) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2 py-0.5 text-[11px] text-muted shrink-0">
        <Spinner size="sm" ariaLabel="Creating" />
        <span>Creating</span>
      </span>
    )
  }
  if (mode === 'checking') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2 py-0.5 text-[11px] text-subtle shrink-0">
        <Spinner size="sm" ariaLabel="Checking" />
        <span>Checking</span>
      </span>
    )
  }
  if (mode === 'live') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-green-500/30 bg-green-500/10 px-2 py-0.5 text-[11px] font-medium text-green-500 shrink-0">
        <span aria-hidden>✓</span>
        <span>Live</span>
      </span>
    )
  }
  if (mode === 'error') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-rose-400/30 bg-rose-400/10 px-2 py-0.5 text-[11px] font-medium text-rose-400 shrink-0">
        <span>Check failed</span>
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2 py-0.5 text-[11px] text-muted shrink-0">
      Not created
    </span>
  )
}
