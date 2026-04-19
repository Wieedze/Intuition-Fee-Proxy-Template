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
          Deploy a thin, audited proxy in front of the MultiVault. Configure
          fees, manage admins, and ship new logic versions without forcing
          users off the one they trust.
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
              'Your proxy is a registry of audited logic implementations. Ship new versions without displacing the old ones — users can pin to any past version via executeAtVersion.',
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

      <section className="space-y-4 max-w-2xl">
        <h2 className="text-sm font-medium uppercase tracking-wider text-subtle">
          Call flow
        </h2>
        <MiniFlow />
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

function MiniFlow() {
  return (
    <div className="flex items-center gap-3 text-sm">
      <Chip>Wallet</Chip>
      <Dash />
      <Chip accent>Fee proxy</Chip>
      <Dash />
      <Chip>MultiVault</Chip>
    </div>
  )
}

function Chip({
  children,
  accent,
}: {
  children: React.ReactNode
  accent?: boolean
}) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-3 py-1.5 ${
        accent
          ? 'border-brand/40 bg-brand/10 text-brand font-medium'
          : 'border-line bg-surface text-ink'
      }`}
    >
      {children}
    </span>
  )
}

function Dash() {
  return <span className="h-px flex-1 bg-line" />
}
