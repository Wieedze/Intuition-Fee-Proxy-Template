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
      { abi, address: proxy, functionName: 'pendingProxyAdmin' },
    ],
    allowFailure: false,
    query: {
      enabled: Boolean(proxy),
      // Auto-poll so `proxyAdmin` / `pendingProxyAdmin` reflect
      // acceptance that happens from another wallet or tab without
      // forcing the user to refresh.
      refetchInterval: 10_000,
    },
  })

  return {
    ...result,
    versions: (result.data?.[0] as Hex[] | undefined) ?? [],
    defaultVersion: result.data?.[1] as Hex | undefined,
    proxyAdmin: result.data?.[2] as Address | undefined,
    pendingProxyAdmin: result.data?.[3] as Address | undefined,
  }
}

/**
 * Cheap 1-read hook for pages that only need the currently-active version
 * label (Explore card, etc.). Avoids the 3-read overhead of
 * `useProxyVersions` when the versions list / proxyAdmin aren't needed.
 *
 * Decodes the bytes32 to a human-readable label ("v2.0.0"). Empty string
 * if the proxy has no default set yet (shouldn't happen — Factory always
 * registers the initial version).
 */
export function useProxyDefaultVersion(proxy: Address | undefined) {
  const result = useReadContract({
    abi,
    address: proxy,
    functionName: 'getDefaultVersion',
    query: { enabled: Boolean(proxy) },
  })

  const raw = result.data as Hex | undefined
  let label: string | undefined
  if (raw) {
    try {
      label = hexToString(raw, { size: 32 }).replace(/\0+$/, '') || undefined
    } catch {
      label = undefined
    }
  }

  return { ...result, defaultVersion: raw, label }
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

/**
 * Step 1 of the 2-step proxy-admin transfer. Only callable by the current
 * `proxyAdmin`. Sets `pendingProxyAdmin = newAdmin`; the target must then
 * call `acceptProxyAdmin()` from their own wallet to finalise. Passing a
 * wrong address is recoverable — just call again with the correct one.
 */
export function useTransferProxyAdmin(proxy: Address | undefined) {
  const { writeContractAsync, data, isPending, error, reset } = useWriteContract()

  function transferAdmin(newAdmin: Address) {
    if (!proxy) throw new Error('Proxy address missing')
    return writeContractAsync({
      abi,
      address: proxy,
      functionName: 'transferProxyAdmin',
      args: [newAdmin],
    })
  }

  return { transferAdmin, hash: data, isPending, error, reset }
}

/**
 * Step 2 of the 2-step proxy-admin transfer. Must be called by the address
 * currently set as `pendingProxyAdmin`. Promotes caller to `proxyAdmin`.
 */
export function useAcceptProxyAdmin(proxy: Address | undefined) {
  const { writeContractAsync, data, isPending, error, reset } = useWriteContract()

  function acceptAdmin() {
    if (!proxy) throw new Error('Proxy address missing')
    return writeContractAsync({
      abi,
      address: proxy,
      functionName: 'acceptProxyAdmin',
    })
  }

  return { acceptAdmin, hash: data, isPending, error, reset }
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
