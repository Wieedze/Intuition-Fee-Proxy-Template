import type { ReactNode } from 'react'

export default function DocsPage() {
  return (
    <div className="max-w-3xl space-y-14">
      <header className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight text-ink">
          How it works
        </h1>
        <p className="text-base text-muted max-w-2xl leading-relaxed">
          A fee proxy is a thin, versioned layer in front of the Intuition
          MultiVault. It routes every call through an audited logic
          implementation, collects fees in-contract, and lets admins swap the
          active version without forcing users off the one they trust.
        </p>
      </header>

      <section className="space-y-4">
        <h2 className="text-sm font-medium uppercase tracking-wider text-subtle">
          Call flow
        </h2>
        <ArchitectureDiagram />
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-medium uppercase tracking-wider text-subtle">
          Pinning to a version
        </h2>
        <div className="rounded-xl border border-line bg-surface p-5 text-sm leading-relaxed text-muted">
          When an admin ships a new logic version, everyone on the default gets
          it automatically. If you prefer to stay on the version you audited,
          call{' '}
          <code className="font-mono text-ink">
            executeAtVersion(&quot;v2.0.0&quot;, data)
          </code>{' '}
          from your wallet — the proxy routes to that specific past logic,
          which is immutable forever.
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-medium uppercase tracking-wider text-subtle">
          Primitives
        </h2>
        <dl className="divide-y divide-line rounded-xl border border-line bg-surface overflow-hidden">
          <Primitive
            term="deposit / createAtoms / withdraw"
            desc="Standard entry points. The default version handles these."
          />
          <Primitive
            term="executeAtVersion(label, data)"
            desc="Permissionless escape hatch — route a call through a specific past implementation."
          />
          <Primitive
            term="registerVersion(label, impl)"
            desc="Proxy-admin only. Appends a new audited implementation to the registry."
          />
          <Primitive
            term="setDefaultVersion(label)"
            desc="Proxy-admin only. Points the fallback path at a previously registered version."
          />
          <Primitive
            term="setDepositFixedFee / setDepositPercentageFee"
            desc="Fee admins configure the two-part fee (fixed + bps) applied on deposits."
          />
          <Primitive
            term="withdraw(to, amount) / withdrawAll(to)"
            desc="Fee admins pull accumulated fees from the proxy to any address."
          />
        </dl>
      </section>
    </div>
  )
}

function Primitive({ term, desc }: { term: string; desc: string }) {
  return (
    <div className="px-5 py-4">
      <dt className="font-mono text-xs text-ink">{term}</dt>
      <dd className="mt-1 text-sm text-muted">{desc}</dd>
    </div>
  )
}

function ArchitectureDiagram() {
  return (
    <div className="flex flex-col items-stretch max-w-xl space-y-2">
      <Node title="Your wallet" subtitle="User or admin" />
      <Arrow />
      <Node
        title="Fee proxy"
        subtitle="ERC-7936 · routes to the default version, or to any pinned version on demand"
        accent
      >
        <div className="mt-3 rounded-md border border-line bg-canvas p-2.5 font-mono text-[11px] leading-relaxed text-muted space-y-0.5">
          <div>versions[&quot;v2.0.0&quot;] = logic_v2</div>
          <div>
            versions[&quot;v2.1.0&quot;] = logic_v21{' '}
            <span className="text-brand">← default</span>
          </div>
        </div>
      </Node>
      <Arrow />
      <Node
        title="Logic (immutable per version)"
        subtitle="deposit · createAtoms · withdraw · setFees"
      />
      <Arrow />
      <Node
        title="Intuition MultiVault"
        subtitle="atoms · triples · deposits"
      />
    </div>
  )
}

function Node({
  title,
  subtitle,
  accent,
  children,
}: {
  title: string
  subtitle: string
  accent?: boolean
  children?: ReactNode
}) {
  return (
    <div
      className={`rounded-lg border p-4 ${
        accent
          ? 'border-brand/30 bg-surface'
          : 'border-line bg-surface'
      }`}
    >
      <div className="font-medium text-sm text-ink">{title}</div>
      <div className="mt-1 text-xs text-muted">{subtitle}</div>
      {children}
    </div>
  )
}

function Arrow() {
  return (
    <div className="flex flex-col items-center text-subtle">
      <div className="h-4 w-px bg-line" />
      <svg width="8" height="6" viewBox="0 0 12 8">
        <path d="M0 0 L6 8 L12 0 Z" fill="currentColor" />
      </svg>
    </div>
  )
}
