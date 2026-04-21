import { useState, type ReactNode } from 'react'
import { Link, NavLink, useParams } from 'react-router-dom'

import {
  CANONICAL_VERSIONS,
  listVersionsByFamily,
  type NetworkName,
  type ProxyFamily,
} from '@intuition-fee-proxy/sdk'

type SectionId =
  | 'overview'
  | 'architecture'
  | 'call-flow'
  | 'proxy-vs-impl'
  | 'pinning'
  | 'sponsoring'
  | 'primitives'
  | 'integration'
  | 'workflow'
  | 'golden-rules'

const GROUPS = [
  {
    label: 'Introduction',
    items: [
      { id: 'overview' as SectionId, label: 'Overview' },
      { id: 'architecture' as SectionId, label: 'Architecture' },
    ],
  },
  {
    label: 'Concepts',
    items: [
      { id: 'call-flow' as SectionId, label: 'Call flow' },
      { id: 'proxy-vs-impl' as SectionId, label: 'Proxy vs. implementation' },
      { id: 'pinning' as SectionId, label: 'Pinning to a version' },
      { id: 'sponsoring' as SectionId, label: 'Sponsoring' },
    ],
  },
  {
    label: 'Reference',
    items: [
      { id: 'primitives' as SectionId, label: 'Primitives' },
      { id: 'integration' as SectionId, label: 'SDK integration' },
    ],
  },
  {
    label: 'Ship a new version',
    items: [
      { id: 'workflow' as SectionId, label: 'Workflow' },
      { id: 'golden-rules' as SectionId, label: 'Golden rules' },
    ],
  },
] as const

const ALL_ITEMS: ReadonlyArray<{ id: SectionId; label: string }> =
  GROUPS.flatMap((g) => g.items.map((i) => ({ id: i.id, label: i.label })))

const ALL_IDS: ReadonlyArray<SectionId> = ALL_ITEMS.map((i) => i.id)

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
    case 'architecture':
      return <Architecture />
    case 'call-flow':
      return <CallFlow />
    case 'proxy-vs-impl':
      return <ProxyVsImpl />
    case 'pinning':
      return <Pinning />
    case 'sponsoring':
      return <Sponsoring />
    case 'primitives':
      return <Primitives />
    case 'integration':
      return <Integration />
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
    ALL_ITEMS.find((i) => i.id === sectionId)?.label ?? ''

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
    <div className="space-y-14">
      <div className="space-y-4">
        <div className="text-[11px] font-medium uppercase tracking-wider text-brand">
          Introduction
        </div>
        <h1 className="text-4xl font-semibold tracking-tight text-ink leading-[1.05]">
          A versioned fee layer for the{' '}
          <span className="text-brand">Intuition MultiVault</span>.
        </h1>
        <p className="text-lg text-muted leading-relaxed max-w-xl">
          Deploy a thin, upgradeable proxy. Charge fees. Ship new logic.
          Never force users off the version they trust.
        </p>
      </div>

      <section className="space-y-3">
        <div className="text-[11px] font-medium uppercase tracking-wider text-subtle">
          Four principles
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Principle
            title="Versioned"
            body="Each new version is added to the registry — it never replaces the previous one. Users who pinned an older version keep running it. The default version is chosen by the admin."
          />
          <Principle
            title="Permissionless"
            body="Anyone deploys — no allowlist, no gatekeeper. Just TRUST for gas and you have your own fee proxy."
          />
          <Principle
            title="Sponsorable"
            body="Admins top up a shared TRUST pool (as many times as needed). Users draw from it on normal calls, bounded by a per-call cap and a per-user daily claim limit."
          />
          <Principle
            title="User-pinned"
            body="Any user can route through a specific past version forever via executeAtVersion. Admin-independent trust."
          />
        </div>
      </section>

      <section className="space-y-3">
        <div className="text-[11px] font-medium uppercase tracking-wider text-subtle">
          Two channels, one factory
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <ChannelPreview
            variant="fee"
            name="Standard"
            body="Users pay deposits and fees directly from their own wallet. Simplest path, ideal when your users already hold TRUST."
          />
          <ChannelPreview
            variant="sponsor"
            name="Sponsored"
            body="Admins fund a shared TRUST pool (top-up any time). Users draw from it on normal calls with reduced or zero msg.value. Ideal for fiat-onboarded dApps."
          />
        </div>
        <p className="text-xs text-subtle pt-1">
          The channel is locked at deploy time. Pick before calling{' '}
          <Code>createProxy</Code>.
        </p>
      </section>

      <section className="space-y-3">
        <div className="text-[11px] font-medium uppercase tracking-wider text-subtle">
          Dive in
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <NavCard
            to="/docs/architecture"
            kicker="Start here"
            title="Architecture"
            body="The full system — factory, admins, proxies, impl, MultiVault — with a Fee/Sponsor toggle. 5-minute read."
          />
          <NavCard
            to="/docs/integration"
            kicker="Reference"
            title="SDK integration"
            body="Ship it. Install, recipes, and the live canonical versions table."
          />
          <NavCard
            to="/docs/call-flow"
            kicker="Concepts"
            title="Call flow + pinning"
            body="How a deposit travels through delegatecall, and why versioning matters for user trust."
          />
          <NavCard
            to="/docs/workflow"
            kicker="Ship a new version"
            title="Author workflow"
            body="Writing, reviewing, deploying and publishing a new implementation as canonical."
          />
        </div>
      </section>
    </div>
  )
}

