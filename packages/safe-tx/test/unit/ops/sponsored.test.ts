import { describe, expect, it } from 'vitest'
import { decodeFunctionData, getAddress, toFunctionSelector } from 'viem'
import * as sponsored from '../../../src/ops/sponsored.js'

const PROXY = getAddress('0xf10D442D0fB934D4037DC30769a6EfCf2f54F7B6')
const RECIPIENT = getAddress('0xc634457aD68b037E2D5aA1C10c3930d7e4E2d551')

const SELECTOR_SET_LIMITS = toFunctionSelector(
  'setClaimLimits(uint256,uint256,uint256,uint256)',
)
const SELECTOR_RECLAIM = toFunctionSelector('reclaimFromPool(uint256,address)')

const ABI = [
  {
    type: 'function',
    name: 'setClaimLimits',
    inputs: [
      { type: 'uint256' },
      { type: 'uint256' },
      { type: 'uint256' },
      { type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'reclaimFromPool',
    inputs: [{ type: 'uint256' }, { type: 'address' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const

describe('sponsored AdminOp builders', () => {
  it('setClaimLimits encodes 4 uint256 args in order', () => {
    const op = sponsored.setClaimLimits(
      PROXY,
      10n ** 18n, // maxPerTx
      10n,        // maxPerWindow
      10n ** 19n, // maxVolumePerWindow
      3600n,      // windowSec
    )
    expect(op.to).toBe(PROXY)
    expect(op.value).toBe(0n)
    expect(op.data.slice(0, 10)).toBe(SELECTOR_SET_LIMITS)
    const decoded = decodeFunctionData({ abi: ABI, data: op.data })
    expect(decoded.functionName).toBe('setClaimLimits')
    expect(decoded.args).toEqual([10n ** 18n, 10n, 10n ** 19n, 3600n])
  })

  it('reclaimFromPool encodes (amount, to)', () => {
    const op = sponsored.reclaimFromPool(PROXY, 5n * 10n ** 18n, RECIPIENT)
    expect(op.data.slice(0, 10)).toBe(SELECTOR_RECLAIM)
    const decoded = decodeFunctionData({ abi: ABI, data: op.data })
    expect(decoded.functionName).toBe('reclaimFromPool')
    expect(decoded.args).toEqual([5n * 10n ** 18n, RECIPIENT])
  })

  it('description includes recipient + amount for traceability', () => {
    const op = sponsored.reclaimFromPool(PROXY, 1n, RECIPIENT)
    expect(op.description).toContain(RECIPIENT)
    expect(op.description).toContain('1 wei')
  })
})
