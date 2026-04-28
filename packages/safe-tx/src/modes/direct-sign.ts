import {
  encodeFunctionData,
  hashTypedData,
  pad,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from 'viem'
import type { AdminOp } from '../types.js'
import type { Signer } from '../signers/types.js'

const ZERO_ADDRESS: Address = '0x0000000000000000000000000000000000000000'

/**
 * Inputs needed to build a Safe transaction wrapping an AdminOp.
 *
 * Most fields default to safe values for admin operations (no gas
 * sponsoring, CALL operation, fresh nonce). Override only when needed.
 */
export type SafeTxRequest = {
  safe: Address
  chainId: number
  op: AdminOp
  /** 0 = CALL, 1 = DELEGATECALL. Defaults to 0. */
  operation?: 0 | 1
  safeTxGas?: bigint
  baseGas?: bigint
  gasPrice?: bigint
  gasToken?: Address
  refundReceiver?: Address
  /** Override the Safe nonce. If omitted, fetched from chain. */
  nonce?: bigint
}

/** Resolved Safe transaction (every field filled in) ready for signing. */
export type SafeTxMessage = {
  to: Address
  value: bigint
  data: Hex
  operation: 0 | 1
  safeTxGas: bigint
  baseGas: bigint
  gasPrice: bigint
  gasToken: Address
  refundReceiver: Address
  nonce: bigint
}

export type SafeTxPayload = {
  safe: Address
  chainId: number
  message: SafeTxMessage
  /** Hash of the EIP-712 typed data — what owners sign. */
  safeTxHash: Hex
}

export type SignedSafeTx = {
  signer: Address
  /** 65-byte ECDSA signature over the SafeTx EIP-712 hash. */
  sig: Hex
}

/** Canonical Safe v1.3.0 EIP-712 SafeTx type. Exported so external code
 *  (api-kit, tests) can reuse the exact same definition. */
export const SAFE_TX_TYPES = {
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
} as const

const SAFE_NONCE_ABI = [
  {
    type: 'function',
    name: 'nonce',
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
] as const

const SAFE_EXEC_ABI = [
  {
    type: 'function',
    name: 'execTransaction',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'data', type: 'bytes' },
      { name: 'operation', type: 'uint8' },
      { name: 'safeTxGas', type: 'uint256' },
      { name: 'baseGas', type: 'uint256' },
      { name: 'gasPrice', type: 'uint256' },
      { name: 'gasToken', type: 'address' },
      { name: 'refundReceiver', type: 'address' },
      { name: 'signatures', type: 'bytes' },
    ],
    outputs: [{ type: 'bool' }],
    stateMutability: 'payable',
  },
] as const

/**
 * Resolve defaults + fetch nonce if missing, then compute the SafeTx
 * EIP-712 hash. Returns the full payload, ready to be signed by owners
 * or executed once enough signatures are gathered.
 *
 * `client` is optional when `request.nonce` is already provided — useful
 * for offline workflows and tests that don't want to spin up an RPC.
 */
export async function buildSafeTx(
  request: SafeTxRequest,
  client?: PublicClient,
): Promise<SafeTxPayload> {
  const operation = request.operation ?? 0
  const safeTxGas = request.safeTxGas ?? 0n
  const baseGas = request.baseGas ?? 0n
  const gasPrice = request.gasPrice ?? 0n
  const gasToken = request.gasToken ?? ZERO_ADDRESS
  const refundReceiver = request.refundReceiver ?? ZERO_ADDRESS

  let nonce: bigint
  if (request.nonce !== undefined) {
    nonce = request.nonce
  } else {
    if (!client) {
      throw new Error('safe-tx: buildSafeTx requires either request.nonce or a publicClient to fetch it')
    }
    nonce = BigInt(
      await client.readContract({
        address: request.safe,
        abi: SAFE_NONCE_ABI,
        functionName: 'nonce',
      }),
    )
  }

  const message: SafeTxMessage = {
    to: request.op.to,
    value: request.op.value,
    data: request.op.data,
    operation,
    safeTxGas,
    baseGas,
    gasPrice,
    gasToken,
    refundReceiver,
    nonce,
  }

  const safeTxHash = hashTypedData({
    domain: { chainId: request.chainId, verifyingContract: request.safe },
    types: SAFE_TX_TYPES,
    primaryType: 'SafeTx',
    message,
  })

  return { safe: request.safe, chainId: request.chainId, message, safeTxHash }
}

/**
 * Produce an EIP-712 signature over the SafeTx hash using the given Signer.
 * The returned record is what owners share off-band before execution.
 */
export async function signSafeTx(
  payload: SafeTxPayload,
  signer: Signer,
): Promise<SignedSafeTx> {
  const sig = await signer.signTypedData({
    domain: { chainId: payload.chainId, verifyingContract: payload.safe },
    types: SAFE_TX_TYPES,
    primaryType: 'SafeTx',
    message: payload.message,
  })
  return { signer: signer.address, sig }
}

/**
 * Concatenate signatures in the byte layout Safe.execTransaction expects:
 * sorted by signer address ascending, raw 65-byte sigs back-to-back.
 *
 * Throws if any two entries share a signer (Safe would reject duplicates).
 */
export function aggregateSignatures(signed: SignedSafeTx[]): Hex {
  if (signed.length === 0) {
    throw new Error('safe-tx: aggregateSignatures requires at least one signature')
  }
  const seen = new Set<string>()
  for (const s of signed) {
    const key = s.signer.toLowerCase()
    if (seen.has(key)) {
      throw new Error(`safe-tx: duplicate signature from signer ${s.signer}`)
    }
    seen.add(key)
  }
  const sorted = [...signed].sort((a, b) =>
    a.signer.toLowerCase().localeCompare(b.signer.toLowerCase()),
  )
  return ('0x' + sorted.map((s) => s.sig.slice(2)).join('')) as Hex
}

/**
 * Build a "pre-approved" signature blob for one owner. Used when an
 * owner has called Safe.approveHash(safeTxHash) on-chain and wants
 * the executor to count their approval without producing an EIP-712 sig.
 *
 * Layout per Safe v1.3.0: pad32(owner) || bytes32(0) || 0x01
 */
export function buildPreApprovedSignature(owner: Address): Hex {
  const padded = pad(owner, { size: 32 })
  const zero = ('0x' + '00'.repeat(32)) as Hex
  return ('0x' + padded.slice(2) + zero.slice(2) + '01') as Hex
}

/**
 * Send Safe.execTransaction with the aggregated signatures. The caller
 * supplies a WalletClient bound to the executor account (any address
 * with enough balance — does not need to be a Safe owner unless gasPrice > 0).
 */
export async function executeSafeTx(args: {
  payload: SafeTxPayload
  signatures: Hex
  walletClient: WalletClient
  account: Address
}): Promise<Hex> {
  const { payload, signatures, walletClient, account } = args
  const { message, safe } = payload
  return walletClient.writeContract({
    account,
    chain: walletClient.chain ?? null,
    address: safe,
    abi: SAFE_EXEC_ABI,
    functionName: 'execTransaction',
    args: [
      message.to,
      message.value,
      message.data,
      message.operation,
      message.safeTxGas,
      message.baseGas,
      message.gasPrice,
      message.gasToken,
      message.refundReceiver,
      signatures,
    ],
  })
}