// ---- Architecture ----

function Architecture() {
  const [channel, setChannel] = useState<'fee' | 'sponsor'>('fee')
  const isFee = channel === 'fee'
  const accentBorder = isFee ? 'border-brand/50' : 'border-[#e8a04a]/60'
  const accentBg = isFee ? 'bg-brand/[0.06]' : 'bg-[#e8a04a]/[0.07]'
  const accentText = isFee ? 'text-brand' : 'text-[#e8a04a]'

  return (
    <div className="space-y-5">
      <PageHeader kicker="Introduction" title="Architecture" />
      <P>
        A proxy never runs in isolation. It sits inside a four-actor system:
        a <b className="text-ink">factory</b> that deploys it, two{' '}
        <b className="text-ink">admin</b> roles that configure it, an{' '}
        <b className="text-ink">implementation</b> that holds the logic, and
        the <b className="text-ink">MultiVault</b> that ultimately executes
        the deposit. The channel picked at deploy time decides who pays:
        the user, or a pool the admin has pre-funded.
      </P>

      <div className="inline-flex rounded-lg border border-line bg-surface p-1 mt-2">
        <ChannelToggle
          active={isFee}
          onClick={() => setChannel('fee')}
          color="brand"
        >
          Fee proxy
        </ChannelToggle>
        <ChannelToggle
          active={!isFee}
          onClick={() => setChannel('sponsor')}
          color="amber"
        >
          Sponsor proxy
        </ChannelToggle>
      </div>

      <H3>Deploy time</H3>
      <P>
        Anyone can deploy a proxy; there is no gatekeeper. The factory is a
        single permissionless contract — it clones the proxy bytecode,
        points it at the channel-specific implementation, and assigns the
        caller-supplied admins.
      </P>
      <div className="flex flex-col items-stretch space-y-2 my-4">
        <ArchNode title="Admin wallet or Safe" subtitle="calls createProxy(...)" />
        <ArrowDown />
        <ArchNode
          title="IntuitionFeeProxyFactory"
          subtitle="clones the proxy · wires the channel impl · emits ProxyCreated"
        />
        <ArrowDown />
        <ArchNode
          title={isFee ? 'Fee proxy' : 'Sponsor proxy'}
          subtitle={
            isFee
              ? 'ABI-clean standard V2 implementation'
              : 'V2Sponsored implementation — adds a shared TRUST pool'
          }
          borderClass={accentBorder}
          bgClass={accentBg}
          titleClass={accentText}
        />
      </div>

      <H3>Runtime — transaction flow</H3>
      <P>
        The proxy keeps two storage compartments: its own (version registry,
        proxy admin) in an ERC-7201 namespaced slot, and the
        implementation&apos;s (fees, metrics, admins — plus the sponsor pool
        in the sponsored channel) in low slots. Every call arrives at the
        proxy and is <Code>delegatecall</Code>ed to the selected version.
      </P>
      <div className="flex flex-col items-stretch space-y-2 my-4">
        <ArchNode
          title="User"
          subtitle={
            isFee
              ? 'sends deposit() with msg.value = amount + fee'
              : 'sends deposit() with reduced or zero msg.value — the pool adds up to maxClaimPerTx to cover the gap'
          }
        />
        <ArrowDown />
        <ArchNode
          title={isFee ? 'Fee proxy' : 'Sponsor proxy'}
          subtitle={
            isFee
              ? 'keeps fixed + % fee in accumulatedFees · delegatecall default version'
              : 'draws at most maxClaimPerTx from sponsorPool per call · per-user caps maxClaimsPerWindow + maxClaimVolumePerWindow over claimWindowSeconds · delegatecall default version'
          }
          borderClass={accentBorder}
          bgClass={accentBg}
          titleClass={accentText}
        />
        <ArrowDown />
        <ArchNode
          title="MultiVault"
          subtitle="executes the deposit · mints shares to the user"
        />
      </div>

      <H3>Actors</H3>
      <dl className="divide-y divide-line rounded-xl border border-line bg-surface overflow-hidden">
        <Actor
          term="Factory"
          desc="Single contract per chain. Holds the canonical standard + sponsored implementation addresses the project owner can bump via setImplementation / setSponsoredImplementation. Never sees user funds."
        />
        <Actor
          term="Proxy"
          desc={
            isFee
              ? 'The contract every user interacts with. Routes deposits through the current default version, or through any pinned version via executeAtVersion. Accumulates fees in accumulatedFees.'
              : 'Same router as the fee proxy, plus a shared sponsorPool admins top up through fundPool (callable as many times as needed). User entry points (deposit, createAtoms, …) draw from the pool transparently when the user calls them with reduced or zero msg.value.'
          }
        />
        <Actor
          term="Fee admins (whitelisted)"
          desc={
            isFee
              ? 'Multiple addresses. Configure fixed + percentage fees, withdraw accumulated fees to any address, rotate the whitelist. Cannot touch the proxy-admin surface.'
              : 'Same fee admin role, plus the sponsor surface: fundPool, reclaimFromPool, setClaimLimits. withdraw is invariant-checked so it stays limited to accumulatedFees and leaves the sponsorPool untouched.'
          }
        />
        <Actor
          term="Proxy admin (single address — use a Safe)"
          desc="Single-slot role (one address at a time). For production, put a Gnosis Safe multisig here — the Safe handles N signers / threshold / signer rotation internally, so you get 'multi-human proxyAdmin' without the contract knowing anything about it. Owns the version registry: registerVersion / setDefaultVersion / 2-step grant via transferProxyAdmin → pending target calls acceptProxyAdmin. Intentionally disjoint from fee admins — compromise of one does not cascade to the other."
        />
        <Actor
          term="Implementation"
          desc={
            isFee
              ? 'Stateless logic contract (IntuitionFeeProxyV2, V2.1, …). Never runs standalone — only via delegatecall from a proxy. New versions inherit from the previous one and never reorder storage.'
              : 'IntuitionFeeProxyV2Sponsored — same pattern as V2, but adds a shared sponsor pool, pool accounting and per-user rate limits. User entry points override the V2 ones to draw from the pool transparently. Upgrades stay append-only within the sponsored family.'
          }
        />
        <Actor
          term="MultiVault"
          desc="Intuition core. The proxy is a pure front; every deposit is ultimately executed here, and the resulting shares are minted to the user who signed the tx — the proxy never reassigns ownership."
        />
      </dl>

      <H3>{isFee ? 'Fee economics' : 'Pool economics'}</H3>
      {isFee ? (
        <>
          <P>
            Every deposit carries two fees: a fixed amount in wei
            (<Code>depositFixedFee</Code>) and a percentage of the
            post-fixed-fee amount (<Code>depositPercentageFee</Code>, basis
            points, hard-capped at 10%). Both accumulate inside the proxy.
            Admins pull them out on demand via{' '}
            <Code>withdraw(to, amount)</Code> or{' '}
            <Code>withdrawAll(to)</Code>. No streaming, no escrow, no
            external dependency.
          </P>
        </>
      ) : (
        <>
          <P>
            One shared <Code>sponsorPool</Code> funded by the admin via{' '}
            <Code>fundPool</Code> (payable, re-callable anytime). Every
            sponsored call consumes from the same pool, bounded by four
            always-on per-user rate limits: <Code>maxClaimPerTx</Code>{' '}
            (cap per call), <Code>maxClaimsPerWindow</Code> (pool-drawing
            calls per user), <Code>maxClaimVolumePerWindow</Code>{' '}
            (cumulative TRUST per user), all applied over a{' '}
            <Code>claimWindowSeconds</Code> sliding window that the admin
            sets (1h, 1 day, 1 week, …). The admin can{' '}
            <Code>reclaimFromPool</Code> any unspent balance. Standard
            fees (fixed + percentage) still apply on top — they accumulate
            in <Code>accumulatedFees</Code> separately, and{' '}
            <Code>withdraw</Code> is invariant-checked so it can never dip
            into the pool.
          </P>
        </>
      )}

      <Callout title={isFee ? 'Need sponsorship later?' : 'Need a pure fee proxy?'}>
        The channel is fixed at deploy time. Switching from fee to sponsored
        (or the other way) requires deploying a fresh proxy. Pick the one
        that matches your dApp&apos;s monetisation model before hitting{' '}
        <Code>createProxy</Code>.
      </Callout>
    </div>
  )
}

