#!/usr/bin/env bun
/**
 * Graduated Trezor smoke test. Run with:
 *
 *   bun packages/safe-tx/scripts/test-trezor.ts                # Phase A only
 *   bun packages/safe-tx/scripts/test-trezor.ts --sign-harmless # Phase A + B
 *   bun packages/safe-tx/scripts/test-trezor.ts --sign-typed    # Phase A + B + C
 *
 * Phases:
 *   A. Resolve address only — NO signature, no device prompt.
 *      Validates Trezor Bridge + @trezor/connect + USB connection.
 *
 *   B. personal_sign of a fixed string — device shows the message,
 *      you press confirm. Signature is only valid for THAT exact
 *      string, cannot be replayed for anything dangerous.
 *
 *   C. EIP-712 typed-data sign with a BOGUS verifyingContract
 *      (0x000…dEaD). Signature is bound to a non-existent contract,
 *      so even if leaked it's worthless on mainnet.
 *
 * Pre-flight:
 *   1. Install Trezor Bridge: https://trezor.io/start
 *   2. Plug + unlock your Trezor (any model).
 *   3. bun add @trezor/connect      (only needed for this test session)
 */

import { trezorSigner } from '../src/signers/trezor.js'

const args = process.argv.slice(2)
const wantHarmless = args.includes('--sign-harmless') || args.includes('--sign-typed')
const wantTyped = args.includes('--sign-typed')

console.log('=== Phase A — Resolve address (no signature) ===')
console.log('Initializing Trezor Connect (may take ~30s on first run)…')
const signer = await trezorSigner()
console.log(`✅ Address: ${signer.address}`)
console.log('   This came from your device without any prompt.')
console.log('   If you see this, the integration works end-to-end.\n')

if (!wantHarmless) {
  console.log('Done. Re-run with --sign-harmless to test signature flow.')
  process.exit(0)
}

console.log('=== Phase B — personal_sign a harmless string ===')
const message = `safe-tx Trezor smoke test @ ${new Date().toISOString()}`
console.log(`Message: "${message}"`)
console.log('LOOK AT YOUR TREZOR — confirm the message displayed matches.\n')
const sigB = await signer.signMessage({ message })
console.log(`✅ Signature: ${sigB}`)
console.log('   This signature is bound to that exact string only.')
console.log('   It cannot be replayed for any tx, transfer, or contract call.\n')

if (!wantTyped) {
  console.log('Done. Re-run with --sign-typed to test EIP-712 flow.')
  process.exit(0)
}

console.log('=== Phase C — EIP-712 sign with BOGUS verifyingContract ===')
const fakeSafe = '0x000000000000000000000000000000000000dEaD' as const
console.log(`verifyingContract: ${fakeSafe}  (intentionally non-existent)`)
console.log('LOOK AT YOUR TREZOR — confirm the contract address shown is 0x000…dEaD.')
console.log('If it shows ANY OTHER address, REJECT the signature.\n')
const sigC = await signer.signTypedData({
  domain: {
    chainId: 1155,
    verifyingContract: fakeSafe,
  },
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
    to: fakeSafe,
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
console.log(`✅ Signature: ${sigC}`)
console.log('   Bound to a non-existent Safe — useless on mainnet.\n')

console.log('All phases passed. Your Trezor signer is ready for real Safe ops.')
process.exit(0)
