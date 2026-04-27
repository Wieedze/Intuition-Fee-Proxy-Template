import type { Address } from 'viem'
import { useSafeStatus } from '../hooks/useSafeStatus'

interface Props {
  address: Address
  /** Optional Den UI URL — when set, the Safe badge wraps as a link. */
  safeUiUrl?: string
}

/**
 * Tiny inline badge: SAFE / EOA / CONTRACT.
 *
 * Non-blocking — purely visual. Used in the AdminsPanel and
 * UpgradeAuthorityPanel to make it obvious which admins are EOAs
 * (single key, fragile) vs Safes (multisig, recommended for prod).
 */
export function SafeBadge({ address, safeUiUrl }: Props) {
  const status = useSafeStatus(address)

  if (status.kind === 'unknown') {
    return (
      <span className="text-[10px] font-mono uppercase tracking-wider text-subtle border border-line rounded px-1.5 py-0.5">
        …
      </span>
    )
  }

  if (status.kind === 'eoa') {
    return (
      <span
        className="text-[10px] font-mono uppercase tracking-wider text-amber-400 border border-amber-400/40 rounded px-1.5 py-0.5"
        title="Externally Owned Account — single private key controls this admin role. Use a Safe multisig for production."
      >
        EOA
      </span>
    )
  }

  if (status.kind === 'safe') {
    const label = (
      <span
        className="text-[10px] font-mono uppercase tracking-wider text-emerald-400 border border-emerald-400/40 rounded px-1.5 py-0.5"
        title={`Gnosis Safe (singleton ${status.singleton}) — multisig, production-grade.`}
      >
        Safe
      </span>
    )
    if (safeUiUrl) {
      return (
        <a href={safeUiUrl} target="_blank" rel="noreferrer" className="hover:opacity-80 transition-opacity">
          {label}
        </a>
      )
    }
    return label
  }

  // Generic contract (smart wallet, module, etc.)
  return (
    <span
      className="text-[10px] font-mono uppercase tracking-wider text-subtle border border-line rounded px-1.5 py-0.5"
      title="Smart contract — not detected as a Safe. Could be another smart-wallet, module, or proxy."
    >
      Contract
    </span>
  )
}