function ChannelToggle({
  active,
  onClick,
  color,
  children,
}: {
  active: boolean
  onClick: () => void
  color: 'brand' | 'amber'
  children: ReactNode
}) {
  const activeCls =
    color === 'brand'
      ? 'bg-brand/10 text-brand'
      : 'bg-[#e8a04a]/10 text-[#e8a04a]'
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
        active ? activeCls : 'text-muted hover:text-ink'
      }`}
    >
      {children}
    </button>
  )
}

function ArchNode({
  title,
  subtitle,
  borderClass,
  bgClass,
  titleClass,
}: {
  title: string
  subtitle: string
  borderClass?: string
  bgClass?: string
  titleClass?: string
}) {
  return (
    <div
      className={`rounded-lg border p-4 transition-colors ${
        borderClass ?? 'border-line'
      } ${bgClass ?? 'bg-surface'}`}
    >
      <div className={`font-medium text-sm ${titleClass ?? 'text-ink'}`}>
        {title}
      </div>
      <div className="mt-1 text-xs text-muted">{subtitle}</div>
    </div>
  )
}

function Actor({ term, desc }: { term: string; desc: string }) {
  return (
    <div className="px-5 py-4">
      <dt className="text-sm font-medium text-ink">{term}</dt>
      <dd className="mt-1 text-sm text-muted leading-relaxed">{desc}</dd>
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
        Because users relying on a reviewed version would silently start
        running new, un-reviewed code. The version registry is the
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
        &ldquo;I reviewed v2.0.0, I don&apos;t care what defaults ship
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
          You&apos;re a user who reviewed an implementation yourself and
          doesn&apos;t want to re-review on every upgrade.
        </li>
        <li>
          You want insulation against an admin-key compromise. If the
          proxy admin&apos;s keys are stolen and the attacker registers a
          malicious impl as the new default, pinned users keep routing
          through the exact bytecode they chose and are never touched.
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
          desc="Step 1 of a 2-step rotation. Sets pendingProxyAdmin but does NOT transfer powers. Calling again overwrites the pending candidate. Passing address(0) reverts."
        />
        <Primitive
          term="acceptProxyAdmin()"
          desc="Step 2 of the rotation. Must be called by the address currently set as pendingProxyAdmin — it promotes the caller to proxyAdmin. Prevents fat-fingered transfers to wrong / lost addresses."
        />
        <Primitive
          term="pendingProxyAdmin() view"
          desc="Returns the candidate awaiting acceptance, or address(0) if no transfer is pending."
        />
        <Primitive
          term="setName(newName) / getName()"
          desc="Optional human-readable label on the proxy. setName is proxy-admin only; getName is public. 32 bytes max."
        />
      </dl>

      <H3>Sponsored channel only (V2Sponsored)</H3>
      <P>
        These functions exist only on proxies deployed through the
        Sponsored channel. Calling them on a Standard proxy reverts with
        &quot;function not found&quot;.
      </P>
      <dl className="divide-y divide-line rounded-xl border border-line bg-surface overflow-hidden">
        <Primitive
          term="fundPool() payable"
          desc="Fee-admin only. Adds msg.value to the shared sponsorPool. Any user of the proxy can then draw from it on their next deposit."
        />
        <Primitive
          term="reclaimFromPool(amount, to)"
          desc="Fee-admin only. Pulls unspent TRUST out of the pool to the recipient of your choice."
        />
        <Primitive
          term="setClaimLimits(maxPerTx, maxPerWindow, maxVolumePerWindow, windowSec)"
          desc="Fee-admin only. All four values must stay > 0 — no 'unlimited' escape. Defaults: 1 TRUST per call, 10 calls / 10 TRUST per 24h window per user."
        />
        <Primitive
          term="sponsorPool() → uint256"
          desc="Current pool balance."
        />
        <Primitive
          term="getClaimStatus(user) → (claimsUsed, volumeUsed, windowResetsAt)"
          desc="How many pool-funded draws and how much cumulative TRUST the user has consumed in the current window, and when the window resets."
        />
        <Primitive
          term="getSponsoredMetrics() → (deposits, volume, uniqueReceivers)"
          desc="Aggregate counters bumped on every pool-funded draw."
        />
      </dl>

      <H3>Metrics (read-only, both channels)</H3>
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

// ---- Integration ----

function Integration() {
  const [network, setNetwork] = useState<NetworkName>('testnet')

  return (
    <div className="space-y-5">
      <PageHeader kicker="Reference" title="SDK integration" />
      <P>
        <Code>@intuition-fee-proxy/sdk</Code> is the one dependency you
        need to talk to the fee-proxy ecosystem from any TypeScript
        codebase — webapps, Node scripts, Cloudflare Workers. It ships
        ABIs, chain configs, the canonical version registry, and typed
        readers that take a viem <Code>PublicClient</Code>.
      </P>

      <H3>Install</H3>
      <Block>{`bun add @intuition-fee-proxy/sdk viem
