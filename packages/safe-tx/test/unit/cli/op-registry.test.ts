import { describe, expect, it } from 'vitest'
import { getAddress } from 'viem'
import {
  OP_REGISTRY,
  getOpRegistration,
  parseOpFlag,
  parseOpFlags,
} from '../../../src/cli/op-registry.js'

describe('OP_REGISTRY', () => {
  it('contains 10 ops total (5 v2-admin + 4 factory + 1 uups)', () => {
    expect(OP_REGISTRY).toHaveLength(10)
    const v2 = OP_REGISTRY.filter((o) => o.category === 'v2-admin')
    const fac = OP_REGISTRY.filter((o) => o.category === 'factory')
    const up = OP_REGISTRY.filter((o) => o.category === 'uups')
    expect(v2).toHaveLength(5)
    expect(fac).toHaveLength(4)
    expect(up).toHaveLength(1)
  })

  it('every op has a unique CLI name', () => {
    const names = OP_REGISTRY.map((o) => o.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('every op has at least one required flag', () => {
    for (const op of OP_REGISTRY) {
      expect(op.flags.some((f) => f.required)).toBe(true)
    }
  })
})

describe('getOpRegistration', () => {
  it('returns the op when it exists', () => {
    const op = getOpRegistration('set-deposit-fixed-fee')
    expect(op.category).toBe('v2-admin')
  })

  it('throws with the available list when the op is unknown', () => {
    expect(() => getOpRegistration('does-not-exist')).toThrow(/unknown op/)
  })
})

describe('parseOpFlag', () => {
  it('address', () => {
    const result = parseOpFlag('0xf10d442d0fb934d4037dc30769a6efcf2f54f7b6', 'address')
    expect(result).toBe(getAddress('0xf10d442d0fb934d4037dc30769a6efcf2f54f7b6'))
  })

  it('bigint', () => {
    expect(parseOpFlag('1000000000000000000', 'bigint')).toBe(10n ** 18n)
  })

  it('bool true/1', () => {
    expect(parseOpFlag('true', 'bool')).toBe(true)
    expect(parseOpFlag('1', 'bool')).toBe(true)
  })

  it('bool false/0', () => {
    expect(parseOpFlag('false', 'bool')).toBe(false)
    expect(parseOpFlag('0', 'bool')).toBe(false)
  })

  it('bool throws on garbage', () => {
    expect(() => parseOpFlag('maybe', 'bool')).toThrow(/bool flag/)
  })

  it('hex passes through valid hex', () => {
    expect(parseOpFlag('0xdeadbeef', 'hex')).toBe('0xdeadbeef')
  })

  it('hex throws on non-hex', () => {
    expect(() => parseOpFlag('not-hex', 'hex')).toThrow(/hex flag/)
  })

  it('version-string encodes as bytes32', () => {
    const out = parseOpFlag('v3.0.0', 'version-string') as string
    expect(out).toMatch(/^0x[0-9a-f]{64}$/)
    // 'v3.0.0' = 6 ASCII bytes, padded to 32
    expect(out.startsWith('0x76332e302e30')).toBe(true)
  })
})

describe('parseOpFlags', () => {
  it('returns parsed args for a valid op', () => {
    const def = getOpRegistration('set-deposit-fixed-fee')
    const parsed = parseOpFlags(def, {
      proxy: '0xf10d442d0fb934d4037dc30769a6efcf2f54f7b6',
      value: '100',
    })
    expect(parsed.value).toBe(100n)
    expect(parsed.proxy).toBe(getAddress('0xf10d442d0fb934d4037dc30769a6efcf2f54f7b6'))
  })

  it('throws on missing required flag', () => {
    const def = getOpRegistration('set-deposit-fixed-fee')
    expect(() => parseOpFlags(def, { proxy: '0xf10d442d0fb934d4037dc30769a6efcf2f54f7b6' })).toThrow(
      /missing required flag --value/,
    )
  })

  it('skips optional flags when absent', () => {
    const def = getOpRegistration('upgrade-to-and-call')
    const parsed = parseOpFlags(def, {
      proxy: '0xf10d442d0fb934d4037dc30769a6efcf2f54f7b6',
      'new-impl': '0x29fcb43b46531bca003ddc8fcb67ffe91900c762',
    })
    expect(parsed['init-data']).toBeUndefined()
  })

  it('every registered op builds a valid AdminOp with sample inputs', () => {
    const sample: Record<string, unknown> = {
      proxy: getAddress('0xf10D442D0fB934D4037DC30769a6EfCf2f54F7B6'),
      admin: getAddress('0xc634457aD68b037E2D5aA1C10c3930d7e4E2d551'),
      recipient: getAddress('0xc634457aD68b037E2D5aA1C10c3930d7e4E2d551'),
      factory: getAddress('0xC22834581EbC8527d974F8a1c97E1bEA4EF910BC'),
      'new-impl': getAddress('0x29fcB43b46531BcA003ddC8FCB67FFE91900C762'),
      'new-owner': getAddress('0xf10D442D0fB934D4037DC30769a6EfCf2f54F7B6'),
      'new-version': '0x' + '00'.repeat(32),
      value: 100n,
      amount: 100n,
      status: true,
      'init-data': '0x',
    }
    for (const op of OP_REGISTRY) {
      const adminOp = op.build(sample)
      expect(adminOp.value).toBe(0n)
      expect(adminOp.data).toMatch(/^0x[0-9a-f]+$/)
      expect(adminOp.description.length).toBeGreaterThan(0)
    }
  })
})
