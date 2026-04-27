import type { Address, Hex } from 'viem'
import type { SafeTxPayload, SignedSafeTx } from './direct-sign.js'

/**
 * Minimal Safe Transaction Service client.
 *
 * Wraps 4 endpoints used by our flow (propose, confirm, get, list) via
 * raw fetch — no @safe-global/api-kit dep. Easier to audit (every
 * endpoint and payload field is visible in source) and keeps the
 * dependency surface lean. Compatible with any STS-compliant backend,
 * including Den's `https://safe-transaction-intuition.onchainden.com`.
 */

export type ApiKitClientOptions = {
  /**
   * Base URL of the Safe Transaction Service. The `/api/v1` path is
   * appended internally — pass only the host root.
   * Example: `https://safe-transaction-intuition.onchainden.com`
   */
  txServiceUrl: string
}

export type StsConfirmation = {
  owner: string
  signature: string
}

export type StsTxRecord = {
  contractTransactionHash: Hex
  to: Address
  value: string
  data: Hex
  operation: number
  safeTxGas: string
  baseGas: string
  gasPrice: string
  gasToken: Address
  refundReceiver: Address
  nonce: string
  sender: Address
  signature: Hex
  confirmations: StsConfirmation[]
}

export type ApiKitClient = {
  propose: (payload: SafeTxPayload, signed: SignedSafeTx) => Promise<void>
  confirm: (safeTxHash: Hex, signed: SignedSafeTx) => Promise<void>
  getTx: (safeTxHash: Hex) => Promise<StsTxRecord>
  getPendingTxs: (safe: Address) => Promise<StsTxRecord[]>
}

export function createApiKitClient(opts: ApiKitClientOptions): ApiKitClient {
  const base = opts.txServiceUrl.replace(/\/$/, '') + '/api/v1'

  return {
    async propose(payload, signed) {
      const body = {
        to: payload.message.to,
        value: payload.message.value.toString(),
        data: payload.message.data,
        operation: payload.message.operation,
        safeTxGas: payload.message.safeTxGas.toString(),
        baseGas: payload.message.baseGas.toString(),
        gasPrice: payload.message.gasPrice.toString(),
        gasToken: payload.message.gasToken,
        refundReceiver: payload.message.refundReceiver,
        nonce: payload.message.nonce.toString(),
        contractTransactionHash: payload.safeTxHash,
        sender: signed.signer,
        signature: signed.sig,
      }
      const url = `${base}/safes/${payload.safe}/multisig-transactions/`
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        throw new Error(
          `safe-tx api-kit propose failed (HTTP ${res.status}): ${await res.text()}`,
        )
      }
    },

    async confirm(safeTxHash, signed) {
      const url = `${base}/multisig-transactions/${safeTxHash}/confirmations/`
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ signature: signed.sig, owner: signed.signer }),
      })
      if (!res.ok) {
        throw new Error(
          `safe-tx api-kit confirm failed (HTTP ${res.status}): ${await res.text()}`,
        )
      }
    },

    async getTx(safeTxHash) {
      const url = `${base}/multisig-transactions/${safeTxHash}/`
      const res = await fetch(url)
      if (!res.ok) {
        throw new Error(
          `safe-tx api-kit getTx failed (HTTP ${res.status}): ${await res.text()}`,
        )
      }
      return res.json() as Promise<StsTxRecord>
    },

    async getPendingTxs(safe) {
      const url = `${base}/safes/${safe}/multisig-transactions/?executed=false`
      const res = await fetch(url)
      if (!res.ok) {
        throw new Error(
          `safe-tx api-kit getPendingTxs failed (HTTP ${res.status}): ${await res.text()}`,
        )
      }
      const json = (await res.json()) as { results: StsTxRecord[] }
      return json.results
    },
  }
}