# or
npm i @intuition-fee-proxy/sdk viem`}</Block>
      <P>
        <Code>viem</Code> is a peer dependency — bring your own version.
      </P>

      <H3>Setup a client</H3>
      <Block>{`import { createPublicClient, http } from 'viem'
import { INTUITION_TESTNET } from '@intuition-fee-proxy/sdk'

const client = createPublicClient({
  chain: INTUITION_TESTNET,
  transport: http(),
})`}</Block>

      <H3>Recipe — list every deployed proxy</H3>
      <P>
        Reads <Code>factory.getAllProxies()</Code>. Same data the Explore
        tab renders.
      </P>
      <Block>{`import {
  V2_ADDRESSES,
  fetchAllProxies,
} from '@intuition-fee-proxy/sdk'

const proxies = await fetchAllProxies(
  client,
  V2_ADDRESSES.testnet.factory,
)`}</Block>

      <H3>Recipe — read a proxy&apos;s headline stats</H3>
      <Block>{`import { readProxyStats } from '@intuition-fee-proxy/sdk'

const stats = await readProxyStats(client, proxies[0])
// { ethMultiVault, depositFixedFee, depositPercentageFee,
//   accumulatedFees, totalFeesCollectedAllTime, adminCount }`}</Block>

      <H3>Recipe — register a canonical version on your proxy</H3>
      <P>
        As the proxy admin, adopt a new canonical implementation without
        pasting its address by hand — pull it straight from the SDK.
      </P>
      <Block>{`import { stringToHex } from 'viem'
import {
  IntuitionVersionedFeeProxyABI,
  getLatestVersion,
} from '@intuition-fee-proxy/sdk'

const latest = getLatestVersion('testnet', 'standard')
if (!latest) throw new Error('No canonical version published yet')

await walletClient.writeContract({
  abi: IntuitionVersionedFeeProxyABI,
  address: yourProxyAddress,
  functionName: 'registerVersion',
  args: [stringToHex(latest.label, { size: 32 }), latest.impl],
})`}</Block>

      <H3>Recipe — fund a sponsor pool</H3>
      <Block>{`import { parseEther } from 'viem'
import { IntuitionFeeProxyV2SponsoredABI } from '@intuition-fee-proxy/sdk'

await walletClient.writeContract({
  abi: IntuitionFeeProxyV2SponsoredABI,
  address: yourSponsoredProxyAddress,
  functionName: 'fundPool',
  args: [],
  value: parseEther('25'),
})`}</Block>

      <H3>Canonical versions</H3>
      <P>
        This table is sourced directly from the SDK&apos;s{' '}
        <Code>CANONICAL_VERSIONS</Code> export — bumping the SDK package
        is how maintainers publish a new recommended impl to every
        consumer.
      </P>
      <div className="mt-3 flex gap-2">
        <NetworkToggle
          value={network}
          onChange={setNetwork}
          label="testnet"
          target="testnet"
        />
        <NetworkToggle
          value={network}
          onChange={setNetwork}
          label="mainnet"
          target="mainnet"
        />
      </div>

      <CanonicalVersionsTable network={network} family="standard" />
      <CanonicalVersionsTable network={network} family="sponsored" />

      <Callout title="Using an impl that isn't in this table?">
        The <Code>registerVersion</Code> call is permissionless at the
        contract level — any address with deployed bytecode can be
        registered. The canonical list is a <em>recommendation</em>
        (reviewed + freshness signal), not a gatekeeper. We review each
        implementation version before publishing it to the canonical
        registry. Users remain free to stay on any previous version, or
        pin to a specific one, indefinitely. Third-party impls fall
        outside that review — use them only when you are the author and
        have reviewed them end-to-end.
      </Callout>

      <H3>Framework-agnostic readers</H3>
      <P>
        The SDK exports the same on-chain reads the webapp uses as plain
        async functions — no React, no wagmi, just{' '}
        <Code>(client, …args) → data</Code>. Drop them into a Node
        script, a backend indexer, another frontend, anywhere you have a
        viem <Code>PublicClient</Code>:
      </P>
      <ul className="space-y-1 text-sm text-muted pl-4 list-disc marker:text-subtle mt-2">
        <li>
          <Code>fetchAllProxies(client, factory)</Code> /{' '}
          <Code>fetchProxiesByDeployer(client, factory, deployer)</Code>
        </li>
        <li>
          <Code>readProxyStats</Code> / <Code>readProxyMetrics</Code> /{' '}
          <Code>readProxyVersions</Code> /{' '}
          <Code>readProxyVersionLabel</Code>
        </li>
        <li>
          <Code>readSponsorPool</Code> / <Code>readSponsoredMetrics</Code>{' '}
          — sponsored-only, return <Code>undefined</Code> on standard
          proxies without throwing.
        </li>
      </ul>
    </div>
  )
}

