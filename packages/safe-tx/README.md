# @intuition-fee-proxy/safe-tx

Safe multisig admin tooling for the Intuition fee-proxy template.

Propose, sign, and execute admin operations against `IntuitionFeeProxyV2` and `IntuitionFeeProxyFactory` via:

- **`api-kit` mode** (primary): proposals routed through Den's Safe Transaction Service for Intuition (`https://safe-transaction-intuition.onchainden.com`). Owners co-sign in the Den UI.
- **`direct-sign` mode** (fallback): signatures collected off-band as JSON, then aggregated and `execTransaction` called directly on the Safe contract. No external service required.

## Status

🚧 **In development.** See [`.claude/SAFE_INTEGRATION_PLAN.md`](../../.claude/SAFE_INTEGRATION_PLAN.md) for the implementation plan and rationale.

## Scope

- 9 admin operation builders (5 V2 admin + 3 Factory owner + 1 UUPS upgrade)
- 3 signer strategies (env, walletconnect, ledger)
- CLI entrypoint `bun safe:propose`
- Anvil fork integration tests against mainnet Intuition state

## Out of scope

- Testnet support (no canonical Safe contracts on Intuition testnet 13579)
- JSON upload to Den UI (api-kit replaces it)
- Self-hosting Safe Transaction Service

## Development

```bash
bun install              # from monorepo root
bun --filter @intuition-fee-proxy/safe-tx test
bun --filter @intuition-fee-proxy/safe-tx typecheck
```

Anvil (Foundry) is required for integration tests:

```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
```