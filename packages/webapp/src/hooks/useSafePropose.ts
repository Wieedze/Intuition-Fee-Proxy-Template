import { useState } from 'react'
import type { Address, Hex } from 'viem'
import {
  useAccount,
  useChainId,
  usePublicClient,
  useSignTypedData,
} from 'wagmi'

import {
  type AdminOp,
  modes,
} from '@intuition-fee-proxy/safe-tx'

const DEN_STS_INTUITION = 'https://safe-transaction-intuition.onchainden.com'

const SAFE_TX_TYPES = {
  SafeTx: [
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'data', type: 'bytes' },
    { name: 'operation', type: 'uint8' },
    { name: 'safeTxGas', type: 'uint256' },
    { name: 'baseGas', type: 'uint256' },
    { name: 'gasPrice', type: 'uint256' },
    { name: 'gasToken', type: 'address' },
    { name: 'refundReceiver', type: 'address' },
    { name: 'nonce', type: 'uint256' },
  ],
} as const

export type SafeProposeResult = {
  safeTxHash: Hex
  denUrl: string
}

/**
 * Build + sign + propose a SafeTx wrapping an AdminOp, routed through
 * the Den Safe Transaction Service. The connected wallet provides the
 * EIP-712 signature via wagmi.signTypedData — no private key on the
 * webapp side.
 *
 * Caller is responsible for picking the Safe address (typically the
 * Safe found in the proxy's admins list).
 */
export function useSafePropose({ safeAddress }: { safeAddress: Address | undefined }) {
  const { address: signerAddress } = useAccount()
  const chainId = useChainId()
  const publicClient = usePublicClient()
  const { signTypedDataAsync } = useSignTypedData()

  const [isProposing, setIsProposing] = useState(false)
  const [proposed, setProposed] = useState<SafeProposeResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const denUrl = safeAddress
    ? `https://safe.onchainden.com/home?safe=int:${safeAddress}`
    : ''

  async function propose(op: AdminOp): Promise<void> {
    if (!safeAddress) {
      throw new Error('useSafePropose: safeAddress is required')
    }
    if (!signerAddress) {
      throw new Error('useSafePropose: connect a wallet first')
    }
    if (!publicClient) {
      throw new Error('useSafePropose: no publicClient available')
    }

    setIsProposing(true)
    setError(null)
    setProposed(null)

    try {
      // 1. Build the SafeTx (fetches the Safe nonce on-chain).
      const payload = await modes.directSign.buildSafeTx(
        { safe: safeAddress, chainId, op },
        publicClient,
      )

      // 2. EIP-712 sign via the connected wallet.
      const sig = await signTypedDataAsync({
        domain: { chainId, verifyingContract: safeAddress },
        types: SAFE_TX_TYPES,
        primaryType: 'SafeTx',
        message: payload.message,
      })

      // 3. POST to Den's STS so the other Safe owners can co-sign in Den UI.
      const sts = modes.apiKit.createApiKitClient({ txServiceUrl: DEN_STS_INTUITION })
      await sts.propose(payload, { signer: signerAddress, sig })

      setProposed({ safeTxHash: payload.safeTxHash, denUrl })
    } catch (e) {
      const msg = e instanceof Error ? e.message.split('\n')[0] : String(e)
      setError(msg)
    } finally {
      setIsProposing(false)
    }
  }

  function reset(): void {
    setProposed(null)
    setError(null)
  }

  return {
    canPropose: Boolean(safeAddress && signerAddress && publicClient),
    propose,
    isProposing,
    proposed,
    error,
    denUrl,
    reset,
  }
}
