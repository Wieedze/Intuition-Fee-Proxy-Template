import type { PoolBurnStats } from '../hooks/useSponsoredProxy'
import { derivePoolHealth } from '../lib/poolHealth'

interface Props {
  balance: bigint | undefined
  burn: PoolBurnStats | undefined
}

export function PoolHealthBadge({ balance, burn }: Props) {
  const view = derivePoolHealth(balance, burn)

  return (
    <section className={`rounded-xl border ${view.meta.border} ${view.meta.bg} p-5`}>
      <div className="flex items-center gap-2 mb-4">
        <span className={`inline-block h-2 w-2 rounded-full ${view.meta.dot}`} />
        <span
          className={`text-[11px] font-mono uppercase tracking-wider ${view.meta.tone}`}
        >
          {view.meta.label}
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-subtle">
            Balance
          </div>
          <div className="mt-1 text-lg font-semibold text-ink">
            {view.balanceDisplay}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-subtle">
            Burn rate (7d)
          </div>
          <div className="mt-1 text-lg font-semibold text-ink">
            {view.rateDisplay}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-subtle">
            Runway
          </div>
          <div className="mt-1 text-lg font-semibold text-ink">
            {view.runwayDisplay}
          </div>
        </div>
      </div>
    </section>
  )
}
