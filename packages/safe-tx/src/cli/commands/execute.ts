import { Command, Option } from 'commander'
import { createPublicClient, createWalletClient, getAddress, http, type Hex } from 'viem'
import { createApiKitClient } from '../../modes/api-kit.js'
import {
  aggregateSignatures,
  executeSafeTx,
  type SafeTxPayload,
  type SignedSafeTx,
} from '../../modes/direct-sign.js'
import { buildSafeUiUrl, getViemChain } from '../../networks.js'
import { resolveContext, type CommonOpts } from '../common.js'

export function buildExecuteCommand(): Command {
  return new Command('execute')
    .description('Execute a fully-signed Safe tx on-chain')
    .requiredOption('--hash <safeTxHash>', 'safeTxHash to execute')
    .option('--safe <address>', 'Safe multisig address (or env SAFE_ADDRESS_MAINNET)')
    .option('--network <name>', 'Target network', 'intuition-mainnet')
    .addOption(
      new Option('--signer <strategy>', 'Signer strategy for the executor (does not need to be a Safe owner)')
        .choices(['env', 'walletconnect', 'ledger'])
        .default('env'),
    )
    .action(
      async (rawOpts: { hash: string } & CommonOpts) => {
        const ctx = await resolveContext(rawOpts)
        const sts = createApiKitClient({ txServiceUrl: ctx.network.txServiceUrl })
        const tx = await sts.getTx(rawOpts.hash as Hex)

        if (tx.confirmations.length === 0) {
          throw new Error('safe-tx: no confirmations on this tx — propose + confirm first')
        }

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

        const signed: SignedSafeTx[] = tx.confirmations.map((c) => ({
          signer: getAddress(c.owner),
          sig: c.signature as Hex,
        }))
        const signatures = aggregateSignatures(signed)

        const chain = getViemChain(ctx.network)
        const publicClient = createPublicClient({ chain, transport: http(ctx.network.rpcUrl) })
        const walletClient = createWalletClient({
          chain,
          transport: http(ctx.network.rpcUrl),
          account: ctx.signer,
        })

        const txHash = await executeSafeTx({
          payload,
          signatures,
          walletClient,
          account: ctx.signer.address,
        })
        console.log(`⏳ Submitted: ${txHash}`)
        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash })
        if (receipt.status === 'success') {
          console.log(`✅ Executed in block ${receipt.blockNumber}`)
        } else {
          console.log(`❌ Reverted in block ${receipt.blockNumber}`)
          process.exit(1)
        }
        console.log(`   Den UI: ${buildSafeUiUrl(ctx.network, ctx.safe)}`)
      },
    )
}
