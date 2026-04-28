import type { Signer } from './types.js'

export type LedgerSignerOptions = {
  /** BIP-44 path. Default: "44'/60'/0'/0/0" (first Ethereum account). */
  derivationPath?: string
}

/**
 * Stub. Hardware-wallet signing via @ledgerhq/hw-app-eth +
 * @ledgerhq/hw-transport-node-hid. Recommended for production prod
 * signers — key never leaves the device.
 *
 * Implementation deferred until the CLI's mainnet path actually needs
 * it. The stub keeps the strategy dispatched in the factory so
 * downstream code can target the final API today.
 */
export async function ledgerSigner(_opts: LedgerSignerOptions = {}): Promise<Signer> {
  throw new Error(
    'safe-tx: ledger signer not yet implemented. Install @ledgerhq/hw-app-eth + @ledgerhq/hw-transport-node-hid and wire the implementation.',
  )
}
