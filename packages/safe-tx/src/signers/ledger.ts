import type { Hex } from 'viem'
import { toAccount } from 'viem/accounts'
import type { Signer } from './types.js'

export type LedgerSignerOptions = {
  /** BIP-44 path. Default: "44'/60'/0'/0/0" (first Ethereum account). */
  derivationPath?: string
  /** Max time to wait for USB transport open. Default: 3000ms. */
  transportTimeoutMs?: number
}

/**
 * Hardware-wallet signing via Ledger over USB. Uses dynamic imports of
 * `@ledgerhq/hw-app-eth` + `@ledgerhq/hw-transport-node-hid` (declared
 * as `optionalDependencies`) so the heavy native bindings only need to
 * resolve when this signer is actually selected.
 *
 * EIP-712 signing uses `signEIP712Message` (full struct on-device,
 * requires Ledger Ethereum app v1.10+). For Intuition mainnet
 * (chain id 1155, not in Ledger's pre-shipped chain list), the device's
 * Ethereum app must have "Blind signing" enabled in Settings.
 *
 * Pre-flight: device unlocked, Ethereum app open, Ledger Live closed
 * (Live grabs the USB transport and blocks other clients).
 */
export async function ledgerSigner(opts: LedgerSignerOptions = {}): Promise<Signer> {
  const derivationPath = opts.derivationPath ?? "44'/60'/0'/0/0"
  const transportTimeoutMs = opts.transportTimeoutMs ?? 3000

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

  // TransportNodeHid.create() can hang indefinitely on machines with no
  // Ledger plugged in (and on some Linux configs without udev rules).
  // Race it with a timeout so we surface a usable error instead of a
  // 30s freeze.
  let transport: Awaited<ReturnType<typeof TransportNodeHid.create>>
  try {
    transport = await Promise.race([
      TransportNodeHid.create(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(`USB transport open timed out after ${transportTimeoutMs}ms`),
            ),
          transportTimeoutMs,
        ),
      ),
    ])
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
      // The Ledger SDK takes an EIP712Message *object* (not JSON string),
      // and all numeric values must be decimal strings (no bigints). Round-
      // trip through JSON to coerce bigints while preserving structure.
      const eip712Message = JSON.parse(
        JSON.stringify(typedData, (_k, v) =>
          typeof v === 'bigint' ? v.toString() : v,
        ),
      ) as Parameters<typeof eth.signEIP712Message>[1]
      const sig = await eth.signEIP712Message(derivationPath, eip712Message)
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
