import { useEffect, useState } from 'react'
import {
  useBlockNumber,
  usePublicClient,
  useReadContract,
  useReadContracts,
  useWriteContract,
} from 'wagmi'
import { getAddress, type Address } from 'viem'

import { IntuitionFeeProxyV2ABI } from '@intuition-fee-proxy/sdk'

const abi = IntuitionFeeProxyV2ABI as any

export type ProxyStats = {
  ethMultiVault: Address
  depositFixedFee: bigint
  depositPercentageFee: bigint
  accumulatedFees: bigint
  totalFeesCollectedAllTime: bigint
  adminCount: bigint
}

/** Batch-read the 6 headline stats for a proxy instance. */
export function useProxyStats(proxy: Address | undefined) {
  const base = { abi, address: proxy } as const
  const result = useReadContracts({
    contracts: [
      { ...base, functionName: 'ethMultiVault' },
      { ...base, functionName: 'depositFixedFee' },
      { ...base, functionName: 'depositPercentageFee' },
      { ...base, functionName: 'accumulatedFees' },
      { ...base, functionName: 'totalFeesCollectedAllTime' },
      { ...base, functionName: 'adminCount' },
    ],
    allowFailure: false,
    query: { enabled: Boolean(proxy) },
  })

  const stats: ProxyStats | undefined = result.data
    ? {
        ethMultiVault: result.data[0] as Address,
        depositFixedFee: result.data[1] as bigint,
        depositPercentageFee: result.data[2] as bigint,
        accumulatedFees: result.data[3] as bigint,
        totalFeesCollectedAllTime: result.data[4] as bigint,
        adminCount: result.data[5] as bigint,
      }
    : undefined

  return { ...result, stats }
}

export type ProxyMetrics = {
  totalAtomsCreated: bigint
  totalTriplesCreated: bigint
  totalDeposits: bigint
  totalVolume: bigint
  totalUniqueUsers: bigint
  lastActivityBlock: bigint
}

/** Read the aggregate on-chain metrics from the proxy. */
export function useProxyMetrics(proxy: Address | undefined) {
  const result = useReadContracts({
    contracts: [
      { abi, address: proxy, functionName: 'getMetrics' },
    ],
    allowFailure: true,
    query: { enabled: Boolean(proxy) },
  })

  const entry = result.data?.[0]
  const ok = entry && entry.status === 'success'
  const raw = ok
    ? (entry.result as {
        totalAtomsCreated: bigint
        totalTriplesCreated: bigint
        totalDeposits: bigint
        totalVolume: bigint
        totalUniqueUsers: bigint
        lastActivityBlock: bigint
      })
    : undefined

  const metrics: ProxyMetrics | undefined = raw
    ? {
        totalAtomsCreated: raw.totalAtomsCreated,
        totalTriplesCreated: raw.totalTriplesCreated,
        totalDeposits: raw.totalDeposits,
        totalVolume: raw.totalVolume,
        totalUniqueUsers: raw.totalUniqueUsers,
        lastActivityBlock: raw.lastActivityBlock,
      }
    : undefined

  const unsupported = entry && entry.status === 'failure'

  return { ...result, metrics, unsupported }
}

/** Check whether an address is a whitelisted admin on the given proxy. */
export function useIsAdmin(proxy: Address | undefined, account: Address | undefined) {
  const result = useReadContracts({
    contracts: [
      {
        abi,
        address: proxy,
        functionName: 'whitelistedAdmins',
        args: account ? [account] : undefined,
      },
    ],
    allowFailure: false,
    query: { enabled: Boolean(proxy && account) },
  })
  return {
    ...result,
    isAdmin: Boolean(result.data?.[0]),
  }
}

/**
 * Reconstruct the current set of whitelisted admins for a proxy by replaying
 * `AdminWhitelistUpdated(address,bool)` events. V2 doesn't store an enumerable
 * admin list on-chain (only a `mapping(address => bool)` + `adminCount`), so
 * we walk past logs and compute the net set client-side.
 */
