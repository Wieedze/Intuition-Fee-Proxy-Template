import type { Address } from 'viem'
import { useChainId } from 'wagmi'
import { useSafeStatuses } from '../hooks/useSafeStatus'

interface Props {
  admins: readonly Address[]
}

const INTUITION_MAINNET_CHAIN_ID = 1155

/**
 * Top-of-panel banner that summarizes the admin set's "Safe-readiness":
 *
 * - safe-only:   ✓ All admins are Safes — production-ready
 * - mixed:       Some EOAs alongside Safes — fine for transition
 * - eoa-only:    No Safe present — strongly discourage on mainnet,
 *                allow without fanfare on local/testnet/dev
 *
 * Intentionally non-blocking. We let devs iterate quickly with EOA
 * admins and only escalate the warning level on mainnet.
 */
export function SafeAdminHealthBanner({ admins }: Props) {
  const chainId = useChainId()
  const statuses = useSafeStatuses(admins)
  const onMainnet = chainId === INTUITION_MAINNET_CHAIN_ID

  if (admins.length === 0) return null

  let safeCount = 0
  let eoaCount = 0
  let unknownCount = 0
  for (const addr of admins) {
    const s = statuses[addr.toLowerCase()]
    if (!s || s.kind === 'unknown') unknownCount++
    else if (s.kind === 'safe') safeCount++
    else if (s.kind === 'eoa') eoaCount++
  }

  // Don't render anything until detection has resolved for at least
  // one admin — avoids a flash-of-warning on mount.
  if (unknownCount === admins.length) return null

  const allSafe = safeCount === admins.length
  const noSafe = safeCount === 0 && eoaCount > 0

  if (allSafe) {
    return (
      <div className="rounded-lg border border-emerald-400/30 bg-emerald-400/5 px-4 py-2.5 text-xs text-emerald-300 flex items-start gap-2">
        <span aria-hidden>🛡️</span>
        <span>
          <strong>Safe-managed.</strong> All admin slots are Gnosis Safes — production-grade access control.
        </span>
      </div>
    )
  }

  if (noSafe) {
    if (onMainnet) {
      return (
        <div className="rounded-lg border border-rose-400/40 bg-rose-400/5 px-4 py-2.5 text-xs text-rose-300 flex items-start gap-2">
          <span aria-hidden>🚨</span>
          <span>
            <strong>EOA-only on mainnet.</strong> Admin keys are concentrated on single accounts — a key loss or compromise drains every admin role.{' '}
            <a
              href="https://github.com/intuition-box/intuition-fee-proxy-template/blob/main/SAFE_TX_RUNBOOK.md#3-rotation-eoa-admin--safe-admin"
              target="_blank"
              rel="noreferrer"
              className="underline hover:text-rose-200"
            >
              Rotate to a Safe before going production
            </a>
            .
          </span>
        </div>
      )
    }
    return (
      <div className="rounded-lg border border-amber-400/30 bg-amber-400/5 px-4 py-2.5 text-xs text-amber-300 flex items-start gap-2">
        <span aria-hidden>👤</span>
        <span>
          <strong>EOA-only.</strong> Fine for dev / testing. Add a Safe before promoting this proxy to production —{' '}
          <a
            href="https://github.com/intuition-box/intuition-fee-proxy-template/blob/main/SAFE_TX_RUNBOOK.md"
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-amber-200"
          >
            see runbook
          </a>
          .
        </span>
      </div>
    )
  }

  // Mixed: at least one Safe + at least one EOA
  return (
    <div className="rounded-lg border border-amber-400/30 bg-amber-400/5 px-4 py-2.5 text-xs text-amber-300 flex items-start gap-2">
      <span aria-hidden>⚠️</span>
      <span>
        <strong>Mixed.</strong> {safeCount} Safe · {eoaCount} EOA. Acceptable during rotation; remove the EOA admin once your Safe quorum is confirmed working.
      </span>
    </div>
  )
}
