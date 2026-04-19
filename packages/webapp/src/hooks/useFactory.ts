import { useMemo } from 'react'
import { useAccount, useChainId, useReadContract, useWriteContract } from 'wagmi'
import { stringToHex, type Address, type Hex } from 'viem'

import { IntuitionFeeProxyFactoryABI } from '@intuition-fee-proxy/sdk'
import { addressesFor, networkFor } from '../lib/addresses'

function useFactoryAddress(): Address | undefined {
  const chainId = useChainId()
  return useMemo(() => {
    const { factory } = addressesFor(networkFor(chainId))
    return factory === '0x0000000000000000000000000000000000000000' ? undefined : factory
  }, [chainId])
}

export function useDeployProxy() {
  const factory = useFactoryAddress()
  const { writeContract, writeContractAsync, data, isPending, error, reset } =
    useWriteContract()

  function deploy(params: {
    ethMultiVault: Address
    depositFixedFee: bigint
    depositPercentageFee: bigint
    admins: Address[]
    name?: string
    /** 0 = Standard, 1 = Sponsored. Defaults to Standard. */
    channel?: 0 | 1
  }) {
    if (!factory) throw new Error('Factory address not configured for this network')
    const nameBytes: Hex = params.name
      ? stringToHex(params.name, { size: 32 })
      : '0x0000000000000000000000000000000000000000000000000000000000000000'
    return writeContractAsync({
      abi: IntuitionFeeProxyFactoryABI as any,
      address: factory,
      functionName: 'createProxy',
      args: [
        params.ethMultiVault,
        params.depositFixedFee,
        params.depositPercentageFee,
        params.admins,
        nameBytes,
        params.channel ?? 0,
      ],
    })
  }

  return {
    deploy,
    write: writeContract,
    hash: data,
    isPending,
    error,
    reset,
    factory,
  }
}

export function useMyProxies() {
  const factory = useFactoryAddress()
  const { address } = useAccount()

  const result = useReadContract({
    abi: IntuitionFeeProxyFactoryABI as any,
    address: factory,
    functionName: 'getProxiesByDeployer',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(factory && address) },
  })

  return {
    ...result,
    proxies: (result.data as Address[] | undefined) ?? [],
    factory,
  }
}

export function useAllProxies() {
  const factory = useFactoryAddress()
  const result = useReadContract({
    abi: IntuitionFeeProxyFactoryABI as any,
    address: factory,
    functionName: 'getAllProxies',
    query: { enabled: Boolean(factory) },
  })

  return {
    ...result,
    proxies: (result.data as Address[] | undefined) ?? [],
    factory,
  }
}
