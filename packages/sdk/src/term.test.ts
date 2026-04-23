import { describe, expect, test } from 'bun:test'
import { keccak256, toBytes } from 'viem'

import { toIntuitionCaip10 } from './caip'
import { calculateProxyTermId } from './term'

// Solidity reference:
//   function calculateAtomId(bytes memory data) public pure returns (bytes32) {
//     return keccak256(abi.encodePacked(data));
//   }
// `abi.encodePacked` on a single `bytes` is identity, so the id is just
// `keccak256(data)`. These tests lock that equivalence in.

const ADDR = '0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70'

describe('calculateProxyTermId', () => {
  test('matches keccak256(utf8(caip10)) — same algo as MultiVaultCore', () => {
    const caip10 = toIntuitionCaip10(13579, ADDR)
    const expected = keccak256(toBytes(caip10))
    expect(calculateProxyTermId(13579, ADDR)).toBe(expected)
  })

  test('is deterministic for the same (chainId, address)', () => {
    expect(calculateProxyTermId(8453, ADDR)).toBe(calculateProxyTermId(8453, ADDR))
  })

  test('differs across chains for the same address', () => {
    expect(calculateProxyTermId(1, ADDR)).not.toBe(calculateProxyTermId(2, ADDR))
  })

  test('differs across addresses on the same chain', () => {
    const other = '0x0000000000000000000000000000000000000001'
    expect(calculateProxyTermId(1, ADDR)).not.toBe(calculateProxyTermId(1, other))
  })

  test('normalizes address case before hashing (checksum dependency)', () => {
    const lower = ADDR.toLowerCase()
    expect(calculateProxyTermId(1, lower)).toBe(calculateProxyTermId(1, ADDR))
  })
})
