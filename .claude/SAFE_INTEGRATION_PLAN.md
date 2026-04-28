# Safe admin integration — implementation plan

> Branche: `feat/safe-admin-integration`
> Statut: **plan validé, implémentation pas encore commencée**
> Dernière mise à jour: 2026-04-23

## Objectif

Remplacer les EOA admin (V2 `whitelistedAdmins`, Factory `Ownable2Step`) par un Gnosis Safe multisig pour toutes les ops admin du projet `intuition-fee-proxy-template`.

**Safe cible (mainnet):** `0xf10D442D0fB934D4037DC30769a6EfCf2f54F7B6` — 2-of-3, Safe v1.3.0+L2.

## Contexte de recherche (vérifié on-chain 2026-04-23)

### Mainnet Intuition (chainId 1155) — viable

| Composant Safe | URL / Adresse | Statut |
|---|---|---|
| Safe singleton (canonique L2 v1.3.0) | `0xfb1bffC9d739B8D520DaF37dF666da4C687191EA` | ✅ déployé |
| Den Client Gateway | `https://safe-cgw.onchainden.com` | ✅ public, sans auth, CORS `*` |
| Den Transaction Service | `https://safe-transaction-intuition.onchainden.com` | ✅ Safe STS standard v5.18.4 |
| Den UI | `https://safe.onchainden.com/home?safe=int:<addr>` | ✅ |

### Testnet Intuition (chainId 13579) — non viable

- ❌ Aucun contrat Safe canonique déployé (vérification on-chain : 7 adresses canoniques toutes vides)
- ❌ Den ne supporte pas testnet (`/v1/chains/13579` → 404)
- 🛑 Décision: **pas de support testnet** dans ce projet, jamais

## Stratégie de validation (sans testnet)

```
unit tests           → Vitest, sans I/O
        ↓
Anvil fork mainnet   → fork pinné de mainnet, impersonation owners, mock STS
        ↓
dry-run mainnet      → ops idempotentes (ex: setDepositFixedFee(currentValue))
        ↓
prod                 → vraies modifications via Den UI
```

## Décisions tooling

| Choix | Décision | Raison |
|---|---|---|
| Fork local | Foundry Anvil officiel | Standard industrie, RPC d'impersonation natif |
| Test runner | Vitest | Mocks matures, watch-mode, snapshots, type-aware |
| Safe SDK | `@safe-global/protocol-kit` + `api-kit` | Standard Safe, compatible Den STS |
| Mode primaire | api-kit → Den STS | Auditable, professionnel |
| Mode fallback | direct-sign (protocol-kit, sans STS) | Résilience si Den down |
| Mode JSON upload | ❌ rejeté | api-kit le remplace de manière supérieure |

## Scope

### Dans le scope

**Package `@intuition-fee-proxy/safe-tx`** (nouveau workspace):
- 9 builders `AdminOp` (5 V2 admin + 3 Factory + 1 UUPS upgrade)
- 2 modes : api-kit (primaire) + direct-sign (fallback)
- 3 signers : env, walletconnect, ledger
- CLI `bun safe:propose` avec sub-commands `propose`, `confirm`, `execute`, `list`
- Tests unit + integration Anvil fork + mock STS

**Hors package**:
- Script `transferAdminToSafe.ts` (rotation EOA→Safe, exécution one-shot)
- Runbook `SAFE_TX_RUNBOOK.md` (procédures opérationnelles humaines)
- Webapp : badge Safe/EOA dans Admins panel (visuel non-bloquant)
- GitHub Action `safe-propose-on-merge` (proposer Safe tx auto sur merge config)

### Hors scope (décisions explicites)

| Hors scope | Raison |
|---|---|
| Support testnet Intuition | Aucun Safe canonique sur 13579, pas de plan de déploiement |
| Mode JSON upload | api-kit > JSON sur tous les critères |
| Self-host Safe Transaction Service | Overkill pour 1 Safe / projet solo |
| Custom Safe Web UI | Den UI fonctionne |
| Ops Pausable / freeze versioning | Parkées sur gouvernance Intuition (cf. `project_security_audit.md`) |
| Tests CI contre vraie Den STS | Évite couplage fragile à infra tierce ; smoke test manuel uniquement |

