import { useEffect, useState } from 'react'
import { stringToHex, type Address, type Hex } from 'viem'
import { useWaitForTransactionReceipt } from 'wagmi'

import {
  getLatestVersion,
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

export function NewVersionBanner({
  proxy,
  network,
  family,
  versions,
  defaultVersion,
  isProxyAdmin,
  onDone,
}: Props) {
  const latest = getLatestVersion(network, family)
  const registeredLabels = new Set(versions.map((v) => decodeVersion(v)))
  const currentDefaultLabel = defaultVersion
    ? decodeVersion(defaultVersion)
    : undefined

  const dismissKey = latest
    ? `proxy-new-version-dismissed:${proxy.toLowerCase()}:${latest.label}`
    : undefined
  const [dismissed, setDismissed] = useState<boolean>(() =>
    typeof window !== 'undefined' && dismissKey
      ? window.localStorage.getItem(dismissKey) === '1'
      : false,
  )

  const {
    register,
    hash: registerHash,
    isPending: registerPending,
  } = useRegisterVersion(proxy)
  const {
    setDefault,
    hash: defaultHash,
    isPending: defaultPending,
  } = useSetDefaultVersion(proxy)
  const registerReceipt = useWaitForTransactionReceipt({ hash: registerHash })
  const defaultReceipt = useWaitForTransactionReceipt({ hash: defaultHash })

  useEffect(() => {
    if (registerReceipt.isSuccess || defaultReceipt.isSuccess) onDone()
  }, [registerReceipt.isSuccess, defaultReceipt.isSuccess])

  if (!latest || dismissed) return null
  if (currentDefaultLabel === latest.label) return null

  const alreadyRegistered = registeredLabels.has(latest.label)
  const busy =
    registerPending ||
    registerReceipt.isLoading ||
    defaultPending ||
    defaultReceipt.isLoading

  function onDismiss() {
    if (dismissKey && typeof window !== 'undefined') {
      window.localStorage.setItem(dismissKey, '1')
    }
    setDismissed(true)
  }

  async function onRegisterAndPromote() {
    try {
      await register(
        stringToHex(latest!.label, { size: 32 }),
        latest!.impl as Address,
      )
      // Promotion happens in a second click after the register confirms —
      // doing both in one flow would require chaining writeContract calls
      // across receipts, which the current hooks don't expose.
    } catch (e) {
      console.error(e)
    }
  }

  async function onPromote() {
    try {
      await setDefault(stringToHex(latest!.label, { size: 32 }))
    } catch (e) {
      console.error(e)
    }
  }

  const headline = alreadyRegistered
    ? `${latest.label} is registered but not default`
    : `New version available — ${latest.label}`

  const body = alreadyRegistered
    ? `Users on the default path will keep hitting ${currentDefaultLabel ?? 'the current impl'} until you promote ${latest.label}.`
    : `Your proxy's default is ${currentDefaultLabel ?? 'unset'}. Register ${latest.label} to make it available to pinned users; promote it to move everyone over.`

  return (
    <section className="rounded-xl border border-brand/40 bg-brand/[0.06] p-4 flex flex-wrap items-start gap-3">
      <span aria-hidden className="text-brand text-lg leading-none mt-0.5">
        ⚡
      </span>
      <div className="flex-1 min-w-[240px] space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-ink">{headline}</span>
          {latest.review && (
            <a
              href={latest.review.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] font-mono uppercase tracking-wider rounded border border-brand/40 bg-brand/10 text-brand px-1.5 py-0.5 hover:opacity-80 transition-opacity"
            >
              reviewed · {latest.review.date}
            </a>
          )}
        </div>
        <p className="text-xs text-muted leading-relaxed">{body}</p>
        {latest.summary && (
          <p className="text-xs text-subtle leading-relaxed">{latest.summary}</p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {isProxyAdmin && (
          <button
            type="button"
            onClick={alreadyRegistered ? onPromote : onRegisterAndPromote}
            disabled={busy}
            className="btn-primary text-xs px-3 py-1.5"
          >
            {busy
              ? 'Pending…'
              : alreadyRegistered
                ? 'Set as default →'
                : 'Register →'}
          </button>
        )}
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="text-xs text-subtle hover:text-ink transition-colors px-2"
        >
          ✕
        </button>
      </div>
    </section>
  )
}
