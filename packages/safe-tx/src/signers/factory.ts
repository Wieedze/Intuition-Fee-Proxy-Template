import { envSigner, type EnvSignerOptions } from './env.js'
import { ledgerSigner, type LedgerSignerOptions } from './ledger.js'
import { trezorSigner, type TrezorSignerOptions } from './trezor.js'
import {
  walletconnectSigner,
  type WalletConnectSignerOptions,
} from './walletconnect.js'
import type { Signer } from './types.js'

export type SignerStrategy = 'env' | 'walletconnect' | 'ledger' | 'trezor'

export type SignerOptions = {
  env?: EnvSignerOptions
  walletconnect?: WalletConnectSignerOptions
  ledger?: LedgerSignerOptions
  trezor?: TrezorSignerOptions
}

/**
 * Resolve a Signer for the requested strategy. Async because some
 * strategies (walletconnect, ledger, trezor) do I/O during initialization.
 */
export async function getSigner(
  strategy: SignerStrategy,
  opts: SignerOptions = {},
): Promise<Signer> {
  switch (strategy) {
    case 'env':
      return envSigner(opts.env)
    case 'walletconnect':
      return walletconnectSigner(opts.walletconnect)
    case 'ledger':
      return ledgerSigner(opts.ledger)
    case 'trezor':
      return trezorSigner(opts.trezor)
  }
}
