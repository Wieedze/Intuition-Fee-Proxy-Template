import { useReadContracts, useWriteContract } from 'wagmi'
import type { Address } from 'viem'

import { IntuitionFeeProxyV2SponsoredABI } from '@intuition-fee-proxy/sdk'

const abi = IntuitionFeeProxyV2SponsoredABI as any

// ============ Claim limits ============

export type ClaimLimits = {
  maxClaimPerTx: bigint
  maxClaimsPerDay: bigint
}

export function useClaimLimits(proxy: Address | undefined) {
  const result = useReadContracts({
    contracts: [
      { abi, address: proxy, functionName: 'maxClaimPerTx' },
      { abi, address: proxy, functionName: 'maxClaimsPerDay' },
    ],
    allowFailure: true,
    query: { enabled: Boolean(proxy) },
  })

  const ok =
    result.data?.[0]?.status === 'success' &&
    result.data?.[1]?.status === 'success'

  const limits: ClaimLimits | undefined = ok
    ? {
        maxClaimPerTx: result.data![0].result as bigint,
        maxClaimsPerDay: result.data![1].result as bigint,
      }
    : undefined

  return { ...result, limits }
}

export function useSetClaimLimits(proxy: Address | undefined) {
  const { writeContractAsync, data, isPending, error, reset } = useWriteContract()

  function setClaimLimits(maxPerTx: bigint, maxPerDay: bigint) {
    if (!proxy) throw new Error('Proxy address missing')
    return writeContractAsync({
      abi,
      address: proxy,
      functionName: 'setClaimLimits',
      args: [maxPerTx, maxPerDay],
    })
  }

  return { setClaimLimits, hash: data, isPending, error, reset }
}

// ============ Credit pool ============

export type SponsoredPool = {
  totalSponsoredCredit: bigint
}

export function useSponsoredPool(proxy: Address | undefined) {
  const result = useReadContracts({
    contracts: [
      { abi, address: proxy, functionName: 'totalSponsoredCredit' },
    ],
    allowFailure: true,
    query: { enabled: Boolean(proxy) },
  })

  const entry = result.data?.[0]
  const pool: SponsoredPool | undefined =
    entry?.status === 'success'
      ? { totalSponsoredCredit: entry.result as bigint }
      : undefined

  return { ...result, pool }
}

export function useUserCredit(proxy: Address | undefined, user: Address | undefined) {
  const result = useReadContracts({
    contracts: [
      {
        abi,
        address: proxy,
        functionName: 'sponsoredCredit',
        args: user ? [user] : undefined,
      },
    ],
    allowFailure: true,
    query: { enabled: Boolean(proxy && user) },
  })

  const entry = result.data?.[0]
  const credit: bigint | undefined =
    entry?.status === 'success' ? (entry.result as bigint) : undefined

  return { ...result, credit }
}

export function useCreditUser(proxy: Address | undefined) {
  const { writeContractAsync, data, isPending, error, reset } = useWriteContract()

  function credit(user: Address, amount: bigint) {
    if (!proxy) throw new Error('Proxy address missing')
    return writeContractAsync({
      abi,
      address: proxy,
      functionName: 'creditUser',
      args: [user],
      value: amount,
    })
  }

  return { credit, hash: data, isPending, error, reset }
}

export function useCreditUsers(proxy: Address | undefined) {
  const { writeContractAsync, data, isPending, error, reset } = useWriteContract()

  function creditMany(users: Address[], amounts: bigint[]) {
    if (!proxy) throw new Error('Proxy address missing')
    const total = amounts.reduce((s, a) => s + a, 0n)
    return writeContractAsync({
      abi,
      address: proxy,
      functionName: 'creditUsers',
      args: [users, amounts],
      value: total,
    })
  }

  return { creditMany, hash: data, isPending, error, reset }
}

export function useUncreditUser(proxy: Address | undefined) {
  const { writeContractAsync, data, isPending, error, reset } = useWriteContract()

  function uncredit(user: Address, amount: bigint, to: Address) {
    if (!proxy) throw new Error('Proxy address missing')
    return writeContractAsync({
      abi,
      address: proxy,
      functionName: 'uncreditUser',
      args: [user, amount, to],
    })
  }

  return { uncredit, hash: data, isPending, error, reset }
}

// ============ Claim status + sponsored metrics ============

export type ClaimStatus = {
  claimsUsed: bigint
  windowResetsAt: bigint
}

export function useClaimStatus(proxy: Address | undefined, user: Address | undefined) {
  const result = useReadContracts({
    contracts: [
      {
        abi,
        address: proxy,
        functionName: 'getClaimStatus',
        args: user ? [user] : undefined,
      },
    ],
    allowFailure: true,
    query: { enabled: Boolean(proxy && user) },
  })

  const entry = result.data?.[0]
  const status: ClaimStatus | undefined =
    entry?.status === 'success'
      ? (() => {
          const [claimsUsed, windowResetsAt] = entry.result as [bigint, bigint]
          return { claimsUsed, windowResetsAt }
        })()
      : undefined

  return { ...result, status }
}

export type SponsoredMetrics = {
  sponsoredDeposits: bigint
  sponsoredVolume: bigint
  uniqueSponsoredReceivers: bigint
}

export function useSponsoredMetrics(proxy: Address | undefined) {
  const result = useReadContracts({
    contracts: [
      { abi, address: proxy, functionName: 'getSponsoredMetrics' },
    ],
    allowFailure: true,
    query: { enabled: Boolean(proxy) },
  })

  const entry = result.data?.[0]
  const metrics: SponsoredMetrics | undefined =
    entry?.status === 'success'
      ? (() => {
          const [a, b, c] = entry.result as [bigint, bigint, bigint]
          return {
            sponsoredDeposits: a,
            sponsoredVolume: b,
            uniqueSponsoredReceivers: c,
          }
        })()
      : undefined

  return { ...result, metrics }
}
