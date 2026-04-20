# @intuition-fee-proxy/sdk

Canonical registry, ABIs, chain config and type-safe readers for the
Intuition fee-proxy ecosystem.

## Install

```bash
bun add @intuition-fee-proxy/sdk viem
# or
npm i @intuition-fee-proxy/sdk viem
```

`viem` is a peer dependency — bring your own version.

## What's inside

- **ABIs** — `IntuitionFeeProxyV2ABI`, `IntuitionFeeProxyV2SponsoredABI`,
  `IntuitionFeeProxyFactoryABI`, `IntuitionVersionedFeeProxyABI`, plus the
  legacy `IntuitionFeeProxyV1ABI` for historical reads.
- **Addresses** — `MULTIVAULT_ADDRESSES`, `V2_ADDRESSES` keyed by network
  (`mainnet` / `testnet`).
- **Chains** — `INTUITION_MAINNET`, `INTUITION_TESTNET` viem-compatible
  chain definitions.
- **Canonical registry** — `CANONICAL_VERSIONS` maps each reviewed impl to
  its label, review link and publish date. Proxy admins use this to decide
  what to register via `registerVersion`. Helpers: `getLatestVersion`,
  `listVersionsByFamily`, `isLatestCanonical`.
- **Readers** — framework-agnostic helpers (`fetchAllProxies`,
  `readProxyStats`, `readProxyMetrics`, `readProxyVersions`,
  `readSponsorPool`, …) that take a viem `PublicClient` and return typed
  data. Use them from Node scripts, Cloudflare Workers, RSC — anywhere
  `wagmi` is overkill.

## Quick recipes

```ts
import { createPublicClient, http } from 'viem'
import {
  INTUITION_TESTNET,
  V2_ADDRESSES,
  fetchAllProxies,
  readProxyStats,
  getLatestVersion,
} from '@intuition-fee-proxy/sdk'

const client = createPublicClient({
  chain: INTUITION_TESTNET,
  transport: http(),
})

// List every proxy deployed through the factory
const proxies = await fetchAllProxies(client, V2_ADDRESSES.testnet.factory)

// Read a proxy's headline stats
const stats = await readProxyStats(client, proxies[0])

// Ask the registry for the latest canonical standard impl
const latest = getLatestVersion('testnet', 'standard')
```

See the full integration guide at
[intuition.box/docs/integration](https://intuition.box/docs/integration).

## Publishing

The `CANONICAL_VERSIONS` object is the source of truth for "what impl
should admins adopt?" — bumping this package and publishing a new semver
is how maintainers broadcast a new reviewed version to every consumer.
Each entry is an implementation the Intuition team has reviewed before
publishing. Admins and users remain free to stay on any previous version,
or pin to a specific one, indefinitely.