function NetworkToggle({
  value,
  onChange,
  label,
  target,
}: {
  value: NetworkName
  onChange: (n: NetworkName) => void
  label: string
  target: NetworkName
}) {
  const active = value === target
  return (
    <button
      type="button"
      onClick={() => onChange(target)}
      className={`px-3 py-1 text-xs rounded-md border transition-colors ${
        active
          ? 'border-brand/60 bg-brand/[0.08] text-brand'
          : 'border-line bg-surface text-muted hover:text-ink'
      }`}
    >
      {label}
    </button>
  )
}

function CanonicalVersionsTable({
  network,
  family,
}: {
  network: NetworkName
  family: ProxyFamily
}) {
  const versions = listVersionsByFamily(network, family)
  const isLatest = (label: string) =>
    CANONICAL_VERSIONS[network].latest[family] === label

  return (
    <div className="mt-4">
      <div className="text-[10px] font-mono uppercase tracking-wider text-subtle mb-2">
        {family}
      </div>
      {versions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-surface p-4 text-xs text-subtle">
          No canonical {family} version published for {network} yet. The
          Factory is permissionless — deploy anyway and register a custom
          impl via the <Code>Advanced</Code> path on the ProxyDetail page.
        </div>
      ) : (
        <dl className="divide-y divide-line rounded-xl border border-line bg-surface overflow-hidden">
          {versions.map((v) => (
            <div key={v.label} className="px-5 py-4">
              <dt className="flex items-center gap-2 text-sm">
                <span className="font-medium text-ink">{v.label}</span>
                {isLatest(v.label) && (
                  <span className="rounded-full border border-brand/40 bg-brand/10 text-brand text-[10px] font-mono uppercase tracking-wider px-2 py-0.5">
                    latest
                  </span>
                )}
              </dt>
              <dd className="mt-1 font-mono text-[11px] text-subtle break-all">
                {v.impl}
              </dd>
              {(v.review || v.summary) && (
                <dd className="mt-2 text-xs text-muted leading-relaxed">
                  {v.summary && <span>{v.summary}</span>}
                  {v.review && (
                    <>
                      {v.summary && <span> · </span>}
                      <a
                        href={v.review.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand hover:opacity-80 transition-opacity"
                      >
                        Reviewed — {v.review.date}
                      </a>
                    </>
                  )}
                </dd>
              )}
            </div>
          ))}
        </dl>
      )}
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
        implementation. It gets reviewed by the Intuition team, deployed
        once on-chain, and each proxy admin decides when — and whether —
        to register it. Below is the full seven-step path from idea to
        production. We review each implementation version before
        publishing it to the canonical registry. Users remain free to
        stay on any previous version, or pin to a specific one,
        indefinitely.
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
          title="Internal review"
          body="The Intuition team reviews the implementation end-to-end before publication: diff against the previous canonical version, storage-layout check, test coverage, and threat-model notes. The review write-up is published alongside the implementation address."
        />
        <Step
          n="05"
          title="Deploy to mainnet, verify source"
          body="One-shot deployment of the reviewed bytecode. Verify source on Intuition Explorer so every consumer can read the exact code that matches the deployed bytecode. No verification = no trust."
        />
        <Step
          n="06"
          title="Publish the canonical address"
          body="Add it to the SDK's canonical-versions table and announce in the changelog with a link to the review write-up. This is the single address every proxy admin will register."
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
        label. Source is verified on the explorer. Review write-up is
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
          source on the explorer, link the review write-up. Same commit,
          same bytecode, same address, everywhere.
        </Rule>
      </ul>
    </div>
  )
}

