# @intuition-fee-proxy/contracts

Smart contracts for the Intuition fee-proxy ecosystem: a versioned fee layer (ERC-7936) on top of the Intuition MultiVault, plus a permissionless UUPS factory and an optional sponsored-channel variant.

## Contracts

| File | Role |
|------|------|
| `IntuitionFeeProxyV2.sol` | Standard fee-layer logic — collects fixed + percentage fees (capped at 10%), accumulates in-contract, admin pulls via `withdraw`. Exposes on-chain metrics (`getMetrics()`). |
| `IntuitionFeeProxyV2Sponsored.sol` | Extends V2 with a shared sponsor pool (`fundPool` / `reclaimFromPool`) + per-user rate limits (`setClaimLimits`). User-initiated draws only — no admin `depositFor`. |
| `IntuitionVersionedFeeProxy.sol` | ERC-7936 versioned proxy: pins logic implementations, lets a proxy-admin `registerVersion` + `setDefaultVersion`, users can `executeAtVersion` for a pinned call. |
| `IntuitionFeeProxyFactory.sol` | UUPS permissionless factory. `createProxy(mv, fees, admins[], name, ProxyChannel.Standard \| Sponsored)` deploys + initializes in one tx. Owner-gated `setImplementation` / `setSponsoredImplementation` bumps the canonical pointer for future deploys. |
| `IntuitionFeeProxy.sol` | V1 legacy (backward-compat, not upgradeable). |

Shared bits live in `src/interfaces/` and `src/libraries/Errors.sol`. Test-only mocks live in `src/test/` (`MockMultiVault`, `IntuitionFeeProxyV3Mock`, `IntuitionFeeProxyFactoryV2Mock`, `OZImports.sol` — forces Hardhat to compile `ERC1967Proxy` after `clean`).

## Fee structure (V2 defaults)

| Type | Default | Cap |
|------|---------|-----|
| Fixed fee | 0.1 TRUST per deposit | — |
| Percentage fee | 5% (500 bps) | 10% hard cap (1000 bps) |

Excess ETH sent on `createAtoms` / `createTriples` / `depositBatch` is refunded Uniswap-V2-style via `_refundExcess`. `deposit()` uses an inverse formula so it is exact by construction.

V2Sponsored overrides the same 4 payable entry points to draw from `sponsorPool` instead of `msg.value` when the pool is funded and the caller is within their rate-limit window.

## Commands

```bash
bun compile                    # hardhat compile (syncs ABIs into ../sdk/src/abis)
bun test                       # 166 passing tests across V1 + V2 + V2Sponsored + Factory + Versioned
bun node                       # local hardhat node on :8545
bun deploy:local               # deploy full stack (MockMV + V2 + V2Sponsored + Factory), writes webapp/.env.local
bun deploy:testnet             # Intuition testnet (chainId 13579)
bun deploy:mainnet             # Intuition mainnet (chainId 1155)
bun e2e:local                  # standard lifecycle: createProxy → deposit → registerVersion → setDefault → executeAtVersion → withdraw
bun e2e:sponsored:local        # sponsored lifecycle: fundPool → multi-user draws → rate limit → sponsored metrics → reclaim
bun deploy:v3mock:local        # deploy a V3Mock impl for manual UX testing of version bumps
```

## Network addresses

| Network | Chain ID | MultiVault |
|---------|----------|-----------|
| Intuition Mainnet | 1155 | `0x6E35cF57A41fA15eA0EaE9C33e751b01A784Fe7e` |
| Intuition Testnet | 13579 | `0x2Ece8D4dEdcB9918A398528f3fa4688b1d2CAB91` |

Canonical Factory / impl addresses will be pinned in `@intuition-fee-proxy/sdk` after mainnet deploy.

## Admin model

V2 uses `whitelistedAdmins[]` (multi-admin, not Ownable), with a last-admin guard + dedupe on init. The proxy-admin (first admin at deploy) additionally gates ERC-7936 version management + name updates. Production deployments must use a Gnosis Safe — this is document-only enforcement; internal-review finding M-03 is accepted with that caveat.

V2.1 adds a `VersionUsed(bytes32,address)` event on every write-path call (same storage layout as V2). See `../../.claude/07-roadmap.md` for follow-up ideas.

## License

MIT
