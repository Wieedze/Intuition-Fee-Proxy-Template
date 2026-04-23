import { useEffect, useState } from 'react'
import {
  useBlockNumber,
  usePublicClient,
  useReadContracts,
  useWriteContract,
} from 'wagmi'
import type { Address } from 'viem'

import { IntuitionFeeProxyV2SponsoredABI } from '@intuition-fee-proxy/sdk'

const abi = IntuitionFeeProxyV2SponsoredABI as any

// ============ Claim limits ============

export type ClaimLimits = {
  maxClaimPerTx: bigint
  maxClaimsPerWindow: bigint
  maxClaimVolumePerWindow: bigint
  claimWindowSeconds: bigint
}

export function useClaimLimits(proxy: Address | undefined) {
  const result = useReadContracts({
    contracts: [
      { abi, address: proxy, functionName: 'maxClaimPerTx' },
      { abi, address: proxy, functionName: 'maxClaimsPerWindow' },
      { abi, address: proxy, functionName: 'maxClaimVolumePerWindow' },
      { abi, address: proxy, functionName: 'claimWindowSeconds' },
    ],
    allowFailure: true,
    query: { enabled: Boolean(proxy) },
  })

  const ok =
    result.data?.[0]?.status === 'success' &&
    result.data?.[1]?.status === 'success' &&
    result.data?.[2]?.status === 'success' &&
    result.data?.[3]?.status === 'success'

  const limits: ClaimLimits | undefined = ok
    ? {
        maxClaimPerTx: result.data![0].result as bigint,
        maxClaimsPerWindow: result.data![1].result as bigint,
        maxClaimVolumePerWindow: result.data![2].result as bigint,
        claimWindowSeconds: result.data![3].result as bigint,
      }
    : undefined

  return { ...result, limits }
}

