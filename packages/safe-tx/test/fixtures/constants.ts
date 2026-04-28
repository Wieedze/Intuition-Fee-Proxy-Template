import type { Address } from 'viem'
import { getAddress } from 'viem'

/**
 * Anvil fork test constants.
 *
 * FORK_BLOCK is pinned for deterministic test runs. Update via the
 * recipe at the bottom of this file when you need fresher state.
 */

export const INTUITION_RPC = process.env.INTUITION_RPC ?? 'https://rpc.intuition.systems'

export const FORK_BLOCK = 3_250_000

export const ANVIL_PORT = Number(process.env.ANVIL_PORT ?? 8545)
export const ANVIL_HOST = '127.0.0.1'
export const ANVIL_RPC = `http://${ANVIL_HOST}:${ANVIL_PORT}`

export const INTUITION_CHAIN_ID = 1155

/** Reference Safe used as the test target. 2-of-3 multisig on Intuition mainnet. */
export const SAFE_ADDRESS: Address = getAddress('0xf10D442D0fB934D4037DC30769a6EfCf2f54F7B6')

export const EXPECTED_OWNERS: readonly Address[] = [
  getAddress('0xc634457aD68b037E2D5aA1C10c3930d7e4E2d551'),
  getAddress('0x077b59a3751Cd6682534C8203aAb29113876af01'),
  getAddress('0x25d5C9DbC1E12163B973261A08739927E4F72BA8'),
] as const

export const EXPECTED_THRESHOLD = 2n

/**
 * Minimal Safe v1.3.0 ABI subset used by the fork sanity check. The real
 * package code uses protocol-kit / api-kit, which ship their own ABIs.
 */
export const SAFE_READ_ABI = [
  {
    type: 'function',
    name: 'getOwners',
    inputs: [],
    outputs: [{ type: 'address[]' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getThreshold',
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'VERSION',
    inputs: [],
    outputs: [{ type: 'string' }],
    stateMutability: 'view',
  },
] as const

// To bump FORK_BLOCK:
//   curl -sS -X POST https://rpc.intuition.systems -H "Content-Type: application/json" \
//     -d '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}'
//   Pick a value ~1000 blocks below head for finality, update FORK_BLOCK above.
