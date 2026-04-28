import { Command, Option } from 'commander'
import type { Hex } from 'viem'
import { createApiKitClient } from '../../modes/api-kit.js'
import { signSafeTx, type SafeTxPayload } from '../../modes/direct-sign.js'
import { buildSafeUiUrl } from '../../networks.js'
import { resolveContext, type CommonOpts } from '../common.js'

export function buildConfirmCommand(): Command {
  return new Command('confirm')
    .description('Add your signature to a previously proposed Safe tx')
    .requiredOption('--hash <safeTxHash>', 'safeTxHash returned by propose')
    .option('--safe <address>', 'Safe multisig address (or env SAFE_ADDRESS_MAINNET)')
    .option('--network <name>', 'Target network', 'intuition-mainnet')
    .addOption(
      new Option('--signer <strategy>', 'Signer strategy')
        .choices(['env', 'walletconnect', 'ledger', 'trezor'])
        .default('env'),
    )
    .action(
      async (rawOpts: { hash: string } & CommonOpts) => {
        const ctx = await resolveContext(rawOpts)
        const sts = createApiKitClient({ txServiceUrl: ctx.network.txServiceUrl })
        const tx = await sts.getTx(rawOpts.hash as Hex)

        const payload: SafeTxPayload = {
          safe: ctx.safe,
          chainId: ctx.network.chainId,
          message: {
            to: tx.to,
            value: BigInt(tx.value),
            data: tx.data,
            operation: tx.operation === 1 ? 1 : 0,
            safeTxGas: BigInt(tx.safeTxGas),
            baseGas: BigInt(tx.baseGas),
            gasPrice: BigInt(tx.gasPrice),
            gasToken: tx.gasToken,
            refundReceiver: tx.refundReceiver,
            nonce: BigInt(tx.nonce),
          },
          safeTxHash: tx.contractTransactionHash,
        }

        const signed = await signSafeTx(payload, ctx.signer)
        await sts.confirm(payload.safeTxHash, signed)

        console.log(`✅ Confirmed: ${payload.safeTxHash}`)
        console.log(`   confirmer:   ${ctx.signer.address}`)
        console.log(`   confirmations now: ${tx.confirmations.length + 1}`)
        console.log(`   Den UI:      ${buildSafeUiUrl(ctx.network, ctx.safe)}`)
      },
    )
}
