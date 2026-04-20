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

/** Batch-read the 6 headline stats for a proxy instance. */
export async function readProxyStats(
  client: PublicClient,
  proxy: Address,
): Promise<ProxyStats> {
  const [
    ethMultiVault,
    depositFixedFee,
    depositPercentageFee,
    accumulatedFees,
    totalFeesCollectedAllTime,
    adminCount,
  ] = await client.multicall({
    allowFailure: false,
    contracts: [
      { abi: IntuitionFeeProxyV2ABI as any, address: proxy, functionName: 'ethMultiVault' },
      { abi: IntuitionFeeProxyV2ABI as any, address: proxy, functionName: 'depositFixedFee' },
      { abi: IntuitionFeeProxyV2ABI as any, address: proxy, functionName: 'depositPercentageFee' },
      { abi: IntuitionFeeProxyV2ABI as any, address: proxy, functionName: 'accumulatedFees' },
      { abi: IntuitionFeeProxyV2ABI as any, address: proxy, functionName: 'totalFeesCollectedAllTime' },
      { abi: IntuitionFeeProxyV2ABI as any, address: proxy, functionName: 'adminCount' },
    ],
  })
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
    return (await client.readContract({
      abi: IntuitionFeeProxyV2ABI as any,
      address: proxy,
      functionName: 'version',
    })) as string
  } catch {
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

/** Registered version labels + current default + proxyAdmin. */
export async function readProxyVersions(
  client: PublicClient,
  proxy: Address,
): Promise<{
  versions: readonly `0x${string}`[]
  defaultVersion: `0x${string}` | undefined
  proxyAdmin: Address | undefined
}> {
  const [versions, defaultVersion, proxyAdmin] = await client.multicall({
    allowFailure: true,
    contracts: [
      { abi: IntuitionVersionedFeeProxyABI as any, address: proxy, functionName: 'getVersions' },
      { abi: IntuitionVersionedFeeProxyABI as any, address: proxy, functionName: 'defaultVersion' },
      { abi: IntuitionVersionedFeeProxyABI as any, address: proxy, functionName: 'proxyAdmin' },
    ],
  })
  return {
    versions:
      versions.status === 'success'
        ? (versions.result as readonly `0x${string}`[])
        : [],
    defaultVersion:
      defaultVersion.status === 'success'
        ? (defaultVersion.result as `0x${string}`)
        : undefined,
    proxyAdmin:
      proxyAdmin.status === 'success'
        ? (proxyAdmin.result as Address)
        : undefined,
  }
}
