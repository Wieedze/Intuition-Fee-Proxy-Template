import { formatEther } from 'viem'

import type { PoolBurnStats } from '../hooks/useSponsoredProxy'

export type PoolHealthState = 'healthy' | 'low' | 'critical' | 'empty' | 'idle'

export interface PoolHealthMeta {
  dot: string
  label: string
  tone: string
  border: string
  bg: string
}

export interface PoolHealthView {
  state: PoolHealthState
  meta: PoolHealthMeta
  runwayDays: number | undefined
  balanceDisplay: string
  rateDisplay: string
  runwayDisplay: string
}

const META: Record<PoolHealthState, PoolHealthMeta> = {
  healthy: {
    dot: 'bg-emerald-500',
    label: 'Pool healthy',
    tone: 'text-emerald-400',
    border: 'border-emerald-500/30',
    bg: 'bg-emerald-500/[0.05]',
  },
  low: {
    dot: 'bg-amber-500',
    label: 'Pool low — refill soon',
    tone: 'text-amber-400',
    border: 'border-amber-500/40',
    bg: 'bg-amber-500/[0.06]',
  },
  critical: {
    dot: 'bg-rose-500',
    label: 'Pool critical — refill now',
    tone: 'text-rose-400',
    border: 'border-rose-500/40',
    bg: 'bg-rose-500/[0.06]',
  },
  empty: {
    dot: 'bg-rose-500',
    label: 'Pool empty — sponsored calls blocked',
    tone: 'text-rose-400',
    border: 'border-rose-500/40',
    bg: 'bg-rose-500/[0.06]',
  },
  idle: {
    dot: 'bg-subtle',
    label: 'Pool — not enough activity to estimate runway',
    tone: 'text-subtle',
    border: 'border-line',
    bg: 'bg-surface',
  },
}

/** Pure derivation of pool health UI state from balance + burn stats. */
export function derivePoolHealth(
  balance: bigint | undefined,
  burn: PoolBurnStats | undefined,
): PoolHealthView {
  const hasBalance = balance !== undefined
  const hasRate = burn !== undefined && burn.ratePerDay > 0n

  const runwayDays =
    hasBalance && hasRate ? Number(balance! / burn!.ratePerDay) : undefined

  const state: PoolHealthState = !hasBalance
    ? 'idle'
    : balance === 0n
      ? 'empty'
      : !hasRate
        ? 'idle'
        : runwayDays! >= 7
          ? 'healthy'
          : runwayDays! >= 2
            ? 'low'
            : 'critical'

  const balanceDisplay = hasBalance ? `${formatEther(balance!)} TRUST` : '—'

  const rateDisplay = hasRate
    ? `${formatEther(burn!.ratePerDay)} TRUST/day`
    : burn && burn.daysCovered === 0
      ? 'No activity yet'
      : '—'

  const runwayDisplay =
    runwayDays !== undefined
      ? `~${runwayDays} ${runwayDays === 1 ? 'day' : 'days'}`
      : '—'

  return {
    state,
    meta: META[state],
    runwayDays,
    balanceDisplay,
    rateDisplay,
    runwayDisplay,
  }
}
