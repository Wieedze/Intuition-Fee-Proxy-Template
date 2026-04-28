import { describe, expect, it } from 'vitest'
import { decodeFunctionData, getAddress, stringToHex, toFunctionSelector } from 'viem'
import * as factory from '../../../src/ops/factory.js'

const FACTORY = getAddress('0xC22834581EbC8527d974F8a1c97E1bEA4EF910BC')
const NEW_IMPL = getAddress('0x29fcB43b46531BcA003ddC8FCB67FFE91900C762')
const NEW_OWNER = getAddress('0xf10D442D0fB934D4037DC30769a6EfCf2f54F7B6')
const VERSION_BYTES32 = stringToHex('v3.0.0', { size: 32 })

const SELECTOR_SET_IMPL = toFunctionSelector('setImplementation(address,bytes32)')
const SELECTOR_SET_SP_IMPL = toFunctionSelector('setSponsoredImplementation(address,bytes32)')
const SELECTOR_TRANSFER = toFunctionSelector('transferOwnership(address)')
const SELECTOR_ACCEPT = toFunctionSelector('acceptOwnership()')

const ABI = [
  { type: 'function', name: 'setImplementation', inputs: [{ type: 'address' }, { type: 'bytes32' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'setSponsoredImplementation', inputs: [{ type: 'address' }, { type: 'bytes32' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'transferOwnership', inputs: [{ type: 'address' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'acceptOwnership', inputs: [], outputs: [], stateMutability: 'nonpayable' },
] as const

describe('factory AdminOp builders', () => {
  it('setImplementation', () => {
    const op = factory.setImplementation(FACTORY, NEW_IMPL, VERSION_BYTES32)
    expect(op.to).toBe(FACTORY)
    expect(op.value).toBe(0n)
    expect(op.data.slice(0, 10)).toBe(SELECTOR_SET_IMPL)
    const decoded = decodeFunctionData({ abi: ABI, data: op.data })
    expect(decoded.functionName).toBe('setImplementation')
    expect(decoded.args).toEqual([NEW_IMPL, VERSION_BYTES32])
  })

  it('setSponsoredImplementation', () => {
    const op = factory.setSponsoredImplementation(FACTORY, NEW_IMPL, VERSION_BYTES32)
    expect(op.data.slice(0, 10)).toBe(SELECTOR_SET_SP_IMPL)
    const decoded = decodeFunctionData({ abi: ABI, data: op.data })
    expect(decoded.functionName).toBe('setSponsoredImplementation')
    expect(decoded.args).toEqual([NEW_IMPL, VERSION_BYTES32])
  })

  it('transferOwnership', () => {
    const op = factory.transferOwnership(FACTORY, NEW_OWNER)
    expect(op.data.slice(0, 10)).toBe(SELECTOR_TRANSFER)
    const decoded = decodeFunctionData({ abi: ABI, data: op.data })
    expect(decoded.functionName).toBe('transferOwnership')
    expect(decoded.args).toEqual([NEW_OWNER])
  })

  it('acceptOwnership (no args, selector only)', () => {
    const op = factory.acceptOwnership(FACTORY)
    expect(op.data).toBe(SELECTOR_ACCEPT)
    expect(op.data.length).toBe(10)
    const decoded = decodeFunctionData({ abi: ABI, data: op.data })
    expect(decoded.functionName).toBe('acceptOwnership')
    // viem returns args === undefined for no-input functions (not [])
    expect(decoded.args ?? []).toEqual([])
  })

  it('all builders target the factory address with value 0n', () => {
    const ops = [
      factory.setImplementation(FACTORY, NEW_IMPL, VERSION_BYTES32),
      factory.setSponsoredImplementation(FACTORY, NEW_IMPL, VERSION_BYTES32),
      factory.transferOwnership(FACTORY, NEW_OWNER),
      factory.acceptOwnership(FACTORY),
    ]
    for (const op of ops) {
      expect(op.to).toBe(FACTORY)
      expect(op.value).toBe(0n)
      expect(op.description.length).toBeGreaterThan(0)
    }
  })
})
