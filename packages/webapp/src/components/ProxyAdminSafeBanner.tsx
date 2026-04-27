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
 * - Safe   -> emerald check, no fanfare
 * - EOA on dev/testnet -> amber, "fine for dev"
 * - EOA on mainnet -> red, prominent, link to runbook rotation section
 * - Generic contract -> sky-blue informational (could be a smart wallet)
 */
export function ProxyAdminSafeBanner({ proxyAdmin }: Props) {
  const chainId = useChainId()
  const status = useSafeStatus(proxyAdmin)
  const onMainnet = chainId === INTUITION_MAINNET_CHAIN_ID

  if (!proxyAdmin || status.kind === 'unknown') return null

  if (status.kind === 'safe') {
    return (
      <div className="rounded-lg border border-emerald-400/30 bg-emerald-400/5 px-4 py-2.5 text-xs text-emerald-300 flex items-start gap-2">
        <span aria-hidden>🛡️</span>
        <span>
          <strong>Safe-managed proxyAdmin.</strong> Upgrades require multisig quorum — production-grade.
        </span>
      </div>
    )
  }

  if (status.kind === 'contract') {
    return (
      <div className="rounded-lg border border-sky-400/30 bg-sky-400/5 px-4 py-2.5 text-xs text-sky-300 flex items-start gap-2">
        <span aria-hidden>📄</span>
        <span>
          <strong>Smart-contract proxyAdmin</strong> — not detected as a known Safe singleton. Verify it's a multisig you trust.
        </span>
      </div>
    )
  }

  // EOA
  if (onMainnet) {
    return (
      <div className="rounded-lg border border-rose-400/50 bg-rose-400/5 px-4 py-3 text-xs text-rose-300 flex items-start gap-2">
        <span aria-hidden className="text-base leading-none">🚨</span>
        <span>
          <strong>EOA proxyAdmin on mainnet — high-risk.</strong> This single key can swap the proxy's implementation, replacing the entire logic of the contract. A key compromise here means total loss of control.{' '}
          <a
            href="https://github.com/intuition-box/intuition-fee-proxy-template/blob/main/SAFE_TX_RUNBOOK.md#3-rotation-eoa-admin--safe-admin"
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-rose-200 font-semibold"
          >
            Rotate to a Gnosis Safe before any production use
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
        <strong>EOA proxyAdmin.</strong> Fine for dev / testing. Rotate to a Safe before this proxy goes near mainnet —{' '}
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
