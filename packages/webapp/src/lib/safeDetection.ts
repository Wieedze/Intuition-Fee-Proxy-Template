import type { Address, PublicClient } from 'viem'
import { getAddress } from 'viem'

/**
 * Known Safe singleton addresses on Intuition mainnet. A proxy whose
 * storage slot 0 matches one of these is a Gnosis Safe.
 *
 * Source: on-chain verification + Den's STS /api/v1/about/singletons/.
 */
export const KNOWN_SAFE_SINGLETONS: readonly Address[] = [
  getAddress('0xfb1bffC9d739B8D520DaF37dF666da4C687191EA'), // v1.3.0+L2
  getAddress('0x29fcB43b46531BcA003ddC8FCB67FFE91900C762'), // v1.4.1+L2
] as const

export type SafeStatus =
  | { kind: 'eoa' }
  | { kind: 'safe'; singleton: Address }
  | { kind: 'contract' } // has code but doesn't look like a Safe
  | { kind: 'unknown' } // detection failed / no client

const SAFE_SINGLETONS_LOWER = new Set(
  KNOWN_SAFE_SINGLETONS.map((a) => a.toLowerCase()),
)

/**
 * Inspect an address: no code -> EOA, code + Safe singleton at slot 0
 * -> Safe, otherwise -> generic contract.
 */
export async function detectSafeStatus(
  client: PublicClient,
  address: Address,
): Promise<SafeStatus> {
  const code = await client.getCode({ address })
  if (!code || code === '0x') return { kind: 'eoa' }

  // Safe proxies store the singleton (master copy) at storage slot 0.
  // Read it and compare against known singletons.
  try {
    const slot0 = await client.getStorageAt({ address, slot: '0x0' })
    if (slot0 && slot0.length === 66) {
      const candidate = getAddress(`0x${slot0.slice(-40)}` as Address)
      if (SAFE_SINGLETONS_LOWER.has(candidate.toLowerCase())) {
        return { kind: 'safe', singleton: candidate }
      }
    }
  } catch {
    // Some chains/clients may not support eth_getStorageAt; treat as opaque
  }
  return { kind: 'contract' }
}
