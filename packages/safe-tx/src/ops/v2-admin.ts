import { encodeFunctionData, type Address } from 'viem'
import type { AdminOp } from '../types.js'

/**
 * Admin operations exposed by IntuitionFeeProxyV2 (and inherited by the
 * Sponsored variant). All gated by `onlyWhitelistedAdmin`.
 */
const V2_ADMIN_ABI = [
  {
    type: 'function',
    name: 'setDepositFixedFee',
    inputs: [{ name: 'newFee', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'setDepositPercentageFee',
    inputs: [{ name: 'newFee', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'setWhitelistedAdmin',
    inputs: [
      { name: 'admin', type: 'address' },
      { name: 'status', type: 'bool' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'withdraw',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'withdrawAll',
    inputs: [{ name: 'to', type: 'address' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const

export function setDepositFixedFee(proxy: Address, newFee: bigint): AdminOp {
  return {
    to: proxy,
    value: 0n,
    data: encodeFunctionData({
      abi: V2_ADMIN_ABI,
      functionName: 'setDepositFixedFee',
      args: [newFee],
    }),
    description: `setDepositFixedFee(${newFee} wei) on ${proxy}`,
  }
}

export function setDepositPercentageFee(proxy: Address, newFeeBps: bigint): AdminOp {
  return {
    to: proxy,
    value: 0n,
    data: encodeFunctionData({
      abi: V2_ADMIN_ABI,
      functionName: 'setDepositPercentageFee',
      args: [newFeeBps],
    }),
    description: `setDepositPercentageFee(${newFeeBps} bps) on ${proxy}`,
  }
}

export function setWhitelistedAdmin(proxy: Address, admin: Address, status: boolean): AdminOp {
  return {
    to: proxy,
    value: 0n,
    data: encodeFunctionData({
      abi: V2_ADMIN_ABI,
      functionName: 'setWhitelistedAdmin',
      args: [admin, status],
    }),
    description: `setWhitelistedAdmin(${admin}, ${status}) on ${proxy}`,
  }
}

export function withdraw(proxy: Address, recipient: Address, amount: bigint): AdminOp {
  return {
    to: proxy,
    value: 0n,
    data: encodeFunctionData({
      abi: V2_ADMIN_ABI,
      functionName: 'withdraw',
      args: [recipient, amount],
    }),
    description: `withdraw(${amount} wei -> ${recipient}) on ${proxy}`,
  }
}

export function withdrawAll(proxy: Address, recipient: Address): AdminOp {
  return {
    to: proxy,
    value: 0n,
    data: encodeFunctionData({
      abi: V2_ADMIN_ABI,
      functionName: 'withdrawAll',
      args: [recipient],
    }),
    description: `withdrawAll(-> ${recipient}) on ${proxy}`,
  }
}
