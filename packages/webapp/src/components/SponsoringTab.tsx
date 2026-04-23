import { formatEther, type Address } from 'viem'

import {
  useClaimLimits,
  usePoolBurnRate,
  useSponsorPool,
} from '../hooks/useSponsoredProxy'
import { formatWindow } from '../lib/format'
import { ClaimLimitsPanel } from './ClaimLimitsPanel'
import { FundPoolPanel } from './FundPoolPanel'
import { PoolHealthBadge } from './PoolHealthBadge'
import { ReclaimFromPoolPanel } from './ReclaimFromPoolPanel'
import { Stat } from './Stat'

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
    <section className="space-y-10">
      <PoolHealthBadge balance={poolBalance} burn={burnStats} />

      <section className="grid gap-4 sm:grid-cols-3">
        <Stat
          label="Max claim / tx"
          value={limits ? `${formatEther(limits.maxClaimPerTx)} TRUST` : '—'}
        />
        <Stat
          label="Max calls / user / window"
          value={limits ? limits.maxClaimsPerWindow.toString() : '—'}
        />
        <Stat
          label="Max TRUST / user / window"
          value={
            limits
              ? `${formatEther(limits.maxClaimVolumePerWindow)} TRUST`
              : '—'
          }
        />
        <Stat
          label="Window length"
          value={limits ? formatWindow(limits.claimWindowSeconds) : '—'}
        />
      </section>

      {/* Permissionless — anyone can contribute to the pool. */}
      <FundPoolPanel proxy={proxy} onDone={onWriteDone} />

      {isAdmin ? (
        <>
          <ReclaimFromPoolPanel
            proxy={proxy}
            poolBalance={poolBalance}
            onDone={onWriteDone}
          />
          <ClaimLimitsPanel proxy={proxy} current={limits} onDone={onWriteDone} />
        </>
      ) : (
        <p className="text-sm text-subtle border-l-2 border-line pl-3">
          Reclaiming pool balance and tuning claim limits is restricted to
          whitelisted admins of this proxy.
        </p>
      )}
    </section>
  )
}
