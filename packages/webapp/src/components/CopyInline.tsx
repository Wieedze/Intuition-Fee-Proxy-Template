import { useState } from 'react'

/**
 * Tiny copy-to-clipboard button — inherits `currentColor`, flashes a check
 * for 1.4s after a successful copy. Sized for use next to a monospaced
 * value in a flex row (`shrink-0` so it never wraps).
 *
 * Distinct from `Address.tsx` because this one only copies; it doesn't
 * render the value itself. Use it when you already have a `<code>` /
 * `<span>` owning the display and just need a companion copy affordance.
 */
export function CopyInline({ value }: { value: string }) {
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

  return (
    <button
      type="button"
      onClick={onCopy}
      aria-label="Copy"
      className="shrink-0 rounded p-1 text-subtle transition-colors hover:text-brand"
    >
      {copied ? (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="9" y="9" width="13" height="13" rx="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
    </button>
  )
}
