# Objectifs V2 — bounty $900 (tous shipped)

Source : issue GitHub "Proxy Fee Template" ($900 total pour V2). Conservé comme référence historique — l'état courant est dans [01-current-state.md](./01-current-state.md).

## Livrables

| # | Livrable | Budget | Status |
|---|----------|--------|--------|
| 1 | Fix receiver validation | $200 | ✅ Shipped — paramètre `receiver` supprimé des 4 payables (Option B). `msg.sender` = receiver implicite. |
| 2 | Upgradeable proxy pattern | $100 | ✅ Shipped — UUPS + ERC-7936 versioned proxy (`IntuitionVersionedFeeProxy`) avec registry de versions canoniques. |
| 3 | Withdraw function + remove fee forwarding | $200 | ✅ Shipped — pattern accumulate+withdraw, pull-based, `feeRecipient` supprimé, plus de `receive()`. |
| 4 | Webapp pour deploy 1-clic via Factory | $300 | ✅ Shipped — Home / Deploy / MyProxies / Explore / ProxyDetail (4 tabs) / Docs (9 sections), wagmi v2 + RainbowKit. |
| 5 | Validation Intuition team | — | ⏳ Envoyée 2026-04-18, en attente. |
| 6 | Article + X post | $100 | ⏳ Bloqué jusqu'à validation + testnet deploy. |

## Extras livrés au-delà du bounty

- **V2Sponsored** : variante sponsored-channel avec pool partagé (`fundPool` / `reclaimFromPool` / per-user rate limits). Shared-pool model, no admin mint-on-behalf.
- **Factory two-channel** : `createProxy(..., ProxyChannel.Standard | Sponsored)` + `setSponsoredImplementation` owner-gated.
- **On-chain metrics** : `totalAtomsCreated/Triples/Deposits/Volume/UniqueUsers/lastActivityBlock` agrégés + `getMetrics()` view, plus compteurs sponsored additifs.
- **Name on VersionedFeeProxy** : `bytes32 name` editable par proxyAdmin, `NameChanged` event.
- **SDK publishable** : `publishConfig`, canonical-versions registry, framework-agnostic readers (`fetchAllProxies`, `readProxyStats`, `readProxyMetrics`, `readSponsorPool`, etc.).
- **Audit Trail-of-Bits-style** : 18 findings tous traités (voir `01-current-state.md` § Audit).
- **E2E scripts** : `e2e-validate` (standard lifecycle) + `e2e-sponsored` (pool lifecycle).

## Points négociés avec l'équipe Intuition

Tous à confirmer dans leur retour :
1. Check `receiver == msg.sender` → implémenté par suppression du paramètre. Compatible meta-tx/ERC-4337 via smart wallet (le smart wallet devient `msg.sender`).
2. Suppression `_transferFee` + accumulation in-contract : OK pour leur vision ?
3. Factory permissionless (anyone may deploy) : acceptable ?
4. V2Sponsored shared-pool model (pas de per-user credit, pas de `depositFor` admin) : design review ?
5. Version Solidity : 0.8.21 — OK ou migrer ?
6. Gouvernance du freeze-versioning (C-01 F2) + Pausable (I-02) : option A (whitelistedAdmins) / B (Intuition multi-sig dédié) / C (PAUSER_ROLE AccessControl) ?

## Non-objectifs V2 (confirmés hors scope)

- Pas de support ERC20 pour les fees (TRUST natif uniquement).
- Pas de tier system (fees différents selon user) — V3 potentiellement.
- Pas de gouvernance on-chain (on garde whitelistedAdmins pour V2).
- Pas de TimelockController (V2.1 roadmap).
- Pas de CREATE2 Factory (V2.1 roadmap).
