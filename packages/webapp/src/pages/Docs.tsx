import { type ReactNode } from 'react'
import { Link, NavLink, useParams } from 'react-router-dom'

type SectionId =
  | 'overview'
  | 'call-flow'
  | 'proxy-vs-impl'
  | 'pinning'
  | 'primitives'
  | 'workflow'
  | 'golden-rules'

const GROUPS = [
  {
    label: 'Introduction',
    items: [{ id: 'overview' as SectionId, label: 'Overview' }],
  },
  {
    label: 'Concepts',
    items: [
      { id: 'call-flow' as SectionId, label: 'Call flow' },
      { id: 'proxy-vs-impl' as SectionId, label: 'Proxy vs. implementation' },
      { id: 'pinning' as SectionId, label: 'Pinning to a version' },
    ],
  },
  {
    label: 'Reference',
    items: [{ id: 'primitives' as SectionId, label: 'Primitives' }],
  },
  {
    label: 'Ship a new version',
    items: [
      { id: 'workflow' as SectionId, label: 'Workflow' },
      { id: 'golden-rules' as SectionId, label: 'Golden rules' },
    ],
  },
] as const

const ALL_IDS = GROUPS.flatMap((g) => g.items.map((i) => i.id))

export default function DocsPage() {
  const params = useParams<{ section?: SectionId }>()
  const section = (params.section ?? 'overview') as SectionId

  return (
    <div className="grid gap-12 md:grid-cols-[200px_1fr]">
      <Sidebar active={section} />
      <article className="min-w-0 max-w-2xl">
        <SectionContent id={section} />
        <SectionFooter id={section} />
      </article>
    </div>
  )
}

