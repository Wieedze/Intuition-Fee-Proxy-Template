/**
 * Intuition-flavored CAIP-10 identifiers.
 *
 * Standard CAIP-10 is `{namespace}:{chain_ref}:{address}` (e.g.
 * `eip155:8453:0xabc…`). The Intuition indexer expects a `caip10:` *prefix*
 * on top — so the atom data stored on-chain looks like:
 *
 *   caip10:eip155:{chainId}:{checksumAddress}
 *
 * This is what the Rust consumer detects via its `is_valid_caip10` check
 * (sofia-core/intuition-rs). When it sees this exact shape in an atom's
 * data, it writes a row into the GraphQL `caip10` table with a 1:1 link
 * to the atom — unlocking queries like "find the atom for this contract".
 */

import { getAddress, isAddress } from 'viem'
import type { Address } from 'viem'

export type IntuitionCaip10 = `caip10:eip155:${number}:0x${string}`

const PREFIX = 'caip10:'
const NAMESPACE = 'eip155'

/**
 * Build the Intuition-flavored CAIP-10 string for an EVM address on a given chain.
 * The address is checksummed; chainId must be a positive integer.
 */
export function toIntuitionCaip10(
  chainId: number | bigint,
  address: string,
): IntuitionCaip10 {
  const id = typeof chainId === 'bigint' ? Number(chainId) : chainId
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(`Invalid chainId: ${String(chainId)} (must be a positive integer)`)
  }
  if (!isAddress(address)) {
    throw new Error(`Invalid address: ${address}`)
  }
  const checksummed = getAddress(address)
  return `${PREFIX}${NAMESPACE}:${id}:${checksummed}` as IntuitionCaip10
}

/**
 * Parse an Intuition-flavored CAIP-10 string back into its parts.
 * Throws if any component is invalid (wrong prefix, wrong namespace, non-integer
 * chainId, malformed address). The returned address is always checksummed.
 */
export function parseIntuitionCaip10(caip10: string): {
  chainId: number
  address: Address
} {
  if (!caip10.startsWith(PREFIX)) {
    throw new Error(`Missing "caip10:" prefix: ${caip10}`)
  }
  const parts = caip10.split(':')
  if (parts.length !== 4) {
    throw new Error(`Malformed CAIP-10 (expected 4 parts, got ${parts.length}): ${caip10}`)
  }
  const [, namespace, chainIdStr, addr] = parts
  if (namespace !== NAMESPACE) {
    throw new Error(`Unsupported namespace "${namespace}" (only "eip155" is supported)`)
  }
  const chainId = Number(chainIdStr)
  if (!Number.isInteger(chainId) || chainId <= 0) {
    throw new Error(`Invalid chainId: ${chainIdStr}`)
  }
  if (!isAddress(addr)) {
    throw new Error(`Invalid address: ${addr}`)
  }
  return { chainId, address: getAddress(addr) }
}
