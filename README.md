# Intuition Proxy Factory

![tests](https://img.shields.io/badge/tests-170%2B%20passing-green) ![solidity](https://img.shields.io/badge/solidity-0.8.21-blue) ![oz](https://img.shields.io/badge/openzeppelin-v5%20namespaced-blue)

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
│   ├── contracts/   # Solidity — V2 + V2Sponsored + Factory + ERC-7936 versioned proxy
│   ├── sdk/         # Shared ABIs, addresses, chains, canonical-version registry, readers
│   └── webapp/      # Vite + React UI — deploy / my-proxies / explore / proxy-detail / docs
├── scripts/
│   └── sync-abis.ts # Copy compiled ABIs to SDK after contracts change
└── .claude/         # Project context, rules, and skills (see .claude/README.md)
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
bun contracts:compile                  # hardhat compile
bun contracts:test                     # hardhat test (V1 + V2 + V2Sponsored + Factory + Versioned)
bun contracts:node                     # local hardhat node on :8545
bun contracts:deploy:local             # deploy full stack on local node (writes webapp/.env.local)
bun contracts:deploy:testnet           # Intuition testnet (chainId 13579)
bun contracts:deploy:mainnet           # Intuition mainnet (chainId 1155)
bun contracts:e2e:local                # end-to-end standard lifecycle
bun contracts:e2e:sponsored:local      # end-to-end sponsored-pool lifecycle
bun contracts:deploy:v3mock:local      # deploy a mock new-version impl for manual UX testing

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

## Security

**The codebase has not been audited.** 

What has been done is **two internal security-review passes** (self-review guided by Trail of Bits' [Building Secure Contracts](https://github.com/crytic/building-secure-contracts) checklist, plus static analysis) it's documented here for transparency.

### Trust model (what the admin can and can't do)

| Role | Holder (recommended) | Powers | Limits |
|---|---|---|---|
| `proxyAdmin` (per-proxy) | Safe multisig | Register new impl versions, switch default, rename, transfer admin (2-step) | Cannot drain user shares (MultiVault enforces `receiver = msg.sender`). Cannot silently raise fees above `MAX_FEE_PERCENTAGE = 10%` (bytecode constant, requires a new reviewed impl registration to bump). |
| Factory `owner` | Project Safe multisig | Update the default impl used for FUTURE deployments, UUPS-upgrade the Factory, rotate ownership (2-step via `Ownable2Step`) | Existing proxies untouched — each carries its own `proxyAdmin`. |
| `whitelistedAdmin` | Per-proxy operator | Adjust fees (bounded 0–10%), add/remove admins, withdraw accumulated fees, fund/reclaim sponsor pool | Cannot mint shares on behalf of users (every write path forces `receiver = msg.sender`). Cannot drain the sponsor pool via the fee-withdraw path: `withdraw` / `withdrawAll` only touch `accumulatedFees`, `reclaimFromPool` only touches `sponsorPool` — the two counters are accounted separately. |


### Defensive guarantees in the code

- `ReentrancyGuard` on every payable entry + all withdraw paths (including the 4 Sponsored overrides)
- Inverse-formula `deposit()` splits `msg.value` exactly (no refund leak)
- `_refundExcess` returns overpayment on `createAtoms` / `createTriples` / `depositBatch`
- `withdraw` / `withdrawAll` are capped at `accumulatedFees`; `reclaimFromPool` is capped at `sponsorPool` — separate counters keep fee withdraws away from the sponsor pool
- ERC-7201 namespaced storage on VersionedFeeProxy + V2Sponsored (no slot collision)
- `_disableInitializers()` on all upgradeable impls
- Last-admin self-revoke guard (V1 + V2)
- 2-step ownership transfer on Factory (`Ownable2Step`) and VersionedFeeProxy (`pendingProxyAdmin` / `acceptProxyAdmin`)
- `uint128`-bounded `setClaimLimits` to prevent silent truncation
- No `receive()` / `fallback()` that blindly accepts ETH — direct transfers revert

## License

MIT
