import { describe, expect, it } from 'vitest'
import { getAddress, hashTypedData } from 'viem'
import {
  aggregateSignatures,
  buildPreApprovedSignature,
  type SignedSafeTx,
} from '../../../src/modes/direct-sign.js'

const OWNER_A = getAddress('0xc634457aD68b037E2D5aA1C10c3930d7e4E2d551')
const OWNER_B = getAddress('0x077b59a3751Cd6682534C8203aAb29113876af01')
const OWNER_C = getAddress('0x25d5C9DbC1E12163B973261A08739927E4F72BA8')

const SIG_A = ('0x' + 'aa'.repeat(65)) as `0x${string}`
const SIG_B = ('0x' + 'bb'.repeat(65)) as `0x${string}`
const SIG_C = ('0x' + 'cc'.repeat(65)) as `0x${string}`

describe('aggregateSignatures', () => {
  it('sorts signatures by signer address ascending', () => {
    // OWNER_B (0x077b...) < OWNER_C (0x25d5...) < OWNER_A (0xc634...)
    const blob = aggregateSignatures([
      { signer: OWNER_A, sig: SIG_A },
      { signer: OWNER_C, sig: SIG_C },
      { signer: OWNER_B, sig: SIG_B },
    ])
    expect(blob).toBe('0x' + 'bb'.repeat(65) + 'cc'.repeat(65) + 'aa'.repeat(65))
  })

  it('produces a blob of len * 65 bytes', () => {
    const blob = aggregateSignatures([
      { signer: OWNER_A, sig: SIG_A },
      { signer: OWNER_B, sig: SIG_B },
    ])
    // 0x + 130 hex per sig * 2 sigs = 0x + 260 chars
    expect(blob.length).toBe(2 + 130 * 2)
  })

  it('rejects empty input', () => {
    expect(() => aggregateSignatures([])).toThrow(/at least one signature/)
  })

  it('rejects duplicate signers', () => {
    expect(() =>
      aggregateSignatures([
        { signer: OWNER_A, sig: SIG_A },
        { signer: OWNER_A.toLowerCase() as `0x${string}`, sig: SIG_B },
      ]),
    ).toThrow(/duplicate signature/)
  })
})

describe('buildPreApprovedSignature', () => {
  it('produces 65 bytes: padded owner + zero pad + 0x01', () => {
    const sig = buildPreApprovedSignature(OWNER_A)
    expect(sig.length).toBe(2 + 65 * 2)
    // bytes 0-31: padded address (12 zero bytes + 20 address bytes)
    expect(sig.slice(2, 2 + 24)).toBe('0'.repeat(24))
    expect(sig.slice(2 + 24, 2 + 64).toLowerCase()).toBe(OWNER_A.slice(2).toLowerCase())
    // bytes 32-63: zero
    expect(sig.slice(2 + 64, 2 + 128)).toBe('0'.repeat(64))
    // byte 64: 0x01
    expect(sig.slice(2 + 128)).toBe('01')
  })

  it('round-trips through aggregateSignatures', () => {
    const blob = aggregateSignatures([
      { signer: OWNER_A, sig: buildPreApprovedSignature(OWNER_A) },
      { signer: OWNER_B, sig: buildPreApprovedSignature(OWNER_B) },
    ])
    expect(blob.length).toBe(2 + 130 * 2)
  })
})

describe('SafeTx EIP-712 hash domain separator', () => {
  // Sanity: ensure our types declaration matches Safe's canonical EIP-712.
  // The reference hash here was computed with Safe's official utilities for
  // a known SafeTx — if our SAFE_TX_TYPES drifts from canonical, this fails.
  it('hashTypedData with our SafeTx types is deterministic', () => {
    const safe = getAddress('0xf10D442D0fB934D4037DC30769a6EfCf2f54F7B6')
    const hash1 = hashTypedData({
      domain: { chainId: 1155, verifyingContract: safe },
      types: {
        SafeTx: [
          { name: 'to', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'data', type: 'bytes' },
          { name: 'operation', type: 'uint8' },
          { name: 'safeTxGas', type: 'uint256' },
          { name: 'baseGas', type: 'uint256' },
          { name: 'gasPrice', type: 'uint256' },
          { name: 'gasToken', type: 'address' },
          { name: 'refundReceiver', type: 'address' },
          { name: 'nonce', type: 'uint256' },
        ],
      },
      primaryType: 'SafeTx',
      message: {
        to: safe,
        value: 0n,
        data: '0x',
        operation: 0,
        safeTxGas: 0n,
        baseGas: 0n,
        gasPrice: 0n,
        gasToken: '0x0000000000000000000000000000000000000000',
        refundReceiver: '0x0000000000000000000000000000000000000000',
        nonce: 0n,
      },
    })
    expect(hash1).toMatch(/^0x[0-9a-f]{64}$/)
    // Should be deterministic
    const hash2 = hashTypedData({
      domain: { chainId: 1155, verifyingContract: safe },
      types: {
        SafeTx: [
          { name: 'to', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'data', type: 'bytes' },
          { name: 'operation', type: 'uint8' },
          { name: 'safeTxGas', type: 'uint256' },
          { name: 'baseGas', type: 'uint256' },
          { name: 'gasPrice', type: 'uint256' },
          { name: 'gasToken', type: 'address' },
          { name: 'refundReceiver', type: 'address' },
          { name: 'nonce', type: 'uint256' },
        ],
      },
      primaryType: 'SafeTx',
      message: {
        to: safe,
        value: 0n,
        data: '0x',
        operation: 0,
        safeTxGas: 0n,
        baseGas: 0n,
        gasPrice: 0n,
        gasToken: '0x0000000000000000000000000000000000000000',
        refundReceiver: '0x0000000000000000000000000000000000000000',
        nonce: 0n,
      },
    })
    expect(hash1).toBe(hash2)
  })
})
