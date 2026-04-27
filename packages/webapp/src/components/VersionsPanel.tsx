import { useEffect, useMemo, useRef, useState } from 'react'
import { isAddress, stringToHex, type Address, type Hex } from 'viem'
import { useWaitForTransactionReceipt } from 'wagmi'

import {
  listVersionsByFamily,
  type CanonicalVersion,
  type NetworkName,
  type ProxyFamily,
} from '@intuition-fee-proxy/sdk'
import {
  useRegisterVersion,
  useSetDefaultVersion,
} from '../hooks/useVersionedProxy'
import { decodeVersion } from '../lib/format'

interface Props {
  proxy: Address
  network: NetworkName
  family: ProxyFamily
  versions: Hex[]
  defaultVersion: Hex | undefined
  isProxyAdmin: boolean
  onDone: () => void
}

/** Per-row derived state. */
type RowStatus =
  | { kind: 'default' }
  | { kind: 'registered' } // registered but not currently default
  | { kind: 'available' } // canonical version not registered yet on this proxy

interface Row {
  label: string
  labelHex: Hex
  impl: Address | undefined
  canonical: CanonicalVersion | undefined
  status: RowStatus
}

export function VersionsPanel({
  proxy,
  network,
  family,
  versions,
  defaultVersion,
  isProxyAdmin,
  onDone,
}: Props) {
  const canonical = listVersionsByFamily(network, family)

  // Merge on-chain registered versions with canonical entries into one
  // deduplicated directory view. `decodeVersion` strips the trailing \0s
  // from the bytes32 label so both sources compare cleanly.
  const rows: Row[] = useMemo(() => {
    const defaultLabel = defaultVersion ? decodeVersion(defaultVersion) : undefined
    const registered = new Map<string, { hex: Hex }>()
    for (const hex of versions) registered.set(decodeVersion(hex), { hex })

    const byLabel = new Map<string, Row>()

    // Pass 1 — everything on-chain (may or may not be canonical).
    for (const [label, { hex }] of registered.entries()) {
      const c = canonical.find((v) => v.label === label)
      byLabel.set(label, {
        label,
        labelHex: hex,
        impl: c?.impl,
        canonical: c,
        status:
          defaultLabel === label
            ? { kind: 'default' }
            : { kind: 'registered' },
      })
    }

    // Pass 2 — canonical entries missing on-chain (`Available`).
    for (const c of canonical) {
      if (byLabel.has(c.label)) continue
      byLabel.set(c.label, {
        label: c.label,
        labelHex: stringToHex(c.label, { size: 32 }),
        impl: c.impl,
        canonical: c,
        status: { kind: 'available' },
      })
    }

    // Sort: default first, then registered (canonical before custom),
    // then available (by publishedAt desc). Keeps "what's live right now"
    // at the top, new suggestions next.
    return Array.from(byLabel.values()).sort((a, b) => {
      if (a.status.kind === 'default') return -1
      if (b.status.kind === 'default') return 1
      if (a.status.kind === 'registered' && b.status.kind !== 'registered')
        return -1
      if (b.status.kind === 'registered' && a.status.kind !== 'registered')
        return 1
      return (
        (b.canonical?.publishedAt ?? 0) - (a.canonical?.publishedAt ?? 0)
      )
    })
  }, [versions, canonical, defaultVersion])

  // ── Write hooks (shared across all rows) ──────────────────────────────

  const {
    register,
    hash: registerHash,
    isPending: registerPending,
    error: registerError,
  } = useRegisterVersion(proxy)
  const {
    setDefault,
    hash: defaultHash,
    isPending: defaultPending,
    error: defaultError,
  } = useSetDefaultVersion(proxy)

  const registerReceipt = useWaitForTransactionReceipt({ hash: registerHash })
  const defaultReceipt = useWaitForTransactionReceipt({ hash: defaultHash })

  // Tracks the label being *promoted* (register → auto-setDefault chain).
  // Also used by "Make default" clicks (they skip the register step by
  // starting with status === 'registered').
  const [pendingLabel, setPendingLabel] = useState<string | null>(null)
  const [pendingStage, setPendingStage] = useState<'register' | 'setDefault' | 'idle'>(
    'idle',
  )

  // Keep a ref to the current promote target so the effect chain that
  // fires setDefault after register can read it without stale-closure bugs.
  const pendingLabelRef = useRef<string | null>(null)
  pendingLabelRef.current = pendingLabel

  // Chain step 2: when the register tx lands during a Promote flow, fire
  // setDefault for the same label. Runs exactly once per register receipt.
  useEffect(() => {
    if (
      pendingStage === 'register' &&
      registerReceipt.isSuccess &&
      pendingLabelRef.current
    ) {
      const labelHex = stringToHex(pendingLabelRef.current, { size: 32 })
      setPendingStage('setDefault')
      onDone() // refresh the registered list so the row flips to "registered"
      setDefault(labelHex).catch(() => {
        setPendingStage('idle')
        setPendingLabel(null)
      })
    }
  }, [registerReceipt.isSuccess, pendingStage, setDefault, onDone])

  // Chain done: setDefault receipt mined → reset state, refresh parent.
  useEffect(() => {
    if (pendingStage === 'setDefault' && defaultReceipt.isSuccess) {
      setPendingStage('idle')
      setPendingLabel(null)
      onDone()
    }
  }, [defaultReceipt.isSuccess, pendingStage, onDone])

  // Refresh on register-only flows (no chained setDefault).
  useEffect(() => {
    if (pendingStage === 'idle' && registerReceipt.isSuccess) onDone()
  }, [registerReceipt.isSuccess, pendingStage, onDone])

  function isBusyFor(row: Row): boolean {
    if (pendingLabel !== row.label) return false
    return (
      registerPending ||
      registerReceipt.isLoading ||
      defaultPending ||
      defaultReceipt.isLoading ||
      pendingStage !== 'idle'
    )
  }

  function busyLabelFor(row: Row): string {
    if (!isBusyFor(row)) return ''
    if (pendingStage === 'register') {
      return registerPending ? 'Sign register…' : 'Registering…'
    }
    if (pendingStage === 'setDefault') {
      return defaultPending ? 'Sign setDefault…' : 'Promoting…'
    }
    return 'Pending…'
  }

  async function onPromote(row: Row) {
    if (!row.impl) return
    setPendingLabel(row.label)
    setPendingStage('register')
    try {
      await register(row.labelHex, row.impl)
    } catch {
      setPendingStage('idle')
      setPendingLabel(null)
    }
  }

  async function onMakeDefault(row: Row) {
    setPendingLabel(row.label)
    setPendingStage('setDefault')
    try {
      await setDefault(row.labelHex)
    } catch {
      setPendingStage('idle')
      setPendingLabel(null)
    }
  }

  return (
    <section className="card space-y-4">
      <div>
        <h2 className="font-semibold">
          Versions (
          <a
            href="https://eips.ethereum.org/EIPS/eip-7936"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-0.5 text-brand underline decoration-brand/60 decoration-from-font hover:decoration-brand"
          >
            ERC-7936
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              aria-hidden="true"
              className="-translate-y-px"
            >
              <path
                d="M7 17L17 7M17 7H9M17 7v8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </a>
          )
        </h2>
        <p className="text-xs text-subtle leading-relaxed">
          Every implementation this proxy has registered + the canonical
          directory published by the team. Pin any past version with{' '}
          <code className="font-mono">executeAtVersion(v, data)</code>.
        </p>
      </div>

      <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-subtle leading-relaxed">
        <strong className="text-amber-400">Heads up:</strong>{' '}
        the proxy admin can switch which version handles new deposits. A
        Safe as proxy admin makes this safer.
      </div>

      <ul className="divide-y divide-line rounded-lg border border-line bg-canvas overflow-hidden">
        {rows.length === 0 && (
          <li className="px-4 py-3 text-xs text-subtle">
            No versions registered and no canonical entries published for this
            family yet.
          </li>
        )}
        {rows.map((row) => (
          <VersionRow
            key={row.label}
            row={row}
            isProxyAdmin={isProxyAdmin}
            busy={isBusyFor(row)}
            busyLabel={busyLabelFor(row)}
            anyBusy={pendingStage !== 'idle'}
            onPromote={() => onPromote(row)}
            onMakeDefault={() => onMakeDefault(row)}
          />
        ))}
      </ul>

      {(registerError || defaultError) && (
        <p className="text-xs text-rose-400 font-mono break-words">
          {(registerError ?? defaultError)!.message.split('\n')[0]}
        </p>
      )}

      {isProxyAdmin && (
        <AdvancedCustomPaste
          proxy={proxy}
          registeredLabels={new Set(rows.map((r) => r.label))}
          onDone={onDone}
        />
      )}

      {!isProxyAdmin && (
        <p className="text-xs text-subtle">
          Registering or promoting versions is proxy-admin only.
        </p>
      )}
    </section>
  )
}

