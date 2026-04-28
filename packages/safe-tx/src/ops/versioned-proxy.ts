import { encodeFunctionData, type Address, type Hex } from 'viem'
import type { AdminOp } from '../types.js'

/**
 * Role 1 (proxyAdmin) operations on `IntuitionVersionedFeeProxy`.
 *
 * `transferProxyAdmin` is 2-step: it sets `pendingProxyAdmin`, the
 * target then has to call `acceptProxyAdmin` from their own wallet
 * (or via their Safe propose flow if they're a Safe) to finalize.
 */
const VERSIONED_PROXY_ABI = [
  {
    type: 'function',
    name: 'transferProxyAdmin',
    inputs: [{ name: 'newAdmin', type: 'address' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'acceptProxyAdmin',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'registerVersion',
    inputs: [
      { name: 'version', type: 'bytes32' },
      { name: 'implementation', type: 'address' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'setDefaultVersion',
    inputs: [{ name: 'version', type: 'bytes32' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const

export function transferProxyAdmin(proxy: Address, newAdmin: Address): AdminOp {
  return {
    to: proxy,
    value: 0n,
    data: encodeFunctionData({
      abi: VERSIONED_PROXY_ABI,
      functionName: 'transferProxyAdmin',
      args: [newAdmin],
    }),
    description: `transferProxyAdmin(-> ${newAdmin}) on proxy ${proxy}`,
  }
}

export function acceptProxyAdmin(proxy: Address): AdminOp {
  return {
    to: proxy,
    value: 0n,
    data: encodeFunctionData({
      abi: VERSIONED_PROXY_ABI,
      functionName: 'acceptProxyAdmin',
      args: [],
    }),
    description: `acceptProxyAdmin() on proxy ${proxy}`,
  }
}

export function registerVersion(
  proxy: Address,
  version: Hex,
  implementation: Address,
): AdminOp {
  return {
    to: proxy,
    value: 0n,
    data: encodeFunctionData({
      abi: VERSIONED_PROXY_ABI,
      functionName: 'registerVersion',
      args: [version, implementation],
    }),
    description: `registerVersion(${version}, ${implementation}) on proxy ${proxy}`,
  }
}

export function setDefaultVersion(proxy: Address, version: Hex): AdminOp {
  return {
    to: proxy,
    value: 0n,
    data: encodeFunctionData({
      abi: VERSIONED_PROXY_ABI,
      functionName: 'setDefaultVersion',
      args: [version],
    }),
    description: `setDefaultVersion(${version}) on proxy ${proxy}`,
  }
}
