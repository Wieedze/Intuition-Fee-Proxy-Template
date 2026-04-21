import { useEffect, useRef, useState } from 'react'
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

  // Mirrors VersionsPanel's Promote: when the register tx mines during a
  // chained promote, auto-fire setDefault for the same label.
  const [stage, setStage] = useState<'idle' | 'register' | 'setDefault'>('idle')
  const latestLabelRef = useRef<string | undefined>(latest?.label)
  latestLabelRef.current = latest?.label

  useEffect(() => {
    if (
      stage === 'register' &&
      registerReceipt.isSuccess &&
      latestLabelRef.current
    ) {
      const labelHex = stringToHex(latestLabelRef.current, { size: 32 })
      setStage('setDefault')
      onDone()
      setDefault(labelHex).catch(() => setStage('idle'))
    }
  }, [stage, registerReceipt.isSuccess, setDefault, onDone])

  useEffect(() => {
    if (stage === 'setDefault' && defaultReceipt.isSuccess) {
      setStage('idle')
      onDone()
    }
  }, [stage, defaultReceipt.isSuccess, onDone])

  if (!latest || dismissed) return null
  if (currentDefaultLabel === latest.label) return null

  const alreadyRegistered = registeredLabels.has(latest.label)
  const busy =
    registerPending ||
    registerReceipt.isLoading ||
    defaultPending ||
    defaultReceipt.isLoading ||
    stage !== 'idle'

  function onDismiss() {
    if (dismissKey && typeof window !== 'undefined') {
      window.localStorage.setItem(dismissKey, '1')
    }
    setDismissed(true)
  }

  async function onPromote() {
    if (!latest) return
    const labelHex = stringToHex(latest.label, { size: 32 })
    if (alreadyRegistered) {
      // Already pinned, just flip the default — single tx.
      setStage('setDefault')
      setDefault(labelHex).catch(() => setStage('idle'))
      return
    }
    // Not pinned yet — register first, the receipt effect fires setDefault.
    setStage('register')
    try {
      await register(labelHex, latest.impl as Address)
    } catch {
      setStage('idle')
    }
  }

  const headline = alreadyRegistered
    ? `${latest.label} is registered but not default`
    : `New version available — ${latest.label}`

  const body = alreadyRegistered
    ? `Users on the default path will keep hitting ${currentDefaultLabel ?? 'the current impl'} until you promote ${latest.label}.`
    : `Your proxy's default is ${currentDefaultLabel ?? 'unset'}. Promote ${latest.label} to move everyone over.`

  const buttonLabel = (() => {
    if (stage === 'register')
      return registerPending ? 'Sign register…' : 'Registering…'
    if (stage === 'setDefault')
      return defaultPending ? 'Sign setDefault…' : 'Promoting…'
    return 'Promote'
  })()

  return (
    <section className="rounded-xl border border-brand/40 bg-brand/[0.06] p-4 flex flex-wrap items-start gap-3">
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
            onClick={onPromote}
            disabled={busy}
            className="btn-primary text-xs px-3 py-1.5 inline-flex items-center gap-1.5"
          >
            {busy && (
              <span
                aria-hidden
                className="inline-block h-3 w-3 rounded-full border border-current border-r-transparent animate-spin"
              />
            )}
            {buttonLabel}
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
