import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { getAddress } from 'viem'
import { createApiKitClient, type ApiKitClient } from '../../src/modes/api-kit.js'
import { buildSafeTx, signSafeTx } from '../../src/modes/direct-sign.js'
import * as v2 from '../../src/ops/v2-admin.js'
import { envSigner } from '../../src/signers/env.js'
import { startMockSts, type MockSts } from '../fixtures/mock-sts.js'

// Two synthetic test private keys (Anvil's #0 and #1).
const PK_A = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const
const PK_B = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as const

const SAFE = getAddress('0xf10D442D0fB934D4037DC30769a6EfCf2f54F7B6')
const PROXY = getAddress('0x29fcB43b46531BcA003ddC8FCB67FFE91900C762')

const PORT = 8889 // distinct from anvil-sanity (8545) and direct-sign (8546)

describe('api-kit mode against mock STS', () => {
  let mock: MockSts
  let client: ApiKitClient

  beforeAll(async () => {
    mock = await startMockSts({ port: PORT })
    client = createApiKitClient({ txServiceUrl: mock.url })
  })

  afterEach(() => {
    mock.reset()
  })

  afterAll(async () => {
    await mock?.stop()
  })

  it('propose stores the SafeTx with the proposer signature', async () => {
    const op = v2.setDepositFixedFee(PROXY, 100n)
    const payload = await buildSafeTx({
      safe: SAFE,
      chainId: 1155,
      op,
      nonce: 0n,
    })
    const signerA = envSigner({ privateKey: PK_A })
    const signed = await signSafeTx(payload, signerA)

    await client.propose(payload, signed)

    const stored = mock.getStored(payload.safeTxHash)
    expect(stored).toHaveLength(1)
    expect(stored[0].sender).toBe(signerA.address)
    expect(stored[0].confirmations).toHaveLength(1)
    expect(stored[0].confirmations[0].signature).toBe(signed.sig)
    expect(BigInt(stored[0].value)).toBe(0n)
    expect(stored[0].nonce).toBe('0')
    expect(stored[0].to).toBe(PROXY)
  })

  it('confirm appends a second signature to the same SafeTx', async () => {
    const op = v2.setDepositPercentageFee(PROXY, 250n)
    const payload = await buildSafeTx({ safe: SAFE, chainId: 1155, op, nonce: 5n })
    const signerA = envSigner({ privateKey: PK_A })
    const signerB = envSigner({ privateKey: PK_B })

    const signedA = await signSafeTx(payload, signerA)
    await client.propose(payload, signedA)

    const signedB = await signSafeTx(payload, signerB)
    await client.confirm(payload.safeTxHash, signedB)

    const stored = mock.getStored(payload.safeTxHash)
    expect(stored).toHaveLength(1)
    expect(stored[0].confirmations).toHaveLength(2)
    expect(stored[0].confirmations.map((c) => c.signature)).toEqual([signedA.sig, signedB.sig])
  })

  it('getTx returns the stored record by safeTxHash', async () => {
    const op = v2.withdraw(PROXY, signerAAddr(), 10n ** 18n)
    const payload = await buildSafeTx({ safe: SAFE, chainId: 1155, op, nonce: 1n })
    const signerA = envSigner({ privateKey: PK_A })
    const signed = await signSafeTx(payload, signerA)
    await client.propose(payload, signed)

    const fetched = await client.getTx(payload.safeTxHash)
    expect(fetched.contractTransactionHash).toBe(payload.safeTxHash)
    expect(fetched.to).toBe(PROXY)
    expect(fetched.confirmations).toHaveLength(1)
  })

  it('getTx throws on unknown hash (404)', async () => {
    const fake = ('0x' + 'de'.repeat(32)) as `0x${string}`
    await expect(client.getTx(fake)).rejects.toThrow(/HTTP 404/)
  })

  it('getPendingTxs lists everything stored for a Safe', async () => {
    const signerA = envSigner({ privateKey: PK_A })
    for (const nonce of [10n, 11n, 12n]) {
      const op = v2.setDepositFixedFee(PROXY, nonce)
      const payload = await buildSafeTx({ safe: SAFE, chainId: 1155, op, nonce })
      const signed = await signSafeTx(payload, signerA)
      await client.propose(payload, signed)
    }

    const pending = await client.getPendingTxs(SAFE)
    expect(pending).toHaveLength(3)
  })
})

function signerAAddr(): `0x${string}` {
  return envSigner({ privateKey: PK_A }).address
}
