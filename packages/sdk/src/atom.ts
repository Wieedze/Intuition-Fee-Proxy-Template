/**
 * Atom writers — creating the CAIP-10 identity atom for a proxy.
 *
 * This is the "auto-after-deploy" step: the deployer signs a `createAtoms`
 * call whose sole data entry is the proxy's Intuition-flavored CAIP-10
 * string. The Rust indexer picks up the `caip10:` prefix and links the atom
 * to the proxy's address in the GraphQL `caip10` table.
 *
 * Scope is deliberately narrow — no metadata, no triples. Those live in
 * future helpers and reuse `calculateProxyTermId` as their anchor.
 */

import { parseAbi, toBytes, toHex } from 'viem'
import type { Address, Hex, PublicClient, WalletClient } from 'viem'

import { toIntuitionCaip10 } from './caip'
import { calculateProxyTermId } from './term'

const MULTIVAULT_WRITE_ABI = parseAbi([
  'function getAtomCost() view returns (uint256)',
  'function createAtoms(bytes[] data, uint256[] assets) payable returns (bytes32[])',
])

export type CreateProxyIdentityAtomResult = {
  termId: Hex
  caip10: string
  txHash: Hex
}

/**
 * Create the CAIP-10 identity atom for a proxy.
 *
 * The transaction is sent by `walletClient`'s account; `publicClient` is used
 * for the fee quote (`getAtomCost`) and to await the receipt. Returns the
 * deterministic termId alongside the tx hash — no event parsing needed since
 * `termId = keccak256(utf8(caip10))` and we control the input.
 *
 * If the atom already exists, the MultiVault will revert. Callers that want
 * idempotency should check `proxyAtomExists` first.
 */
export async function createProxyIdentityAtom(
  publicClient: PublicClient,
  walletClient: WalletClient,
  multiVault: Address,
  chainId: number | bigint,
  proxyAddress: string,
): Promise<CreateProxyIdentityAtomResult> {
  const account = walletClient.account
  if (!account) {
    throw new Error('walletClient has no account attached')
  }

  const caip10 = toIntuitionCaip10(chainId, proxyAddress)
  const termId = calculateProxyTermId(chainId, proxyAddress)
  const data = toHex(toBytes(caip10))

  const atomCost = (await publicClient.readContract({
    abi: MULTIVAULT_WRITE_ABI,
    address: multiVault,
    functionName: 'getAtomCost',
  })) as bigint

  const txHash = await walletClient.writeContract({
    abi: MULTIVAULT_WRITE_ABI,
    address: multiVault,
    functionName: 'createAtoms',
    args: [[data], [atomCost]],
    value: atomCost,
    account,
    chain: walletClient.chain ?? null,
  })

  await publicClient.waitForTransactionReceipt({ hash: txHash })

  return { termId, caip10, txHash }
}
