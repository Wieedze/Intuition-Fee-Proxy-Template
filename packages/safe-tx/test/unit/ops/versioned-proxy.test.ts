import { describe, expect, it } from 'vitest'
import { decodeFunctionData, getAddress, stringToHex, toFunctionSelector } from 'viem'
import * as vp from '../../../src/ops/versioned-proxy.js'

const PROXY = getAddress('0xf10D442D0fB934D4037DC30769a6EfCf2f54F7B6')
const ADMIN = getAddress('0xc634457aD68b037E2D5aA1C10c3930d7e4E2d551')
const NEW_IMPL = getAddress('0x29fcB43b46531BcA003ddC8FCB67FFE91900C762')
const VERSION_BYTES32 = stringToHex('v3.0.0', { size: 32 })

const SELECTOR_SET_PROXY_ADMIN = toFunctionSelector('setProxyAdmin(address,bool)')
const SELECTOR_REGISTER = toFunctionSelector('registerVersion(bytes32,address)')
const SELECTOR_SET_DEFAULT = toFunctionSelector('setDefaultVersion(bytes32)')

const ABI = [
  { type: 'function', name: 'setProxyAdmin', inputs: [{ type: 'address' }, { type: 'bool' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'registerVersion', inputs: [{ type: 'bytes32' }, { type: 'address' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'setDefaultVersion', inputs: [{ type: 'bytes32' }], outputs: [], stateMutability: 'nonpayable' },
] as const

describe('versioned-proxy AdminOp builders', () => {
  it('setProxyAdmin grant', () => {
    const op = vp.setProxyAdmin(PROXY, ADMIN, true)
    expect(op.to).toBe(PROXY)
    expect(op.value).toBe(0n)
    expect(op.data.slice(0, 10)).toBe(SELECTOR_SET_PROXY_ADMIN)
    expect(op.description).toContain('setProxyAdmin')
    const decoded = decodeFunctionData({ abi: ABI, data: op.data })
    expect(decoded.functionName).toBe('setProxyAdmin')
    expect(decoded.args).toEqual([ADMIN, true])
  })

  it('setProxyAdmin revoke', () => {
    const op = vp.setProxyAdmin(PROXY, ADMIN, false)
    const decoded = decodeFunctionData({ abi: ABI, data: op.data })
    expect(decoded.args).toEqual([ADMIN, false])
  })

  it('registerVersion', () => {
    const op = vp.registerVersion(PROXY, VERSION_BYTES32, NEW_IMPL)
    expect(op.data.slice(0, 10)).toBe(SELECTOR_REGISTER)
    const decoded = decodeFunctionData({ abi: ABI, data: op.data })
    expect(decoded.functionName).toBe('registerVersion')
    expect(decoded.args).toEqual([VERSION_BYTES32, NEW_IMPL])
  })

  it('setDefaultVersion', () => {
    const op = vp.setDefaultVersion(PROXY, VERSION_BYTES32)
    expect(op.data.slice(0, 10)).toBe(SELECTOR_SET_DEFAULT)
    const decoded = decodeFunctionData({ abi: ABI, data: op.data })
    expect(decoded.functionName).toBe('setDefaultVersion')
    expect(decoded.args).toEqual([VERSION_BYTES32])
  })

  it('all builders target the proxy address with value 0n', () => {
    const ops = [
      vp.setProxyAdmin(PROXY, ADMIN, true),
      vp.registerVersion(PROXY, VERSION_BYTES32, NEW_IMPL),
      vp.setDefaultVersion(PROXY, VERSION_BYTES32),
    ]
    for (const op of ops) {
      expect(op.to).toBe(PROXY)
      expect(op.value).toBe(0n)
      expect(op.description.length).toBeGreaterThan(0)
    }
  })
})
