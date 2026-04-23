/**
 * Intuition MultiVault atom hooks — scoped to the "identity" atom pattern
 * (a single bytes-encoded CAIP-10 string identifying a proxy contract).
 *
 * Metadata atoms (IPFS/JSON) and triples live in future hooks that reuse
 * `calculateProxyTermId` from the SDK as their anchor — keeping this file
 * narrowly focused on the auto-after-deploy flow.
 */

import { useEffect, useMemo } from 'react'
import { parseAbi, toBytes, toHex, type Address, type Hex } from 'viem'
import { usePublicClient, useReadContract, useWriteContract } from 'wagmi'

import {
  calculateProxyTermId,
  toIntuitionCaip10,
} from '@intuition-fee-proxy/sdk'

const MULTIVAULT_ABI = parseAbi([
  'function getAtomCost() view returns (uint256)',
  'function createAtoms(bytes[] data, uint256[] assets) payable returns (bytes32[])',
  'function isAtom(bytes32 atomId) view returns (bool)',
  'function isTermCreated(bytes32 id) view returns (bool)',
  'function atom(bytes32 atomId) view returns (bytes)',
])

/**
 * Fire a `createAtoms` transaction with a single CAIP-10 identity atom for
 * the given proxy. Fetches `getAtomCost` just-in-time so the value matches
 * whatever the MultiVault currently charges — no stale quote.
 */
export function useCreateProxyIdentityAtom() {
  const publicClient = usePublicClient()
  const { writeContractAsync, data: hash, isPending, error, reset } =
    useWriteContract()

  async function createIdentity(params: {
    multiVault: Address
    chainId: number
    proxyAddress: Address
  }): Promise<Hex> {
    if (!publicClient) throw new Error('No public client available')
    const caip10 = toIntuitionCaip10(params.chainId, params.proxyAddress)
    const data = toHex(toBytes(caip10))

    const atomCost = (await publicClient.readContract({
      abi: MULTIVAULT_ABI,
      address: params.multiVault,
      functionName: 'getAtomCost',
    })) as bigint

    return writeContractAsync({
      abi: MULTIVAULT_ABI,
      address: params.multiVault,
      functionName: 'createAtoms',
      args: [[data], [atomCost]],
      value: atomCost,
    })
  }

  return { createIdentity, hash, isPending, error, reset }
}

/**
 * Live check: does the identity atom for this proxy already exist on-chain?
 * Returns `undefined` while loading. Disabled until both address inputs are
 * set so callers can pass optional values safely.
 */
export function useProxyAtomExists(params: {
  multiVault: Address | undefined
  chainId: number | undefined
  proxyAddress: Address | undefined
}) {
  const termId = useMemo<Hex | undefined>(() => {
    if (!params.chainId || !params.proxyAddress) return undefined
    return calculateProxyTermId(params.chainId, params.proxyAddress)
  }, [params.chainId, params.proxyAddress])

  const result = useReadContract({
    abi: MULTIVAULT_ABI,
    address: params.multiVault,
    functionName: 'isAtom',
    args: termId ? [termId] : undefined,
    query: {
      enabled: Boolean(params.multiVault && termId),
    },
  })

  // Diagnostic pair read: dump raw `atom()` data to see if the slot is
  // non-empty even when `isAtom()` disagrees. Also `isTermCreated` so we
  // know whether the storage got bucketed as a triple by mistake.
  const atomDataResult = useReadContract({
    abi: MULTIVAULT_ABI,
    address: params.multiVault,
    functionName: 'atom',
    args: termId ? [termId] : undefined,
    query: {
      enabled: Boolean(params.multiVault && termId),
    },
  })
  const isTermResult = useReadContract({
    abi: MULTIVAULT_ABI,
    address: params.multiVault,
    functionName: 'isTermCreated',
    args: termId ? [termId] : undefined,
    query: {
      enabled: Boolean(params.multiVault && termId),
    },
  })

  // Diagnostic: log what we queried + what came back. Removing once we've
  // confirmed the on-chain read behaves as expected.
  useEffect(() => {
    if (!params.multiVault || !termId) return
    // eslint-disable-next-line no-console
    console.log('[useProxyAtomExists]', {
      multiVault: params.multiVault,
      chainId: params.chainId,
      proxyAddress: params.proxyAddress,
      termId,
      isAtom: {
        loading: result.isLoading,
        fetched: result.isFetched,
        value: result.data,
        error: result.error?.message,
      },
      isTermCreated: {
        loading: isTermResult.isLoading,
        fetched: isTermResult.isFetched,
        value: isTermResult.data,
        error: isTermResult.error?.message,
      },
      atomData: {
        loading: atomDataResult.isLoading,
        fetched: atomDataResult.isFetched,
        value: atomDataResult.data,
        error: atomDataResult.error?.message,
      },
    })
  }, [
    params.multiVault,
    params.chainId,
    params.proxyAddress,
    termId,
    result.isLoading,
    result.isFetched,
    result.data,
    result.error,
    atomDataResult.isLoading,
    atomDataResult.isFetched,
    atomDataResult.data,
    atomDataResult.error,
    isTermResult.isLoading,
    isTermResult.isFetched,
    isTermResult.data,
    isTermResult.error,
  ])

  return {
    ...result,
    exists: result.data as boolean | undefined,
    termId,
    // Surface the query error so the card can distinguish "atom missing"
    // from "we couldn't tell" (bad RPC, wrong ABI, etc).
    readError: result.error,
  }
}
