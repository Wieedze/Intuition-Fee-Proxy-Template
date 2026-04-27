import { encodeFunctionData, type Address, type Hex } from 'viem'
import type { AdminOp } from '../types.js'

/**
 * Owner-only operations on IntuitionFeeProxyFactory (Ownable2Step).
 *
 * `transferOwnership` initiates rotation; the new owner must then call
 * `acceptOwnership` to complete it. When rotating ownership TO the
 * Safe, the Safe is the one that calls acceptOwnership.
 */
const FACTORY_OWNER_ABI = [
  {
    type: 'function',
    name: 'setImplementation',
    inputs: [
      { name: 'newImpl', type: 'address' },
      { name: 'newVersion', type: 'bytes32' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'setSponsoredImplementation',
    inputs: [
      { name: 'newImpl', type: 'address' },
      { name: 'newVersion', type: 'bytes32' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'transferOwnership',
    inputs: [{ name: 'newOwner', type: 'address' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'acceptOwnership',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const

export function setImplementation(
  factory: Address,
  newImpl: Address,
  newVersion: Hex,
): AdminOp {
  return {
    to: factory,
    value: 0n,
    data: encodeFunctionData({
      abi: FACTORY_OWNER_ABI,
      functionName: 'setImplementation',
      args: [newImpl, newVersion],
    }),
    description: `setImplementation(${newImpl}, ${newVersion}) on factory ${factory}`,
  }
}

export function setSponsoredImplementation(
  factory: Address,
  newImpl: Address,
  newVersion: Hex,
): AdminOp {
  return {
    to: factory,
    value: 0n,
    data: encodeFunctionData({
      abi: FACTORY_OWNER_ABI,
      functionName: 'setSponsoredImplementation',
      args: [newImpl, newVersion],
    }),
    description: `setSponsoredImplementation(${newImpl}, ${newVersion}) on factory ${factory}`,
  }
}

export function transferOwnership(factory: Address, newOwner: Address): AdminOp {
  return {
    to: factory,
    value: 0n,
    data: encodeFunctionData({
      abi: FACTORY_OWNER_ABI,
      functionName: 'transferOwnership',
      args: [newOwner],
    }),
    description: `transferOwnership(-> ${newOwner}) on factory ${factory}`,
  }
}

export function acceptOwnership(factory: Address): AdminOp {
  return {
    to: factory,
    value: 0n,
    data: encodeFunctionData({
      abi: FACTORY_OWNER_ABI,
      functionName: 'acceptOwnership',
      args: [],
    }),
    description: `acceptOwnership() on factory ${factory}`,
  }
}
