import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getAddress } from 'viem'
import { envSigner } from '../../../src/signers/env.js'

// Anvil's default first account (well-known test mnemonic).
const TEST_PK = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const
const TEST_ADDR = getAddress('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266')

describe('envSigner', () => {
  let savedDefault: string | undefined

  beforeEach(() => {
    savedDefault = process.env.PROPOSER_PK
    delete process.env.PROPOSER_PK
  })

  afterEach(() => {
    if (savedDefault === undefined) delete process.env.PROPOSER_PK
    else process.env.PROPOSER_PK = savedDefault
  })

  it('loads from PROPOSER_PK env var by default', () => {
    process.env.PROPOSER_PK = TEST_PK
    const signer = envSigner()
    expect(signer.address).toBe(TEST_ADDR)
  })

  it('accepts opts.privateKey override (no env required)', () => {
    const signer = envSigner({ privateKey: TEST_PK })
    expect(signer.address).toBe(TEST_ADDR)
  })

  it('accepts a custom envVar name', () => {
    process.env.MY_CUSTOM_KEY = TEST_PK
    try {
      const signer = envSigner({ envVar: 'MY_CUSTOM_KEY' })
      expect(signer.address).toBe(TEST_ADDR)
    } finally {
      delete process.env.MY_CUSTOM_KEY
    }
  })

  it('throws a clear error when env var is missing and no override', () => {
    expect(() => envSigner()).toThrow(/missing private key.*PROPOSER_PK/)
  })

  it('throws on private key not 0x-prefixed', () => {
    expect(() =>
      envSigner({ privateKey: 'ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as `0x${string}` }),
    ).toThrow(/0x-prefixed/)
  })

  it('throws on private key of wrong length', () => {
    expect(() => envSigner({ privateKey: '0xdeadbeef' as `0x${string}` })).toThrow(/0x-prefixed/)
  })

  it('produces an EIP-712 signature of the expected length', async () => {
    const signer = envSigner({ privateKey: TEST_PK })
    const sig = await signer.signTypedData({
      domain: { name: 'Test', version: '1', chainId: 1, verifyingContract: TEST_ADDR },
      types: { Mail: [{ name: 'contents', type: 'string' }] },
      primaryType: 'Mail',
      message: { contents: 'hello' },
    })
    expect(sig).toMatch(/^0x[0-9a-f]{130}$/)
  })
})
