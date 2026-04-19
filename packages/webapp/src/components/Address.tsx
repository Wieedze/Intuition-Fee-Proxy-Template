import { useState } from 'react'
import type { Address as Addr } from 'viem'

type Props = {
  value: Addr | string
  /** "full" shows the entire address, "short" does middle-truncate. Default: "short". */
  variant?: 'full' | 'short'
  /** Show a copy button. Default: true. */
  copy?: boolean
  className?: string
}

function middleTruncate(v: string, left = 6, right = 4) {
  if (v.length <= left + right + 3) return v
  return `${v.slice(0, left)}…${v.slice(-right)}`
}

export default function Address({
  value,
  variant = 'short',
  copy = true,
  className = '',
}: Props) {
  const [copied, setCopied] = useState(false)

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    } catch {
      /* noop */
    }
  }

  const label = variant === 'full' ? value : middleTruncate(value)

  return (
    <span className={`inline-flex items-center gap-1.5 font-mono text-xs text-muted ${className}`}>
      <span
        className={variant === 'full' ? 'break-all' : ''}
        title={variant === 'full' ? undefined : value}
      >
        {label}
      </span>
      {copy && (
        <button
          type="button"
          onClick={onCopy}
          aria-label="Copy address"
          className="rounded p-0.5 text-subtle transition-colors hover:text-brand"
        >
          {copied ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="9" width="13" height="13" rx="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          )}
        </button>
      )}
    </span>
  )
}
