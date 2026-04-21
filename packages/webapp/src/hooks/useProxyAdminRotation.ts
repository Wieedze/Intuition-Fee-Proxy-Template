import { useEffect, useRef, useState } from 'react'
import { isAddress, type Address } from 'viem'
import { useWaitForTransactionReceipt } from 'wagmi'

import { useSetWhitelistedAdmin } from './useProxy'
import { useTransferProxyAdmin } from './useVersionedProxy'
import type { AdminRotateStage } from '../types'

export interface ProxyAdminRotation {
  /** Input address for the target admin. */
  input: string
  setInput: (v: string) => void
  /** Where we are in the 5-state machine. */
  stage: AdminRotateStage
  /** User-facing error from any step of the chain. */
  error: string | null
  /** True while any signature/mining inside the rotation is in flight. */
  busy: boolean
  /** Receipts — exposed so the caller can show step-by-step progress. */
  grantConfirmed: boolean
  transferConfirmed: boolean
  /** Granular flags for per-step button text ("Sign Role 2…" etc). */
  grantPending: boolean
  transferPending: boolean
  /** True when the trimmed input is a valid hex address. */
  isValid: boolean
  /** Start the 2-tx chain. Precondition: isValid. */
  start: () => Promise<void>
  /** Clear all state — run manually once the user acknowledges completion. */
  reset: () => void
}

/**
 * Encapsulates the "grant both roles" 5-state machine + the 2 writes it
 * drives (setWhitelistedAdmin + transferProxyAdmin) and the external
 * acceptance detection. Keeps UpgradeAuthorityPanel free of state-machine
 * wiring — the panel just renders based on `stage`.
 *
 * Callbacks:
 *   - `onWriteSuccess` — fired when EITHER write mines. Callers refetch
 *     `useProxyVersions` to pick up the new pending/current admin.
 */
export function useProxyAdminRotation({
  proxy,
  proxyAdmin,
  account,
  onWriteSuccess,
}: {
  proxy: Address
  proxyAdmin: Address | undefined
  account: Address | undefined
  onWriteSuccess: () => void
}): ProxyAdminRotation {
  const {
    setAdmin: grantFeeAdmin,
    hash: grantHash,
    isPending: grantPending,
    reset: resetGrant,
  } = useSetWhitelistedAdmin(proxy)
  const grantReceipt = useWaitForTransactionReceipt({ hash: grantHash })

  const {
    transferAdmin,
    hash: transferHash,
    isPending: transferPending,
    reset: resetTransfer,
  } = useTransferProxyAdmin(proxy)
  const transferReceipt = useWaitForTransactionReceipt({ hash: transferHash })

  const [input, setInput] = useState('')
  const [stage, setStage] = useState<AdminRotateStage>('idle')
  const [error, setError] = useState<string | null>(null)

  function resetAll() {
    setStage('idle')
    setInput('')
    setError(null)
    resetGrant()
    resetTransfer()
  }

  // Fire proxyAdmin transfer once the fee-admin grant confirms.
  useEffect(() => {
    if (stage === 'grant' && grantReceipt.isSuccess) {
      resetGrant()
      setStage('transfer')
      transferAdmin(input.trim() as Address).catch((e: any) => {
        setError(e?.message ?? 'transferProxyAdmin failed')
        setStage('idle')
      })
    }
  }, [stage, grantReceipt.isSuccess, resetGrant, input, transferAdmin])

  // Transfer mined → move to "done" (awaiting external accept).
  useEffect(() => {
    if (transferReceipt.isSuccess) {
      resetTransfer()
      onWriteSuccess()
      if (stage === 'transfer') setStage('done')
    }
  }, [transferReceipt.isSuccess, resetTransfer, onWriteSuccess, stage])

  // Refresh parent reads when grant mines too (not strictly needed for
  // versions, but keeps behaviour symmetric with the panel's onTransferred).
  useEffect(() => {
    if (grantReceipt.isSuccess) onWriteSuccess()
  }, [grantReceipt.isSuccess, onWriteSuccess])

  // Detect external acceptance: on-chain proxyAdmin flipped to our target.
  useEffect(() => {
    if (stage !== 'done' || !proxyAdmin || !input) return
    if (proxyAdmin.toLowerCase() === input.trim().toLowerCase()) {
      setStage('complete')
    }
  }, [stage, proxyAdmin, input])

  // Fresh wallet = fresh rotation form. Previous wallet's in-flight state
  // would be confusing for the new principal.
  const prevAccount = useRef(account)
  useEffect(() => {
    if (prevAccount.current !== account) {
      resetAll()
      prevAccount.current = account
    }
    // `resetAll` is intentionally omitted — it's stable for our purposes
    // and listing it would require a useCallback dance for no gain.

  }, [account])

  const isValid = isAddress(input.trim())

  async function start() {
    setError(null)
    setStage('grant')
    try {
      await grantFeeAdmin(input.trim() as Address, true)
    } catch (e: any) {
      setError(e?.message ?? 'setWhitelistedAdmin failed')
      setStage('idle')
    }
  }

  const busy =
    grantPending ||
    grantReceipt.isLoading ||
    transferPending ||
    transferReceipt.isLoading ||
    stage === 'grant' ||
    stage === 'transfer'

  return {
    input,
    setInput,
    stage,
    error,
    busy,
    grantConfirmed: grantReceipt.isSuccess,
    transferConfirmed: transferReceipt.isSuccess,
    grantPending,
    transferPending,
    isValid,
    start,
    reset: resetAll,
  }
}
