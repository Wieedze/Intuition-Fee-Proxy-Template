import { describe, expect, it } from 'vitest'
import { decodeFunctionData, encodeFunctionData, getAddress, toFunctionSelector } from 'viem'
import * as uups from '../../../src/ops/uups-upgrade.js'

const PROXY = getAddress('0xf10D442D0fB934D4037DC30769a6EfCf2f54F7B6')
const NEW_IMPL = getAddress('0x29fcB43b46531BcA003ddC8FCB67FFE91900C762')

const SELECTOR_UPGRADE = toFunctionSelector('upgradeToAndCall(address,bytes)')

const ABI = [
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

describe('uups upgradeToAndCall builder', () => {
  it('upgrade with empty initData defaults to 0x', () => {
    const op = uups.upgradeToAndCall(PROXY, NEW_IMPL)
    expect(op.to).toBe(PROXY)
    expect(op.value).toBe(0n)
    expect(op.data.slice(0, 10)).toBe(SELECTOR_UPGRADE)
    const decoded = decodeFunctionData({ abi: ABI, data: op.data })
    expect(decoded.functionName).toBe('upgradeToAndCall')
    expect(decoded.args).toEqual([NEW_IMPL, '0x'])
  })

  it('upgrade with initData encodes the trailing call payload', () => {
    const initCallData = encodeFunctionData({
      abi: [{ type: 'function', name: 'reinitialize', inputs: [{ type: 'uint8' }], outputs: [], stateMutability: 'nonpayable' }],
      functionName: 'reinitialize',
      args: [3],
    })
    const op = uups.upgradeToAndCall(PROXY, NEW_IMPL, initCallData)
    const decoded = decodeFunctionData({ abi: ABI, data: op.data })
    expect(decoded.args).toEqual([NEW_IMPL, initCallData])
    expect(op.description).toContain(initCallData)
  })

  it('description mentions upgradeToAndCall and proxy address', () => {
    const op = uups.upgradeToAndCall(PROXY, NEW_IMPL)
    expect(op.description).toContain('upgradeToAndCall')
    expect(op.description).toContain(PROXY)
    expect(op.description).toContain(NEW_IMPL)
  })
})
