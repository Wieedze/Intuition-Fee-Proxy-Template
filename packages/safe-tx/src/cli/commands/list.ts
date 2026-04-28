import { Command } from 'commander'
import { getAddress } from 'viem'
import { createApiKitClient } from '../../modes/api-kit.js'
import { INTUITION_MAINNET, buildSafeUiUrl } from '../../networks.js'

export function buildListCommand(): Command {
  return new Command('list')
    .description('List pending Safe transactions for a Safe')
    .option('--safe <address>', 'Safe multisig address (or env SAFE_ADDRESS_MAINNET)')
    .option('--network <name>', 'Target network', 'intuition-mainnet')
    .action(async (rawOpts: { safe?: string; network?: string }) => {
      const safeStr = rawOpts.safe ?? process.env.SAFE_ADDRESS_MAINNET
      if (!safeStr) {
        throw new Error('safe-tx: --safe required (or set SAFE_ADDRESS_MAINNET in env)')
      }
      const safe = getAddress(safeStr)

      if ((rawOpts.network ?? 'intuition-mainnet') !== 'intuition-mainnet') {
        throw new Error('safe-tx: only intuition-mainnet is supported')
      }
      const network = INTUITION_MAINNET
      const sts = createApiKitClient({ txServiceUrl: network.txServiceUrl })
      const pending = await sts.getPendingTxs(safe)

      if (pending.length === 0) {
        console.log(`No pending transactions for ${safe}`)
        return
      }
      console.log(`Pending transactions for ${safe}:`)
      for (const tx of pending) {
        console.log(`  - ${tx.contractTransactionHash}`)
        console.log(`    nonce: ${tx.nonce}  to: ${tx.to}  confirmations: ${tx.confirmations.length}`)
      }
      console.log(`\nDen UI: ${buildSafeUiUrl(network, safe)}`)
    })
}
