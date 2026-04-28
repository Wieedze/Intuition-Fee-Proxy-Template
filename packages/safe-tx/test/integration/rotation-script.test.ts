import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Smoke tests for the transferAdminToSafe.ts CLI script. We don't run
 * the full rotation against a real proxy here (would require deploying
 * a mock V2 proxy on Anvil fork, ~1-2h of plumbing). Instead we verify
 * the script's process-level behavior:
 *
 * - --help prints usage and exits 0
 * - missing required flags surface clear errors
 * - --dry-run can run without PROPOSER_PK env var set
 *
 * The on-chain rotation mechanics are covered by:
 *   - test/integration/direct-sign.test.ts (Safe execTransaction flow)
 *   - test/integration/api-kit.test.ts     (STS propose flow)
 *   - test/unit/ops/v2-admin.test.ts       (setWhitelistedAdmin builder)
 */

const SCRIPT = resolve(
  __dirname,
  '..',
  '..',
  'scripts',
  'transferAdminToSafe.ts',
)

function runScript(args: string[], env: Record<string, string> = {}): {
  stdout: string
  stderr: string
  status: number | null
} {
  const result = spawnSync('bun', [SCRIPT, ...args], {
    encoding: 'utf-8',
    env: { ...process.env, ...env },
    timeout: 30_000,
  })
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    status: result.status,
  }
}

describe('transferAdminToSafe script — smoke', () => {
  it('--help exits 0 and prints usage', () => {
    const { stdout, status } = runScript(['--help'])
    expect(status).toBe(0)
    expect(stdout).toContain('transferAdminToSafe')
    expect(stdout).toContain('--proxy')
    expect(stdout).toContain('--safe')
    expect(stdout).toContain('--eoa')
    expect(stdout).toContain('--dry-run')
  })

  it('missing --proxy fails with a clear required-option error', () => {
    const { stderr, status } = runScript([
      '--safe',
      '0xf10D442D0fB934D4037DC30769a6EfCf2f54F7B6',
      '--eoa',
      '0xc634457aD68b037E2D5aA1C10c3930d7e4E2d551',
    ])
    expect(status).not.toBe(0)
    expect(stderr).toMatch(/required option/i)
    expect(stderr).toContain('--proxy')
  })

  it('--dry-run does not require PROPOSER_PK env var', () => {
    // Use a non-existent proxy address — the dry-run still hits the
    // network to read whitelistedAdmins (which will revert because no
    // contract). We expect a non-zero exit but NOT the missing-key error.
    const { stderr, status } = runScript(
      [
        '--proxy',
        '0x000000000000000000000000000000000000dEaD',
        '--safe',
        '0xf10D442D0fB934D4037DC30769a6EfCf2f54F7B6',
        '--eoa',
        '0xc634457aD68b037E2D5aA1C10c3930d7e4E2d551',
        '--dry-run',
      ],
      { PROPOSER_PK: '' },
    )
    // We don't care about the network outcome — only that the script
    // didn't bail on the env-var check.
    expect(status).not.toBe(0)
    expect(stderr).not.toMatch(/PROPOSER_PK env var required/)
  }, 30_000)
})
