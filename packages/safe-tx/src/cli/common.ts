import { getAddress, type Address } from 'viem'
import { INTUITION_MAINNET } from '../networks.js'
import { getSigner, type SignerStrategy } from '../signers/factory.js'
import type { Signer } from '../signers/types.js'
import type { SafeNetworkConfig } from '../types.js'

/** Common flags shared by every CLI subcommand. */
export type CommonOpts = {
  safe?: string
  network?: string
  signer?: string
}

export type ResolvedContext = {
  safe: Address
  network: SafeNetworkConfig
  signer: Signer
}

/**
 * Resolve the Safe address (from --safe or env), the network config, and
 * a Signer instance from the requested strategy.
 */
export async function resolveContext(opts: CommonOpts): Promise<ResolvedContext> {
  const safeStr = opts.safe ?? process.env.SAFE_ADDRESS_MAINNET
  if (!safeStr) {
    throw new Error(
      'safe-tx: --safe required (or set SAFE_ADDRESS_MAINNET in env)',
    )
  }
  const safe = getAddress(safeStr)

  const networkName = opts.network ?? 'intuition-mainnet'
  if (networkName !== 'intuition-mainnet') {
    throw new Error(
      `safe-tx: unsupported network "${networkName}". Only intuition-mainnet is supported.`,
    )
  }
  const network = INTUITION_MAINNET

  const strategy = (opts.signer ?? 'env') as SignerStrategy
  const signer = await getSigner(strategy)

  return { safe, network, signer }
}
