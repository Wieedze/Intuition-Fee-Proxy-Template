import { useEffect, useState } from 'react'
import { formatEther, parseEther, type Address } from 'viem'
import { useWaitForTransactionReceipt } from 'wagmi'

import { useSetClaimLimits } from '../hooks/useSponsoredProxy'
import { WINDOW_PRESETS, formatWindow } from '../lib/format'

interface Limits {
  maxClaimPerTx: bigint
  maxClaimsPerWindow: bigint
  maxClaimVolumePerWindow: bigint
  claimWindowSeconds: bigint
}

interface Props {
  proxy: Address
  current: Limits | undefined
  onDone: () => void
}

/**
 * Parses a trimmed numeric string and returns `undefined` on empty / NaN so
 * the live recap can fall back to "—" placeholders while the admin is still
 * typing (avoids flashing "0 TRUST" sentences mid-edit).
 */
function toNumberOrUndefined(raw: string): number | undefined {
  const trimmed = raw.trim()
  if (!trimmed) return undefined
  const n = Number(trimmed)
  return Number.isFinite(n) ? n : undefined
}

export function ClaimLimitsPanel({ proxy, current, onDone }: Props) {
  const [maxPerTx, setMaxPerTx] = useState('')
  const [maxPerWindow, setMaxPerWindow] = useState('')
  const [maxVolume, setMaxVolume] = useState('')
  const [windowSec, setWindowSec] = useState('')
  const { setClaimLimits, hash, isPending, error, reset } =
    useSetClaimLimits(proxy)
  const receipt = useWaitForTransactionReceipt({ hash })

  useEffect(() => {
    if (current) {
      setMaxPerTx(formatEther(current.maxClaimPerTx))
      setMaxPerWindow(current.maxClaimsPerWindow.toString())
      setMaxVolume(formatEther(current.maxClaimVolumePerWindow))
      setWindowSec(current.claimWindowSeconds.toString())
    }
  }, [
    current?.maxClaimPerTx,
    current?.maxClaimsPerWindow,
    current?.maxClaimVolumePerWindow,
    current?.claimWindowSeconds,
  ])

  useEffect(() => {
    if (receipt.isSuccess) {
      onDone()
      reset()
    }
  }, [hash, receipt.isSuccess])

  const txValid = Number(maxPerTx) > 0
  const windowCountValid =
    Number.isInteger(Number(maxPerWindow)) && Number(maxPerWindow) > 0
  const volumeValid = Number(maxVolume) > 0
  const windowSecNum = Number(windowSec)
  const windowSecValid =
    Number.isInteger(windowSecNum) &&
    windowSecNum >= 3600 &&
    windowSecNum <= 4_294_967_295
  const allValid = txValid && windowCountValid && volumeValid && windowSecValid

  async function onSubmit() {
    if (!allValid) return
    try {
      await setClaimLimits(
        parseEther(maxPerTx),
        BigInt(maxPerWindow),
        parseEther(maxVolume),
        BigInt(windowSec),
      )
    } catch (e) {
      console.error(e)
    }
  }

  // Live recap values
  const recapTx = toNumberOrUndefined(maxPerTx)
  const recapCount = toNumberOrUndefined(maxPerWindow)
  const recapVolume = toNumberOrUndefined(maxVolume)
  const recapWindow =
    windowSecValid && windowSecNum >= 1
      ? formatWindow(BigInt(windowSec))
      : undefined

  return (
    <section className="card space-y-6">
      {/* ── Header + intro ─────────────────────────────── */}
      <div>
        <h3 className="font-semibold">Claim limits</h3>
        <p className="text-sm text-subtle mt-1.5 leading-relaxed">
          Your sponsor pool is a shared reserve of TRUST you fund. When users
          interact with this proxy, the pool pays for their transactions
          instead of their wallet. These four caps control how much any single
          user can consume — so one person can&apos;t drain your whole pool.
        </p>
      </div>

      {/* ── Per-tx block ───────────────────────────────── */}
      <div className="rounded-md border border-line bg-canvas p-4 space-y-3">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted">
          Per transaction
        </div>

        <label className="block space-y-1">
          <div className="text-sm font-medium">Max per transaction</div>
          <p className="text-xs text-subtle">
            The biggest single tx your pool will pay for.
          </p>
          <div className="relative">
            <input
              type="number"
              step="any"
              min="0"
              value={maxPerTx}
              onChange={(e) => setMaxPerTx(e.target.value)}
              className="input pr-16"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted font-mono">
              TRUST
            </span>
          </div>
          <p className="text-xs text-subtle italic mt-1">
            Example: if set to 1 and a user asks the pool to cover a 1.5 TRUST
            tx, only 1 TRUST is sponsored — the user pays the extra 0.5 from
            their own wallet (or the tx reverts).
          </p>
          {!txValid && (
            <p className="text-xs text-rose-400 mt-1">Must be &gt; 0.</p>
          )}
        </label>
      </div>

      {/* ── Per-user / window block ────────────────────── */}
      <div className="rounded-md border border-line bg-canvas p-4 space-y-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted">
            Per user, per window
          </div>
          <p className="text-xs text-subtle mt-1">
            A <strong>window</strong> is a reset cycle. Once it expires, the
            two counters below go back to 0 for that user only — other users
            are unaffected.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1">
            <div className="text-sm font-medium">Max transactions / window</div>
            <p className="text-xs text-subtle">
              How many sponsored tx a single user can make before the window
              resets.
            </p>
            <div className="relative">
              <input
                type="number"
                step="1"
                min="1"
                value={maxPerWindow}
                onChange={(e) => setMaxPerWindow(e.target.value)}
                className="input pr-16"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted font-mono">
                calls
              </span>
            </div>
            <p className="text-xs text-subtle italic mt-1">
              Example: 10 means the user can make up to 10 sponsored tx, then
              they&apos;re blocked until the window rolls over.
            </p>
            {!windowCountValid && (
              <p className="text-xs text-rose-400 mt-1">Integer &gt; 0.</p>
            )}
          </label>

          <label className="block space-y-1">
            <div className="text-sm font-medium">Max total / window</div>
            <p className="text-xs text-subtle">
              Cumulative TRUST a single user can claim across their window.
            </p>
            <div className="relative">
              <input
                type="number"
                step="any"
                min="0"
                value={maxVolume}
                onChange={(e) => setMaxVolume(e.target.value)}
                className="input pr-16"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted font-mono">
                TRUST
              </span>
            </div>
            <p className="text-xs text-subtle italic mt-1">
              Example: 10 TRUST means once a user has been sponsored for 10
              TRUST total (even spread over several small tx), they&apos;re
              blocked until the window resets.
            </p>
            {!volumeValid && (
              <p className="text-xs text-rose-400 mt-1">Must be &gt; 0.</p>
            )}
          </label>
        </div>

        <div className="rounded-md border border-line bg-surface p-3 text-xs text-subtle leading-relaxed">
          <strong className="text-ink">Why two limits?</strong>
          <ul className="mt-1 space-y-0.5 list-disc ml-4">
            <li>
              <strong>Max transactions</strong> stops a user spamming many
              small sponsored tx.
            </li>
            <li>
              <strong>Max total</strong> stops a user consuming the pool via
              one (or a few) fat tx.
            </li>
          </ul>
        </div>

        {/* Window length */}
        <label className="block space-y-1">
          <div className="text-sm font-medium">Window length</div>
          <p className="text-xs text-subtle">
            How often the two counters above reset. Minimum on-chain is 1
            hour.
          </p>
          <div className="relative">
            <input
              type="number"
              step="1"
              min="3600"
              value={windowSec}
              onChange={(e) => setWindowSec(e.target.value)}
              className="input pr-28"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted font-mono">
              s
              {recapWindow && (
                <span className="text-ink ml-2">= {recapWindow}</span>
              )}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {WINDOW_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => setWindowSec(p.seconds.toString())}
                className="text-[11px] rounded border border-line bg-canvas px-2 py-0.5 text-subtle hover:text-ink hover:border-line-strong transition-colors"
              >
                {p.label}
              </button>
            ))}
          </div>
          {!windowSecValid && (
            <p className="text-xs text-rose-400 mt-1">
              Integer &ge; 3600 (1 hour, on-chain minimum).
            </p>
          )}
        </label>
      </div>

      {/* ── Live policy recap ──────────────────────────── */}
      <div className="rounded-md border border-brand/30 bg-brand/5 p-4">
        <div className="text-xs font-semibold uppercase tracking-wider text-brand mb-1.5">
          Current policy
        </div>
        <p className="text-sm text-ink leading-relaxed">
          With these settings, each user can pull up to{' '}
          <strong>{recapCount ?? '—'} transactions</strong> totaling at most{' '}
          <strong>{recapVolume ?? '—'} TRUST</strong> from the pool every{' '}
          <strong>{recapWindow ?? '—'}</strong>. Each individual tx is capped
          at <strong>{recapTx ?? '—'} TRUST</strong> — larger requests revert
          (the user would have to split them or top up with their own wallet).
        </p>
      </div>

      <button
        type="button"
        onClick={onSubmit}
        disabled={!allValid || isPending || receipt.isLoading}
        className="btn-primary"
      >
        {isPending ? 'Sign…' : receipt.isLoading ? 'Mining…' : 'Update limits'}
      </button>

      {error && (
        <p className="text-xs text-rose-400 font-mono">
          {error.message.split('\n')[0]}
        </p>
      )}
    </section>
  )
}
