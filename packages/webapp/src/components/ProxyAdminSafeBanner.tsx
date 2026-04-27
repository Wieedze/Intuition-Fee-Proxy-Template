import type { Address } from 'viem'
import { useChainId } from 'wagmi'
import { useSafeStatus } from '../hooks/useSafeStatus'

interface Props {
  proxyAdmin: Address | undefined
}

const INTUITION_MAINNET_CHAIN_ID = 1155

/**
 * Banner specifically for Role 1 (proxyAdmin). Stricter than the
 * fee-admin variant because the proxyAdmin can swap the proxy's
 * implementation — it effectively holds the upgrade key, so an EOA
 * compromise here is catastrophic (the attacker can replace the logic
 * with any contract they want).
 *
 * - Safe                 -> emerald, no fanfare
 * - Generic contract     -> neutral info, "verify it's a multisig"
 * - EOA on dev/testnet   -> amber, "fine for dev"
 * - EOA on mainnet       -> rose, prominent, points to runbook
 */
export function ProxyAdminSafeBanner({ proxyAdmin }: Props) {
  const chainId = useChainId()
  const status = useSafeStatus(proxyAdmin)
  const onMainnet = chainId === INTUITION_MAINNET_CHAIN_ID

  if (!proxyAdmin || status.kind === 'unknown') return null

  if (status.kind === 'safe') {
    return (
      <div className="rounded-lg border border-emerald-400/30 bg-emerald-400/5 px-4 py-2.5 text-xs text-emerald-300">
        <strong>Safe-managed proxyAdmin.</strong> Upgrades require multisig quorum — production-grade.
      </div>
    )
  }

  if (status.kind === 'contract') {
    return (
      <div className="rounded-lg border border-line bg-surface px-4 py-2.5 text-xs text-muted">
        <strong>Smart-contract proxyAdmin</strong> — not detected as a known Safe singleton. Verify it&apos;s a multisig you trust.
      </div>
    )
  }

  // EOA
  if (onMainnet) {
    return (
      <div className="rounded-lg border border-rose-400/50 bg-rose-400/5 px-4 py-3 text-xs text-rose-300">
        <strong>EOA proxyAdmin on mainnet — high risk.</strong> This single key can swap the proxy&apos;s implementation, replacing the entire logic of the contract. A key compromise here means total loss of control. Rotate to a Gnosis Safe before any production use (see <code className="font-mono text-rose-200">SAFE_TX_RUNBOOK.md</code> in the repo).
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-amber-400/30 bg-amber-400/5 px-4 py-2.5 text-xs text-amber-300">
      <strong>EOA proxyAdmin.</strong> Fine for dev / testing. Rotate to a Safe before this proxy goes near mainnet (see <code className="font-mono text-amber-200">SAFE_TX_RUNBOOK.md</code> in the repo).
    </div>
  )
}
