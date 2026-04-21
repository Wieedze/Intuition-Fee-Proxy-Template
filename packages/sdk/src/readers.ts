/**
 * Framework-agnostic readers — use them from any environment that has a viem
 * PublicClient (Node scripts, Next.js RSC, Cloudflare Workers…). The webapp
 * uses wagmi hooks that call these same contract functions; keep the two in
 * sync when adding new reads.
 */

import type { Address, PublicClient } from 'viem'

import {
  IntuitionFeeProxyFactoryABI,
  IntuitionFeeProxyV2ABI,
  IntuitionFeeProxyV2SponsoredABI,
  IntuitionVersionedFeeProxyABI,
} from './index'

export type ProxyStats = {
  ethMultiVault: Address
  depositFixedFee: bigint
  depositPercentageFee: bigint
  accumulatedFees: bigint
  totalFeesCollectedAllTime: bigint
  adminCount: bigint
}

export type ProxyMetrics = {
  totalAtomsCreated: bigint
  totalTriplesCreated: bigint
  totalDeposits: bigint
  totalVolume: bigint
  totalUniqueUsers: bigint
  lastActivityBlock: bigint
}

export type SponsoredMetrics = {
  sponsoredDeposits: bigint
  sponsoredVolume: bigint
  uniqueSponsoredReceivers: bigint
}

/** Every proxy ever deployed via the factory, in deployment order. */
export async function fetchAllProxies(
  client: PublicClient,
  factory: Address,
): Promise<readonly Address[]> {
  return (await client.readContract({
    abi: IntuitionFeeProxyFactoryABI as any,
    address: factory,
    functionName: 'getAllProxies',
  })) as readonly Address[]
}

/** Proxies a given deployer wallet has created. */
export async function fetchProxiesByDeployer(
  client: PublicClient,
  factory: Address,
  deployer: Address,
): Promise<readonly Address[]> {
  return (await client.readContract({
    abi: IntuitionFeeProxyFactoryABI as any,
    address: factory,
    functionName: 'getProxiesByDeployer',
    args: [deployer],
  })) as readonly Address[]
}

/** Batch-read the 6 headline stats for a proxy instance.
 *
 * Hybrid dispatch: tries `client.multicall()` first (1 RPC round-trip on
 * chains with Multicall3 deployed — testnet + mainnet), falls back to
 * parallel `readContract` calls (N round-trips) on chains without —
 * typically a fresh hardhat node. Both paths return identical data; the
 * fallback just costs more HTTP hops, not more on-chain gas.
 */
export async function readProxyStats(
  client: PublicClient,
  proxy: Address,
): Promise<ProxyStats> {
  const abi = IntuitionFeeProxyV2ABI as any
  const contracts = [
    { abi, address: proxy, functionName: 'ethMultiVault' },
    { abi, address: proxy, functionName: 'depositFixedFee' },
    { abi, address: proxy, functionName: 'depositPercentageFee' },
    { abi, address: proxy, functionName: 'accumulatedFees' },
    { abi, address: proxy, functionName: 'totalFeesCollectedAllTime' },
    { abi, address: proxy, functionName: 'adminCount' },
  ] as const

  let results: readonly unknown[]
  try {
    results = await client.multicall({ allowFailure: false, contracts: contracts as any })
  } catch {
    results = await Promise.all(
      contracts.map((c) => client.readContract(c as any)),
    )
  }
  const [ethMultiVault, depositFixedFee, depositPercentageFee, accumulatedFees, totalFeesCollectedAllTime, adminCount] = results
  return {
    ethMultiVault: ethMultiVault as Address,
    depositFixedFee: depositFixedFee as bigint,
    depositPercentageFee: depositPercentageFee as bigint,
    accumulatedFees: accumulatedFees as bigint,
    totalFeesCollectedAllTime: totalFeesCollectedAllTime as bigint,
    adminCount: adminCount as bigint,
  }
}

/** Aggregate on-chain metrics emitted on every write-path. */
export async function readProxyMetrics(
  client: PublicClient,
  proxy: Address,
): Promise<ProxyMetrics> {
  const raw = (await client.readContract({
    abi: IntuitionFeeProxyV2ABI as any,
    address: proxy,
    functionName: 'getMetrics',
  })) as {
    totalAtomsCreated: bigint
    totalTriplesCreated: bigint
    totalDeposits: bigint
    totalVolume: bigint
    totalUniqueUsers: bigint
    lastActivityBlock: bigint
  }
  return { ...raw }
}

