import { useReadContract, useReadContracts, useWriteContract } from 'wagmi'
import type { Address, Hex } from 'viem'

import { IntuitionVersionedFeeProxyABI } from '@intuition-fee-proxy/sdk'

const abi = IntuitionVersionedFeeProxyABI as any

export function useProxyVersions(proxy: Address | undefined) {
  const result = useReadContracts({
    contracts: [
      { abi, address: proxy, functionName: 'getVersions' },
      { abi, address: proxy, functionName: 'getDefaultVersion' },
      { abi, address: proxy, functionName: 'proxyAdmin' },
    ],
    allowFailure: false,
    query: { enabled: Boolean(proxy) },
  })

  return {
    ...result,
    versions: (result.data?.[0] as Hex[] | undefined) ?? [],
    defaultVersion: result.data?.[1] as Hex | undefined,
    proxyAdmin: result.data?.[2] as Address | undefined,
  }
}

export function useProxyImplementation(
  proxy: Address | undefined,
  version: Hex | undefined,
) {
  return useReadContract({
    abi,
    address: proxy,
    functionName: 'getImplementation',
    args: version ? [version] : undefined,
    query: { enabled: Boolean(proxy && version) },
  })
}

export function useRegisterVersion(proxy: Address | undefined) {
  const { writeContractAsync, data, isPending, error, reset } = useWriteContract()

  function register(version: Hex, implementation: Address) {
    if (!proxy) throw new Error('Proxy address missing')
    return writeContractAsync({
      abi,
      address: proxy,
      functionName: 'registerVersion',
      args: [version, implementation],
    })
  }

  return { register, hash: data, isPending, error, reset }
}

export function useSetDefaultVersion(proxy: Address | undefined) {
  const { writeContractAsync, data, isPending, error, reset } = useWriteContract()

  function setDefault(version: Hex) {
    if (!proxy) throw new Error('Proxy address missing')
    return writeContractAsync({
      abi,
      address: proxy,
      functionName: 'setDefaultVersion',
      args: [version],
    })
  }

  return { setDefault, hash: data, isPending, error, reset }
}
