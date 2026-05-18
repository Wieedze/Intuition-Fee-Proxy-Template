import { createPublicClient, http } from 'viem'
import { Command, Option } from 'commander'
import { OP_REGISTRY, parseOpFlags, type OpRegistration } from '../op-registry.js'
import { buildSafeUiUrl, getViemChain } from '../../networks.js'
import { createApiKitClient } from '../../modes/api-kit.js'
import { buildSafeTx, signSafeTx } from '../../modes/direct-sign.js'
import { resolveContext, type CommonOpts } from '../common.js'

/** Build one Commander subcommand per registered AdminOp. */
export function buildProposeCommands(): Command[] {
  return OP_REGISTRY.map((op) => buildProposeCommand(op))
}

function buildProposeCommand(op: OpRegistration): Command {
  const cmd = new Command(op.name).description(op.description)

  for (const flag of op.flags) {
    const opt = `--${flag.name} <value>`
    if (flag.required) cmd.requiredOption(opt, flag.description)
    else cmd.option(opt, flag.description)
  }

  cmd.option('--safe <address>', 'Safe multisig address (or env SAFE_ADDRESS_MAINNET)')
  cmd.option('--network <name>', 'Target network', 'intuition-mainnet')
  cmd.addOption(
    new Option('--signer <strategy>', 'Signer strategy')
      .choices(['env', 'walletconnect', 'ledger', 'trezor'])
      .default('env'),
  )

  cmd.action(async (rawOpts: Record<string, string | undefined> & CommonOpts) => {
    const ctx = await resolveContext(rawOpts)
    const args = parseOpFlags(op, rawOpts)
    const adminOp = op.build(args)

    const client = createPublicClient({
      chain: getViemChain(ctx.network),
      transport: http(ctx.network.rpcUrl),
    })
    const payload = await buildSafeTx(
      { safe: ctx.safe, chainId: ctx.network.chainId, op: adminOp },
      client,
    )
    const signed = await signSafeTx(payload, ctx.signer)

    const sts = createApiKitClient({ txServiceUrl: ctx.network.txServiceUrl })
    await sts.propose(payload, signed)

    console.log(`✅ Proposed: ${adminOp.description}`)
    console.log(`   safeTxHash:  ${payload.safeTxHash}`)
    console.log(`   nonce:       ${payload.message.nonce}`)
    console.log(`   proposer:    ${ctx.signer.address}`)
    console.log(`   Den UI:      ${buildSafeUiUrl(ctx.network, ctx.safe)}`)
  })

  return cmd
}
