import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createPublicClient, http } from 'viem'
import { startAnvilFork, type AnvilFork } from '../fixtures/anvil.js'
import {
  EXPECTED_OWNERS,
  EXPECTED_THRESHOLD,
  INTUITION_CHAIN_ID,
  SAFE_ADDRESS,
  SAFE_READ_ABI,
} from '../fixtures/constants.js'
import { impersonateAndFund } from '../fixtures/impersonate.js'

describe('Anvil fork sanity', () => {
  let fork: AnvilFork

  beforeAll(async () => {
    fork = await startAnvilFork()
  }, 30_000)

  afterAll(async () => {
    await fork?.stop()
  })

  it('forks Intuition mainnet (chainId == 1155)', async () => {
    const client = createPublicClient({ transport: http(fork.rpcUrl) })
    expect(await client.getChainId()).toBe(INTUITION_CHAIN_ID)
  })

  it('Safe contract has bytecode at the expected address', async () => {
    const client = createPublicClient({ transport: http(fork.rpcUrl) })
    const code = await client.getCode({ address: SAFE_ADDRESS })
    expect(code).toBeDefined()
    expect((code ?? '0x').length).toBeGreaterThan(2)
  })

  it('Safe owners match expected 2-of-3 set', async () => {
    const client = createPublicClient({ transport: http(fork.rpcUrl) })
    const owners = await client.readContract({
      address: SAFE_ADDRESS,
      abi: SAFE_READ_ABI,
      functionName: 'getOwners',
    })
    expect([...owners].sort()).toEqual([...EXPECTED_OWNERS].sort())
  })

  it('Safe threshold is 2', async () => {
    const client = createPublicClient({ transport: http(fork.rpcUrl) })
    const threshold = await client.readContract({
      address: SAFE_ADDRESS,
      abi: SAFE_READ_ABI,
      functionName: 'getThreshold',
    })
    expect(threshold).toBe(EXPECTED_THRESHOLD)
  })

  it('Safe reports v1.3.0 on VERSION()', async () => {
    const client = createPublicClient({ transport: http(fork.rpcUrl) })
    const version = await client.readContract({
      address: SAFE_ADDRESS,
      abi: SAFE_READ_ABI,
      functionName: 'VERSION',
    })
    expect(version).toBe('1.3.0')
  })

  it('impersonateAndFund can credit an arbitrary address', async () => {
    const client = createPublicClient({ transport: http(fork.rpcUrl) })
    const target = EXPECTED_OWNERS[0]
    await impersonateAndFund(fork.rpcUrl, target)
    const balance = await client.getBalance({ address: target })
    expect(balance).toBeGreaterThanOrEqual(100n * 10n ** 18n)
  })
})
