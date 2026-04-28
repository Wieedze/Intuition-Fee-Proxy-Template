import { describe, expect, it } from 'vitest'
import { getAddress } from 'viem'
import { getSigner } from '../../../src/signers/factory.js'

const TEST_PK = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const
const TEST_ADDR = getAddress('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266')

describe('getSigner factory', () => {
  it('returns env signer for "env" strategy', async () => {
    const signer = await getSigner('env', { env: { privateKey: TEST_PK } })
    expect(signer.address).toBe(TEST_ADDR)
  })

  it('rejects with an actionable error when ledger has no device + no deps', async () => {
    // Two valid failure paths depending on whether @ledgerhq/* optional
    // deps were installed by bun:
    //   - deps missing -> "ledger signer requires optional deps"
    //   - deps installed but no device plugged -> "cannot open USB transport"
    // Both are user-actionable and resolve quickly thanks to the 3s
    // transport open timeout in the signer.
    await expect(
      getSigner('ledger', { ledger: { transportTimeoutMs: 1500 } }),
    ).rejects.toThrow(
      /ledger signer requires optional deps|cannot open USB transport/i,
    )
  }, 5000)

  it('rejects with "not yet implemented" for walletconnect strategy', async () => {
    await expect(getSigner('walletconnect')).rejects.toThrow(/walletconnect.*not yet implemented/i)
  })
})
