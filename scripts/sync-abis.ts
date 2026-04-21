#!/usr/bin/env bun
/**
 * Sync ABIs from compiled contracts to the SDK package.
 * Run after `bun contracts:compile`.
 */
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { existsSync } from 'node:fs'

const ROOT = join(import.meta.dir, '..')
const ARTIFACTS = join(ROOT, 'packages/contracts/artifacts/src')
const SDK_ABIS = join(ROOT, 'packages/sdk/src/abis')

const CONTRACTS_TO_EXPORT = [
  'IntuitionFeeProxy',
  'IntuitionFeeProxyV2',
  'IntuitionFeeProxyV2Sponsored',
  'IntuitionFeeProxyFactory',
  'IntuitionVersionedFeeProxy',
]

async function main() {
  if (!existsSync(ARTIFACTS)) {
    console.error(`Artifacts directory not found: ${ARTIFACTS}`)
    console.error('Run `bun contracts:compile` first.')
    process.exit(1)
  }

  await mkdir(SDK_ABIS, { recursive: true })

  const exported: string[] = []

  async function walk(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(fullPath)
        continue
      }
      if (!entry.name.endsWith('.json') || entry.name.endsWith('.dbg.json')) continue

      const contractName = entry.name.replace('.json', '')
      if (!CONTRACTS_TO_EXPORT.includes(contractName)) continue

      const artifact = JSON.parse(await readFile(fullPath, 'utf-8'))
      const abi = artifact.abi
      const outPath = join(SDK_ABIS, `${contractName}.json`)
      await writeFile(outPath, JSON.stringify(abi, null, 2))
      exported.push(contractName)
      console.log(`  ✓ ${contractName} → ${outPath}`)
    }
  }

  console.log('Syncing ABIs to SDK...')
  await walk(ARTIFACTS)

  if (exported.length === 0) {
    console.warn('No ABIs exported. Check CONTRACTS_TO_EXPORT list.')
  } else {
    console.log(`\nSynced ${exported.length} ABI(s).`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
