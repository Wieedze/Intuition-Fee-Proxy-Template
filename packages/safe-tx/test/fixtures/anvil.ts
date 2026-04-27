import { spawn, type ChildProcess } from 'node:child_process'
import { ANVIL_HOST, ANVIL_PORT, FORK_BLOCK, INTUITION_CHAIN_ID, INTUITION_RPC } from './constants.js'

export type AnvilFork = {
  rpcUrl: string
  stop: () => Promise<void>
}

export type StartAnvilForkOptions = {
  port?: number
  forkBlock?: number
  rpcUrl?: string
  silent?: boolean
}

/**
 * Spawn an Anvil instance forking Intuition mainnet at FORK_BLOCK.
 *
 * Resolves once the RPC accepts requests. The returned `stop()` sends
 * SIGTERM and waits for the process to exit.
 *
 * Anvil (Foundry) must be in PATH. Install: https://getfoundry.sh
 */
export async function startAnvilFork(opts: StartAnvilForkOptions = {}): Promise<AnvilFork> {
  const port = opts.port ?? ANVIL_PORT
  const forkUrl = opts.rpcUrl ?? INTUITION_RPC
  const forkBlock = opts.forkBlock ?? FORK_BLOCK
  const silent = opts.silent ?? true

  const args = [
    '--fork-url', forkUrl,
    '--fork-block-number', String(forkBlock),
    '--chain-id', String(INTUITION_CHAIN_ID),
    '--host', ANVIL_HOST,
    '--port', String(port),
  ]
  if (silent) args.push('--silent')

  const proc = spawn('anvil', args, { stdio: silent ? 'ignore' : 'inherit' })

  const rpcUrl = `http://${ANVIL_HOST}:${port}`

  proc.on('error', (err) => {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(
        'anvil not found in PATH. Install Foundry: curl -L https://foundry.paradigm.xyz | bash && foundryup',
      )
    }
    throw err
  })

  await waitForRpcReady(rpcUrl)

  return {
    rpcUrl,
    stop: () => stopAnvil(proc),
  }
}

async function waitForRpcReady(rpcUrl: string, timeoutMs = 20_000): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }),
      })
      if (res.ok) {
        const json = (await res.json()) as { result?: string }
        if (json.result) return
      }
    } catch {
      // RPC not up yet
    }
    await sleep(200)
  }
  throw new Error(`Anvil RPC at ${rpcUrl} did not become ready within ${timeoutMs}ms`)
}

async function stopAnvil(proc: ChildProcess): Promise<void> {
  if (proc.killed) return
  return new Promise<void>((resolve) => {
    proc.once('exit', () => resolve())
    proc.kill('SIGTERM')
    setTimeout(() => {
      if (!proc.killed) proc.kill('SIGKILL')
      resolve()
    }, 3_000)
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