function Sidebar({ active }: { active: SectionId }) {
  return (
    <aside className="hidden md:block">
      <nav className="sticky top-20 space-y-6 text-sm">
        {GROUPS.map((group) => (
          <div key={group.label}>
            <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-subtle">
              {group.label}
            </div>
            <ul className="space-y-0.5">
              {group.items.map((item) => (
                <li key={item.id}>
                  <NavLink
                    to={`/docs/${item.id}`}
                    className={() =>
                      `block border-l px-3 py-1.5 -ml-px transition-colors ${
                        active === item.id
                          ? 'border-brand text-ink'
                          : 'border-transparent text-muted hover:text-ink hover:border-line-strong'
                      }`
                    }
                  >
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  )
}

function SectionContent({ id }: { id: SectionId }) {
  switch (id) {
    case 'overview':
      return <Overview />
    case 'call-flow':
      return <CallFlow />
    case 'proxy-vs-impl':
      return <ProxyVsImpl />
    case 'pinning':
      return <Pinning />
    case 'primitives':
      return <Primitives />
    case 'workflow':
      return <Workflow />
    case 'golden-rules':
      return <GoldenRules />
  }
}

function SectionFooter({ id }: { id: SectionId }) {
  const idx = ALL_IDS.indexOf(id)
  const prev = idx > 0 ? ALL_IDS[idx - 1] : null
  const next = idx < ALL_IDS.length - 1 ? ALL_IDS[idx + 1] : null
  if (!prev && !next) return null

  const labelOf = (sectionId: SectionId): string =>
    GROUPS.flatMap((g) => g.items).find((i) => i.id === sectionId)?.label ?? ''

  return (
    <div className="mt-16 flex items-center justify-between gap-4 border-t border-line pt-6 text-sm">
      {prev ? (
        <Link
          to={`/docs/${prev}`}
          className="group flex flex-col items-start text-muted hover:text-ink transition-colors"
        >
          <span className="text-[11px] uppercase tracking-wider text-subtle">
            Previous
          </span>
          <span>← {labelOf(prev)}</span>
        </Link>
      ) : (
        <span />
      )}
      {next && (
        <Link
          to={`/docs/${next}`}
          className="group flex flex-col items-end text-muted hover:text-ink transition-colors"
        >
          <span className="text-[11px] uppercase tracking-wider text-subtle">
            Next
          </span>
          <span>{labelOf(next)} →</span>
        </Link>
      )}
    </div>
  )
}

// ============ Section content ============

function PageHeader({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div className="mb-8 space-y-2">
      <div className="text-[11px] font-medium uppercase tracking-wider text-brand">
        {kicker}
      </div>
      <h1 className="text-3xl font-semibold tracking-tight text-ink">{title}</h1>
    </div>
  )
}

function P({ children }: { children: ReactNode }) {
  return <p className="text-sm leading-relaxed text-muted">{children}</p>
}

function H3({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-sm font-semibold text-ink mt-8 mb-3">{children}</h3>
  )
}

function Code({ children }: { children: ReactNode }) {
  return <code className="font-mono text-ink text-[0.9em]">{children}</code>
}

function Block({ children }: { children: ReactNode }) {
  return (
    <pre className="rounded-lg border border-line bg-canvas p-4 text-[12px] font-mono text-ink overflow-x-auto leading-relaxed">
      {children}
    </pre>
  )
}

function Callout({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <div className="my-6 rounded-lg border-l-4 border-l-brand border border-line bg-surface p-4 text-sm">
      <div className="font-medium text-ink mb-1">{title}</div>
      <div className="text-muted leading-relaxed">{children}</div>
    </div>
  )
}

// ---- Overview ----

function Overview() {
  return (
    <div className="space-y-5">
      <PageHeader kicker="Introduction" title="Overview" />
      <P>
        A fee proxy is a thin, versioned layer deployed in front of the
        Intuition MultiVault. It lets you monetise access to the vault
        (fixed and percentage fees per deposit), rotate the underlying
        logic without migrating storage, and give users a cryptographic
        escape hatch to stay on an audited version they trust.
      </P>
      <P>
        Every proxy is permissionless to deploy. Admins are whitelisted
        addresses — one per proxy, many possible — that can withdraw
        accumulated fees and reconfigure the fee schedule. A separate
        proxy-admin (ideally a Safe) owns the version registry and can
        register new implementations or swap the default.
      </P>

      <H3>How this documentation is organised</H3>
      <div className="grid gap-3 sm:grid-cols-2 mt-2">
        <Link
          to="/docs/call-flow"
          className="rounded-xl border border-line bg-surface p-4 hover:border-line-strong transition-colors"
        >
          <div className="text-[11px] font-medium uppercase tracking-wider text-subtle">
            Concepts
          </div>
          <div className="mt-1 font-medium text-ink">
            Call flow · Proxy vs. impl · Pinning
          </div>
          <div className="mt-1 text-xs text-muted">
            The mental model. Start here if you&apos;re new to ERC-7936.
          </div>
        </Link>
        <Link
          to="/docs/primitives"
          className="rounded-xl border border-line bg-surface p-4 hover:border-line-strong transition-colors"
        >
          <div className="text-[11px] font-medium uppercase tracking-wider text-subtle">
            Reference
          </div>
          <div className="mt-1 font-medium text-ink">Primitives</div>
          <div className="mt-1 text-xs text-muted">
            Function signatures and who can call them.
          </div>
        </Link>
        <Link
          to="/docs/workflow"
          className="rounded-xl border border-line bg-surface p-4 hover:border-line-strong transition-colors sm:col-span-2"
        >
          <div className="text-[11px] font-medium uppercase tracking-wider text-subtle">
            Ship a new version
          </div>
          <div className="mt-1 font-medium text-ink">
            Workflow &amp; Golden rules
          </div>
          <div className="mt-1 text-xs text-muted">
            Step-by-step for authors of new implementations, from writing
            the Solidity file to pushing the canonical address.
          </div>
        </Link>
      </div>
    </div>
  )
}

// ---- Call flow ----

function CallFlow() {
  return (
    <div className="space-y-5">
      <PageHeader kicker="Concepts" title="Call flow" />
      <P>
        Every call flows through three hops. The wallet sends a transaction
        to the proxy; the proxy{' '}
        <Code>delegatecall</Code>s the selected implementation, which
        computes fees and forwards the remainder to the MultiVault. Fees
        stay in the proxy contract, pullable by admins on demand.
      </P>

      <ArchitectureDiagram />

      <H3>Two routing paths</H3>
      <P>
        The proxy exposes the same Solidity ABI as a regular fee proxy —
        users call <Code>deposit(...)</Code> or{' '}
        <Code>createAtoms(...)</Code> as usual. Those calls hit the
        fallback, which routes through the <em>default</em> version.
      </P>
      <P>
        Advanced callers can pin to a specific past version by calling{' '}
        <Code>executeAtVersion(label, data)</Code> directly. The proxy
        looks up that label in its registry and{' '}
        <Code>delegatecall</Code>s that implementation instead, ignoring
        the current default. If the label was registered once, the
        implementation at that address is immutable forever.
      </P>

      <H3>Where state lives</H3>
      <P>
        The proxy&apos;s own storage (version registry, proxy-admin) sits
        in an ERC-7201-style namespaced slot so it can never collide with
        the implementation&apos;s regular slot-0-onwards layout. The
        implementation&apos;s storage — fees, admins, metrics — reads and
        writes directly into the proxy&apos;s low slots via delegatecall.
        That&apos;s what makes upgrades non-destructive.
      </P>
    </div>
  )
}

// ---- Proxy vs impl ----

function ProxyVsImpl() {
  return (
    <div className="space-y-5">
      <PageHeader kicker="Concepts" title="Proxy vs. implementation" />
      <P>
        Two contracts, two roles. Keep them distinct in your head — most
        mistakes around registering new versions come from conflating
        them.
      </P>

      <H3>Implementation</H3>
      <P>
        The logic contract (
        <Code>IntuitionFeeProxyV2</Code>,{' '}
        <Code>IntuitionFeeProxyV21</Code>, etc.). Deployed once on the
        chain, at a fixed address. Stateless on its own: it never runs
        directly — only via <Code>delegatecall</Code> from a proxy.
        That&apos;s why its storage layout has a{' '}
        <Code>__gap</Code>-reserved tail: it will be interpreted in the
        caller&apos;s slots.
      </P>

      <H3>Proxy</H3>
      <P>
        A thin router — <Code>IntuitionVersionedFeeProxy</Code>. Holds the
        actual storage (fees, admins, metrics, version registry) and
        forwards every call to the currently-selected implementation via{' '}
        <Code>delegatecall</Code>. One proxy per deployment; each admin
        owns theirs.
      </P>

      <H3>What goes in the version registry</H3>
      <P>
        When you register <Code>v2.1.0</Code> on your proxy, you store a
        pointer to <b>an already-deployed raw implementation address</b>.
        Never another proxy. Never a Solidity source string.
      </P>
      <Callout title="Common confusion: can I register another proxy?">
        No. A proxy delegates to its own namespaced slot. Putting
        proxy&nbsp;B as an implementation of proxy&nbsp;A means A would{' '}
        <Code>delegatecall</Code> B, and B&apos;s assembly would reach for
        its own layout — but it would read and write into A&apos;s
        storage, corrupting both. Always register naked implementation
        contracts.
      </Callout>

      <H3>Why not just redeploy the logic in place?</H3>
      <P>
        Because users relying on an audited version would silently start
        running new, unaudited code. The version registry is the
        cryptographic commitment that says: &ldquo;v2.0.0 points to this
        exact bytecode, forever.&rdquo; A user who pinned it can trust it
        across any admin action.
      </P>
    </div>
  )
}

// ---- Pinning ----

function Pinning() {
  return (
    <div className="space-y-5">
      <PageHeader kicker="Concepts" title="Pinning to a version" />
      <P>
        The default user experience is the simplest: make a standard call,
        the proxy routes it through the current default version, the new
        version ships automatically when admins register and promote it.
      </P>
      <P>
        Pinning is the escape hatch for users who want something stronger:
        &ldquo;I audited v2.0.0, I don&apos;t care what defaults ship
        next.&rdquo; Once a version label is registered, the
        implementation it points to is immutable. Calling into it will
        route through the exact bytecode you reviewed, for as long as the
        proxy exists.
      </P>

      <H3>When to pin</H3>
      <ul className="space-y-2 text-sm text-muted pl-4 list-disc marker:text-subtle">
        <li>
          You&apos;re an integrator and need a fixed behaviour for
          downstream contracts to depend on.
        </li>
        <li>
          You&apos;re a user who audited an implementation yourself and
          doesn&apos;t want to re-audit on every upgrade.
        </li>
        <li>
          You want insulation against an admin (or compromised multisig)
          shipping a hostile new default.
        </li>
      </ul>

      <H3>How to pin in code</H3>
      <Block>{`// viem example — deposit pinned to v2.0.0
const depositData = encodeFunctionData({
  abi: IntuitionFeeProxyV2ABI,
  functionName: 'deposit',
  args: [termId, curveId, minShares],
})

await walletClient.writeContract({
  address: proxyAddress,
  abi: IntuitionVersionedFeeProxyABI,
  functionName: 'executeAtVersion',
  args: [stringToHex('v2.0.0', { size: 32 }), depositData],
  value: totalValue,
})`}</Block>

      <H3>What happens when the default moves</H3>
      <P>
        Nothing for pinned users. An admin can ship v2.1.0 and promote it,
        or even register and promote v2.2.0 on top of that — the pinned
        path keeps resolving <Code>v2.0.0</Code> to its original
        implementation address. The proxy&apos;s storage keeps evolving
        (fees, metrics, etc.) but the logic running over that storage is
        always the one you chose.
      </P>
    </div>
  )
}

// ---- Primitives ----

function Primitives() {
  return (
    <div className="space-y-5">
      <PageHeader kicker="Reference" title="Primitives" />
      <P>
        The surface area of a fee proxy, grouped by who can call what.
        Signatures are shortened — full types live in the SDK&apos;s ABI
        exports.
      </P>

      <H3>End-user entry points</H3>
      <dl className="divide-y divide-line rounded-xl border border-line bg-surface overflow-hidden">
        <Primitive
          term="deposit(termId, curveId, minShares) payable"
          desc="Deposit TRUST into a term. Proxy keeps a fixed + percentage fee; forwards the remainder to the MultiVault on behalf of msg.sender."
        />
        <Primitive
          term="createAtoms(data[], assets[], curveId) payable"
          desc="Create one or more atoms. Non-zero assets are immediately deposited into the new atom."
        />
        <Primitive
          term="createTriples(subjectIds[], predicateIds[], objectIds[], assets[], curveId) payable"
          desc="Create triples linking three existing terms. Optional deposit per triple."
        />
        <Primitive
          term="depositBatch(termIds[], curveIds[], assets[], minShares[]) payable"
          desc="Batch version of deposit. Fees apply per entry."
        />
        <Primitive
          term="executeAtVersion(version, data) payable"
          desc="Pin a call to a specific registered version. Routes the embedded calldata through that exact implementation."
        />
      </dl>

      <H3>Fee admins (whitelisted)</H3>
      <dl className="divide-y divide-line rounded-xl border border-line bg-surface overflow-hidden">
        <Primitive
          term="setDepositFixedFee(newFee)"
          desc="Update the per-deposit fixed fee (in wei)."
        />
        <Primitive
          term="setDepositPercentageFee(newFee)"
          desc="Update the percentage fee, max 10000 (basis points)."
        />
        <Primitive
          term="setWhitelistedAdmin(admin, status)"
          desc="Add or remove a fee admin. Cannot self-revoke the last admin."
        />
        <Primitive
          term="withdraw(to, amount) / withdrawAll(to)"
          desc="Pull accumulated fees to any address."
        />
      </dl>

      <H3>Proxy admin (single address / Safe)</H3>
      <dl className="divide-y divide-line rounded-xl border border-line bg-surface overflow-hidden">
        <Primitive
          term="registerVersion(label, impl)"
          desc="Append a new implementation to the registry. Label must be unique; impl must be deployed and have code."
        />
        <Primitive
          term="setDefaultVersion(label)"
          desc="Change which registered version handles fallback calls."
        />
        <Primitive
          term="transferProxyAdmin(newAdmin)"
          desc="Hand proxy-admin rights to another address (ideally a rotation-aware multisig)."
        />
      </dl>

      <H3>Metrics (read-only)</H3>
      <dl className="divide-y divide-line rounded-xl border border-line bg-surface overflow-hidden">
        <Primitive
          term="getMetrics() → ProxyMetrics"
          desc="Aggregate tuple: atoms, triples, deposits, volume, unique users, last-activity block."
        />
        <Primitive
          term="hasInteracted(user)"
          desc="Whether an address has ever hit the proxy. Feeds totalUniqueUsers."
        />
      </dl>
    </div>
  )
}

// ---- Workflow ----

function Workflow() {
  return (
    <div className="space-y-5">
      <PageHeader kicker="Ship a new version" title="Workflow" />
      <P>
        A new version is a Solidity file that inherits from the previous
        implementation. It gets audited, deployed once on-chain, and each
        proxy admin decides when — and whether — to register it. Below is
        the full seven-step path from idea to production.
      </P>

      <ol className="space-y-3 mt-6">
        <Step
          n="01"
          title="Write the new implementation"
          body={
            <>
              Create <Code>IntuitionFeeProxyV21.sol</Code> inheriting from{' '}
              <Code>IntuitionFeeProxyV2</Code>. Add functions, override
              existing ones, append new storage variables. Shrink the
              parent&apos;s <Code>__gap</Code> by the number of slots you
              add. Never reorder or delete existing storage.
            </>
          }
        />
        <Step
          n="02"
          title="Test"
          body={
            <>
              Duplicate the parent&apos;s test suite and add coverage for
              new behaviour. Every old test must still pass — that&apos;s
              your regression guarantee. Run{' '}
              <Code>bun contracts:test</Code> until green.
            </>
          }
        />
        <Step
          n="03"
          title="Deploy to testnet and validate"
          body="Deploy the raw implementation (not a full proxy) to Intuition testnet. Pick a disposable test proxy, register the new impl via registerVersion, and exercise every entry point with realistic calldata before touching any real capital."
        />
        <Step
          n="04"
          title="Audit"
          body="External firm — Spearbit, Trail of Bits, Code4rena, OpenZeppelin. Publish the report alongside the implementation address once you&apos;re ready to ship."
        />
        <Step
          n="05"
          title="Deploy to mainnet, verify source"
          body="One-shot deployment of the audited bytecode. Verify source on Intuition Explorer so every consumer can read the exact code that matches the deployed bytecode. No verification = no trust."
        />
        <Step
          n="06"
          title="Publish the canonical address"
          body="Add it to the SDK's canonical-versions table and announce in the changelog with a link to the audit. This is the single address every proxy admin will register."
        />
        <Step
          n="07"
          title="Each admin registers + optionally sets as default"
          body={
            <>
              On their proxy detail page, an admin pastes the canonical
              address into <b>Register new version</b> and signs with
              their Safe. They can set it as default to migrate all
              non-pinned users, or leave it registered but inactive for
              users to opt in via <Code>executeAtVersion</Code>.
            </>
          }
        />
      </ol>

      <Callout title="Before you ship — minimal checklist">
        Storage layout diff = append-only. Constructor has{' '}
        <Code>_disableInitializers()</Code>. Every existing test passes
        against the new impl. <Code>version()</Code> exposes the new
        label. Source is verified on the explorer. Audit report is
        public. Canonical address is in the SDK.
      </Callout>
    </div>
  )
}

// ---- Golden rules ----

function GoldenRules() {
  return (
    <div className="space-y-5">
      <PageHeader kicker="Ship a new version" title="Golden rules" />
      <P>
        Hard rules for implementation authors. Breaking any of these can
        brick existing proxies, corrupt storage, or give users unauthored
        code. Treat as compile-time errors.
      </P>

      <ul className="space-y-4 mt-6 rounded-xl border border-line bg-surface p-5 text-sm leading-relaxed text-muted">
        <Rule title="Inherit from the previous version">
          Guarantees storage-slot compatibility and interface continuity.
          Never redefine or reorder state variables from the parent.
        </Rule>
        <Rule title="Append-only storage">
          New variables go after the parent&apos;s existing slots. Shrink
          the parent&apos;s <Code>__gap</Code> by the exact number of
          slots you add so the tail reservation stays consistent.
        </Rule>
        <Rule title="No new constructor logic">
          Always <Code>_disableInitializers()</Code> in the constructor.
          The proxy is already initialised; this impl never runs its own
          initializer after the first deployment.
        </Rule>
        <Rule title="Guard re-initialisation with reinitializer(n)">
          If you really need a one-shot state migration on upgrade, use{' '}
          <Code>reinitializer(n)</Code> and increment <Code>n</Code> each
          version so a migration step cannot run twice across
          versions.
        </Rule>
        <Rule title="Emit a version marker">
          Expose a <Code>version()</Code> pure function returning a
          string so dashboards and diff tools can introspect without
          guessing from the address.
        </Rule>
        <Rule title="Preserve the public interface">
          Existing function selectors must keep the same signatures and
          semantics. Breaking them would silently surprise users who
          pinned the old version for trust reasons.
        </Rule>
        <Rule title="Never self-upgrade">
          The implementation is pure logic. All upgrade authority lives
          on the versioned proxy via <Code>registerVersion</Code> and{' '}
          <Code>setDefaultVersion</Code>. No{' '}
          <Code>_authorizeUpgrade</Code>, no UUPS escape hatches baked
          into the impl.
        </Rule>
        <Rule title="Tag and verify">
          Tag the commit matching the deployed bytecode, publish the
          source on the explorer, link the audit report. Same commit,
          same bytecode, same address, everywhere.
        </Rule>
      </ul>
    </div>
  )
}

// ============ Small building blocks ============

function Primitive({ term, desc }: { term: string; desc: string }) {
  return (
    <div className="px-5 py-4">
      <dt className="font-mono text-xs text-ink">{term}</dt>
      <dd className="mt-1 text-sm text-muted">{desc}</dd>
    </div>
  )
}

function Step({
  n,
  title,
  body,
}: {
  n: string
  title: string
  body: ReactNode
}) {
  return (
    <li className="flex gap-4 rounded-xl border border-line bg-surface p-4">
      <div className="font-mono text-xs text-subtle pt-0.5">{n}</div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-ink">{title}</div>
        <p className="mt-1 text-sm text-muted leading-relaxed">{body}</p>
      </div>
    </li>
  )
}

function Rule({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <li className="space-y-1">
      <div className="flex items-center gap-2">
        <span className="text-brand text-xs">▸</span>
        <span className="font-medium text-ink">{title}</span>
      </div>
      <div className="pl-5">{children}</div>
    </li>
  )
}

function ArchitectureDiagram() {
  return (
    <div className="flex flex-col items-stretch space-y-2 my-6">
      <Node title="Your wallet" subtitle="User or admin" />
      <ArrowDown />
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
      <ArrowDown />
      <Node
        title="Logic (immutable per version)"
        subtitle="deposit · createAtoms · withdraw · setFees"
      />
      <ArrowDown />
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
        accent ? 'border-brand/30 bg-surface' : 'border-line bg-surface'
      }`}
    >
      <div className="font-medium text-sm text-ink">{title}</div>
      <div className="mt-1 text-xs text-muted">{subtitle}</div>
      {children}
    </div>
  )
}

function ArrowDown() {
  return (
    <div className="flex flex-col items-center text-subtle">
      <div className="h-4 w-px bg-line" />
      <svg width="8" height="6" viewBox="0 0 12 8">
        <path d="M0 0 L6 8 L12 0 Z" fill="currentColor" />
      </svg>
    </div>
  )
}
