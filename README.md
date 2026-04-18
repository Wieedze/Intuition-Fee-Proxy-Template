# Intuition Fee Proxy Template

Monorepo for a customizable upgradeable fee proxy on top of [Intuition](https://intuition.systems) MultiVault, plus a Factory contract for 1-click deployment and a web UI.

## Structure

```
intuition-fee-proxy-template/
├── packages/
│   ├── contracts/    # Solidity contracts (V1 legacy + V2 upgradeable + Factory)
│   ├── sdk/          # Shared ABIs, addresses, chain configs
│   └── webapp/       # Vite + React Factory UI (factory.intuition.box)
├── scripts/
│   └── sync-abis.ts  # Copy compiled ABIs to SDK
├── .claude/          # Project context and planning docs
└── docs/             # Audit reports, announcements
```

## Requirements

- [Bun](https://bun.sh) (package manager + runtime)
- Node.js 20+ (for Hardhat compatibility)

## Install

```bash
bun install
```

## Common commands

```bash
# Compile contracts
bun contracts:compile

# Run contract tests
bun contracts:test

# Sync compiled ABIs to SDK
bun sdk:sync

# Dev server for webapp (http://localhost:3000)
bun webapp:dev

# Build webapp for production
bun webapp:build
```

## V2 roadmap

V2 transforms this template into an upgradeable system with a Factory:

- ✅ Upgradeable contract (UUPS pattern)
- ✅ Factory for 1-click deployment (Uniswap V2-style)
- ✅ Webapp with wallet connect + deploy form + "My Proxies" dashboard
- ✅ Fix receiver validation issue ([#1](https://github.com/intuition-box/Fee-Proxy-Template/issues/1))
- ✅ Withdraw pattern (accumulate + withdraw) instead of immediate fee forwarding

See [.claude/README.md](./.claude/README.md) for the full V2 planning.

## License

MIT
