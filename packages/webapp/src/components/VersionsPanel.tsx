import { useEffect, useState } from 'react'
import { isAddress, isHex, stringToHex, type Address, type Hex } from 'viem'
import { useWaitForTransactionReceipt } from 'wagmi'

import {
  listVersionsByFamily,
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
  const [mode, setMode] = useState<'canonical' | 'custom'>(
    canonical.length > 0 ? 'canonical' : 'custom',
  )
  const [selectedCanonical, setSelectedCanonical] = useState<string>('')
  const [newLabel, setNewLabel] = useState('')
  const [newImpl, setNewImpl] = useState('')
  const [selectedVersion, setSelectedVersion] = useState<Hex | ''>('')

  const registeredLabels = new Set(versions.map((v) => decodeVersion(v)))
  const availableCanonical = canonical.filter(
    (v) => !registeredLabels.has(v.label),
  )
  const picked = availableCanonical.find((v) => v.label === selectedCanonical)

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

  useEffect(() => {
    if (registerReceipt.isSuccess) onDone()
  }, [registerHash, registerReceipt.isSuccess])

  useEffect(() => {
    if (defaultReceipt.isSuccess) onDone()
  }, [defaultHash, defaultReceipt.isSuccess])

  const customLabelValid = newLabel.length > 0 && newLabel.length <= 32
  const customImplValid = isAddress(newImpl)
  const canRegister =
    mode === 'canonical'
      ? Boolean(picked)
      : customLabelValid && customImplValid

  async function onRegister() {
    try {
      if (mode === 'canonical' && picked) {
        await register(
          stringToHex(picked.label, { size: 32 }),
          picked.impl as Address,
        )
        setSelectedCanonical('')
      } else if (customLabelValid && customImplValid) {
        await register(stringToHex(newLabel, { size: 32 }), newImpl as Address)
        setNewLabel('')
        setNewImpl('')
      }
    } catch (e) {
      console.error(e)
    }
  }

  async function onSetDefault() {
    if (!selectedVersion || !isHex(selectedVersion)) return
    try {
      await setDefault(selectedVersion as Hex)
    } catch (e) {
      console.error(e)
    }
  }

  return (
    <section className="card space-y-4">
      <div>
        <h2 className="font-semibold">Versions (ERC-7936)</h2>
        <p className="text-xs text-subtle">
          Every implementation this proxy has been pinned to. Advanced users
          can call <code className="font-mono">executeAtVersion(v, data)</code>{' '}
          to pin to a specific past version.
        </p>
      </div>

      <ul className="divide-y divide-line rounded-lg border border-line bg-canvas overflow-hidden">
        {versions.length === 0 && (
          <li className="px-3 py-2 text-xs text-subtle">
            No versions registered.
          </li>
        )}
        {versions.map((v) => {
          const isDefault =
            defaultVersion && v.toLowerCase() === defaultVersion.toLowerCase()
          return (
            <li
              key={v}
              className="px-3 py-2 flex items-center justify-between text-sm"
            >
              <div>
                <span className="font-medium">{decodeVersion(v)}</span>
                {isDefault && (
                  <span className="ml-2 rounded-full border border-brand/40 bg-brand/10 text-brand text-[10px] font-mono uppercase tracking-wider px-2 py-0.5">
                    default
                  </span>
                )}
                <div className="font-mono text-[10px] text-subtle break-all mt-0.5">
                  {v}
                </div>
              </div>
            </li>
          )
        })}
      </ul>

      {isProxyAdmin ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2 h-full">
            <div className="text-xs font-medium">Register new version</div>

            {mode === 'canonical' ? (
              <>
                <select
                  value={selectedCanonical}
                  onChange={(e) => setSelectedCanonical(e.target.value)}
                  className="input"
                  disabled={availableCanonical.length === 0}
                >
                  <option value="">
                    {availableCanonical.length === 0
                      ? canonical.length === 0
                        ? 'No canonical versions published yet'
                        : 'All canonical versions already registered'
                      : `Select a canonical ${family} version…`}
                  </option>
                  {availableCanonical.map((v) => (
                    <option key={v.label} value={v.label}>
                      {v.label}
                      {v.review ? ` — reviewed ${v.review.date}` : ''}
                    </option>
                  ))}
                </select>
                {picked && (
                  <div className="rounded-md border border-line bg-canvas px-3 py-2 text-[11px] font-mono text-subtle break-all">
                    {picked.impl}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setMode('custom')}
                  className="text-left text-[11px] text-subtle hover:text-ink transition-colors"
                >
                  Advanced — paste a custom implementation →
                </button>
              </>
            ) : (
              <>
                <input
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="v2.1.0 (max 32 chars)"
                  className="input"
                />
                <input
                  value={newImpl}
                  onChange={(e) => setNewImpl(e.target.value)}
                  placeholder="0x… (implementation address)"
                  className="input font-mono text-xs"
                />
                <div className="rounded-md border border-rose-500/30 bg-rose-500/5 px-2.5 py-1.5 text-[11px] text-rose-300 leading-snug">
                  ⚠ Third-party implementations fall outside the canonical
                  registry. Use this path only when you&apos;ve deployed and
                  reviewed the impl yourself.
                </div>
                {canonical.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setMode('canonical')}
                    className="text-left text-[11px] text-subtle hover:text-ink transition-colors"
                  >
                    ← Back to canonical versions
                  </button>
                )}
              </>
            )}

            <button
              type="button"
              onClick={onRegister}
              disabled={
                !canRegister || registerPending || registerReceipt.isLoading
              }
              className="btn-primary w-full mt-auto"
            >
              {registerPending
                ? 'Confirm…'
                : registerReceipt.isLoading
                  ? 'Mining…'
                  : 'Register'}
            </button>
            {registerError && (
              <p className="text-xs text-rose-400 font-mono">
                {registerError.message.split('\n')[0]}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2 h-full">
            <div className="text-xs font-medium">Set default version</div>
            <select
              value={selectedVersion}
              onChange={(e) => setSelectedVersion(e.target.value as Hex | '')}
              className="input"
            >
              <option value="">Select a version…</option>
              {versions.map((v) => (
                <option key={v} value={v}>
                  {decodeVersion(v)}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={onSetDefault}
              disabled={
                !selectedVersion || defaultPending || defaultReceipt.isLoading
              }
              className="btn-secondary w-full mt-auto"
            >
              {defaultPending
                ? 'Confirm…'
                : defaultReceipt.isLoading
                  ? 'Mining…'
                  : 'Set as default'}
            </button>
            {defaultError && (
              <p className="text-xs text-rose-400 font-mono">
                {defaultError.message.split('\n')[0]}
              </p>
            )}
          </div>
        </div>
      ) : (
        <p className="text-xs text-subtle">
          Register/swap default is proxy-admin only. Connect as the proxy
          admin to manage versions.
        </p>
      )}
    </section>
  )
}
