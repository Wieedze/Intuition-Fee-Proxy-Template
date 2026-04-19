import { useState, type FormEvent, type ReactNode } from 'react'
import { isAddress, parseEther, type Address } from 'viem'
import { useAccount, useChainId, useWaitForTransactionReceipt } from 'wagmi'
import { Link, useNavigate } from 'react-router-dom'

import { MULTIVAULT_ADDRESSES } from '@intuition-fee-proxy/sdk'
import { networkFor } from '../lib/addresses'
import { useDeployProxy } from '../hooks/useFactory'

const FEE_DENOMINATOR = 10_000n

export default function DeployPage() {
  const { isConnected } = useAccount()
  const chainId = useChainId()
  const network = networkFor(chainId)
  const navigate = useNavigate()

  const defaultMV = MULTIVAULT_ADDRESSES[network]

  const [name, setName] = useState<string>('')
  const [channel, setChannel] = useState<0 | 1>(0) // 0 = Standard, 1 = Sponsored
  const [ethMultiVault, setEthMultiVault] = useState<string>(defaultMV)
  const [fixedFeeEth, setFixedFeeEth] = useState<string>('0.1')
  const [percentageBps, setPercentageBps] = useState<string>('500')
  const [adminsRaw, setAdminsRaw] = useState<string>('')

  const { deploy, hash, isPending, error, factory } = useDeployProxy()
  const receipt = useWaitForTransactionReceipt({ hash })

  const admins = adminsRaw
    .split(/[,\s\n]+/)
    .map((a) => a.trim())
    .filter(Boolean)

  const adminsValid = admins.length > 0 && admins.every((a) => isAddress(a))
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

      {!factory && (
        <div className="rounded-lg border-l-4 border-l-brand border border-line bg-surface p-4 text-sm text-ink">
          <b>No factory address for <code className="font-mono text-muted">{network}</code>.</b>{' '}
          <span className="text-muted">
            Set <code className="font-mono text-brand">VITE_FACTORY_ADDRESS</code> and{' '}
            <code className="font-mono text-brand">VITE_IMPLEMENTATION_ADDRESS</code> in{' '}
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

        <Field
          label="Admins"
          hint="One address per line or comma-separated. At least one required."
        >
          <textarea
            value={adminsRaw}
            onChange={(e) => setAdminsRaw(e.target.value)}
            rows={3}
            className="input font-mono text-xs"
            placeholder="0x…&#10;0x…"
          />
          <div className="mt-2 rounded-md border border-brand/30 bg-brand/10 px-3 py-2 text-xs text-ink">
            <span className="font-medium text-brand">Heads up — </span>
            use a multisig (e.g. a Safe) as admin. A single EOA is a single
            point of failure for fee withdrawals and version upgrades.
          </div>
          {adminsRaw && !adminsValid && (
            <p className="text-xs text-rose-400 mt-1">
              Every line must be a valid address.
            </p>
          )}
        </Field>

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

      {receipt.isSuccess && newProxyAddress && (
        <div className="rounded-xl border border-brand/30 bg-brand/10 p-5 space-y-3">
          <div className="text-sm font-medium text-brand">Proxy deployed</div>
          <div className="font-mono text-xs text-ink break-all">
            {newProxyAddress}
          </div>
          <div className="flex gap-4 pt-1 text-sm">
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
        'Users pay deposits + fees from their own wallet. Simplest path, zero trust on a sponsor. Pick this if your users already hold TRUST.',
      doc: '/docs/call-flow',
    },
    {
      value: 1,
      title: 'Sponsored',
      body:
        'You (the proxy admin) fund a TRUST pool in the proxy. Users consume from that pool via regular deposits with reduced msg.value, or you act on their behalf via depositFor. Ideal for dApps that charge in fiat and need to cover user gas/deposit costs.',
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
            className={`text-left rounded-xl border p-4 transition-colors ${
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
              className="mt-3 inline-block text-[11px] text-muted hover:text-ink transition-colors"
            >
              Learn more →
            </Link>
          </button>
        )
      })}
    </div>
  )
}
