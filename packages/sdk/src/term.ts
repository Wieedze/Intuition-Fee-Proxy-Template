/**
 * Term primitives — pure id calculation + on-chain existence checks.
 *
 * A "term" in V2 MultiVault is either an atom or a triple. Both are addressed
 * by `bytes32 termId`. Atoms are created from `bytes data` with
 *
 *   termId = keccak256(data)        // abi.encodePacked on bytes is identity
 *
 * so we can compute the termId for any proxy's identity atom *without* a
 * round-trip: pure client-side hash. The chain-reading helpers below are for
 * the second step — checking whether that termId has already been created.
 *
 * Naming note: we use `termId` everywhere (not `atomId`) because the same
 * key is the natural anchor for future triples referencing this proxy.
 */

import { keccak256, parseAbi, toBytes } from 'viem'
import type { Address, Hex, PublicClient } from 'viem'

import { toIntuitionCaip10 } from './caip'

const MULTIVAULT_READ_ABI = parseAbi([
  'function isAtom(bytes32 atomId) view returns (bool)',
  'function isTermCreated(bytes32 id) view returns (bool)',
  'function atom(bytes32 atomId) view returns (bytes)',
])

/**
 * Pure, deterministic termId for a proxy's identity atom.
 * No RPC call — matches `MultiVaultCore.calculateAtomId(data)` exactly.
 */
export function calculateProxyTermId(
  chainId: number | bigint,
  proxyAddress: string,
): Hex {
  const caip10 = toIntuitionCaip10(chainId, proxyAddress)
  return keccak256(toBytes(caip10))
}

/**
 * Strict check: does an *atom* with this proxy's CAIP-10 identity exist?
 * Returns false for triples that happen to share the id (won't in practice
 * since the preimage is a CAIP-10 string, but the stricter check is cleaner).
 */
export async function proxyAtomExists(
  client: PublicClient,
  multiVault: Address,
  chainId: number | bigint,
  proxyAddress: string,
): Promise<boolean> {
  const termId = calculateProxyTermId(chainId, proxyAddress)
  return (await client.readContract({
    abi: MULTIVAULT_READ_ABI,
    address: multiVault,
    functionName: 'isAtom',
    args: [termId],
  })) as boolean
}

/**
 * Permissive check: has *any* term (atom or triple) been created at this id?
 * Kept alongside `proxyAtomExists` as the natural primitive for future code
 * that will reason about triples anchored on a proxy's identity.
 */
export async function proxyTermExists(
  client: PublicClient,
  multiVault: Address,
  chainId: number | bigint,
  proxyAddress: string,
): Promise<boolean> {
  const termId = calculateProxyTermId(chainId, proxyAddress)
  return (await client.readContract({
    abi: MULTIVAULT_READ_ABI,
    address: multiVault,
    functionName: 'isTermCreated',
    args: [termId],
  })) as boolean
}

/**
 * Read the raw atom data for a proxy's identity atom, if it exists.
 * Returns `undefined` when the atom hasn't been created (the read returns an
 * empty bytes blob in that case).
 */
export async function readProxyAtomData(
  client: PublicClient,
  multiVault: Address,
  chainId: number | bigint,
  proxyAddress: string,
): Promise<Hex | undefined> {
  const termId = calculateProxyTermId(chainId, proxyAddress)
  const data = (await client.readContract({
    abi: MULTIVAULT_READ_ABI,
    address: multiVault,
    functionName: 'atom',
    args: [termId],
  })) as Hex
  return data === '0x' ? undefined : data
}
