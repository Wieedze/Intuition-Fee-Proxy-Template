import { encodeFunctionData, type Address, type Hex } from 'viem'
import type { AdminOp } from '../types.js'

/**
 * Role 1 (proxyAdmin) operations on `IntuitionVersionedFeeProxy`.
 *
 * Role 1 is a whitelist (post 2-step retirement) — `setProxyAdmin`
 * grants or revokes instantly. The contract enforces idempotent
 * reject + last-admin guard.
 *
 * `registerVersion` and `setDefaultVersion` are the version-registry
 * mutators — they live on the same role-1 surface so the same admins
 * that rotate the whitelist also manage the implementation directory.
 */
const VERSIONED_PROXY_ABI = [
  {
    type: 'function',
    name: 'setProxyAdmin',
    inputs: [
      { name: 'admin', type: 'address' },
      { name: 'status', type: 'bool' },
    ],
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

export function setProxyAdmin(
  proxy: Address,
  admin: Address,
  status: boolean,
): AdminOp {
  return {
    to: proxy,
    value: 0n,
    data: encodeFunctionData({
      abi: VERSIONED_PROXY_ABI,
      functionName: 'setProxyAdmin',
      args: [admin, status],
    }),
    description: `setProxyAdmin(${admin}, ${status}) on ${proxy}`,
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
