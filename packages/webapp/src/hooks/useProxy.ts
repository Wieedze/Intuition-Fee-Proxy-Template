import { useReadContracts, useWriteContract } from 'wagmi'
import type { Address } from 'viem'

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
