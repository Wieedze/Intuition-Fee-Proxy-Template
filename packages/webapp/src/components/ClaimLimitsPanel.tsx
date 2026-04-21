import { useEffect, useState } from 'react'
import { formatEther, parseEther, type Address } from 'viem'
import { useWaitForTransactionReceipt } from 'wagmi'

import { useSetClaimLimits } from '../hooks/useSponsoredProxy'
import { WINDOW_PRESETS } from '../lib/format'

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
    windowSecNum > 0 &&
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

  return (
    <section className="card space-y-4">
      <div>
        <h3 className="font-semibold">Claim limits</h3>
        <p className="text-xs text-subtle">
          Per-user caps applied over a configurable rolling window. All
          four values must stay &gt; 0 — there is no &ldquo;unlimited&rdquo;
          mode (set a cap high if you want it effectively open).
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1">
          <div className="text-xs text-muted">Max claim per tx (TRUST)</div>
          <input
            type="number"
            step="any"
            min="0"
            value={maxPerTx}
            onChange={(e) => setMaxPerTx(e.target.value)}
            className="input"
          />
          {!txValid && (
            <p className="text-xs text-rose-400 mt-1">Must be &gt; 0.</p>
          )}
        </label>
        <label className="block space-y-1">
          <div className="text-xs text-muted">
            Max pool-drawing calls per user / window
          </div>
          <input
            type="number"
            step="1"
            min="1"
            value={maxPerWindow}
            onChange={(e) => setMaxPerWindow(e.target.value)}
            className="input"
          />
          {!windowCountValid && (
            <p className="text-xs text-rose-400 mt-1">Integer &gt; 0.</p>
          )}
        </label>
        <label className="block space-y-1">
          <div className="text-xs text-muted">
            Max cumulative TRUST per user / window
          </div>
          <input
            type="number"
            step="any"
            min="0"
            value={maxVolume}
            onChange={(e) => setMaxVolume(e.target.value)}
            className="input"
          />
          {!volumeValid && (
            <p className="text-xs text-rose-400 mt-1">Must be &gt; 0.</p>
          )}
        </label>
        <label className="block space-y-1">
          <div className="text-xs text-muted">Window length (seconds)</div>
          <input
            type="number"
            step="1"
            min="1"
            value={windowSec}
            onChange={(e) => setWindowSec(e.target.value)}
            className="input"
          />
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {WINDOW_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => setWindowSec(p.seconds.toString())}
                className="text-[10px] font-mono uppercase tracking-wider rounded border border-line bg-canvas px-2 py-0.5 text-subtle hover:text-ink hover:border-line-strong transition-colors"
              >
                {p.label}
              </button>
            ))}
          </div>
          {!windowSecValid && (
            <p className="text-xs text-rose-400 mt-1">Integer &gt; 0.</p>
          )}
        </label>
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
