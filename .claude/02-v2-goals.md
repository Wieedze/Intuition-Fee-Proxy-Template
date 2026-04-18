# Objectifs V2

Source : issue GitHub "Proxy Fee Template" ($900 total pour V2)

## Livrables V2

| # | Livrable | Budget | Status |
|---|----------|--------|--------|
| 1 | Fix receiver validation (Fee-Proxy-Template#1) | $200 | À faire |
| 2 | Upgradeable proxy pattern | $100 | À faire |
| 3 | Withdraw function + remove fee forwarding | $200 | À faire |
| 4 | Webapp pour deploy 1-clic via Factory | $300 | À faire |
| 5 | Validation par l'équipe Intuition | — | À faire |
| 6 | Article + X post | $100 | À faire |

## 1. Fix receiver validation

**Problème** : `receiver` n'est pas validé contre `msg.sender` dans V1 → risque de payer les fees pour déposer des shares à un tiers.

**Solution** : ajouter `if (receiver != msg.sender) revert ReceiverNotSender()` en haut des 4 fonctions payables.

**⚠️ À vérifier avec Intuition** : est-ce que leur protocole supporte des flows meta-transactions / account abstraction où `receiver != msg.sender` serait légitime ? Si oui, prévoir une whitelist de relayers autorisés ou un pattern d'approval.

## 2. Upgradeable proxy

**Pattern choisi** : **UUPS (ERC-1822/1967)**

Raisons :
- Moins de gas à l'usage que Transparent Proxy
- Bytecode du proxy minimal (bon pour la Factory)
- Chaque instance garde son propre upgrade path (pas de beacon centralisé)

**Éléments techniques** :
- Hérite de `Initializable`, `UUPSUpgradeable`
- `constructor` désactive les initializers (`_disableInitializers()`)
- Function `initialize()` remplace le constructor
- Function `_authorizeUpgrade()` avec `onlyWhitelistedAdmin`
- Storage gap `uint256[43] __gap` pour futurs upgrades
- `ethMultiVault` passe de `immutable` à storage

## 3. Withdraw function + remove fee forwarding

**Changement de pattern** :

V1 :
```
user paye fees → _transferFee(amount) → fees envoyées immédiatement au Safe
```

V2 :
```
user paye fees → accumulatedFees += amount → admin appelle withdraw(to, amount) quand il veut
```

**Avantages** :
- Moins de gas par tx (pas de `.call` externe)
- Pas de risque de revert si le recipient rejette l'appel
- Flexibilité : admin peut batch les withdraws

**Fonctions admin** :
- `withdraw(address to, uint256 amount)` — withdraw partiel
- `withdrawAll(address to)` — withdraw total

**Supprimer** :
- `feeRecipient` (plus nécessaire)
- `_transferFee()`
- `setFeeRecipient()`
- `receive() external payable {}` — pour empêcher les fonds bloqués

## 4. Webapp Factory

**Objectif** : page "Create your Fee Proxy in 1 click" façon Uniswap V2 factory LP.

**Features MVP** :
1. Connect wallet
2. Formulaire deploy (multiVault, fixedFee, pctFee, admins[])
3. Deploy → affiche address + link explorer
4. Dashboard "My Proxies" → liste des proxies déployés par le wallet
5. Pour chaque proxy : stats (accumulated fees, total collected), withdraw button (admin), update fees button (admin)

**Stack** : Vite + React + TypeScript + wagmi v2 + RainbowKit + Tailwind + shadcn/ui

## 5. Validation Intuition Team

**Points à soulever avec eux** :
1. Le check `receiver == msg.sender` casse-t-il des flows existants (meta-tx, smart wallets) ?
2. La suppression de `_transferFee` et l'accumulation dans le contrat : OK pour leur vision ?
3. La Factory ouverte à tous (n'importe qui peut créer un fee-proxy) : acceptable dans leur écosystème ?
4. Version Solidity : 0.8.21 (actuelle) ou migrer vers 0.8.25+ ?

**Livrable** : document `AUDIT_V2.md` avec diff V1→V2, storage layout, Slither report, matrice de risques.

## 6. Article + X post

**Éléments à couvrir** :
- Histoire du bug V1 (receiver non validé) + comment V2 le fix
- Le pattern receive() dangereux éliminé en V2
- Nouveau pattern accumulate + withdraw
- Factory : n'importe qui peut déployer son fee-proxy en 1 clic
- Upgradeable : agilité en cas de futur bug
- Call to action : utilisez la webapp pour déployer

## Non-objectifs V2 (hors scope)

- Pas de support ERC20 pour les fees (uniquement TRUST natif)
- Pas de tier system (fees différents selon user) — pour V3 peut-être
- Pas de refund du surplus user (si `msg.value` > requis, le surplus est perdu — à discuter)
- Pas de gouvernance on-chain (on garde whitelistedAdmins)
