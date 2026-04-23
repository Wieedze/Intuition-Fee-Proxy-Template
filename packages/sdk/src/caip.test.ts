import { describe, expect, test } from 'bun:test'

import { parseIntuitionCaip10, toIntuitionCaip10 } from './caip'

// Known checksummed test vector (same one used in the Rust indexer's
// `is_valid_caip10` unit tests for cross-implementation parity).
const CHECKSUM_ADDR = '0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70'
const LOWER_ADDR = '0x71041dddad3595f9ced3dccfbe3d1f4b0a16bb70'

describe('toIntuitionCaip10', () => {
  test('formats the Intuition-flavored CAIP-10 string with checksum', () => {
    expect(toIntuitionCaip10(13579, CHECKSUM_ADDR)).toBe(
      `caip10:eip155:13579:${CHECKSUM_ADDR}`,
    )
  })

  test('checksums lowercase input', () => {
    expect(toIntuitionCaip10(8453, LOWER_ADDR)).toBe(
      `caip10:eip155:8453:${CHECKSUM_ADDR}`,
    )
  })

  test('accepts bigint chainId', () => {
    expect(toIntuitionCaip10(1155n, CHECKSUM_ADDR)).toBe(
      `caip10:eip155:1155:${CHECKSUM_ADDR}`,
    )
  })

  test('rejects zero / negative / non-integer chainId', () => {
    expect(() => toIntuitionCaip10(0, CHECKSUM_ADDR)).toThrow()
    expect(() => toIntuitionCaip10(-1, CHECKSUM_ADDR)).toThrow()
    expect(() => toIntuitionCaip10(1.5, CHECKSUM_ADDR)).toThrow()
  })

  test('rejects malformed address', () => {
    expect(() => toIntuitionCaip10(1, '0xnothex')).toThrow()
    expect(() => toIntuitionCaip10(1, '0x1234')).toThrow()
    expect(() => toIntuitionCaip10(1, '')).toThrow()
  })
})

describe('parseIntuitionCaip10', () => {
  test('round-trips with toIntuitionCaip10', () => {
    const str = toIntuitionCaip10(13579, CHECKSUM_ADDR)
    const { chainId, address } = parseIntuitionCaip10(str)
    expect(chainId).toBe(13579)
    expect(address).toBe(CHECKSUM_ADDR)
  })

  test('returns checksummed address even from lowercase input', () => {
    const str = `caip10:eip155:1:${LOWER_ADDR}`
    expect(parseIntuitionCaip10(str).address).toBe(CHECKSUM_ADDR)
  })

  test('rejects missing caip10: prefix', () => {
    expect(() =>
      parseIntuitionCaip10(`eip155:1:${CHECKSUM_ADDR}`),
    ).toThrow(/prefix/)
  })

  test('rejects wrong namespace', () => {
    expect(() =>
      parseIntuitionCaip10(`caip10:bip122:1:${CHECKSUM_ADDR}`),
    ).toThrow(/namespace/)
  })

  test('rejects wrong number of parts', () => {
    expect(() => parseIntuitionCaip10('caip10:eip155:1')).toThrow()
    expect(() =>
      parseIntuitionCaip10(`caip10:eip155:1:${CHECKSUM_ADDR}:extra`),
    ).toThrow()
  })

  test('rejects malformed chainId', () => {
    expect(() =>
      parseIntuitionCaip10(`caip10:eip155:abc:${CHECKSUM_ADDR}`),
    ).toThrow(/chainId/)
  })

  test('rejects malformed address', () => {
    expect(() => parseIntuitionCaip10('caip10:eip155:1:not_an_address')).toThrow()
  })
})
