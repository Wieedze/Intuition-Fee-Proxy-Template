import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { isAddress, parseEther, type Address, type Hex } from 'viem'
import { useAccount, useChainId, useWaitForTransactionReceipt } from 'wagmi'
import { Link, useNavigate } from 'react-router-dom'

import {
  calculateProxyTermId,
  toIntuitionCaip10,
} from '@intuition-fee-proxy/sdk'
import { addressesFor, networkFor } from '../lib/addresses'
import {
  ATOM_PORTAL_BY_CHAIN,
  TX_EXPLORER_BY_CHAIN,
} from '../lib/explorers'
import { useDeployProxy } from '../hooks/useFactory'
import { useCreateProxyIdentityAtom } from '../hooks/useIntuitionAtom'
import { CopyInline } from '../components/CopyInline'
import { Spinner } from '../components/Spinner'

const FEE_DENOMINATOR = 10_000n

export default function DeployPage() {
  const { address: connectedAddress, isConnected } = useAccount()
  const chainId = useChainId()
  const network = networkFor(chainId)
  const navigate = useNavigate()

  const defaultMV = addressesFor(network).multiVault

  const [name, setName] = useState<string>('')
  const [channel, setChannel] = useState<0 | 1>(0) // 0 = Standard, 1 = Sponsored
  const [ethMultiVault, setEthMultiVault] = useState<string>(defaultMV)
  const [fixedFeeEth, setFixedFeeEth] = useState<string>('0.1')
  const [percentageBps, setPercentageBps] = useState<string>('500')
  const [admins, setAdmins] = useState<Address[]>([])
  const [adminInput, setAdminInput] = useState<string>('')
  const [adminInputError, setAdminInputError] = useState<string | null>(null)

  function tryAddAdmin(raw: string): void {
    const trimmed = raw.trim()
    if (!trimmed) return
    if (!isAddress(trimmed)) {
      setAdminInputError('Invalid address.')
      return
    }
    if (admins.some((a) => a.toLowerCase() === trimmed.toLowerCase())) {
      setAdminInputError('Already added.')
      return
    }
    setAdmins((prev) => [...prev, trimmed as Address])
    setAdminInput('')
    setAdminInputError(null)
  }

  function removeAdmin(addr: Address): void {
    setAdmins((prev) => prev.filter((a) => a.toLowerCase() !== addr.toLowerCase()))
  }

  const { deploy, hash, isPending, error, factory } = useDeployProxy()
  const receipt = useWaitForTransactionReceipt({ hash })

  // Atom creation (step 2 — fires automatically once the proxy tx lands)
  const {
    createIdentity,
    hash: atomHash,
    isPending: atomSigning,
    error: atomError,
    reset: resetAtom,
  } = useCreateProxyIdentityAtom()
  const atomReceipt = useWaitForTransactionReceipt({ hash: atomHash })
  const [atomTriggered, setAtomTriggered] = useState(false)

  const adminsValid = admins.length > 0
  const mvValid = isAddress(ethMultiVault)
  const pctValid = (() => {
    const n = Number(percentageBps)
    return Number.isInteger(n) && n >= 0 && n <= Number(FEE_DENOMINATOR)
  })()
  const fixedValid = Number(fixedFeeEth) >= 0
  const nameValid = new Blob([name]).size <= 32

  const canSubmit =
    isConnected && factory && adminsValid && mvValid && pctValid && fixedValid && nameValid

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    try {
      await deploy({
        ethMultiVault: ethMultiVault as Address,
        depositFixedFee: parseEther(fixedFeeEth),
        depositPercentageFee: BigInt(percentageBps),
        admins: admins as Address[],
        name: name.trim(),
        channel,
      })
    } catch (err) {
      console.error(err)
    }
  }

  // Parse the ProxyCreated log to get the new proxy address
  const newProxyAddress: Address | undefined = (() => {
    if (!receipt.data) return undefined
    // Event topic0 for ProxyCreated(address,address,address,address,uint256,uint256)
    // The first indexed arg is `proxy` — topics[1].
    const log = receipt.data.logs.find(
      (l) => l.topics.length >= 4 && l.address.toLowerCase() === factory?.toLowerCase(),
    )
    if (!log) return undefined
    const topic = log.topics[1]
    if (!topic) return undefined
    return (`0x${topic.slice(26)}` as Address)
  })()

  // When the deploy settles, snap to top so the success card (above the
  // form) is immediately visible — users clicking Deploy tend to be
  // scrolled down at the submit button.
  useEffect(() => {
    if (receipt.isSuccess && newProxyAddress) {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }, [receipt.isSuccess, newProxyAddress])

  // Auto-fire the CAIP-10 identity atom right after the proxy lands.
  // Runs once per deploy; on rejection or failure the user retries via
  // the button in the success card. Guarded so a re-render with
  // `isSuccess` still true doesn't re-submit.
  useEffect(() => {
    if (
      receipt.isSuccess &&
      newProxyAddress &&
      !atomTriggered &&
      mvValid
    ) {
      setAtomTriggered(true)
      createIdentity({
        multiVault: ethMultiVault as Address,
        chainId,
        proxyAddress: newProxyAddress,
      }).catch((err) => {
        console.error('identity atom creation failed', err)
      })
    }
  }, [
    receipt.isSuccess,
    newProxyAddress,
    atomTriggered,
    mvValid,
    chainId,
    ethMultiVault,
    createIdentity,
  ])

  async function handleRetryAtom() {
    if (!newProxyAddress || !mvValid) return
    resetAtom()
    try {
      await createIdentity({
        multiVault: ethMultiVault as Address,
        chainId,
        proxyAddress: newProxyAddress,
      })
    } catch (err) {
      console.error('identity atom retry failed', err)
    }
  }

  const caip10: string | undefined = newProxyAddress
    ? toIntuitionCaip10(chainId, newProxyAddress)
    : undefined
  const termId: Hex | undefined = newProxyAddress
    ? calculateProxyTermId(chainId, newProxyAddress)
    : undefined
  const txExplorer = TX_EXPLORER_BY_CHAIN[chainId]
  const atomPortal = ATOM_PORTAL_BY_CHAIN[chainId]

  return (
    <div className="space-y-8 max-w-2xl mx-auto">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-ink">
          Deploy a fee proxy
        </h1>
        <p className="text-sm text-muted">
          Configure fees and admins. The proxy is upgradeable via version registry.
        </p>
      </div>

      {receipt.isSuccess && newProxyAddress && (
        <div className="rounded-xl border border-brand/30 bg-brand/10 p-5 space-y-4">
          {/* Step 1 — Proxy deployment (always green once we reach this card) */}
          <div className="space-y-2">
            <StepHeader state="success" label="Proxy deployed" />
            <div className="flex items-start gap-2 pl-6">
              <code className="font-mono text-xs text-ink break-all flex-1 leading-relaxed">
                {newProxyAddress}
              </code>
              <CopyInline value={newProxyAddress} />
            </div>
          </div>

          {/* Step 2 — Intuition atom (progressive: loading → success/error) */}
          {caip10 && (
            <div className="pt-4 border-t border-brand/20">
              <AtomStep
                signing={atomSigning}
                mining={atomReceipt.isLoading}
                success={atomReceipt.isSuccess}
                error={atomError ?? atomReceipt.error ?? null}
                atomHash={atomHash}
                termId={termId}
                caip10={caip10}
                triggered={atomTriggered}
                txExplorer={txExplorer}
                atomPortal={atomPortal}
                onRetry={handleRetryAtom}
              />
            </div>
          )}

          <div className="flex gap-4 pt-2 border-t border-brand/20 text-sm">
            <Link
              to={`/proxy/${newProxyAddress}`}
              className="text-brand hover:opacity-80 transition-opacity"
            >
              Open detail →
            </Link>
            <button
              type="button"
              onClick={() => navigate('/my-proxies')}
              className="text-muted hover:text-ink"
            >
              See all my proxies
            </button>
          </div>
        </div>
      )}

      {!factory && (
        <div className="rounded-lg border-l-4 border-l-brand border border-line bg-surface p-4 text-sm text-ink">
          <b>No factory address for <code className="font-mono text-muted">{network}</code>.</b>{' '}
          <span className="text-muted">
            Set <code className="font-mono text-brand">VITE_FACTORY_ADDRESS</code> in{' '}
            <code className="font-mono">packages/webapp/.env.local</code>, or deploy the contracts and
            update <code className="font-mono">V2_ADDRESSES</code> in the SDK.
          </span>
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-5">
        <Field
          label="Proxy type"
          hint="Locked at deploy. Switching families later requires redeploying a new proxy."
        >
          <ChannelRadio value={channel} onChange={setChannel} />
        </Field>

        <Field
          label="Name (optional)"
          hint="Human-readable label — max 32 bytes. Editable later by the proxy admin. Leave empty for an unnamed proxy."
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input"
            placeholder="My DAO Fees"
            maxLength={32}
          />
          {!nameValid && (
            <p className="text-xs text-rose-400 mt-1">
              Name too long — max 32 bytes (≈ 32 ASCII chars).
            </p>
          )}
        </Field>

        <Field
          label="MultiVault address"
          hint="Intuition MultiVault contract this proxy will wrap."
        >
          <input
            value={ethMultiVault}
            onChange={(e) => setEthMultiVault(e.target.value)}
            className="input"
            placeholder="0x…"
          />
          {!mvValid && ethMultiVault && (
            <p className="text-xs text-rose-400 mt-1">Invalid address.</p>
          )}
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Fixed fee (TRUST per deposit)">
            <input
              type="number"
              step="any"
              min="0"
              value={fixedFeeEth}
              onChange={(e) => setFixedFeeEth(e.target.value)}
              className="input"
              placeholder="0.1"
            />
          </Field>
          <Field label="Percentage fee (bps, max 10000)">
            <input
              type="number"
              min="0"
              max="10000"
              step="1"
              value={percentageBps}
              onChange={(e) => setPercentageBps(e.target.value)}
              className="input"
              placeholder="500"
            />
            {!pctValid && (
              <p className="text-xs text-rose-400 mt-1">
                Integer in [0, 10000] (500 = 5%).
              </p>
            )}
          </Field>
        </div>

        <div className="block space-y-2">
          <div className="text-sm font-medium text-ink">Admins</div>
          <div className="text-xs text-subtle">
            Add one or more addresses. EOA for dev, Gnosis Safe for production.
          </div>

          {admins.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {admins.map((addr) => (
                <li
                  key={addr}
                  className="inline-flex items-center gap-2 rounded-full border border-line bg-surface pl-3 pr-1 py-1"
                >
                  <code className="font-mono text-xs text-ink">
                    {addr.slice(0, 6)}…{addr.slice(-4)}
                  </code>
                  <button
                    type="button"
                    onClick={() => removeAdmin(addr)}
                    aria-label={`Remove ${addr}`}
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted hover:text-rose-400 hover:bg-rose-400/10 transition-colors"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <input
              value={adminInput}
              onChange={(e) => {
                setAdminInput(e.target.value)
                if (adminInputError) setAdminInputError(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  tryAddAdmin(adminInput)
                }
              }}
              placeholder="0x… (paste an EOA or Safe address)"
              className="input font-mono text-xs flex-1 min-w-[260px]"
            />
            <button
              type="button"
              onClick={() => tryAddAdmin(adminInput)}
              disabled={!adminInput.trim()}
              className="btn-secondary text-xs px-3 py-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Add
            </button>
            {connectedAddress && !admins.some((a) => a.toLowerCase() === connectedAddress.toLowerCase()) && (
              <button
                type="button"
                onClick={() => tryAddAdmin(connectedAddress)}
                className="text-[11px] px-2 py-1.5 rounded border border-line text-muted hover:text-ink hover:border-ink/40 transition-colors"
              >
                + my wallet
              </button>
            )}
          </div>
          {adminInputError && (
            <p className="text-xs text-rose-400">{adminInputError}</p>
          )}

          <div className="rounded-md border border-brand/30 bg-brand/10 px-3 py-2 text-xs text-ink">
            <span className="font-medium text-brand">Heads up — </span>
            use a multisig (e.g. a Safe) as admin for production. A single
            EOA is a single point of failure for fee withdrawals and version
            upgrades.{' '}
            <Link
              to="/docs/safe-admin"
              className="underline decoration-brand/60 hover:decoration-brand"
            >
              See the Safe multisig admin guide
            </Link>
            .
          </div>
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button
            type="submit"
            disabled={!canSubmit || isPending || receipt.isLoading}
            className="btn-primary text-base px-5 py-3"
          >
            {isPending
              ? 'Confirm in wallet…'
              : receipt.isLoading
                ? 'Mining…'
                : 'Deploy'}
          </button>
          {!isConnected && (
            <span className="text-sm text-subtle">Connect wallet first.</span>
          )}
        </div>

        {error && (
          <p className="text-sm text-rose-400 font-mono">
            {error.message.split('\n')[0]}
          </p>
        )}
      </form>
    </div>
  )
}

/**
 * Step-line header used by both "Proxy deployed" and the atom step. Consistent
 * vertical rhythm (28px row, 6px gutter to details below) keeps the two
 * stacked steps feeling like one flow, not two disconnected badges.
 */
function StepHeader({
  state,
  label,
}: {
  state: 'pending' | 'success' | 'error'
  label: string
}) {
  const icon =
    state === 'success' ? (
      <span className="inline-flex h-4 w-4 items-center justify-center text-green-500">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
          <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    ) : state === 'error' ? (
      <span className="inline-flex h-4 w-4 items-center justify-center text-rose-400">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
          <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    ) : (
      <span className="inline-flex h-4 w-4 items-center justify-center text-muted">
        <Spinner size="sm" ariaLabel={label} />
      </span>
    )

  const colorClass =
    state === 'success'
      ? 'text-green-500'
      : state === 'error'
        ? 'text-rose-400'
        : 'text-muted'

  return (
    <div className={`flex items-center gap-2 text-sm font-medium ${colorClass}`}>
      {icon}
      <span>{label}</span>
    </div>
  )
}

/**
 * Progressive status for the identity-atom step. Reveals states in order:
 * pending (spinner + "Creating Intuition atom…") → success (green check +
 * CAIP-10 + termId + explorer links) OR error (red × + retry). The CAIP-10
 * string is shown under the spinner from the start so the user sees what's
 * being written, not a blind wait.
 */
function AtomStep({
  signing,
  mining,
  success,
  error,
  atomHash,
  termId,
  caip10,
  triggered,
  txExplorer,
  atomPortal,
  onRetry,
}: {
  signing: boolean
  mining: boolean
  success: boolean
  error: Error | null
  atomHash: Hex | undefined
  termId: Hex | undefined
  caip10: string
  triggered: boolean
  txExplorer: string | undefined
  atomPortal: string | undefined
  onRetry: () => void
}) {
  if (success) {
    return (
      <div className="space-y-2">
        <StepHeader state="success" label="Atom created on-chain" />
        <div className="pl-6 space-y-1.5">
          <div className="font-mono text-[11px] text-muted break-all">
            {caip10}
          </div>
          {termId && (
            <div className="flex items-start gap-2">
              <code className="font-mono text-[11px] text-muted break-all flex-1 leading-relaxed">
                {termId}
              </code>
              <CopyInline value={termId} />
            </div>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs pt-1">
            {txExplorer && atomHash && (
              <a
                href={`${txExplorer}/tx/${atomHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand hover:opacity-80 transition-opacity"
              >
                Tx receipt →
              </a>
            )}
            {atomPortal && termId && (
              <a
                href={`${atomPortal}/${termId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand hover:opacity-80 transition-opacity"
              >
                View on Intuition portal →
              </a>
            )}
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-2">
        <StepHeader state="error" label="Atom creation failed" />
        <div className="pl-6 space-y-1.5">
          <div className="text-xs text-rose-400 font-mono break-all">
            {error.message.split('\n')[0]}
          </div>
          <button
            type="button"
            onClick={onRetry}
            className="text-xs font-medium text-brand hover:opacity-80 transition-opacity"
          >
            Retry atom creation →
          </button>
        </div>
      </div>
    )
  }

  const loadingLabel = signing
    ? 'Confirm atom tx in wallet…'
    : mining || atomHash
      ? 'Mining atom tx…'
      : triggered
        ? 'Preparing atom tx…'
        : 'Creating Intuition atom…'

  return (
    <div className="space-y-2">
      <StepHeader state="pending" label={loadingLabel} />
      <div className="pl-6 font-mono text-[11px] text-muted break-all">
        {caip10}
      </div>
    </div>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <label className="block space-y-1.5">
      <div className="text-sm font-medium text-ink">{label}</div>
      {hint && <div className="text-xs text-subtle">{hint}</div>}
      {children}
    </label>
  )
}

function ChannelRadio({
  value,
  onChange,
}: {
  value: 0 | 1
  onChange: (v: 0 | 1) => void
}) {
  const options: {
    value: 0 | 1
    title: string
    body: string
    doc: string
  }[] = [
    {
      value: 0,
      title: 'Standard',
      body:
        'Users pay deposits and fees from their own wallet. Simplest path, no sponsor trust. Pick this when your users already hold TRUST.',
      doc: '/docs/call-flow',
    },
    {
      value: 1,
      title: 'Sponsored',
      body:
        'Admins fund a shared TRUST pool. The proxy tops up user deposits automatically, bounded by per-user rate limits. Pick this when your dApp covers users’ on-chain cost.',
      doc: '/docs/sponsoring',
    },
  ]

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {options.map((opt) => {
        const active = value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`text-left rounded-xl border p-4 transition-colors h-full flex flex-col ${
              active
                ? 'border-brand bg-brand/10 text-ink'
                : 'border-line bg-surface text-ink hover:border-line-strong'
            }`}
          >
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border ${
                  active ? 'border-brand' : 'border-line-strong'
                }`}
                aria-hidden
              >
                {active && <span className="h-1.5 w-1.5 rounded-full bg-brand" />}
              </span>
              <span className="text-sm font-medium">{opt.title}</span>
            </div>
            <p className="mt-2 text-xs text-muted leading-relaxed">{opt.body}</p>
            <Link
              to={opt.doc}
              onClick={(e) => e.stopPropagation()}
              className="mt-auto pt-3 inline-block text-[11px] text-muted hover:text-ink transition-colors self-start"
            >
              Learn more →
            </Link>
          </button>
        )
      })}
    </div>
  )
}