// ---- Sponsoring ----

function Sponsoring() {
  return (
    <div className="space-y-5">
      <PageHeader kicker="Concepts" title="Sponsoring" />
      <P>
        A proxy deployed on the <b>sponsored channel</b> runs the{' '}
        <Code>IntuitionFeeProxyV2Sponsored</Code> implementation — a
        superset of standard V2 that lets the proxy carry a shared TRUST
        pool. Admins top the pool up whenever they need to; any user
        interacting with the proxy then draws from it transparently. Use
        case: a dApp that charges its users in fiat (Stripe, App Store)
        but still needs TRUST on-chain to interact with the MultiVault.
      </P>

      <H3>One proxy, one pool, top up at will</H3>
      <P>
        The proxy is the sole sponsoring entity. There is no per-user
        budget, no multi-sponsor tracking and no allowlist of who can
        draw — admins call <Code>fundPool()</Code> as many times as they
        like (each call adds <Code>msg.value</Code> to{' '}
        <Code>sponsorPool</Code>), and every user who calls the proxy
        consumes from the same bucket until it&apos;s empty. Fairness is
        enforced by four rate-limit knobs applied over a configurable
        rolling window: <Code>maxClaimPerTx</Code> (cap per single call),{' '}
        <Code>maxClaimsPerWindow</Code> (max pool-drawing calls per user
        per window), <Code>maxClaimVolumePerWindow</Code> (max cumulative
        TRUST per user per window) and <Code>claimWindowSeconds</Code>{' '}
        (window length — 1h, 1 day, 1 week, …).
      </P>
      <P>
        For tiered subscriptions (free / pro / premium), deploy one
        sponsored proxy per tier rather than encoding tiers on-chain.
        Each proxy has its own pool, limits and admins — isolation is
        cleaner and keeps the contract simple.
      </P>
      <P>
        Funding is a plain on-chain call — you can expose it directly in
        your dashboard and let multiple trusted admins top up from their
        own wallets. Unspent TRUST is reclaimable any time via{' '}
        <Code>reclaimFromPool(amount, to)</Code>.
      </P>

      <H3>The sponsored flow</H3>
      <P>
        The user calls the normal entry points (<Code>deposit</Code>,{' '}
        <Code>createAtoms</Code>, <Code>createTriples</Code>,{' '}
        <Code>depositBatch</Code>) from their own wallet. On{' '}
        <Code>deposit</Code>, the proxy automatically draws up to{' '}
        <Code>maxClaimPerTx</Code> from the pool and adds it to whatever{' '}
        <Code>msg.value</Code> the user sent (which can be zero). On the
        batched entry points, the user passes the asset amounts they want
        to deposit, and the pool only fills the gap between{' '}
        <Code>msg.value</Code> and the required total. In both cases the
        user signs their own tx and owns the shares; the admin&apos;s
        surface is limited to configuring and funding the pool.
      </P>
      <P>
        For custodial onboarding flows where the user has no wallet of
        their own, the app handles that at the frontend layer via an
        embedded-AA kit (Privy, Thirdweb, Turnkey). The wallet still
        belongs to the user conceptually, and the on-chain call still
        originates from them.
      </P>
      <P>
        Reclaim any unspent TRUST via{' '}
        <Code>reclaimFromPool(amount, to)</Code> at any time.
      </P>

      <H3>Claim limits — mandatory, never unlimited</H3>
      <P>
        Sponsored proxies always enforce four rate-limits on credit
        consumption, configurable by the admin but never zero:
      </P>
      <ul className="space-y-2 pl-4 list-disc marker:text-subtle text-sm text-muted">
        <li>
          <Code>maxClaimPerTx</Code> — max TRUST drawable from credit in a
          single call. Default 1 TRUST. Acts as a <em>cap</em>: a user
          with more credit than the cap only consumes up to the cap per
          tx, the rest stays available for later.
        </li>
        <li>
          <Code>maxClaimsPerWindow</Code> — max number of pool-drawing
          calls per user per rolling window. Default 10. Only calls that
          actually consume from the pool bump the counter — on the
          batched entry points (<Code>createAtoms</Code>,{' '}
          <Code>createTriples</Code>, <Code>depositBatch</Code>) a user
          can send full <Code>msg.value</Code> to opt out of the pool
          and leave their daily quota untouched. On <Code>deposit</Code>{' '}
          the pool always contributes while it has balance, so that
          entry point always bumps the counter until the pool is empty.
        </li>
        <li>
          <Code>maxClaimVolumePerWindow</Code> — max cumulative TRUST (in
          wei) a user can draw from the pool across all their calls in a
          window. Default 10 TRUST. Hits <em>before</em> the count cap
          when the user makes large individual claims — lets you enforce
          a budget per user (e.g. 5 TRUST/week/student) independent of
          how many transactions they spread it across.
        </li>
        <li>
          <Code>claimWindowSeconds</Code> — length of the rolling window
          in seconds. Default 86400 (1 day). Set it to 3600 for hourly,
          604800 for weekly, 2592000 for monthly. All three caps above
          roll over together when the window elapses.
        </li>
      </ul>

      <H3>Admin API (all onlyWhitelistedAdmin)</H3>
      <dl className="divide-y divide-line rounded-xl border border-line bg-surface overflow-hidden">
        <Primitive
          term="fundPool() payable"
          desc="Top up the shared sponsor pool with msg.value TRUST. Callable as many times as you like — safe to expose directly in your dashboard so multiple admin wallets can contribute."
        />
        <Primitive
          term="reclaimFromPool(amount, to)"
          desc="Pull unspent TRUST out of the pool to any recipient address (e.g. treasury, Safe)."
        />
        <Primitive
          term="setClaimLimits(maxPerTx, maxPerWindow, maxVolumePerWindow, windowSec)"
          desc="Update all four rate-limit knobs atomically. Every value must stay > 0 (reverts otherwise). Window is the rolling duration in seconds (1h=3600, 1 day=86400, 1 week=604800)."
        />
      </dl>

      <H3>User-facing API (same selectors as standard V2)</H3>
      <P>
        A sponsored proxy is ABI-compatible with V2 for users: the dApp
        does not need a different SDK path for users with credit. Credit
        consumption happens transparently inside the existing{' '}
        <Code>deposit</Code> / <Code>createAtoms</Code> /{' '}
        <Code>createTriples</Code> / <Code>depositBatch</Code> functions.
      </P>

      <H3>Example: fund 25 TRUST into the pool</H3>
      <Block>{`await walletClient.writeContract({
  abi: IntuitionFeeProxyV2SponsoredABI,
  address: proxyAddress,
  functionName: 'fundPool',
  args: [],
  value: parseEther('25'),
})
// Any user interacting with the proxy now draws up to maxClaimPerTx
// from the pool per call, bounded by maxClaimsPerWindow (count) and
// maxClaimVolumePerWindow (TRUST) per user over claimWindowSeconds.`}</Block>

      <H3>Invariant: withdraw never dips into the credit pool</H3>
      <P>
        <Code>withdraw</Code> / <Code>withdrawAll</Code> on a sponsored
        proxy assert that{' '}
        <Code>balance - amount &ge; totalSponsoredCredit</Code> after the
        transfer — an admin can&apos;t accidentally drain user credit by
        withdrawing fees. Only <Code>accumulatedFees</Code> is reachable
        through the withdraw path.
      </P>

      <H3>Choose the channel at deploy time</H3>
      <P>
        The channel is fixed at proxy creation (<Code>Standard</Code> or{' '}
        <Code>Sponsored</Code>) and can&apos;t be switched later without
        deploying a new proxy. The Factory exposes{' '}
        <Code>setSponsoredImplementation</Code> for the project owner so
        V2.1Sponsored etc. can ship as canonical upgrades — but each
        individual proxy chooses its family once and stays within it.
      </P>
    </div>
  )
}