function VersionRow({
  row,
  isProxyAdmin,
  busy,
  busyLabel,
  anyBusy,
  onPromote,
  onMakeDefault,
}: {
  row: Row
  isProxyAdmin: boolean
  busy: boolean
  busyLabel: string
  anyBusy: boolean
  onPromote: () => void
  onMakeDefault: () => void
}) {
  const impl = row.impl ?? '—'

  return (
    <li className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-ink">{row.label}</span>
          {row.status.kind === 'default' && (
            <span className="rounded-full border border-brand/40 bg-brand/10 text-brand text-[10px] font-mono uppercase tracking-wider px-2 py-0.5">
              default
            </span>
          )}
          {row.status.kind === 'registered' && (
            <span className="rounded-full border border-line bg-surface text-subtle text-[10px] font-mono uppercase tracking-wider px-2 py-0.5">
              registered
            </span>
          )}
          {row.status.kind === 'available' && (
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/5 text-emerald-400 text-[10px] font-mono uppercase tracking-wider px-2 py-0.5">
              available
            </span>
          )}
          {row.canonical?.review && (
            <span className="text-[10px] font-mono uppercase tracking-wider text-subtle">
              reviewed · {row.canonical.review.date}
            </span>
          )}
        </div>
        <div className="font-mono text-[10px] text-subtle break-all mt-0.5">
          {impl}
        </div>
        {row.canonical?.summary && (
          <div className="text-[11px] text-muted leading-snug mt-1.5 max-w-[44ch]">
            {row.canonical.summary}
          </div>
        )}
      </div>

      {isProxyAdmin && (
        <div className="shrink-0">
          {row.status.kind === 'default' && (
            <span className="inline-flex items-center gap-1.5 text-[11px] text-subtle">
              <span
                aria-hidden
                className="inline-block h-2 w-2 rounded-full bg-emerald-500 animate-pulse"
                style={{
                  boxShadow:
                    '0 0 8px rgba(16, 185, 129, 0.7), 0 0 2px rgba(16, 185, 129, 1)',
                }}
              />
              live
            </span>
          )}
          {row.status.kind === 'registered' && (
            <button
              type="button"
              onClick={onMakeDefault}
              disabled={busy || anyBusy}
              className="btn-secondary text-xs px-3 py-1.5 inline-flex items-center gap-1.5"
            >
              {busy ? <InlineSpinner /> : null}
              {busy ? busyLabel : 'Make default'}
            </button>
          )}
          {row.status.kind === 'available' && (
            <button
              type="button"
              onClick={onPromote}
              disabled={busy || anyBusy}
              className="btn-primary text-xs px-3 py-1.5 inline-flex items-center gap-1.5"
            >
              {busy ? <InlineSpinner /> : null}
              {busy ? busyLabel : 'Promote'}
            </button>
          )}
        </div>
      )}
    </li>
  )
}

