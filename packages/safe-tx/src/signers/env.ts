import { privateKeyToAccount } from 'viem/accounts'
import type { Hex } from 'viem'
import type { Signer } from './types.js'

export type EnvSignerOptions = {
  /** Env var to read the private key from. Default: PROPOSER_PK */
  envVar?: string
  /** Explicit override (typically used in tests). Skips env lookup if set. */
  privateKey?: Hex
}

/**
 * Loads a private key from process.env (or an explicit override) and
 * returns a viem LocalAccount.
 *
 * Intended for dev / CI / scripts where one Safe owner runs unattended.
 * For production, prefer ledgerSigner or walletconnectSigner so the key
 * never touches the filesystem.
 */
export function envSigner(opts: EnvSignerOptions = {}): Signer {
  const envVar = opts.envVar ?? 'PROPOSER_PK'
  const pk = opts.privateKey ?? process.env[envVar]

  if (!pk) {
    throw new Error(
      `safe-tx: missing private key. Set ${envVar} in env or pass opts.privateKey.`,
    )
  }
  if (!pk.startsWith('0x') || pk.length !== 66) {
    throw new Error(
      'safe-tx: private key must be 0x-prefixed and exactly 32 bytes (66 chars total).',
    )
  }

  return privateKeyToAccount(pk as Hex)
}
