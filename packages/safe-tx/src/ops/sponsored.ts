import { encodeFunctionData, type Address } from 'viem'
import type { AdminOp } from '../types.js'

/**
 * Admin operations specific to `IntuitionFeeProxyV2Sponsored` (the
 * sponsor-pool-funded variant). All gated by `onlyWhitelistedAdmin`.
 *
 * Note: `fundPool` is `external payable` and NOT admin-gated — anyone
 * can credit the sponsor pool — so it's not modelled as an AdminOp.
 */
const SPONSORED_ABI = [
  {
    type: 'function',
    name: 'setClaimLimits',
    inputs: [
      { name: 'maxPerTx', type: 'uint256' },
      { name: 'maxPerWindow', type: 'uint256' },
      { name: 'maxVolumePerWindow', type: 'uint256' },
      { name: 'windowSec', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'reclaimFromPool',
    inputs: [
      { name: 'amount', type: 'uint256' },
      { name: 'to', type: 'address' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const

export function setClaimLimits(
  proxy: Address,
  maxPerTx: bigint,
  maxPerWindow: bigint,
  maxVolumePerWindow: bigint,
  windowSec: bigint,
): AdminOp {
  return {
    to: proxy,
    value: 0n,
    data: encodeFunctionData({
      abi: SPONSORED_ABI,
      functionName: 'setClaimLimits',
      args: [maxPerTx, maxPerWindow, maxVolumePerWindow, windowSec],
    }),
    description: `setClaimLimits(maxPerTx=${maxPerTx}, maxPerWindow=${maxPerWindow}, maxVolumePerWindow=${maxVolumePerWindow}, windowSec=${windowSec}) on ${proxy}`,
  }
}

export function reclaimFromPool(
  proxy: Address,
  amount: bigint,
  to: Address,
): AdminOp {
  return {
    to: proxy,
    value: 0n,
    data: encodeFunctionData({
      abi: SPONSORED_ABI,
      functionName: 'reclaimFromPool',
      args: [amount, to],
    }),
    description: `reclaimFromPool(${amount} wei -> ${to}) on ${proxy}`,
  }
}