function InlineSpinner() {
  return (
    <span
      aria-hidden
      className="inline-block h-3 w-3 rounded-full border border-current border-r-transparent animate-spin"
    />
  )
}

function AdvancedCustomPaste({
  proxy,
  registeredLabels,
  onDone,
}: {
  proxy: Address
  registeredLabels: Set<string>
  onDone: () => void
}) {
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState('')
  const [impl, setImpl] = useState('')

  const {
    register,
    hash,
    isPending,
    error,
  } = useRegisterVersion(proxy)
  const receipt = useWaitForTransactionReceipt({ hash })

  useEffect(() => {
    if (receipt.isSuccess) {
      onDone()
      setLabel('')
      setImpl('')
    }
  }, [receipt.isSuccess, onDone])

  const labelValid =
    label.length > 0 && label.length <= 32 && !registeredLabels.has(label)
  const implValid = isAddress(impl)
  const canSubmit = labelValid && implValid

  async function onRegister() {
    if (!canSubmit) return
    try {
      await register(stringToHex(label, { size: 32 }), impl as Address)
    } catch {
      // errors propagate via `error`
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-left text-[11px] text-subtle hover:text-ink transition-colors"
      >
        Advanced — register a custom implementation →
      </button>
    )
  }

  return (
    <div className="rounded-xl border border-line bg-surface p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium text-ink">
          Register a custom implementation
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-subtle hover:text-ink"
        >
          Close
        </button>
      </div>
      <div className="rounded-md border border-rose-500/30 bg-rose-500/5 px-2.5 py-1.5 text-[11px] text-rose-300 leading-snug">
        ⚠ Third-party implementations fall outside the canonical registry.
        Use only when you&apos;ve deployed and reviewed the impl yourself.
        This only registers the address — make it default separately from
        the list above once it&apos;s live.
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="my-v2.9 (max 32 chars)"
          className="input"
        />
        <input
          value={impl}
          onChange={(e) => setImpl(e.target.value)}
          placeholder="0x… (implementation address)"
          className="input font-mono text-xs"
        />
      </div>
      <button
        type="button"
        onClick={onRegister}
        disabled={!canSubmit || isPending || receipt.isLoading}
        className="btn-primary text-xs px-3 py-1.5"
      >
        {isPending
          ? 'Sign…'
          : receipt.isLoading
            ? 'Mining…'
            : 'Register'}
      </button>
      {label.length > 0 && registeredLabels.has(label) && (
        <p className="text-[11px] text-subtle">
          &apos;{label}&apos; is already registered — pick another label.
        </p>
      )}
      {error && (
        <p className="text-[11px] text-rose-400 font-mono">
          {error.message.split('\n')[0]}
        </p>
      )}
    </div>
  )
}
