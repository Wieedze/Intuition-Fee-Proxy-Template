import type { Hex } from 'viem'
import { toAccount } from 'viem/accounts'
import type { Signer } from './types.js'

export type TrezorSignerOptions = {
  /** BIP-44 path. Default: "m/44'/60'/0'/0/0" (first Ethereum account). */
  derivationPath?: string
  /**
   * App identity sent to Trezor Connect. The library requires it to be
   * declared once per process — pick a stable email + url for your CLI.
   */
  manifest?: {
    email: string
    appUrl: string
  }
  /** Max time to wait for Trezor Connect init. Default: 30000ms. */
  initTimeoutMs?: number
}

/**
 * Hardware-wallet signing via Trezor (Model One / Model T / Safe).
 * Uses a dynamic import of `@trezor/connect` so the dep stays optional:
 *
 *   bun add @trezor/connect
 *
 * Pre-flight:
 * - Trezor Bridge installed and running (https://trezor.io/start) —
 *   Trezor Connect uses Bridge to talk to the device on Linux/Mac.
 * - Device unlocked and on the home screen.
 * - Confirm action prompts on the device when signing.
 *
 * EIP-712: uses `ethereumSignTypedData` with `metamask_v4_compat: true`
 * which accepts a domain + types + message structure equivalent to what
 * viem produces for Safe transactions.
 */
export async function trezorSigner(opts: TrezorSignerOptions = {}): Promise<Signer> {
  const derivationPath = opts.derivationPath ?? "m/44'/60'/0'/0/0"
  const manifest = opts.manifest ?? {
    email: 'safe-tx@intuition.box',
    appUrl: 'https://github.com/intuition-box/intuition-fee-proxy-template',
  }
  const initTimeoutMs = opts.initTimeoutMs ?? 30_000

  // Optional dep — typed `any` so the typecheck doesn't fail when
  // @trezor/connect isn't installed in node_modules (the whole point of
  // optionalDependencies). Runtime types are checked at the use sites
  // through the SDK's response shape.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let TrezorConnect: any
  try {
    // @vite-ignore — optional dep, may not be installed in webapp builds.
    const mod = await import(/* @vite-ignore */ '@trezor/connect' as string)
    TrezorConnect = mod.default
  } catch {
    throw new Error(
      'safe-tx: trezor signer requires optional dep. Install: bun add @trezor/connect',
    )
  }

  try {
    await Promise.race([
      TrezorConnect.init({ manifest }),
      new Promise<never>((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(
                `Trezor Connect init timed out after ${initTimeoutMs}ms — is Trezor Bridge running? https://trezor.io/start`,
              ),
            ),
          initTimeoutMs,
        ),
      ),
    ])
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    // init() throws if already initialized — that's fine, we proceed.
    if (!/already/i.test(msg)) {
      throw new Error(`safe-tx: trezor init failed. ${msg}`)
    }
  }

  const addrRes = await TrezorConnect.ethereumGetAddress({
    path: derivationPath,
    showOnTrezor: false,
  })
  if (!addrRes.success) {
    throw new Error(`safe-tx: trezor getAddress failed. ${addrRes.payload.error}`)
  }
  const account = addrRes.payload.address as `0x${string}`

  return toAccount({
    address: account,

    async signTypedData(typedData) {
      // Trezor's ethereumSignTypedData with metamask_v4_compat accepts
      // the EIP-712 v4 structure. Need to coerce bigints to decimal
      // strings so JSON-serializable.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any = JSON.parse(
        JSON.stringify(typedData, (_k, v) =>
          typeof v === 'bigint' ? v.toString() : v,
        ),
      )
      const res = await TrezorConnect.ethereumSignTypedData({
        path: derivationPath,
        data,
        metamask_v4_compat: true,
      })
      if (!res.success) {
        throw new Error(`safe-tx trezor signTypedData failed: ${res.payload.error}`)
      }
      return res.payload.signature as Hex
    },

    async signMessage({ message }) {
      const messageString =
        typeof message === 'string'
          ? message
          : (message.raw as string).startsWith('0x')
            ? Buffer.from((message.raw as string).slice(2), 'hex').toString('utf-8')
            : (message.raw as string)
      const res = await TrezorConnect.ethereumSignMessage({
        path: derivationPath,
        message: messageString,
        hex: false,
      })
      if (!res.success) {
        throw new Error(`safe-tx trezor signMessage failed: ${res.payload.error}`)
      }
      return res.payload.signature as Hex
    },

    async signTransaction(_transaction) {
      throw new Error(
        'safe-tx trezor signer: signTransaction not implemented. The Safe execution path uses signTypedData; if you need raw tx signing, file an issue.',
      )
    },
  })
}