export function useSetClaimLimits(proxy: Address | undefined) {
  const { writeContractAsync, data, isPending, error, reset } = useWriteContract()

  function setClaimLimits(
    maxPerTx: bigint,
    maxPerWindow: bigint,
    maxVolumePerWindow: bigint,
    windowSec: bigint,
  ) {
    if (!proxy) throw new Error('Proxy address missing')
    return writeContractAsync({
      abi,
      address: proxy,
      functionName: 'setClaimLimits',
      args: [maxPerTx, maxPerWindow, maxVolumePerWindow, windowSec],
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

// ============ Pool top-ups log ============

export type PoolTopUp = {
  /** Address that funded the pool (from the event's `by` arg). */
  funder: Address
  /** Amount in wei. */
  amount: bigint
  /** Block number the tx landed in. */
  blockNumber: bigint
  /** Unix seconds (filled in best-effort from the block — may be undefined if unresolved). */
  timestamp: number | undefined
  /** Tx hash, for explorer links. */
  txHash: `0x${string}`
  /** Log index within the block — tie-breaker for stable sort. */
  logIndex: number
}

export type PoolReclaim = {
  /** Address that received the refund (from the event's `to` arg). */
  to: Address
  /** Amount in wei. */
  amount: bigint
  /** Block number the reclaim tx landed in. */
  blockNumber: bigint
  /** Admin who initiated the reclaim. */
  by: Address
  /** Tx hash. */
  txHash: `0x${string}`
  /** Log index within the block. */
  logIndex: number
}

/**
 * A top-up augmented with its refund status. Computed client-side by
 * FIFO-matching PoolReclaimed events against PoolFunded events per funder:
 * the oldest un-refunded top-up from a funder is "consumed" first when a
 * reclaim to that address lands. A partial reclaim is not attributed to any
 * single top-up until enough cumulative reclaim equals that top-up's amount.
 */
export type PoolTopUpWithStatus = PoolTopUp & {
  refunded: boolean
  /** Tx hash of the reclaim that covered this top-up (undefined if not refunded). */
  refundTxHash?: `0x${string}`
}

/**
 * Replays `PoolFunded` events for a proxy and returns the list newest-first.
 * Timestamps are fetched in a best-effort second pass (one getBlock per unique
 * block). Large pools may want to paginate — here we read fromBlock = 0n for
 * simplicity, matching the size targets of a single sponsored proxy.
 */
export function usePoolTopUps(proxy: Address | undefined): {
  topUps: PoolTopUp[]
  isLoading: boolean
  error: Error | null
  refetch: () => void
} {
  const publicClient = usePublicClient()
  const { data: currentBlock } = useBlockNumber({ watch: true })
  const [topUps, setTopUps] = useState<PoolTopUp[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    if (!publicClient || !proxy || !currentBlock) return
    let cancelled = false
    setIsLoading(true)
    setError(null)

    publicClient
      .getLogs({
        address: proxy,
        event: {
          type: 'event',
          name: 'PoolFunded',
          inputs: [
            { type: 'uint256', name: 'amount', indexed: false },
            { type: 'address', name: 'by', indexed: true },
          ],
        },
        fromBlock: 0n,
        toBlock: currentBlock,
      })
      .then(async (logs) => {
        if (cancelled) return
        if (logs.length === 0) {
          setTopUps([])
          setIsLoading(false)
          return
        }

        // Deduplicate unique block numbers to minimize getBlock calls.
        const uniqueBlocks = Array.from(new Set(logs.map((l) => l.blockNumber!)))
        const blockMap = new Map<bigint, number>()
        await Promise.all(
          uniqueBlocks.map((bn) =>
            publicClient
              .getBlock({ blockNumber: bn })
              .then((b) => blockMap.set(bn, Number(b.timestamp)))
              .catch(() => {
                /* leave undefined */
              }),
          ),
        )
        if (cancelled) return

        const entries: PoolTopUp[] = logs.map((log) => {
          const args = (log as any).args as { amount: bigint; by: Address }
          return {
            funder: args.by,
            amount: args.amount,
            blockNumber: log.blockNumber!,
            timestamp: blockMap.get(log.blockNumber!),
            txHash: log.transactionHash!,
            logIndex: log.logIndex ?? 0,
          }
        })

        // Newest-first.
        entries.sort((a, b) => {
          if (a.blockNumber !== b.blockNumber)
            return Number(b.blockNumber - a.blockNumber)
          return b.logIndex - a.logIndex
        })

        setTopUps(entries)
        setIsLoading(false)
      })
      .catch((e) => {
        if (cancelled) return
        setError(e as Error)
        setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [publicClient, proxy, currentBlock ? Number(currentBlock) : 0, refreshKey])

  return {
    topUps,
    isLoading,
    error,
    refetch: () => setRefreshKey((k) => k + 1),
  }
}

/**
 * Replays `PoolReclaimed` events for a proxy. Same shape as usePoolTopUps but
 * for admin-side refunds.
 */
export function usePoolReclaims(proxy: Address | undefined): {
  reclaims: PoolReclaim[]
  isLoading: boolean
  error: Error | null
  refetch: () => void
} {
  const publicClient = usePublicClient()
  const { data: currentBlock } = useBlockNumber({ watch: true })
  const [reclaims, setReclaims] = useState<PoolReclaim[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    if (!publicClient || !proxy || !currentBlock) return
    let cancelled = false
    setIsLoading(true)
    setError(null)
    publicClient
      .getLogs({
        address: proxy,
        event: {
          type: 'event',
          name: 'PoolReclaimed',
          inputs: [
            { type: 'uint256', name: 'amount', indexed: false },
            { type: 'address', name: 'to', indexed: true },
            { type: 'address', name: 'by', indexed: true },
          ],
        },
        fromBlock: 0n,
        toBlock: currentBlock,
      })
      .then((logs) => {
        if (cancelled) return
        const entries: PoolReclaim[] = logs.map((log) => {
          const args = (log as any).args as {
            amount: bigint
            to: Address
            by: Address
          }
          return {
            to: args.to,
            amount: args.amount,
            by: args.by,
            blockNumber: log.blockNumber!,
            txHash: log.transactionHash!,
            logIndex: log.logIndex ?? 0,
          }
        })
        setReclaims(entries)
        setIsLoading(false)
      })
      .catch((e) => {
        if (cancelled) return
        setError(e as Error)
        setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [publicClient, proxy, currentBlock ? Number(currentBlock) : 0, refreshKey])

  return {
    reclaims,
    isLoading,
    error,
    refetch: () => setRefreshKey((k) => k + 1),
  }
}

/**
 * FIFO-match reclaims against top-ups per funder to decide which top-ups
 * are fully covered (= "refunded"). Per funder:
 *   - accumulate reclaim amounts to that address (in chronological order)
 *   - mark top-ups from that funder as refunded oldest-first, each consuming
 *     its full amount from the accumulator
 * Partial reclaims that don't cover a full top-up leave it un-refunded (no
 * partial badge). If a reclaim sends more than the sum of that funder's
 * top-ups, the excess is ignored for attribution purposes.
 *
 * Returned list preserves the input order (typically newest-first).
 */
export function matchRefunds(
  topUps: PoolTopUp[],
  reclaims: PoolReclaim[],
): PoolTopUpWithStatus[] {
  // 1. Sum reclaims per funder AND remember them oldest-first so we can attribute
  //    FIFO — paired later with top-ups sorted oldest-first.
  const reclaimsByFunder = new Map<string, PoolReclaim[]>()
  const sortedReclaims = [...reclaims].sort((a, b) => {
    const bn = Number(a.blockNumber - b.blockNumber)
    return bn !== 0 ? bn : a.logIndex - b.logIndex
  })
  for (const r of sortedReclaims) {
    const key = r.to.toLowerCase()
    const arr = reclaimsByFunder.get(key) ?? []
    arr.push(r)
    reclaimsByFunder.set(key, arr)
  }

  // 2. Group top-ups by funder, sorted oldest-first for FIFO attribution.
  const topUpsByFunder = new Map<string, PoolTopUp[]>()
  for (const t of topUps) {
    const key = t.funder.toLowerCase()
    const arr = topUpsByFunder.get(key) ?? []
    arr.push(t)
    topUpsByFunder.set(key, arr)
  }
  for (const arr of topUpsByFunder.values()) {
    arr.sort((a, b) => {
      const bn = Number(a.blockNumber - b.blockNumber)
      return bn !== 0 ? bn : a.logIndex - b.logIndex
    })
  }

  // 3. Walk each funder's top-ups oldest-first, consuming reclaim balance.
  const refundedTxByTopUp = new Map<string, `0x${string}`>() // key = `${blockNumber}-${logIndex}`
  for (const [funderKey, funderTopUps] of topUpsByFunder.entries()) {
    const funderReclaims = reclaimsByFunder.get(funderKey) ?? []
    // Flatten reclaim pool as a queue of (amount remaining, txHash) chunks.
    const reclaimQueue = funderReclaims.map((r) => ({
      remaining: r.amount,
      txHash: r.txHash,
    }))
    for (const t of funderTopUps) {
      let need = t.amount
      let coveringTx: `0x${string}` | undefined
      while (need > 0n && reclaimQueue.length > 0) {
        const chunk = reclaimQueue[0]
        if (chunk.remaining >= need) {
          chunk.remaining -= need
          need = 0n
          coveringTx = chunk.txHash
          if (chunk.remaining === 0n) reclaimQueue.shift()
        } else {
          // Chunk exhausted without fully covering — drop it and try the next.
          need -= chunk.remaining
          reclaimQueue.shift()
        }
      }
      if (need === 0n && coveringTx !== undefined) {
        const k = `${t.blockNumber}-${t.logIndex}`
        refundedTxByTopUp.set(k, coveringTx)
      }
    }
  }

  // 4. Produce the final list in the same order as the input (newest-first
  //    from usePoolTopUps).
  return topUps.map((t) => {
    const k = `${t.blockNumber}-${t.logIndex}`
    const refundTxHash = refundedTxByTopUp.get(k)
    return {
      ...t,
      refunded: refundTxHash !== undefined,
      refundTxHash,
    }
  })
}

// ============ Claim status + sponsored metrics ============

export type ClaimStatus = {
  claimsUsed: bigint
  volumeUsed: bigint
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
          const [claimsUsed, volumeUsed, windowResetsAt] = entry.result as [
            bigint,
            bigint,
            bigint,
          ]
          return { claimsUsed, volumeUsed, windowResetsAt }
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

// ============ Burn rate — 7d sliding window ============

export type PoolBurnStats = {
  /** Total TRUST consumed in the observed window. */
  burn: bigint
  /** Actual number of days the sample spans (≤ 7, lower if pool is young). */
  daysCovered: number
  /** TRUST per day (burn / daysCovered), or 0n if no activity yet. */
  ratePerDay: bigint
}

/// Over-estimates a 7-day window at 2s block time; over-fetches (but
/// post-filters by timestamp) on slower chains so it's always correct.
const APPROX_BLOCKS_7D = 302_400n

/**
 * Replays `CreditConsumed` logs to compute the pool's burn rate over a
 * sliding 7-day window. Uses linear block-time estimation (3 RPC calls
 * regardless of event count) instead of per-event timestamp lookups.
 */
export function usePoolBurnRate(proxy: Address | undefined): {
  stats: PoolBurnStats | undefined
  isLoading: boolean
  error: Error | null
  refetch: () => void
} {
  const publicClient = usePublicClient()
  const { data: currentBlock } = useBlockNumber({ watch: true })
  const [stats, setStats] = useState<PoolBurnStats | undefined>(undefined)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    if (!publicClient || !proxy || !currentBlock) return
    let cancelled = false
    setIsLoading(true)
    setError(null)

    const fromBlock =
      currentBlock > APPROX_BLOCKS_7D ? currentBlock - APPROX_BLOCKS_7D : 0n

    publicClient
      .getLogs({
        address: proxy,
        event: {
          type: 'event',
          name: 'CreditConsumed',
          inputs: [
            { type: 'address', name: 'user', indexed: true },
            { type: 'uint256', name: 'amount', indexed: false },
          ],
        },
        fromBlock,
        toBlock: currentBlock,
      })
      .then(async (logs) => {
        if (cancelled) return
        if (logs.length === 0) {
          setStats({ burn: 0n, daysCovered: 0, ratePerDay: 0n })
          setIsLoading(false)
          return
        }
        const [nowBlock, oldestLogBlock] = await Promise.all([
          publicClient.getBlock({ blockNumber: currentBlock }),
          publicClient.getBlock({ blockNumber: logs[0].blockNumber! }),
        ])
        if (cancelled) return

        const nowTs = Number(nowBlock.timestamp)
        const oldestTs = Number(oldestLogBlock.timestamp)
        const blockSpan = Number(currentBlock - logs[0].blockNumber!)
        const tsSpan = Math.max(1, nowTs - oldestTs)
        const blocksPerSec = blockSpan > 0 ? blockSpan / tsSpan : 0

        const sevenDaysAgoBlock =
          blocksPerSec > 0
            ? currentBlock -
              BigInt(Math.floor(7 * 86400 * blocksPerSec))
            : fromBlock

        let burn = 0n
        for (const log of logs) {
          if (log.blockNumber! >= sevenDaysAgoBlock) {
            burn += (log as any).args.amount as bigint
          }
        }

        const elapsedSec = BigInt(Math.max(1, nowTs - oldestTs))
        const ratePerDay = (burn * 86_400n) / elapsedSec
        const daysCovered = Math.min(7, (nowTs - oldestTs) / 86_400)

        setStats({ burn, daysCovered, ratePerDay })
        setIsLoading(false)
      })
      .catch((e) => {
        if (cancelled) return
        setError(e as Error)
        setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [publicClient, proxy, currentBlock ? Number(currentBlock) : 0, refreshKey])

  return { stats, isLoading, error, refetch: () => setRefreshKey((k) => k + 1) }
}
