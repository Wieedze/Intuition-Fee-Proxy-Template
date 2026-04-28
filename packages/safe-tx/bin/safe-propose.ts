#!/usr/bin/env bun
import { Command } from 'commander'
import { buildConfirmCommand } from '../src/cli/commands/confirm.js'
import { buildExecuteCommand } from '../src/cli/commands/execute.js'
import { buildListCommand } from '../src/cli/commands/list.js'
import { buildProposeCommands } from '../src/cli/commands/propose.js'

const program = new Command()
  .name('safe-propose')
  .description(
    'Safe admin tooling for the Intuition fee-proxy template — propose, sign, and execute admin operations against a Gnosis Safe via Den Safe Transaction Service.',
  )
  .version('2.0.0-alpha')

for (const cmd of buildProposeCommands()) {
  program.addCommand(cmd)
}
program.addCommand(buildConfirmCommand())
program.addCommand(buildExecuteCommand())
program.addCommand(buildListCommand())

program.parseAsync(process.argv).catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err)
  console.error(`safe-propose error: ${msg}`)
  process.exit(1)
})
