# Intuition Proxy Factory

Monorepo for a versioned, upgradeable fee proxy on top of the [Intuition](https://intuition.systems) MultiVault, with a permissionless Factory for one-click deployment and a web UI to manage individual proxies (fees, admins, versions, metrics).

## What this gives you

- **A versioned fee-proxy contract** (ERC-7936 pattern) that routes every call through a pinned logic implementation, collects fees in-contract, and lets a proxy admin ship new logic versions without displacing the ones users already trust.
- **A permissionless Factory** so anyone can deploy their own proxy in a single transaction.
- **A webapp** with wallet connect, deploy form, per-proxy detail page, full light/dark docs — designed for web3 infra operators, not a landing template.
- **On-chain metrics** baked into the implementation: total atoms, triples, deposits, volume, unique users, last-activity block — aggregated every call and exposed via `getMetrics()` for dashboards.

## Structure

```
intuition-fee-proxy-template/
├── packages/
│   ├── contracts/   # Solidity (V2 upgradeable + Factory + ERC-7936 versioned proxy)
│   ├── sdk/         # Shared ABIs, addresses, chain configs
│   └── webapp/      # Vite + React UI (deploy, my proxies, proxy detail, /docs)
├── scripts/
│   └── sync-abis.ts # Copy compiled ABIs to SDK after contracts change
├── .claude/         # Project context, rules, and skills (see .claude/README.md)
└── docs/            # Audit reports, announcements
```

## Requirements

- [Bun](https://bun.sh) (package manager + runtime)
- Node.js 20+ (for Hardhat compatibility — Node 18 works with warnings)

## Install

```bash
bun install
```

## Common commands

```bash
# Contracts
bun contracts:compile              # hardhat compile
bun contracts:test                 # hardhat test (V2 + Factory + Versioned + Metrics)
bun contracts:node                 # local hardhat node on :8545
bun contracts:deploy:local         # deploy full stack on local node (writes webapp/.env.local)
bun contracts:deploy:testnet       # Intuition testnet (chainId 13579)
bun contracts:deploy:mainnet       # Intuition mainnet (chainId 1155)
bun contracts:e2e:local            # end-to-end validation (deposits + upgrade + pin + withdraw)
bun contracts:deploy:v3mock:local  # deploy a mock new-version impl for manual UX testing

# SDK
bun sdk:sync                       # copy compiled ABIs from contracts/ into sdk/

# Webapp
bun webapp:dev                     # http://localhost:3000
bun webapp:build                   # production build
bun webapp:preview                 # preview production build
```

## Local testing flow (3 terminals)

```bash
# Terminal 1
bun contracts:node

# Terminal 2
bun contracts:deploy:local          # also writes packages/webapp/.env.local

# Terminal 3
bun webapp:dev
```

MetaMask → add `http://127.0.0.1:8545`, chainId `31337`, import one of the hardhat test keys printed by `contracts:node`. Account #0 is the factory deployer/owner; the MockMultiVault address on a fresh node is always `0x5FbDB2315678afecb367f032d93F642f64180aa3`.

End-to-end validation (optional but recommended):

```bash
bun contracts:e2e:local
```

Walks the full lifecycle — Factory `createProxy` → user deposits → `registerVersion` + `setDefaultVersion` → `executeAtVersion` pinning → `withdrawAll` — and prints a metrics snapshot at each step.

## Architecture in one sentence

A **Factory** deploys a versioned **proxy** that `delegatecall`s a pinned **implementation**, which reads/writes the proxy's storage and forwards ETH to the Intuition MultiVault. Admins register new implementations; users either follow the default or pin their own via `executeAtVersion`.

Full explanation at `/docs` in the running webapp.

## Project context

The [.claude/](./.claude/) directory holds the planning, architecture, rules, and skill playbooks:

- [.claude/README.md](./.claude/README.md) — index
- [.claude/08-rules.md](./.claude/08-rules.md) — project rules (design, copy, code, storage)
- [.claude/09-skills.md](./.claude/09-skills.md) — step-by-step playbooks (ship a new version, local test, etc.)

## Status

V2 contracts, SDK, factory, webapp and docs are implemented and tested locally (124 passing tests). The design has been sent to the Intuition team for review. Next phases: testnet deploy, external audit, mainnet launch.

## License

MIT
