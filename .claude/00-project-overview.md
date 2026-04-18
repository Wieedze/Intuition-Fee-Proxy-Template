# Vue d'ensemble — Intuition Fee Proxy Template

## Qu'est-ce que c'est ?

**IntuitionFeeProxy** est un smart contract proxy pour **Intuition MultiVault** qui :
1. Collecte des frais (fixes + pourcentage) sur chaque opération de dépôt
2. Forwarde les dépôts au MultiVault avec le bon montant
3. Transfère les frais à un recipient configurable

C'est un **template open-source** pour que n'importe quel projet construit sur Intuition puisse monétiser ses interactions en ajoutant une couche de fees devant MultiVault.

## Écosystème

- **Intuition** : protocole de knowledge graph on-chain (MultiVault = contrat principal)
- **Ce repo** : template public — anyone can fork, customize, deploy
- **V2 objectif** : transformer le template en système upgradeable + Factory pour deploy 1-clic

## V1 (actuel)

- **Fichier** : `packages/contracts/src/IntuitionFeeProxy.sol`
- **Immutable** : pas de proxy, pas d'upgrade possible
- **Pas déployé officiellement** — c'est un template que les devs forkent et déploient chacun pour leur projet

## Fee structure V1

| Type | Valeur par défaut | Description |
|------|-------------------|-------------|
| Fixe | 0.1 TRUST | Par dépôt |
| Pourcentage | 5% (500/10000) | Du montant déposé |

Exemple pour 10 TRUST déposés :
- Fixe : 0.1 TRUST
- % : 0.5 TRUST
- **Total fee : 0.6 TRUST**
- **User envoie : 10.6 TRUST**
- **Deposited to MultiVault : 10 TRUST**

## Fonctions exposées V1

- `createAtoms(receiver, data[], assets[], curveId)` — créer des atoms + deposit
- `createTriples(receiver, subjectIds[], predicateIds[], objectIds[], assets[], curveId)` — créer des triples + deposit
- `deposit(receiver, termId, curveId, minShares)` — dépôt direct
- `depositBatch(receiver, termIds[], curveIds[], assets[], minShares[])` — dépôts en batch

## Admin V1

- `setDepositFixedFee(uint256)`
- `setDepositPercentageFee(uint256)`
- `setFeeRecipient(address)`
- `setWhitelistedAdmin(address, bool)`

Modèle : `whitelistedAdmins[]` (multi-admin, pas Ownable).
