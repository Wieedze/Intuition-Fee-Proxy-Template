import { hexToString, type Hex } from 'viem'

/**
 * Format a UNIX seconds timestamp to a readable local string.
 * Short today ("17:23"), longer yesterday/older ("Apr 18, 17:23").
 */
export function formatAbsoluteDate(tsSeconds: number): string {
  const d = new Date(tsSeconds * 1000)
  const now = new Date()
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  if (sameDay) {
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Format a positive "seconds ago" delta to a compact relative string.
 * Returns "just now" for < 1 min, or a rounded unit (min / h / d).
 */
export function formatRelativeTime(secondsAgo: number): string {
  if (secondsAgo < 0) return 'in the future'
  if (secondsAgo < 60) return 'just now'
  if (secondsAgo < 3600) {
    const m = Math.floor(secondsAgo / 60)
    return `${m} min ago`
  }
  if (secondsAgo < 86400) {
    const h = Math.floor(secondsAgo / 3600)
    return `${h} h ago`
  }
  const d = Math.floor(secondsAgo / 86400)
  return `${d} day${d === 1 ? '' : 's'} ago`
}

/** Decode a bytes32 version label back to its human-readable form. */
export function decodeVersion(v: Hex): string {
  try {
    const decoded = hexToString(v, { size: 32 })
    return decoded || v
  } catch {
    return v
  }
}

export const WINDOW_PRESETS: ReadonlyArray<{
  label: string
  seconds: bigint
}> = [
  { label: '1 hour', seconds: 3600n },
  { label: '1 day', seconds: 86400n },
  { label: '1 week', seconds: 604800n },
  { label: '30 days', seconds: 2592000n },
]

/** Human-readable claim-window length ("1 day", "12 hours", "45s"). */
export function formatWindow(seconds: bigint): string {
  const match = WINDOW_PRESETS.find((p) => p.seconds === seconds)
  if (match) return match.label
  const n = Number(seconds)
  if (n % 86400 === 0) return `${n / 86400} days`
  if (n % 3600 === 0) return `${n / 3600} hours`
  if (n % 60 === 0) return `${n / 60} min`
  return `${n}s`
}
