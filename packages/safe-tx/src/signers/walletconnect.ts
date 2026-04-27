import type { Signer } from './types.js'

export type WalletConnectSignerOptions = {
  /** WalletConnect Cloud project ID. */
  projectId?: string
  /** dApp metadata shown in the wallet during pairing. */
  metadata?: {
    name: string
    description: string
    url: string
    icons: string[]
  }
}

/**
 * Stub. WalletConnect v2 signing — the user scans a QR / deep-link in
 * MetaMask / Rabby / Trust to approve the EIP-712 signature request.
 * No private key is stored on the host.
 *
 * Implementation deferred. Same rationale as ledgerSigner — keep the
 * factory dispatch in place so the CLI can select this strategy when
 * the wallet-side support lands.
 */
export async function walletconnectSigner(_opts: WalletConnectSignerOptions = {}): Promise<Signer> {
  throw new Error(
    'safe-tx: walletconnect signer not yet implemented. Install @walletconnect/sign-client and wire the implementation.',
  )
}
