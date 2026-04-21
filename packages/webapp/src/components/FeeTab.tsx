import { formatEther, type Address } from 'viem'

import type { ProxyStats } from '../hooks/useProxy'
import { Stat } from './Stat'
import { SetFeesPanel } from './SetFeesPanel'
import { WithdrawPanel } from './WithdrawPanel'

interface Props {
  proxy: Address
  stats: ProxyStats
  isAdmin: boolean
  onWriteDone: () => void
}

export function FeeTab({ proxy, stats, isAdmin, onWriteDone }: Props) {
  return (
    <div className="space-y-10">
      <section className="grid gap-4 sm:grid-cols-2">
        <Stat
          label="Accumulated fees"
          value={`${formatEther(stats.accumulatedFees)} TRUST`}
          emphasize
        />
        <Stat
          label="All-time collected"
          value={`${formatEther(stats.totalFeesCollectedAllTime)} TRUST`}
        />
        <Stat
          label="Fixed fee / deposit"
          value={`${formatEther(stats.depositFixedFee)} TRUST`}
        />
        <Stat
          label="Percentage fee"
          value={`${(Number(stats.depositPercentageFee) / 100).toFixed(2)} %`}
        />
      </section>

      {isAdmin ? (
        <div className="space-y-8">
          <WithdrawPanel
            proxy={proxy}
            accumulated={stats.accumulatedFees}
            onDone={onWriteDone}
          />
          <SetFeesPanel
            proxy={proxy}
            currentFixed={stats.depositFixedFee}
            currentPct={stats.depositPercentageFee}
            onDone={onWriteDone}
          />
        </div>
      ) : (
        <p className="text-sm text-subtle border-l-2 border-line pl-3">
          Connect as a whitelisted admin to withdraw fees or change config.
        </p>
      )}
    </div>
  )
}
