import { Link } from 'react-router-dom'

export default function HomePage() {
  return (
    <div className="space-y-24">
      <section className="max-w-3xl space-y-6 pt-6">
        <h1 className="text-5xl font-semibold tracking-tight text-ink leading-[1.1]">
          A versioned fee layer for the{' '}
          <span className="text-brand">Intuition MultiVault</span>.
        </h1>
        <p className="text-lg text-muted leading-relaxed max-w-2xl">
          Deploy a thin, upgradeable proxy in front of the MultiVault.
          Configure fees, manage admins, and ship new logic versions without
          forcing users off the one they depend on.
        </p>
        <div className="flex items-center gap-5 pt-2">
          <Link to="/deploy" className="btn-primary px-5 py-2.5">
            Deploy a proxy
          </Link>
          <Link
            to="/docs"
            className="text-sm text-muted hover:text-ink transition-colors"
          >
            Read the docs →
          </Link>
        </div>
      </section>

      <section className="grid gap-6 sm:grid-cols-3">
        {[
          {
            title: 'Versioned',
            body:
              'Your proxy is a registry of logic implementations. Ship new versions without displacing the old ones — users can pin to any past version via executeAtVersion.',
          },
          {
            title: 'Pull-based fees',
            body:
              'Fees accumulate in-contract on every deposit. Admins withdraw on-demand to any address; no streaming, no external dependencies.',
          },
          {
            title: 'Permissionless',
            body:
              'Anyone can deploy a proxy. No deployment fee, no allowlist. A Safe is recommended as the admin on the deploy form.',
          },
        ].map((f) => (
          <div key={f.title} className="rounded-xl border border-line bg-surface p-6">
            <div className="text-base font-medium text-ink">{f.title}</div>
            <p className="mt-2 text-sm text-muted leading-relaxed">{f.body}</p>
          </div>
        ))}
      </section>

      <section className="space-y-8">
        <h2 className="text-sm font-medium uppercase tracking-wider text-subtle">
          Call flow
        </h2>
        <CallFlow />
        <Link
          to="/docs"
          className="inline-block text-sm text-muted hover:text-ink transition-colors"
        >
          See the full architecture →
        </Link>
      </section>

    </div>
  )
}

function CallFlow() {
  return (
    <div className="rounded-2xl border border-line bg-surface/50 p-8 md:p-10">
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr_auto_1fr] items-stretch gap-4 md:gap-0">
        <FlowNode
          icon={<WalletIcon />}
          title="Wallet"
          subtitle="User / dApp"
          body="Initiates the deposit."
        />

        <FlowArrow />

        <ProxyWheel />

        <FlowArrow />

        <FlowNode
          icon={<VaultIcon />}
          title="MultiVault"
          subtitle="Intuition core"
          body="Mints the position to the original sender."
        />
      </div>
    </div>
  )
}

function ProxyWheel() {
  const reduce =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  return (
    <div className="relative h-[200px] overflow-hidden" aria-label="Proxy variant carousel">
      <div
        className={reduce ? '' : 'animate-proxy-wheel will-change-transform'}
      >
        <WheelSlide>
          <FlowNode
            variant="fee"
            icon={<ProxyIcon />}
            title="Fee proxy"
            subtitle="Versioned logic"
            badge="FEE"
            body="User pays the fee on every deposit."
          />
        </WheelSlide>
        <WheelSlide>
          <FlowNode
            variant="sponsor"
            icon={<ProxyIcon />}
            title="Sponsor proxy"
            subtitle="Sponsored channel"
            badge="SPONSORED"
            body="Admin pool absorbs the cost for the user."
          />
        </WheelSlide>
        <WheelSlide>
          <FlowNode
            variant="fee"
            icon={<ProxyIcon />}
            title="Fee proxy"
            subtitle="Versioned logic"
            badge="FEE"
            body="User pays the fee on every deposit."
          />
        </WheelSlide>
      </div>
    </div>
  )
}

function WheelSlide({ children }: { children: React.ReactNode }) {
  return <div className="h-[200px]">{children}</div>
}

function FlowNode({
  icon,
  title,
  subtitle,
  body,
  variant = 'neutral',
  badge,
}: {
  icon: React.ReactNode
  title: string
  subtitle: string
  body: string
  variant?: 'neutral' | 'fee' | 'sponsor'
  badge?: string
}) {
  const border =
    variant === 'fee'
      ? 'border-brand/50'
      : variant === 'sponsor'
        ? 'border-[#e8a04a]/60'
        : 'border-line'
  const bg =
    variant === 'fee'
      ? 'bg-brand/[0.06]'
      : variant === 'sponsor'
        ? 'bg-[#e8a04a]/[0.07]'
        : 'bg-bg'
  const accentText =
    variant === 'fee'
      ? 'text-brand'
      : variant === 'sponsor'
        ? 'text-[#e8a04a]'
        : 'text-ink'
  const iconText =
    variant === 'fee'
      ? 'text-brand'
      : variant === 'sponsor'
        ? 'text-[#e8a04a]'
        : 'text-muted'

  return (
    <div
      className={`rounded-xl border ${border} ${bg} p-5 flex flex-col gap-3 min-h-[160px] h-full`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className={`inline-flex h-8 w-8 items-center justify-center rounded-md border ${border} ${iconText}`}
          >
            {icon}
          </span>
          <div className="flex flex-col leading-tight min-w-0">
            <span className={`text-base font-semibold tracking-tight ${accentText}`}>
              {title}
            </span>
            <span className="text-[11px] font-mono uppercase tracking-wider text-subtle">
              {subtitle}
            </span>
          </div>
        </div>
        {badge && (
          <span
            className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider ${border} ${accentText}`}
          >
            {badge}
          </span>
        )}
      </div>
      <p className="text-sm text-muted leading-relaxed">{body}</p>
    </div>
  )
}

function FlowArrow() {
  return (
    <div className="flex items-center justify-center px-4 py-2 md:py-0 md:min-w-[100px]">
      <div className="flex items-center w-full">
        <span className="h-px flex-1 bg-line" />
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          className="text-line ml-[-1px]"
          aria-hidden="true"
        >
          <path d="M0 1 L8 5 L0 9 Z" fill="currentColor" />
        </svg>
      </div>
    </div>
  )
}

function WalletIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M16 12h3" />
      <path d="M3 9h14a2 2 0 0 1 2 2" />
    </svg>
  )
}

function ProxyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M8 9h8M8 12h8M8 15h5" />
    </svg>
  )
}

function VaultIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="12" cy="12" r="3" />
      <path d="M12 9v-1M12 16v-1M15 12h1M8 12h1" />
    </svg>
  )
}