/**
 * Reads the on-chain `version()` label. Returns `undefined` if the impl
 * predates the versioned layout. Used to infer the proxy family:
 *   label containing "-sponsored" → sponsored
 *   otherwise                      → standard
 */
export async function readProxyVersionLabel(
  client: PublicClient,
  proxy: Address,
): Promise<string | undefined> {
  try {
    // MUST use the Sponsored ABI — `version()` is declared on V2Sponsored
    // only (V2 base doesn't have it). Using the V2 ABI would make viem
    // reject the call client-side ("function not found in ABI") and we'd
    // never even hit the chain, so every proxy would look standard.
    return (await client.readContract({
      abi: IntuitionFeeProxyV2SponsoredABI as any,
      address: proxy,
      functionName: 'version',
    })) as string
  } catch {
    // V2 standard proxies revert on-chain (function selector not found).
    // That's the signal used by callers to classify the channel.
    return undefined
  }
}

/** Sponsor pool balance (sponsored-family proxies only). */
export async function readSponsorPool(
  client: PublicClient,
  proxy: Address,
): Promise<bigint | undefined> {
  try {
    return (await client.readContract({
      abi: IntuitionFeeProxyV2SponsoredABI as any,
      address: proxy,
      functionName: 'sponsorPool',
    })) as bigint
  } catch {
    return undefined
  }
}

/** Sponsored-only aggregate metrics. */
export async function readSponsoredMetrics(
  client: PublicClient,
  proxy: Address,
): Promise<SponsoredMetrics | undefined> {
  try {
    const [a, b, c] = (await client.readContract({
      abi: IntuitionFeeProxyV2SponsoredABI as any,
      address: proxy,
      functionName: 'getSponsoredMetrics',
    })) as [bigint, bigint, bigint]
    return {
      sponsoredDeposits: a,
      sponsoredVolume: b,
      uniqueSponsoredReceivers: c,
    }
  } catch {
    return undefined
  }
}

/** Registered version labels + current default + current + pending proxy admin.
 *
 * Hybrid dispatch: Multicall3 with `allowFailure: true` on chains that
 * support it (per-field revert tolerant — older impls missing
 * `pendingProxyAdmin` don't break the read), parallel per-field reads
 * otherwise. Both return identical shape.
 */
export async function readProxyVersions(
  client: PublicClient,
  proxy: Address,
): Promise<{
  versions: readonly `0x${string}`[]
  defaultVersion: `0x${string}` | undefined
  proxyAdmin: Address | undefined
  pendingProxyAdmin: Address | undefined
}> {
  const abi = IntuitionVersionedFeeProxyABI as any
  const contracts = [
    { abi, address: proxy, functionName: 'getVersions' },
    { abi, address: proxy, functionName: 'getDefaultVersion' },
    { abi, address: proxy, functionName: 'proxyAdmin' },
    { abi, address: proxy, functionName: 'pendingProxyAdmin' },
  ] as const

  try {
    const [versions, defaultVersion, proxyAdmin, pendingProxyAdmin] =
      await client.multicall({ allowFailure: true, contracts: contracts as any })
    return {
      versions: versions.status === 'success' ? (versions.result as readonly `0x${string}`[]) : [],
      defaultVersion: defaultVersion.status === 'success' ? (defaultVersion.result as `0x${string}`) : undefined,
      proxyAdmin: proxyAdmin.status === 'success' ? (proxyAdmin.result as Address) : undefined,
      pendingProxyAdmin: pendingProxyAdmin.status === 'success' ? (pendingProxyAdmin.result as Address) : undefined,
    }
  } catch {
    // Fallback — no Multicall3 on this chain. Per-field try-catch so a
    // single-field revert doesn't poison the whole read.
    const safe = <T>(p: Promise<T>): Promise<T | undefined> => p.catch(() => undefined)
    const [versions, defaultVersion, proxyAdmin, pendingProxyAdmin] = await Promise.all([
      safe(client.readContract(contracts[0] as any) as Promise<readonly `0x${string}`[]>),
      safe(client.readContract(contracts[1] as any) as Promise<`0x${string}`>),
      safe(client.readContract(contracts[2] as any) as Promise<Address>),
      safe(client.readContract(contracts[3] as any) as Promise<Address>),
    ])
    return {
      versions: versions ?? [],
      defaultVersion,
      proxyAdmin,
      pendingProxyAdmin,
    }
  }
}
