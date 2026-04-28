import type { Hex } from 'viem'
import { toAccount } from 'viem/accounts'
import type { Signer } from './types.js'

export type LedgerSignerOptions = {
  /** BIP-44 path. Default: "44'/60'/0'/0/0" (first Ethereum account). */
  derivationPath?: string
}

/**
 * Hardware-wallet signing via Ledger over USB. Uses dynamic imports of
 * `@ledgerhq/hw-app-eth` + `@ledgerhq/hw-transport-node-hid` so the
 * deps stay optional — install them only if you actually use this:
 *
 *   bun add @ledgerhq/hw-app-eth @ledgerhq/hw-transport-node-hid
 *
 * EIP-712 signing uses `signEIP712Message` (full JSON, displays the
 * struct on-device). Requires Ledger Ethereum app v1.10+. Older app
 * versions can be updated via Ledger Live.
 *
 * Pre-flight: device unlocked, Ethereum app open, Ledger Live closed
 * (Live grabs the USB transport and blocks other clients).
 */
export async function ledgerSigner(opts: LedgerSignerOptions = {}): Promise<Signer> {
  const derivationPath = opts.derivationPath ?? "44'/60'/0'/0/0"

  let TransportNodeHid: typeof import('@ledgerhq/hw-transport-node-hid').default
  let Eth: typeof import('@ledgerhq/hw-app-eth').default
  try {
    const transportMod = await import('@ledgerhq/hw-transport-node-hid')
    const ethMod = await import('@ledgerhq/hw-app-eth')
    TransportNodeHid = transportMod.default
    Eth = ethMod.default
  } catch {
    throw new Error(
      'safe-tx: ledger signer requires optional deps. Install: ' +
        'bun add @ledgerhq/hw-app-eth @ledgerhq/hw-transport-node-hid',
    )
  }

  let transport: Awaited<ReturnType<typeof TransportNodeHid.create>>
  try {
    transport = await TransportNodeHid.create()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(
      `safe-tx: cannot open USB transport to Ledger. Is the device connected, unlocked, and Ethereum app open? Close Ledger Live first. (${msg})`,
    )
  }

  const eth = new Eth(transport)
  const { address } = await eth.getAddress(derivationPath)
  const account = address as `0x${string}`

  function packSig(r: string, s: string, v: number): Hex {
    const vHex = v.toString(16).padStart(2, '0')
    return (`0x${r}${s}${vHex}`) as Hex
  }

  return toAccount({
    address: account,

    async signTypedData(typedData) {
      // viem may pass bigints in the typed data — JSON.stringify needs
      // help. Pass as decimal strings; the Ledger Eth app accepts that.
      const json = JSON.stringify(typedData, (_k, v) =>
        typeof v === 'bigint' ? v.toString() : v,
      )
      const sig = await eth.signEIP712Message(derivationPath, json)
      return packSig(sig.r, sig.s, sig.v)
    },

    async signMessage({ message }) {
      const raw =
        typeof message === 'string'
          ? Buffer.from(message, 'utf-8').toString('hex')
          : (message.raw as string).startsWith('0x')
            ? (message.raw as string).slice(2)
            : Buffer.from(message.raw as string, 'utf-8').toString('hex')
      const sig = await eth.signPersonalMessage(derivationPath, raw)
      return packSig(sig.r, sig.s, sig.v)
    },

    async signTransaction(_transaction) {
      throw new Error(
        'safe-tx ledger signer: signTransaction not implemented. The Safe execution path uses signTypedData; if you need raw tx signing for a different flow, file an issue.',
      )
    },
  })
}
