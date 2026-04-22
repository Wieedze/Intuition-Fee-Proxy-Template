/**
 * Public surface of the @intuition-fee-proxy/sdk package.
 *
 * Three concern areas:
 *  - ABIs + addresses + chain configs — the foundational types consumers
 *    need to read/write contracts.
 *  - Canonical registry (versions.ts) — the curated list of reviewed impls
 *    proxy admins are recommended to adopt. Empty until the first release.
 *  - Readers (readers.ts) — framework-agnostic helpers that take a viem
 *    PublicClient and return typed data. The webapp's wagmi hooks are
 *    thin adapters over these; other frameworks re-use them directly.
 */

export * from './addresses'
export * from './chains'
export * from './versions'
export * from './readers'

import IntuitionFeeProxyV2Abi from './abis/IntuitionFeeProxyV2.json'
import IntuitionFeeProxyV2SponsoredAbi from './abis/IntuitionFeeProxyV2Sponsored.json'
import IntuitionFeeProxyFactoryAbi from './abis/IntuitionFeeProxyFactory.json'
import IntuitionVersionedFeeProxyAbi from './abis/IntuitionVersionedFeeProxy.json'
import IntuitionFeeProxyV1Abi from './abis/IntuitionFeeProxy.json'

export const IntuitionFeeProxyV2ABI = IntuitionFeeProxyV2Abi
/** V2Sponsored ABI — superset of V2 adding the shared sponsor pool, per-user rate limits, and `depositSponsored`. */
export const IntuitionFeeProxyV2SponsoredABI = IntuitionFeeProxyV2SponsoredAbi
export const IntuitionFeeProxyFactoryABI = IntuitionFeeProxyFactoryAbi
/** ERC-7936 versioned proxy ABI — the contract deployed by the Factory. */
export const IntuitionVersionedFeeProxyABI = IntuitionVersionedFeeProxyAbi
/** V1 legacy ABI (for reading historical deployments in dashboards). */
export const IntuitionFeeProxyV1ABI = IntuitionFeeProxyV1Abi
