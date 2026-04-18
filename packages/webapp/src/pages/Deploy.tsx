import { useState, type FormEvent, type ReactNode } from 'react'
import { isAddress, parseEther, type Address } from 'viem'
import { useAccount, useChainId, useWaitForTransactionReceipt } from 'wagmi'
import { Link, useNavigate } from 'react-router-dom'

import { MULTIVAULT_ADDRESSES } from '@intuition-fee-proxy/sdk'
import { networkFor } from '../lib/addresses'
import { useDeployProxy } from '../hooks/useFactory'

const FEE_DENOMINATOR = 10_000n

export default function DeployPage() {
  const { address: account, isConnected } = useAccount()
  const chainId = useChainId()
  const network = networkFor(chainId)
  const navigate = useNavigate()

  const defaultMV = MULTIVAULT_ADDRESSES[network]

  const [ethMultiVault, setEthMultiVault] = useState<string>(defaultMV)
  const [fixedFeeEth, setFixedFeeEth] = useState<string>('0.1')
  const [percentageBps, setPercentageBps] = useState<string>('500')
  const [adminsRaw, setAdminsRaw] = useState<string>(account ?? '')

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

  const canSubmit = isConnected && factory && adminsValid && mvValid && pctValid && fixedValid

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    try {
      await deploy({
        ethMultiVault: ethMultiVault as Address,
        depositFixedFee: parseEther(fixedFeeEth),
        depositPercentageFee: BigInt(percentageBps),
        admins: admins as Address[],
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
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-3xl font-bold">Deploy a new Fee Proxy</h1>

      {!factory && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          Factory address is not configured for <b>{network}</b>. Set{' '}
          <code>VITE_FACTORY_ADDRESS</code> (and <code>VITE_IMPLEMENTATION_ADDRESS</code>)
          in <code>packages/webapp/.env.local</code> or deploy the contracts and update
          <code> V2_ADDRESSES</code> in the SDK.
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-5">
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
            <p className="text-xs text-red-600 mt-1">Invalid address.</p>
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
              <p className="text-xs text-red-600 mt-1">
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
          {adminsRaw && !adminsValid && (
            <p className="text-xs text-red-600 mt-1">
              Every line must be a valid address.
            </p>
          )}
        </Field>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={!canSubmit || isPending || receipt.isLoading}
            className="rounded-md bg-black px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-400"
          >
            {isPending
              ? 'Confirm in wallet…'
              : receipt.isLoading
                ? 'Mining…'
                : 'Deploy'}
          </button>
          {!isConnected && (
            <span className="text-sm text-gray-600">Connect wallet first.</span>
          )}
        </div>

        {error && (
          <p className="text-sm text-red-700">
            {error.message.split('\n')[0]}
          </p>
        )}
      </form>

      {receipt.isSuccess && newProxyAddress && (
        <div className="rounded-md border border-green-300 bg-green-50 p-4 space-y-2 text-sm">
          <div className="font-semibold text-green-900">Proxy deployed!</div>
          <div className="font-mono break-all">{newProxyAddress}</div>
          <div className="flex gap-3 pt-1">
            <Link to={`/proxy/${newProxyAddress}`} className="underline">
              Open detail →
            </Link>
            <button
              type="button"
              onClick={() => navigate('/my-proxies')}
              className="underline text-left"
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
    <label className="block space-y-1">
      <div className="text-sm font-medium">{label}</div>
      {hint && <div className="text-xs text-gray-500">{hint}</div>}
      {children}
    </label>
  )
}
