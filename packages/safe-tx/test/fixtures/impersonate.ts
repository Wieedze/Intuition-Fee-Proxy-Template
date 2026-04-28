import type { Address } from 'viem'

/**
 * Anvil impersonation helpers. Lets tests act as Safe owners without
 * holding their private keys — Anvil accepts `eth_sendTransaction` from
 * any impersonated account on the fork.
 */

async function rpc(rpcUrl: string, method: string, params: unknown[]): Promise<unknown> {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  if (!res.ok) {
    throw new Error(`Anvil RPC ${method} failed: HTTP ${res.status}`)
  }
  const json = (await res.json()) as { result?: unknown; error?: { message: string } }
  if (json.error) {
    throw new Error(`Anvil RPC ${method} error: ${json.error.message}`)
  }
  return json.result
}

export async function impersonate(rpcUrl: string, address: Address): Promise<void> {
  await rpc(rpcUrl, 'anvil_impersonateAccount', [address])
}

export async function stopImpersonating(rpcUrl: string, address: Address): Promise<void> {
  await rpc(rpcUrl, 'anvil_stopImpersonatingAccount', [address])
}

/** Set a balance on the fork. `balance` is in wei. */
export async function setBalance(rpcUrl: string, address: Address, balance: bigint): Promise<void> {
  await rpc(rpcUrl, 'anvil_setBalance', [address, `0x${balance.toString(16)}`])
}

/** Convenience: impersonate AND fund with 100 ETH so subsequent tx don't fail on gas. */
export async function impersonateAndFund(rpcUrl: string, address: Address): Promise<void> {
  await impersonate(rpcUrl, address)
  await setBalance(rpcUrl, address, 100n * 10n ** 18n)
}