## Scope des 9 AdminOp builders

**V2 proxy admin** (`IntuitionFeeProxyV2`):
1. `setDepositFixedFee(uint256)`
2. `setDepositPercentageFee(uint256)`
3. `setWhitelistedAdmin(address, bool)`
4. `withdraw(address, uint256)`
5. `withdrawAll(address)`

**Factory owner** (`IntuitionFeeProxyFactory`):
6. `setImplementation(address, bytes32)`
7. `setSponsoredImplementation(address, bytes32)`
8. `transferOwnership(address)` (Ownable2Step → `acceptOwnership` côté Safe)

**UUPS upgrade** (sur n'importe quel proxy ERC1967):
9. `upgradeToAndCall(address, bytes)`

## Plan d'implémentation — 13 commits séquencés

### Phase A — Fondations (3 commits)

| # | Commit | Output | Dépendances |
|---|---|---|---|
| 1 | `feat(safe-tx): scaffold package` | `package.json`, `tsconfig.json`, `vitest.config.ts`, `README.md` squelette | aucune |
| 2 | `feat(safe-tx): network config + Safe addresses` | `src/networks.ts` (Intuition mainnet + Safe addresses fetched de Den CGW), `src/types.ts` | #1 |
| 3 | `feat(safe-tx): anvil fork test fixtures` | `test/fixtures/anvil.ts`, `test/fixtures/impersonate.ts`, `test/fixtures/constants.ts` (FORK_BLOCK pinné, choisi après création Safe `0xf10D...`) | #2 |

**Livrable A** : `bun test` lance, sanity Anvil fork passe (chainId == 1155, Safe owners == 2-of-3 attendu).

### Phase B — Logique métier (2 commits)

| # | Commit | Output | Dépendances |
|---|---|---|---|
| 4 | `feat(safe-tx): AdminOp builders` | `src/ops/v2-admin.ts` (5 ops), `src/ops/factory.ts` (3 ops), `src/ops/uups-upgrade.ts` (1 op), `src/ops/index.ts` | #2 |
| 5 | `feat(safe-tx): signer strategies` | `src/signers/{env,walletconnect,ledger,index}.ts` | #2 |

**Livrable B** : 9 builders + 3 signers en unit tests, sans I/O on-chain.

### Phase C — Modes d'exécution (2 commits)

| # | Commit | Output | Dépendances |
|---|---|---|---|
| 6 | `feat(safe-tx): direct-sign mode` | `src/modes/direct-sign.ts` (build → sign → aggregate sigs JSON → execTransaction) | #3, #4, #5 |
| 7 | `feat(safe-tx): api-kit mode + mock STS` | `src/modes/api-kit.ts`, `test/fixtures/mock-sts.ts` | #6 |

**Livrable C** : les 2 modes prouvés sur Anvil fork avec assertions sur state FeeProxy.

### Phase D — Surface utilisateur (2 commits)

| # | Commit | Output | Dépendances |
|---|---|---|---|
| 8 | `feat(safe-tx): CLI safe-propose` | `bin/safe-propose.ts` (commander : `propose`, `confirm`, `execute`, `list`) + scripts root `package.json` | #6, #7 |
| 9 | `feat(safe-tx): rotation EOA→Safe` | `packages/safe-tx/scripts/transferAdminToSafe.ts` | #8 |

**Livrable D** : utilisable end-to-end. `bun safe:propose --help` répond, rotation testée sur fork.

### Phase E — Doc, UX, automation (4 commits)

| # | Commit | Output | Dépendances |
|---|---|---|---|
| 10 | `docs: SAFE_TX_RUNBOOK.md` | Runbook ops humain (rotation, dry-run mainnet, fallback Den down, hors-scope) | #8 |
| 11 | `feat(webapp): Safe/EOA admin badge` | `packages/webapp/src/components/AdminsPanel/SafeBadge.tsx` + intégration | #2 (pour adresses) |
| 12 | `ci: safe-tx anvil fork test job` | `.github/workflows/safe-tx-test.yml` (Foundry + Anvil + Vitest) | #3-#9 |
| 13 | `ci: safe-propose-on-merge action` | `.github/workflows/safe-propose-on-merge.yml` (diff config → JSON proposé sur Den STS) | #8, #12 |

**Livrable E** : projet complet, documenté, automatisé.

## Structure de fichiers cible

```
packages/safe-tx/
├── package.json                      # @intuition-fee-proxy/safe-tx
├── tsconfig.json
├── vitest.config.ts
├── README.md
├── src/
│   ├── index.ts                      # re-exports publics
│   ├── networks.ts                   # Intuition mainnet config + Safe addresses
│   ├── types.ts
│   ├── safe-client.ts                # wrapper protocol-kit
│   ├── ops/
│   │   ├── v2-admin.ts               # 5 ops V2
│   │   ├── factory.ts                # 3 ops Factory owner
│   │   ├── uups-upgrade.ts           # 1 op UUPS
│   │   └── index.ts
│   ├── signers/
│   │   ├── env.ts
│   │   ├── walletconnect.ts
│   │   ├── ledger.ts
│   │   └── index.ts
│   └── modes/
│       ├── api-kit.ts                # mode primaire (Den STS)
│       └── direct-sign.ts            # mode fallback
├── bin/
│   └── safe-propose.ts               # CLI entrypoint
├── scripts/
│   └── transferAdminToSafe.ts        # rotation one-shot
└── test/
    ├── fixtures/
    │   ├── anvil.ts
    │   ├── impersonate.ts
    │   ├── mock-sts.ts
    │   └── constants.ts              # FORK_BLOCK pinné
    ├── unit/
    │   ├── ops/v2-admin.test.ts
    │   ├── ops/factory.test.ts
    │   └── ops/uups.test.ts
    ├── integration/
    │   ├── direct-mode.test.ts
    │   └── api-kit-mode.test.ts
    └── e2e/
        └── rotation.test.ts

# Hors package
SAFE_TX_RUNBOOK.md
packages/webapp/src/components/AdminsPanel/SafeBadge.tsx
.github/workflows/safe-tx-test.yml
.github/workflows/safe-propose-on-merge.yml
```

## Critères d'acceptation par phase

| Phase | Critère |
|---|---|
| A | `bun test` passe, sanity check Anvil fork OK (chainId, Safe owners attendus) |
| B | 9 ops + 3 signers couverts à 100% en unit tests |
| C | Sur Anvil fork, op exécutée via les 2 modes, state FeeProxy modifié comme attendu |
| D | `bun safe:propose --op setDepositFixedFee --value 100 --network mainnet --dry-run` produit une tx valide |
| E | PR mergée sur `main` avec changement de config → workflow GitHub crée commentaire avec lien Den STS |

## Risques identifiés

| Risque | Mitigation |
|---|---|
| Den arrête le service | Mode `direct` reste 100% fonctionnel sans Den (juste RPC Intuition) |
| Den change le format de l'API | Mock STS reste sur format Safe standard ; on découple via interface |
| FORK_BLOCK devient stale (6+ mois) | Update du pin dans `constants.ts`, ~5min |
| Owners du Safe changent | api-kit refetch les owners depuis chain à chaque run |
| Coût gas inattendu sur op upgrade | Anvil fork donne estimation précise avant prod |

## Validation pré-implémentation

Validations utilisateur consignées:
- ✅ Mode `api-kit` (Den STS) en primaire
- ✅ Mode `direct` en fallback obligatoire
- ✅ Mode JSON upload abandonné
- ✅ Pas de testnet, jamais
- ✅ Anvil fork mainnet pour tests (Foundry officiel)
- ✅ Vitest comme runner
- ✅ Branche dédiée `feat/safe-admin-integration`
- ✅ 13 commits atomiques séquencés
- ✅ Plan sauvegardé dans `.claude/SAFE_INTEGRATION_PLAN.md` ET dans memory

## Prochaine étape

Commit #1 : `feat(safe-tx): scaffold package` — quand l'utilisateur dit "go".

D'ici là, ce document reste la source de vérité. Toute déviation = update du plan en premier, code après.