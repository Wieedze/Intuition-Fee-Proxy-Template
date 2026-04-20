# Vue d'ensemble — Intuition Fee Proxy Factory

## Qu'est-ce que c'est ?

**IntuitionFeeProxy** est un template de smart contract proxy pour **Intuition MultiVault** qui :
1. Collecte des frais (fixes + pourcentage) sur chaque opération de dépôt
2. Forwarde les dépôts au MultiVault avec le bon montant
3. Accumule les fees in-contract, que l'admin peut retirer via `withdraw`

Distribué comme **template open-source** pour que n'importe quel projet construit sur Intuition puisse monétiser ses interactions en ajoutant une couche de fees devant MultiVault — ou sponsoriser les coûts de ses users via la variante sponsored.

## Écosystème

- **Intuition** : protocole de knowledge graph on-chain (MultiVault = contrat principal)
- **Ce repo** : template public + webapp `factory.intuition.box` permettant le deploy 1-clic
- **V2 shipped** : UUPS upgradeable + Factory permissionless + ERC-7936 versioned proxy + variante sponsored

## V1 (legacy — conservé)

- **Fichier** : `packages/contracts/src/IntuitionFeeProxy.sol`
- **Immutable** : pas de proxy, pas d'upgrade possible
- **Utilité résiduelle** : dashboard historique, indexation backward-compat
- Audit fix L-01 (last-admin guard + dedupe on init) backporté

## V2 (actuel)

- **`IntuitionFeeProxyV2.sol`** — logique métier standard, fees capés à 10% (M-01), pattern accumulate+withdraw, metrics on-chain (`totalAtomsCreated/Triples/Deposits/Volume/UniqueUsers/lastActivityBlock`).
- **`IntuitionFeeProxyV2Sponsored.sol`** — hérite V2, ajoute un pool partagé de sponsoring (user-initiated draws seulement, pas de `depositFor` admin) + rate limits per-user.
- **`IntuitionVersionedFeeProxy.sol`** — proxy ERC-7936 avec registry de versions canoniques + `bytes32 name` editable.
- **`IntuitionFeeProxyFactory.sol`** — UUPS, permissionless, two-channel (`ProxyChannel.Standard | Sponsored`).

## Fee structure (par défaut)

| Type | Valeur | Description |
|------|--------|-------------|
| Fixe | 0.1 TRUST | Par dépôt |
| Pourcentage | 5% (500/10000) | Du montant déposé, capé à 10% max (1000 bps) |

Exemple pour 10 TRUST déposés :
- Fixe : 0.1 TRUST
- % : 0.5 TRUST
- **Total fee : 0.6 TRUST**
- **User envoie : 10.6 TRUST** (auto-refund du surplus via `_refundExcess`)
- **Deposited to MultiVault : 10 TRUST**

## Fonctions exposées V2

- `createAtoms(data[], assets[], curveId)` — créer des atoms + deposit (receiver implicite = msg.sender)
- `createTriples(subjectIds[], predicateIds[], objectIds[], assets[], curveId)` — créer des triples + deposit
- `deposit(termId, curveId, minShares)` — dépôt direct
- `depositBatch(termIds[], curveIds[], assets[], minShares[])` — dépôts en batch

V2Sponsored override ces 4 entry points pour consommer du `sponsorPool` à la place d'`msg.value` quand le pool est suffisamment funded.

## Admin V2

- `setDepositFixedFee` / `setDepositPercentageFee` (cap 10%)
- `setWhitelistedAdmin` (avec last-admin guard)
- `withdraw(to, amount)` / `withdrawAll(to)`
- V2Sponsored : `fundPool()` / `reclaimFromPool` / `setClaimLimits`

Modèle : `whitelistedAdmins[]` (multi-admin, pas Ownable). Pour V2.1 : TimelockController 48h (roadmap).
