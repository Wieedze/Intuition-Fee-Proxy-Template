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
            n: '01',
            title: 'Versioned',
            body:
              'Your proxy is a registry of logic implementations. Ship new versions without displacing the old ones — users can pin to any past version via executeAtVersion.',
          },
          {
            n: '02',
            title: 'Pull-based fees',
            body:
              'Fees accumulate in-contract on every deposit. Admins withdraw on-demand to any address; no streaming, no external dependencies.',
          },
          {
            n: '03',
            title: 'Permissionless',
            body:
              'Anyone can deploy a proxy. No deployment fee, no allowlist. A Safe is recommended as the admin on the deploy form.',
          },
        ].map((f) => (
          <div key={f.n} className="rounded-xl border border-line bg-surface p-6">
            <div className="font-mono text-xs text-subtle">{f.n}</div>
            <div className="mt-4 text-base font-medium text-ink">{f.title}</div>
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

      <section className="space-y-4 max-w-3xl">
        <h2 className="text-sm font-medium uppercase tracking-wider text-subtle">
          Sponsored variant
        </h2>
        <div className="rounded-2xl border border-line bg-surface/50 p-6 md:p-8 space-y-5">
          <p className="text-sm text-muted leading-relaxed">
            Pick the <b className="text-ink">sponsored channel</b> at deploy
            time and the proxy becomes a TRUST pool your admins fund for your
            users. Two flows, depending on whether the user is holding a wallet
            or not:
          </p>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-line bg-surface p-4">
              <div className="text-xs font-mono text-subtle">FLOW A — credit balance</div>
              <div className="mt-2 text-sm font-medium text-ink">
                Admin → <code className="font-mono">creditUser</code> → user deposits with reduced <code className="font-mono">msg.value</code>
              </div>
              <p className="mt-2 text-xs text-muted leading-relaxed">
                The user still signs their own deposit tx (and pays gas), but
                the deposit amount + fees come from the pool the admin
                pre-funded for them. Good for users who already have a wallet
                but whose deposit cost you want to cover.
              </p>
            </div>
            <div className="rounded-xl border border-line bg-surface p-4">
              <div className="text-xs font-mono text-subtle">FLOW B — direct action</div>
              <div className="mt-2 text-sm font-medium text-ink">
                Admin → <code className="font-mono">depositFor(user, …)</code> → shares minted to user
              </div>
              <p className="mt-2 text-xs text-muted leading-relaxed">
                The admin calls directly with full <code className="font-mono">msg.value</code>; the user doesn&apos;t
                sign anything on-chain and doesn&apos;t need any TRUST at all. Good
                for email-onboarding / custodial flows where the dApp
                orchestrates everything server-side.
              </p>
            </div>
          </div>

          <p className="text-xs text-muted leading-relaxed">
            Rate limits (<code className="font-mono">maxClaimPerTx</code> +{' '}
            <code className="font-mono">maxClaimsPerDay</code>) protect the pool
            from drain. A dedicated{' '}
            <b className="text-ink">Sponsoring</b> tab on each sponsored proxy
            exposes the admin surface: credit / reclaim, set limits, watch the
            pool draining in real time.
          </p>

          <Link
            to="/docs/sponsoring"
            className="inline-block text-sm text-muted hover:text-ink transition-colors"
          >
            Full sponsoring docs →
          </Link>
        </div>
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
          body="Sends a deposit tx with an extra fee forwarded to the proxy."
        />
        <FlowArrow label="deposit() + fee" />
        <FlowNode
          accent
          icon={<ProxyIcon />}
          title="Fee proxy"
          subtitle="Versioned logic"
          body="Accumulates fees, routes the call to the selected MultiVault version."
        />
        <FlowArrow label="executeAtVersion()" />
        <FlowNode
          icon={<VaultIcon />}
          title="MultiVault"
          subtitle="Intuition core"
          body="Executes the deposit and mints the position to the original sender."
        />
      </div>
    </div>
  )
}

function FlowNode({
  icon,
  title,
  subtitle,
  body,
  accent,
}: {
  icon: React.ReactNode
  title: string
  subtitle: string
  body: string
  accent?: boolean
}) {
  const border = accent ? 'border-brand/50' : 'border-line'
  const bg = accent ? 'bg-brand/[0.06]' : 'bg-bg'
  const titleColor = accent ? 'text-brand' : 'text-ink'
  return (
    <div
      className={`rounded-xl border ${border} ${bg} p-5 flex flex-col gap-3 min-h-[160px]`}
    >
      <div className="flex items-center gap-2.5">
        <span
          className={`inline-flex h-8 w-8 items-center justify-center rounded-md border ${border} ${
            accent ? 'text-brand' : 'text-muted'
          }`}
        >
          {icon}
        </span>
        <div className="flex flex-col leading-tight">
          <span className={`text-base font-semibold tracking-tight ${titleColor}`}>
            {title}
          </span>
          <span className="text-[11px] font-mono uppercase tracking-wider text-subtle">
            {subtitle}
          </span>
        </div>
      </div>
      <p className="text-sm text-muted leading-relaxed">{body}</p>
    </div>
  )
}

function FlowArrow({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-2 md:py-0 md:min-w-[140px]">
      <span className="font-mono text-[11px] text-subtle whitespace-nowrap mb-1.5">
        {label}
      </span>
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

