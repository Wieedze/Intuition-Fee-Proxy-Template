import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  encodeFunctionData,
  http,
} from 'viem'
import {
  aggregateSignatures,
  buildPreApprovedSignature,
  buildSafeTx,
  executeSafeTx,
} from '../../src/modes/direct-sign.js'
import { startAnvilFork, type AnvilFork } from '../fixtures/anvil.js'
import {
  EXPECTED_OWNERS,
  INTUITION_CHAIN_ID,
  SAFE_ADDRESS,
} from '../fixtures/constants.js'
import { impersonateAndFund } from '../fixtures/impersonate.js'

// Distinct port from anvil-sanity (8545) to allow vitest parallelism.
const PORT = 8546

// Anvil's default first account is well-known and pre-funded on the
// fork — used as the executor (no impersonation needed).
const EXECUTOR = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as const

const anvilChain = (rpcUrl: string) =>
  defineChain({
    id: INTUITION_CHAIN_ID,
    name: 'Intuition (forked)',
    nativeCurrency: { name: 'TRUST', symbol: 'TRUST', decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] }, public: { http: [rpcUrl] } },
  })

const SAFE_ABI = [
  {
    type: 'function',
    name: 'approveHash',
    inputs: [{ name: 'hashToApprove', type: 'bytes32' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'nonce',
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
] as const

describe('direct-sign mode against Anvil fork', () => {
  let fork: AnvilFork

  beforeAll(async () => {
    fork = await startAnvilFork({ port: PORT })
  }, 30_000)

  afterAll(async () => {
    await fork?.stop()
  })

  it('build + approveHash from 2 owners + execute increments Safe nonce', async () => {
    const chain = anvilChain(fork.rpcUrl)
    const publicClient = createPublicClient({ chain, transport: http(fork.rpcUrl) })
    const walletClient = createWalletClient({ chain, transport: http(fork.rpcUrl) })

    // No-op SafeTx: send 0 wei to a random address with no calldata.
    // Always succeeds, increments the Safe nonce, mutates nothing else.
    const noopOp = {
      to: '0x0000000000000000000000000000000000000001' as const,
      value: 0n,
      data: '0x' as const,
      description: 'noop test tx',
    }

    const payload = await buildSafeTx(
      { safe: SAFE_ADDRESS, chainId: INTUITION_CHAIN_ID, op: noopOp },
      publicClient,
    )

    expect(payload.safeTxHash).toMatch(/^0x[0-9a-f]{64}$/)

    const nonceBefore = await publicClient.readContract({
      address: SAFE_ADDRESS,
      abi: SAFE_ABI,
      functionName: 'nonce',
    })

    // 2 of 3 owners approve the hash on-chain via impersonation.
    const ownerA = EXPECTED_OWNERS[0]
    const ownerB = EXPECTED_OWNERS[1]
    await impersonateAndFund(fork.rpcUrl, ownerA)
    await impersonateAndFund(fork.rpcUrl, ownerB)
    await impersonateAndFund(fork.rpcUrl, EXECUTOR)

    const approveData = encodeFunctionData({
      abi: SAFE_ABI,
      functionName: 'approveHash',
      args: [payload.safeTxHash],
    })

    // Anvil signs on behalf of impersonated accounts via eth_sendTransaction.
    const sendApprove = async (from: typeof ownerA): Promise<`0x${string}`> => {
      const res = await fetch(fork.rpcUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_sendTransaction',
          params: [{ from, to: SAFE_ADDRESS, data: approveData }],
        }),
      })
      const json = (await res.json()) as {
        result?: `0x${string}`
        error?: { message: string }
      }
      if (json.error) throw new Error(`approveHash from ${from} failed: ${json.error.message}`)
      return json.result!
    }

    const txA = await sendApprove(ownerA)
    await publicClient.waitForTransactionReceipt({ hash: txA })
    const txB = await sendApprove(ownerB)
    await publicClient.waitForTransactionReceipt({ hash: txB })

    // Execute with pre-approved signatures.
    const signatures = aggregateSignatures([
      { signer: ownerA, sig: buildPreApprovedSignature(ownerA) },
      { signer: ownerB, sig: buildPreApprovedSignature(ownerB) },
    ])

    const execHash = await executeSafeTx({
      payload,
      signatures,
      walletClient,
      account: EXECUTOR,
    })
    const receipt = await publicClient.waitForTransactionReceipt({ hash: execHash })
    expect(receipt.status).toBe('success')

    const nonceAfter = await publicClient.readContract({
      address: SAFE_ADDRESS,
      abi: SAFE_ABI,
      functionName: 'nonce',
    })
    expect(nonceAfter).toBe(nonceBefore + 1n)
  }, 60_000)
})
