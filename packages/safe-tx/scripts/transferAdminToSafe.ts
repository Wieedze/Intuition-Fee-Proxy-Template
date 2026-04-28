#!/usr/bin/env bun
/**
 * One-shot rotation: grant the Safe admin role on a V2 fee proxy, then
 * propose a SafeTx that revokes the EOA admin. After Safe owners
 * co-sign and execute the proposed revoke, the Safe is the sole admin.
 *
 * Usage:
 *   bun packages/safe-tx/scripts/transferAdminToSafe.ts \
 *     --proxy 0xPROXY \
 *     --safe 0xSAFE \
 *     --eoa 0xEOA \
 *     [--no-revoke]   # only grant Safe; skip propose-revoke
 *     [--dry-run]     # print plan, send nothing
 *
 * Required env: PROPOSER_PK
 *   Must hold the EOA admin's private key (used to sign the grant tx
 *   AND to propose the revoke SafeTx). The address derived from this
 *   key must also be a Safe owner — otherwise the propose POST is
 *   rejected by Den's STS.
 */

import { Command } from 'commander'
import {
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
  type Address,
  type Hex,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { createApiKitClient } from '../src/modes/api-kit.js'
import { buildSafeTx, signSafeTx } from '../src/modes/direct-sign.js'
import { INTUITION_MAINNET, buildSafeUiUrl, getViemChain } from '../src/networks.js'
import * as v2 from '../src/ops/v2-admin.js'

const PROXY_ADMIN_ABI = [
  {
    type: 'function',
    name: 'whitelistedAdmins',
    inputs: [{ name: 'admin', type: 'address' }],
    outputs: [{ type: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'setWhitelistedAdmin',
    inputs: [
      { name: 'admin', type: 'address' },
      { name: 'status', type: 'bool' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const

type Opts = {
  proxy: string
  safe: string
  eoa: string
  revoke: boolean
  dryRun?: boolean
}

const program = new Command()
  .name('transferAdminToSafe')
  .description('Rotate V2 proxy admin from an EOA to a Safe multisig (one-shot migration)')
  .requiredOption('--proxy <address>', 'V2 fee proxy address')
  .requiredOption('--safe <address>', 'Target Safe multisig address')
  .requiredOption('--eoa <address>', 'Current EOA admin address (will be revoked)')
  .option('--no-revoke', 'Only grant Safe admin; do not propose the EOA revoke')
  .option('--dry-run', 'Print plan and exit without sending any tx')
  .action(async (opts: Opts) => {
    const proxy = getAddress(opts.proxy)
    const safe = getAddress(opts.safe)
    const eoa = getAddress(opts.eoa)

    const network = INTUITION_MAINNET
    const chain = getViemChain(network)
    const publicClient = createPublicClient({ chain, transport: http(network.rpcUrl) })

    const [eoaIsAdmin, safeIsAdmin] = await Promise.all([
      publicClient.readContract({
        address: proxy,
        abi: PROXY_ADMIN_ABI,
        functionName: 'whitelistedAdmins',
        args: [eoa],
      }),
      publicClient.readContract({
        address: proxy,
        abi: PROXY_ADMIN_ABI,
        functionName: 'whitelistedAdmins',
        args: [safe],
      }),
    ])

    console.log(`Proxy:  ${proxy}`)
    console.log(`Safe:   ${safe}  (admin? ${safeIsAdmin})`)
    console.log(`EOA:    ${eoa}   (admin? ${eoaIsAdmin})`)
    console.log('')

    if (!eoaIsAdmin && !safeIsAdmin) {
      throw new Error(`Neither EOA nor Safe is currently an admin of ${proxy} — nothing to rotate from`)
    }

    const pk = process.env.PROPOSER_PK as Hex | undefined
    if (!pk && !opts.dryRun) {
      throw new Error('PROPOSER_PK env var required (the EOA admin private key, also a Safe owner)')
    }

    // ----- Step 1: grant Safe admin via EOA -----
    if (safeIsAdmin) {
      console.log('Step 1: skipped — Safe is already admin')
    } else if (opts.dryRun) {
      console.log(`Step 1 [dry-run]: would call setWhitelistedAdmin(${safe}, true) from ${eoa}`)
    } else {
      console.log('Step 1: granting Safe admin via EOA...')
      const account = privateKeyToAccount(pk!)
      if (account.address.toLowerCase() !== eoa.toLowerCase()) {
        throw new Error(
          `PROPOSER_PK derives ${account.address} but --eoa is ${eoa}. Step 1 needs the EOA's key.`,
        )
      }
      const walletClient = createWalletClient({ chain, transport: http(network.rpcUrl), account })
      const txHash = await walletClient.writeContract({
        address: proxy,
        abi: PROXY_ADMIN_ABI,
        functionName: 'setWhitelistedAdmin',
        args: [safe, true],
      })
      console.log(`  ⏳ Submitted: ${txHash}`)
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash })
      if (receipt.status !== 'success') {
        throw new Error(`Step 1 reverted: ${txHash} (block ${receipt.blockNumber})`)
      }
      console.log(`  ✅ Granted in block ${receipt.blockNumber}`)
    }

    // ----- Step 2: propose SafeTx to revoke EOA -----
    if (!opts.revoke) {
      console.log('Step 2: skipped (--no-revoke). Run with revoke later via:')
      console.log(`  bun safe:tx set-whitelisted-admin --proxy ${proxy} --admin ${eoa} --status false --safe ${safe}`)
    } else if (!eoaIsAdmin) {
      console.log('Step 2: skipped — EOA is already not admin')
    } else if (opts.dryRun) {
      console.log(`Step 2 [dry-run]: would propose setWhitelistedAdmin(${eoa}, false) via Safe`)
    } else {
      console.log('Step 2: proposing SafeTx to revoke EOA admin...')
      const op = v2.setWhitelistedAdmin(proxy, eoa, false)
      const account = privateKeyToAccount(pk!)
      const payload = await buildSafeTx(
        { safe, chainId: network.chainId, op },
        publicClient,
      )
      const signed = await signSafeTx(payload, account)
      const sts = createApiKitClient({ txServiceUrl: network.txServiceUrl })
      await sts.propose(payload, signed)
      console.log(`  ✅ Proposed: ${payload.safeTxHash}`)
      console.log(`     Den UI:  ${buildSafeUiUrl(network, safe)}`)
      console.log(`     Owners must co-sign in Den, then run:`)
      console.log(`       bun safe:tx execute --hash ${payload.safeTxHash} --safe ${safe}`)
    }

    console.log('\nDone.')
  })

program.parseAsync(process.argv).catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err)
  console.error(`transferAdminToSafe error: ${msg}`)
  process.exit(1)
})
