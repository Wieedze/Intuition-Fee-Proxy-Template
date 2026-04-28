import { describe, expect, it } from 'vitest'
import { decodeFunctionData, getAddress, toFunctionSelector } from 'viem'
import * as v2 from '../../../src/ops/v2-admin.js'

const PROXY = getAddress('0xf10D442D0fB934D4037DC30769a6EfCf2f54F7B6')
const ADMIN = getAddress('0xc634457aD68b037E2D5aA1C10c3930d7e4E2d551')

const SELECTOR_SET_FIXED = toFunctionSelector('setDepositFixedFee(uint256)')
const SELECTOR_SET_PCT = toFunctionSelector('setDepositPercentageFee(uint256)')
const SELECTOR_SET_ADMIN = toFunctionSelector('setWhitelistedAdmin(address,bool)')
const SELECTOR_WITHDRAW = toFunctionSelector('withdraw(address,uint256)')
const SELECTOR_WITHDRAW_ALL = toFunctionSelector('withdrawAll(address)')

const ABI = [
  { type: 'function', name: 'setDepositFixedFee', inputs: [{ type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'setDepositPercentageFee', inputs: [{ type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'setWhitelistedAdmin', inputs: [{ type: 'address' }, { type: 'bool' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'withdraw', inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'withdrawAll', inputs: [{ type: 'address' }], outputs: [], stateMutability: 'nonpayable' },
] as const

describe('v2-admin AdminOp builders', () => {
  it('setDepositFixedFee', () => {
    const op = v2.setDepositFixedFee(PROXY, 100n)
    expect(op.to).toBe(PROXY)
    expect(op.value).toBe(0n)
    expect(op.data.slice(0, 10)).toBe(SELECTOR_SET_FIXED)
    expect(op.description).toContain('setDepositFixedFee')
    const decoded = decodeFunctionData({ abi: ABI, data: op.data })
    expect(decoded.functionName).toBe('setDepositFixedFee')
    expect(decoded.args).toEqual([100n])
  })

  it('setDepositPercentageFee', () => {
    const op = v2.setDepositPercentageFee(PROXY, 250n)
    expect(op.data.slice(0, 10)).toBe(SELECTOR_SET_PCT)
    expect(op.description).toContain('250 bps')
    const decoded = decodeFunctionData({ abi: ABI, data: op.data })
    expect(decoded.functionName).toBe('setDepositPercentageFee')
    expect(decoded.args).toEqual([250n])
  })

  it('setWhitelistedAdmin true', () => {
    const op = v2.setWhitelistedAdmin(PROXY, ADMIN, true)
    expect(op.data.slice(0, 10)).toBe(SELECTOR_SET_ADMIN)
    const decoded = decodeFunctionData({ abi: ABI, data: op.data })
    expect(decoded.functionName).toBe('setWhitelistedAdmin')
    expect(decoded.args).toEqual([ADMIN, true])
  })

  it('setWhitelistedAdmin false', () => {
    const op = v2.setWhitelistedAdmin(PROXY, ADMIN, false)
    const decoded = decodeFunctionData({ abi: ABI, data: op.data })
    expect(decoded.args).toEqual([ADMIN, false])
  })

  it('withdraw', () => {
    const op = v2.withdraw(PROXY, ADMIN, 10n ** 18n)
    expect(op.data.slice(0, 10)).toBe(SELECTOR_WITHDRAW)
    const decoded = decodeFunctionData({ abi: ABI, data: op.data })
    expect(decoded.functionName).toBe('withdraw')
    expect(decoded.args).toEqual([ADMIN, 10n ** 18n])
  })

  it('withdrawAll', () => {
    const op = v2.withdrawAll(PROXY, ADMIN)
    expect(op.data.slice(0, 10)).toBe(SELECTOR_WITHDRAW_ALL)
    const decoded = decodeFunctionData({ abi: ABI, data: op.data })
    expect(decoded.functionName).toBe('withdrawAll')
    expect(decoded.args).toEqual([ADMIN])
  })

  it('all builders set value to 0n (no ETH transfer)', () => {
    const ops = [
      v2.setDepositFixedFee(PROXY, 1n),
      v2.setDepositPercentageFee(PROXY, 1n),
      v2.setWhitelistedAdmin(PROXY, ADMIN, true),
      v2.withdraw(PROXY, ADMIN, 1n),
      v2.withdrawAll(PROXY, ADMIN),
    ]
    for (const op of ops) {
      expect(op.value).toBe(0n)
      expect(op.to).toBe(PROXY)
    }
  })
})
