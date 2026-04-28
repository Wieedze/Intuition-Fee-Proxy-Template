import { encodeFunctionData, type Address, type Hex } from 'viem'
import type { AdminOp } from '../types.js'

/**
 * UUPS upgrade entrypoint exposed by ERC1967-based upgradeable proxies
 * (OpenZeppelin UUPSUpgradeable). Gated by `_authorizeUpgrade` on the
 * implementation — for IntuitionFeeProxyV2 this is `onlyWhitelistedAdmin`,
 * for the Factory this is `onlyOwner`.
 *
 * `initData` is appended to the upgrade call. Pass `0x` to skip
 * post-upgrade initialization, or the encoded calldata of an init
 * function (e.g., `initializeV3()`) to run it atomically with the
 * implementation swap.
 */
const UUPS_ABI = [
  {
    type: 'function',
    name: 'upgradeToAndCall',
    inputs: [
      { name: 'newImplementation', type: 'address' },
      { name: 'data', type: 'bytes' },
    ],
    outputs: [],
    stateMutability: 'payable',
  },
] as const

export function upgradeToAndCall(proxy: Address, newImpl: Address, initData: Hex = '0x'): AdminOp {
  return {
    to: proxy,
    value: 0n,
    data: encodeFunctionData({
      abi: UUPS_ABI,
      functionName: 'upgradeToAndCall',
      args: [newImpl, initData],
    }),
    description: `upgradeToAndCall(${newImpl}, initData=${initData}) on proxy ${proxy}`,
  }
}
