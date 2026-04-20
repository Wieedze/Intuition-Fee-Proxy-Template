# État actuel — V2 + V2Sponsored shipped, audit fixes landed

## En une phrase

V2 standard + V2Sponsored (shared-pool) + Factory two-channel + webapp complet (Home / Deploy / MyProxies / ProxyDetail avec 4 tabs / Docs 9 sections) + SDK publishable (canonical-versions registry + framework-agnostic readers) + audit Trail-of-Bits-style fixé localement — **prêt pour push + PR + validation Intuition team**.

## Contrats

- **`IntuitionFeeProxyV2.sol`** — logique métier standard (deposit, createAtoms, createTriples, depositBatch, fees fixed+pct capés à 10%, admins avec last-admin guard + dedupe, withdraw pull-based, metrics on-chain agrégées). Slots 0–13 + `__gap[36]`. Refactor init : `_initializeV2` internal extrait pour que V2Sponsored chaîne sans conflit d'`initializer`.
- **`IntuitionFeeProxyV2Sponsored.sol`** — hérite V2, ajoute un pool partagé (`sponsorPool` + `fundPool` / `reclaimFromPool` admin-gated), rate limits per-user sur fenêtre glissante configurable : `maxClaimPerTx` (cap par tx), `maxClaimsPerWindow` (nb d'appels par user / fenêtre), `maxClaimVolumePerWindow` (TRUST cumulé par user / fenêtre), `claimWindowSeconds` (longueur de la fenêtre, défaut 86400). Sponsored metrics additives. Storage ERC-7201 namespaced (`keccak256("intuition.feeproxy.sponsored.v1")`). User-side seulement — pas de `depositFor`, l'admin ne peut jamais créer d'action on-chain sur une adresse tierce. Pour les tiers (free/pro/premium), on déploie un proxy par tier plutôt que d'encoder les tiers on-chain.
- **`IntuitionVersionedFeeProxy.sol`** — proxy ERC-7936, storage namespacée ERC-7201 canonique (fix M-07), name on-chain, registry + default + executeAtVersion.
- **`IntuitionFeeProxyFactory.sol`** — UUPS, permissionless, two-channel (`createProxy(mv, fees, admins, name, ProxyChannel)`), `setImplementation` + `setSponsoredImplementation` pour bumper les canoniques.
- **`IIntuitionFeeProxyV2.sol`** — interface complète incl. struct `ProxyMetrics`.
- **Mocks** (in `src/test/`) : `MockMultiVault` (atom IDs déterministes via counter, fix L-06), `IntuitionFeeProxyV3Mock`, `IntuitionFeeProxyFactoryV2Mock`, `OZImports.sol` (force-compile ERC1967Proxy après `hardhat clean`).
- **V1 legacy** (`IntuitionFeeProxy.sol`) — conservé pour dashboard historique, avec L-01 backport (last-admin guard).

## Tests — 166 passing

- `IntuitionFeeProxyV2.test.ts`
- `IntuitionFeeProxyV2Sponsored.test.ts`
- `IntuitionFeeProxyFactory.test.ts`
- `IntuitionVersionedFeeProxy.test.ts`
- `IntuitionFeeProxy.test.ts` (V1 legacy)

## SDK — publishable

- `publishConfig`, `files`, viem peer dep, `prepublishOnly` wired. Versions canoniques (`CANONICAL_VERSIONS`, `listVersionsByFamily`, helpers) + framework-agnostic readers (`fetchAllProxies`, `readProxyStats`, `readProxyMetrics`, `readProxyVersions`, `readSponsorPool`, `readSponsoredMetrics`…).
- ABIs synced pour les 5 contrats (V1, V2, V2Sponsored, Factory, Versioned).
- `MULTIVAULT_ADDRESSES` + `V2_ADDRESSES` tables par network.

## Webapp

- Routes : `/`, `/deploy`, `/explore`, `/my-proxies`, `/proxy/:address`, `/docs`, `/docs/:section`.
- ProxyDetail : 4 onglets (Overview · Metrics · Admins · Sponsoring si sponsored channel), inclut UpgradeAuthorityPanel, VersionsPanel, WithdrawPanel, SetFeesPanel, FundPoolPanel, ReclaimFromPoolPanel, ClaimLimitsPanel, AdminsPanel, RenameButton.
- Docs (9 sections avec sidebar) : Overview, Architecture, Call flow, Proxy vs impl, Pinning, Sponsoring, Primitives, SDK integration, Workflow, Golden rules.
- Channel radio Standard/Sponsored au deploy, banners "nouvelle version disponible", dropdown de versions canoniques + advanced paste mode.
- Palette warm-paper + burnt-orange, Geist fonts, light/dark toggle persistant.

## Scripts

- `scripts/deploy.ts` — deploy stack complet (Mock MV + V2 + V2Sponsored + Factory proxy + register sponsored channel) + écrit `.env.local`.
- `scripts/e2e-validate.ts` — lifecycle standard (createProxy → deposit → registerVersion → setDefault → executeAtVersion → withdraw).
- `scripts/e2e-sponsored.ts` — lifecycle sponsored (fundPool → multi-user draws → rate limit → sponsored metrics → reclaim).
- `scripts/deploy-v3mock.ts` — helper deploy V3Mock isolé.
- `scripts/sync-abis.ts` — copie les 5 ABIs dans le SDK.

## Audit — 18 findings, tous traités

- **C-01** severity downgraded (F1 + F3 + F5 landed, F2 freeze-versioning parked avec I-02 sur décision gouvernance Intuition).
- **H-01** auto-refund Uniswap V2 style + `nonReentrant` sur les 4 payables V2 et les 4 overrides V2Sponsored.
- **H-02** min shares handled via separate agent branch.
- **H-03** hardened via e2e-validate + e2e-sponsored (à étendre au testnet). Accepted-risk pour l'instant.
- **M-01** max fee percentage hard-capped à 10% (bps ≤ 1000) sur V1 + V2.
- **M-02, M-03, I-01** — accepted-risk (documented in `07-roadmap.md` + audit memory).
- **M-04** `nonReentrant` sur les payables V2 + V2Sponsored.
- **M-06 + L-07** CI Slither/storage-layout — deferred ("not now").
- **M-07** ERC-7201 canonical slots sur VersionedFeeProxy + V2Sponsored.
- **M-08** UpgradeAuthorityPanel sur Admins tab (info-only).
- **L-01** V1 last-admin guard + dedupe sur init.
- **L-02** atomic deploy pattern already in `deploy.ts`.
- **L-04** VersionedFeeProxy constructor plus `payable`.
- **L-06** MockMultiVault deterministic atom IDs.
- **I-02 Pausable** + **C-01 F2 freeze** parked pending Intuition gouvernance (qui détient le pause-admin ?). Design A/B/C documenté dans `07-roadmap.md`.
- **I-03** calculateAtomId delegates to MV.

## Branche + PR

- Branche : `v2-upgradeable-factory`
- ~20 commits au-delà du MVP initial
- PR ouverte contre `main` le 2026-04-18

## Ce qui bloque la suite

**Phase 7 (deploy) + Phase 8 (article + AUDIT_V2)** :
- [ ] Retour Intuition team sur la design V2 (envoyé 2026-04-18)
- [ ] Décision gouvernance pour I-02 Pausable + C-01 F2 freeze (A: whitelistedAdmins / B: Intuition multi-sig dédiée / C: PAUSER_ROLE)
- [ ] Testnet deploy (chainId 13579)
- [ ] Audit externe (Spearbit / Trail of Bits / Code4rena)
- [ ] Mainnet deploy (chainId 1155) + publier adresses canoniques dans SDK
- [ ] Article + X post

**Post-V2** : voir [07-roadmap.md](./07-roadmap.md) (TimelockController V2.1, depositForWithSig V2.1Sponsored, sponsoring per-user V2.2Sponsored, CREATE2 Factory, Pausable, governance…).
