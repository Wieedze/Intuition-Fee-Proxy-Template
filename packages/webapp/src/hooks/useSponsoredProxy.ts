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

// ============ Sponsor pool ============

export function useSponsorPool(proxy: Address | undefined) {
  const result = useReadContracts({
    contracts: [{ abi, address: proxy, functionName: 'sponsorPool' }],
    allowFailure: true,
    query: { enabled: Boolean(proxy) },
  })

  const entry = result.data?.[0]
  const balance: bigint | undefined =
    entry?.status === 'success' ? (entry.result as bigint) : undefined

  return { ...result, balance }
}

export function useFundPool(proxy: Address | undefined) {
  const { writeContractAsync, data, isPending, error, reset } = useWriteContract()

  function fund(amount: bigint) {
    if (!proxy) throw new Error('Proxy address missing')
    return writeContractAsync({
      abi,
      address: proxy,
      functionName: 'fundPool',
      args: [],
      value: amount,
    })
  }

  return { fund, hash: data, isPending, error, reset }
}

export function useReclaimFromPool(proxy: Address | undefined) {
  const { writeContractAsync, data, isPending, error, reset } = useWriteContract()

  function reclaim(amount: bigint, to: Address) {
    if (!proxy) throw new Error('Proxy address missing')
    return writeContractAsync({
      abi,
      address: proxy,
      functionName: 'reclaimFromPool',
      args: [amount, to],
    })
  }

  return { reclaim, hash: data, isPending, error, reset }
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
