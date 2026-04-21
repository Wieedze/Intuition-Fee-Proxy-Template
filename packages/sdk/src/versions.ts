/**
 * Canonical registry of reviewed implementation versions per network.
 *
 * This file is the single source of truth for "what impl should proxy admins
 * adopt?". It's intentionally separated from on-chain data: the Factory only
 * stores raw implementation addresses, never metadata — review links, publish
 * dates and human-readable labels live here, off-chain, bumped via SDK
 * releases.
 *
 * Entries are added by the maintainers (Intuition team) after an impl is
 * reviewed, deployed, and verified on the explorer. Consumers read this
 * object to build dropdowns, banners and freshness checks; they never have
 * to maintain a parallel table themselves.
 *
 * An empty `versions` map is the expected state right after Factory
 * deployment and before the first canonical release — the surrounding UI
 * should degrade gracefully (no banner shown, "advanced paste" mode still
 * usable).
 */

import type { NetworkName } from './addresses'

export type ProxyFamily = 'standard' | 'sponsored'

export type CanonicalVersion = {
  /** Label as registered on-chain via `registerVersion(label, impl)`. */
  label: string
  /** Deployed, verified implementation address. */
  impl: `0x${string}`
  /** Which family of proxy this impl serves. */
  family: ProxyFamily
  /** Internal review reference. Absent means "not in the canonical registry — third-party, advanced users only". */
  review?: {
    url: string
    /** ISO 8601 date — e.g. "2026-04-15". */
    date: string
  }
  /** Block number the impl was deployed at. Useful for freshness heuristics. */
  publishedAt?: number
  /** One-line changelog — shown in the banner / dropdown. */
  summary?: string
}

export type CanonicalRegistry = {
  versions: Record<string, CanonicalVersion>
  latest: Partial<Record<ProxyFamily, string>>
}

/**
 * Network-keyed canonical registry.
 *
 * Populated via SDK releases — bumping `@intuition-fee-proxy/sdk@x.y.z`
 * adds or replaces the `latest` pointer for a family. Old labels remain
 * present so proxies pinned to them keep resolving.
 */
export const CANONICAL_VERSIONS: Record<NetworkName, CanonicalRegistry> = {
  mainnet: {
    versions: {},
    latest: {},
  },
  testnet: {
    versions: {
      'v2.0.0': {
        label: 'v2.0.0',
        impl: '0x26F81d723Ad1648194FAA4b7E235105Fd1212c6c',
        family: 'standard',
        review: { url: 'https://github.com/Wieedze/Intuition-Proxy-Factory', date: '2026-04-21' },
        summary: 'Initial canonical standard impl shipped with the Factory.',
      },
      'v2.0.0-sponsored': {
        label: 'v2.0.0-sponsored',
        impl: '0x4E20279EeE9f77673A4f1605E58607cD9A597d70',
        family: 'sponsored',
        review: { url: 'https://github.com/Wieedze/Intuition-Proxy-Factory', date: '2026-04-21' },
        summary: 'Initial canonical sponsored impl shipped with the Factory.',
      },
      'v2.1.0': {
        label: 'v2.1.0',
        impl: '0xC65e0e84d44269fA6286BeC88C9E22CE09fab204',
        family: 'standard',
        review: { url: 'https://github.com/Wieedze/Intuition-Proxy-Factory', date: '2026-04-21' },
        summary: 'Emits VersionUsed(version, user) on every write-path call so indexers can attribute activity to the active impl.',
      },
      'v2.1.0-sponsored': {
        label: 'v2.1.0-sponsored',
        impl: '0x435979B23F561db76eAc6eb54f524e3B0fAF91fA',
        family: 'sponsored',
        review: { url: 'https://github.com/Wieedze/Intuition-Proxy-Factory', date: '2026-04-21' },
        summary: 'Sponsored sibling of v2.1.0 — same VersionUsed marker, version() now returns "v2.1.0-sponsored".',
      },
    },
    latest: {
      standard: 'v2.1.0',
      sponsored: 'v2.1.0-sponsored',
    },
  },
}

/** Convenience accessor — returns undefined if no latest has been published. */
export function getLatestVersion(
  network: NetworkName,
  family: ProxyFamily,
): CanonicalVersion | undefined {
  const label = CANONICAL_VERSIONS[network].latest[family]
  if (!label) return undefined
  return CANONICAL_VERSIONS[network].versions[label]
}

/** All canonical versions for a family, sorted newest first by publishedAt. */
export function listVersionsByFamily(
  network: NetworkName,
  family: ProxyFamily,
): CanonicalVersion[] {
  return Object.values(CANONICAL_VERSIONS[network].versions)
    .filter((v) => v.family === family)
    .sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0))
}

/**
 * Returns true if a given implementation address matches the latest canonical
 * one for its family. Used off-chain to verify a pinned proxy is running the
 * expected canonical bytecode.
 */
export function isLatestCanonical(
  network: NetworkName,
  family: ProxyFamily,
  impl: `0x${string}`,
): boolean {
  const latest = getLatestVersion(network, family)
  return Boolean(latest && latest.impl.toLowerCase() === impl.toLowerCase())
}