// ============ Small building blocks ============

function Principle({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      <div className="flex items-center gap-2">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand" />
        <span className="text-sm font-semibold text-ink">{title}</span>
      </div>
      <p className="mt-2 text-sm text-muted leading-relaxed">{body}</p>
    </div>
  )
}

function ChannelPreview({
  variant,
  name,
  body,
}: {
  variant: 'fee' | 'sponsor'
  name: string
  body: string
}) {
  const isSponsor = variant === 'sponsor'
  const borderCls = isSponsor ? 'border-[#e8a04a]/50' : 'border-brand/50'
  const bgCls = isSponsor ? 'bg-[#e8a04a]/[0.05]' : 'bg-brand/[0.05]'
  const textCls = isSponsor ? 'text-[#e8a04a]' : 'text-brand'
  return (
    <div className={`rounded-xl border ${borderCls} ${bgCls} p-5`}>
      <div
        className={`text-[10px] font-mono uppercase tracking-wider ${textCls}`}
      >
        {name}
      </div>
      <p className="mt-2 text-sm text-muted leading-relaxed">{body}</p>
    </div>
  )
}

function NavCard({
  to,
  kicker,
  title,
  body,
}: {
  to: string
  kicker: string
  title: string
  body: string
}) {
  return (
    <Link
      to={to}
      className="group rounded-xl border border-line bg-surface p-5 hover:border-line-strong transition-colors flex flex-col gap-2 h-full"
    >
      <div className="text-[10px] font-mono uppercase tracking-wider text-subtle">
        {kicker}
      </div>
      <div className="font-semibold text-ink">{title}</div>
      <p className="text-xs text-muted leading-relaxed">{body}</p>
      <div className="mt-auto pt-2 text-xs text-muted group-hover:text-ink transition-colors">
        Read →
      </div>
    </Link>
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