export function useAdmins(proxy: Address | undefined) {
  const publicClient = usePublicClient()
  const { data: currentBlock } = useBlockNumber({ watch: true })
  const [admins, setAdmins] = useState<Address[]>([])
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
          name: 'AdminWhitelistUpdated',
          inputs: [
            { type: 'address', name: 'admin', indexed: true },
            { type: 'bool', name: 'status', indexed: false },
          ],
        },
        fromBlock: 0n,
        toBlock: currentBlock,
      })
      .then((logs) => {
        if (cancelled) return
        const set = new Set<string>()
        for (const log of logs) {
          const { admin, status } = (log as any).args as {
            admin: Address
            status: boolean
          }
          const a = getAddress(admin)
          if (status) set.add(a)
          else set.delete(a)
        }
        setAdmins(Array.from(set) as Address[])
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

  return { admins, isLoading, error, refetch: () => setRefreshKey((k) => k + 1) }
}

/** Write admin add/revoke. */
export function useSetWhitelistedAdmin(proxy: Address | undefined) {
  const { writeContractAsync, data, isPending, error, reset } = useWriteContract()

  function setAdmin(addr: Address, status: boolean) {
    if (!proxy) throw new Error('Proxy address missing')
    return writeContractAsync({
      abi,
      address: proxy,
      functionName: 'setWhitelistedAdmin',
      args: [addr, status],
    })
  }

  return { setAdmin, hash: data, isPending, error, reset }
}

/**
 * Detect which implementation family the proxy is currently pointed at.
 * Calls `version()` — present on V2Sponsored (returns e.g. "v2.0.0-sponsored"),
 * absent on V2 standard (call reverts). Revert → standard. String containing
 * "-sponsored" → sponsored. Anything else → unknown (future families).
 */
export type ProxyChannel = 'standard' | 'sponsored' | 'unknown'

export function useProxyChannel(proxy: Address | undefined): {
  channel: ProxyChannel
  version: string | null
  isLoading: boolean
} {
  const result = useReadContract({
    abi: [
      {
        type: 'function',
        name: 'version',
        stateMutability: 'pure',
        inputs: [],
        outputs: [{ type: 'string' }],
      },
    ],
    address: proxy,
    functionName: 'version',
    query: { enabled: Boolean(proxy), retry: false },
  })

  const version = (result.data as string | undefined) ?? null

  let channel: ProxyChannel
  if (result.isLoading) channel = 'standard' // optimistic placeholder while loading
  else if (result.error) channel = 'standard' // version() reverted → V2 standard
  else if (version && version.includes('-sponsored')) channel = 'sponsored'
  else channel = 'unknown'

  return { channel, version, isLoading: result.isLoading }
}

export function useWithdraw(proxy: Address | undefined) {
  const { writeContractAsync, data, isPending, error, reset } = useWriteContract()

  function withdraw(to: Address, amount: bigint) {
    if (!proxy) throw new Error('Proxy address missing')
    return writeContractAsync({
      abi,
      address: proxy,
      functionName: 'withdraw',
      args: [to, amount],
    })
  }

  function withdrawAll(to: Address) {
    if (!proxy) throw new Error('Proxy address missing')
    return writeContractAsync({
      abi,
      address: proxy,
      functionName: 'withdrawAll',
      args: [to],
    })
  }

  return { withdraw, withdrawAll, hash: data, isPending, error, reset }
}

// ============ Fee withdrawals log ============

export type FeeWithdrawal = {
  /** Recipient (from the event's `to` arg). */
  to: Address
  /** Amount withdrawn (wei). */
  amount: bigint
  /** Admin who triggered the withdraw (from the event's `by` arg). */
  by: Address
  /** Block number the tx landed in. */
  blockNumber: bigint
  /** Unix seconds (best-effort fetch, may be undefined). */
  timestamp: number | undefined
  /** Tx hash for explorer link. */
  txHash: `0x${string}`
  /** Log index in block. */
  logIndex: number
}

/**
 * Replays `FeesWithdrawn(to, amount, by)` events for a proxy. Public audit
 * trail of every admin-triggered withdraw. Applies to both channels —
 * sponsored proxies' accumulatedFees should always be 0 under B1 so the
 * list is typically empty, but if any accrued historically the events
 * still surface here.
 */
export function useFeeWithdrawals(proxy: Address | undefined): {
  withdrawals: FeeWithdrawal[]
  isLoading: boolean
  error: Error | null
  refetch: () => void
} {
  const publicClient = usePublicClient()
  const { data: currentBlock } = useBlockNumber({ watch: true })
  const [withdrawals, setWithdrawals] = useState<FeeWithdrawal[]>([])
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
          name: 'FeesWithdrawn',
          inputs: [
            { type: 'address', name: 'to', indexed: true },
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
          setWithdrawals([])
          setIsLoading(false)
          return
        }
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

        const entries: FeeWithdrawal[] = logs.map((log) => {
          const args = (log as any).args as {
            to: Address
            amount: bigint
            by: Address
          }
          return {
            to: args.to,
            amount: args.amount,
            by: args.by,
            blockNumber: log.blockNumber!,
            timestamp: blockMap.get(log.blockNumber!),
            txHash: log.transactionHash!,
            logIndex: log.logIndex ?? 0,
          }
        })
        entries.sort((a, b) => {
          if (a.blockNumber !== b.blockNumber)
            return Number(b.blockNumber - a.blockNumber)
          return b.logIndex - a.logIndex
        })
        setWithdrawals(entries)
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
    withdrawals,
    isLoading,
    error,
    refetch: () => setRefreshKey((k) => k + 1),
  }
}

export function useSetFees(proxy: Address | undefined) {
  const { writeContractAsync, data, isPending, error, reset } = useWriteContract()

  function setDepositFixedFee(newFee: bigint) {
    if (!proxy) throw new Error('Proxy address missing')
    return writeContractAsync({
      abi,
      address: proxy,
      functionName: 'setDepositFixedFee',
      args: [newFee],
    })
  }

  function setDepositPercentageFee(newFee: bigint) {
    if (!proxy) throw new Error('Proxy address missing')
    return writeContractAsync({
      abi,
      address: proxy,
      functionName: 'setDepositPercentageFee',
      args: [newFee],
    })
  }

  return {
    setDepositFixedFee,
    setDepositPercentageFee,
    hash: data,
    isPending,
    error,
    reset,
  }
}
