import { useReadContract, useReadContracts, useWriteContract } from 'wagmi'
import { hexToString, stringToHex, type Address, type Hex } from 'viem'

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

/** Read the proxy's human-readable name (bytes32, decoded to string). */
export function useProxyName(proxy: Address | undefined) {
  const result = useReadContract({
    abi,
    address: proxy,
    functionName: 'getName',
    query: { enabled: Boolean(proxy) },
  })

  const raw = result.data as Hex | undefined
  const name = (() => {
    if (!raw) return ''
    try {
      return hexToString(raw, { size: 32 }).replace(/\0+$/, '')
    } catch {
      return ''
    }
  })()

  const unsupported = Boolean(result.error)

  return { ...result, name, unsupported }
}

export function useSetProxyName(proxy: Address | undefined) {
  const { writeContractAsync, data, isPending, error, reset } = useWriteContract()

  function setName(newName: string) {
    if (!proxy) throw new Error('Proxy address missing')
    const bytes: Hex = newName
      ? stringToHex(newName, { size: 32 })
      : '0x0000000000000000000000000000000000000000000000000000000000000000'
    return writeContractAsync({
      abi,
      address: proxy,
      functionName: 'setName',
      args: [bytes],
    })
  }

  return { setName, hash: data, isPending, error, reset }
}
