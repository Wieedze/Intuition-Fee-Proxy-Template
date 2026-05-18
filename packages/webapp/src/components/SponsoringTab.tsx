import { formatEther, type Address } from 'viem'

import {
  useClaimLimits,
  usePoolBurnRate,
  useSponsorPool,
  type ClaimLimits,
} from '../hooks/useSponsoredProxy'
import { formatWindow } from '../lib/format'
import { ClaimLimitsPanel } from './ClaimLimitsPanel'
import { FundPoolPanel } from './FundPoolPanel'
import { PoolHealthBadge } from './PoolHealthBadge'
import { ReclaimFromPoolPanel } from './ReclaimFromPoolPanel'

interface Props {
  proxy: Address
  isAdmin: boolean
}

export function SponsoringTab({ proxy, isAdmin }: Props) {
  const { limits, refetch: refetchLimits } = useClaimLimits(proxy)
  const { balance: poolBalance, refetch: refetchPool } = useSponsorPool(proxy)
  const { stats: burnStats, refetch: refetchBurn } = usePoolBurnRate(proxy)

  function onWriteDone() {
    refetchLimits()
    refetchPool()
    refetchBurn()
  }

  return (
    <section className="space-y-6">
      <PoolHealthBadge balance={poolBalance} burn={burnStats} />

      <ClaimLimitsStrip limits={limits} />

      {isAdmin ? (
        <>
          {/* Fund: permissionless. Reclaim: admin-only. Side-by-side, equal height. */}
          <div className="grid gap-4 lg:grid-cols-2">
            <FundPoolPanel proxy={proxy} onDone={onWriteDone} />
            <ReclaimFromPoolPanel proxy={proxy} onDone={onWriteDone} />
          </div>
          <ClaimLimitsPanel proxy={proxy} current={limits} onDone={onWriteDone} />
        </>
      ) : (
        <>
          <FundPoolPanel proxy={proxy} onDone={onWriteDone} />
          <p className="text-sm text-subtle border-l-2 border-line pl-3">
            Reclaiming pool balance and tuning claim limits is restricted to
            whitelisted admins of this proxy.
          </p>
        </>
      )}
    </section>
  )
}

function ClaimLimitsStrip({ limits }: { limits: ClaimLimits | undefined }) {
  const items: { label: string; value: string }[] = [
    {
      label: 'Max / tx',
      value: limits ? `${formatEther(limits.maxClaimPerTx)} TRUST` : '—',
    },
    {
      label: 'Max calls / user',
      value: limits ? limits.maxClaimsPerWindow.toString() : '—',
    },
    {
      label: 'Max TRUST / user',
      value: limits ? `${formatEther(limits.maxClaimVolumePerWindow)} TRUST` : '—',
    },
    {
      label: 'Window',
      value: limits ? formatWindow(limits.claimWindowSeconds) : '—',
    },
  ]
  return (
    <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 rounded-md border border-line bg-surface px-4 py-2.5">
      <span className="text-[10px] font-mono uppercase tracking-widest text-subtle">
        Claim limits
      </span>
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-baseline gap-1.5">
          <span className="text-[11px] text-subtle">{it.label}</span>
          <span className="text-sm font-medium text-ink">{it.value}</span>
        </span>
      ))}
    </div>
  )
}
