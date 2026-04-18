# Décisions techniques

Ce fichier liste les décisions techniques, validées ou en attente. Mettre à jour au fur et à mesure.

Status possibles : ✅ Validé · 🟡 En discussion · ❌ Rejeté · ⏳ À décider

---

## Contrat V2

### Proxy pattern
- ✅ **UUPS (ERC-1822/1967)** — moins de gas, bytecode minimal, compatible Factory
- ❌ Transparent Proxy — plus lourd
- ❌ Beacon — trop rigide (tous upgradent en même temps)
- ❌ Clones EIP-1167 — pas upgradeable

### Solidity version
- 🟡 **0.8.21** (actuelle) ou 0.8.25+ — à valider avec Intuition

### OpenZeppelin
- ✅ **v5** (breaking changes vs v4 mais API plus propre, Ownable signature changée)

### Storage layout
- ✅ `ethMultiVault` passe de `immutable` → storage (obligatoire pour upgradeable)
- ✅ Variables dans l'ordre : multiVault, fixedFee, pctFee, accumulatedFees, totalFeesCollectedAllTime, mapping admins
- ✅ Storage gap `uint256[43] __gap` réservé pour futurs upgrades

### Fee pattern
- ✅ **Accumulate + withdraw** (bounty spec strict)
- ✅ Tracker : `accumulatedFees` (withdrawable) et `totalFeesCollectedAllTime` (stat cumulative)
- ✅ **Supprimer `feeRecipient` et `setFeeRecipient`** (cohérent avec suppression forwarding)
- ✅ `withdraw(address to, uint256 amount)` — admin choisit destination
- ✅ `withdrawAll(address to)` — admin withdraw tout à `to`
- ✅ **Pas de cron/keeper** (hors scope bounty)
- ✅ **Validation admin : Niveau 1** (aucune validation on-chain)
  - Factory permissionless, deployer responsable du choix admin
  - Instance officielle : on setup le Safe manuellement au déploiement
  - Webapp : warning UI si admin semble être une EOA

### Scope du proxy : dépôts uniquement
- ✅ **Pas de `redeem` / `withdraw shares` via le proxy**
- ✅ Raison : MultiVault n'autorise pas le redeem via un proxy (pas de `approveRedeem`)
- ✅ Les users retirent leurs shares directement via MultiVault (pas de fee sur les retraits)
- ✅ Scope clair : "fee layer sur les entrées"

### receive() / fallback
- ✅ **Supprimer `receive()`** — empêche les fonds bloqués
- ❌ Pas de fallback non plus

### Receiver validation → Option B validée
- ✅ **Supprimer le paramètre `receiver` des 4 fonctions payables** (Option B)
- ✅ Raison : le proxy est un **fee layer pur**, pas un mécanisme de sponsorship
- ✅ Plus sûr (impossible à bypasser), calldata plus petit, API plus claire
- ✅ Le sponsoring (si besoin futur) = **contrat séparé dédié**, pas mélangé au fee layer
- ⏳ **À valider avec Intuition** : compatibilité avec smart wallets / ERC-4337 OK ?

### Pausable
- ❌ **Pas de Pausable** (hors scope du bounty)
- ✅ En cas de bug critique, utiliser l'upgrade UUPS (`upgradeToAndCall`) comme mécanisme de réparation
- ✅ KISS : moins de code = moins de surface d'attaque

### Changement du MultiVault
- ✅ **Pas de setter `setEthMultiVault`** (Option A)
- ✅ `ethMultiVault` set une fois dans `initialize()`, stocké en storage (pas immutable car upgradeable)
- ✅ Si MultiVault V2 d'Intuition : upgrade UUPS du contrat (exception, pas un flow normal)
- ✅ Standard industrie (Uniswap Router, 1inch, CoW Protocol) : target immutable

### Upgrade authorization (V2 minimaliste)
- ✅ **V2** : `_authorizeUpgrade = onlyWhitelistedAdmin` (n'importe quel admin peut upgrade)
- ✅ Bounty-compliant ($100 item "Implement upgradeable proxy")
- ✅ Sécurité via multisig Safe (admin doit être un Gnosis Safe, pas une EOA)

### Upgrade authorization (V2.1 roadmap — à annoncer dans l'article)
- 🗺️ **V2.1** : introduction du TimelockController (délai 48h)
- 🗺️ Deux chemins possibles sans modif contrat :
  1. Ajouter Timelock comme whitelistedAdmin, retirer Safe → tous les admin calls passent par Timelock (Option B stricte)
  2. Upgrade vers V2.1 impl avec `upgradeAdmin` séparé → granularité (Timelock sur upgrade seulement)
- 🗺️ Permet "user protection : 48h pour exit avant qu'un upgrade soit effectif"

### Timelock sur les fees
- ✅ **V2** : pas de timelock sur les fees (instantané, comme V1)
- 🗺️ **V2.1** (roadmap) : timelock 48h sur `setDepositFixedFee` et `setDepositPercentageFee`
- ✅ Cohérent avec la décision upgrade : pattern minimal V2, timelock V2.1

### Cap sur le pourcentage
- ✅ Garder `MAX_FEE_PERCENTAGE = 10000` (100% théorique)
- 🟡 Faut-il baisser à 1000 (10%) pour rassurer les users ?

### Helper `getProxyInfo()` pour la webapp
- ❌ **Pas de helper custom**
- ✅ Utiliser **Multicall3** (déjà déployé sur Intuition à `0xcA11bde05977b3631167028862bE2a173976CA11`)
- ✅ wagmi/viem batch automatiquement les reads via `useReadContracts`
- ✅ Pas de code extra dans le contrat

---

## Factory

### Deployment pattern
- ✅ `ERC1967Proxy` (OZ) pour chaque instance
- ❌ Clones EIP-1167 (incompatible UUPS)

### Deployment fee
- ✅ **Gratuit définitivement** — la Factory ne prend aucun fee de déploiement
- ✅ La monétisation se fait via les fees collectées par chaque instance (le fee proxy fait son job)
- ✅ Pas de `setDeploymentFee`, pas de `deploymentFee` variable
- ✅ Aligned avec Uniswap V2 factory (gratuit)

### CREATE2 (adresses prédictibles)
- ❌ **Pas de CREATE2** — CREATE standard suffit
- ✅ Aucun usage réel pour notre cas (single chain, pas de counterfactual, pas d'AA)
- ✅ Webapp lit `ProxyCreated` event → address connue en 1 bloc

### Registry
- ✅ `proxiesByDeployer[address] => address[]`
- ✅ `allProxies[]` pour lister tous les proxies (utile webapp)
- ✅ `isProxyFromFactory(address) => bool`

### Owner de la Factory
- ✅ **Gnosis Safe** (celui du project qui deploy la Factory officielle)
- ✅ Peut call `setImplementation(newImpl)` pour les futurs déploiements
- ✅ Ne contrôle pas les instances existantes (chaque user garde le contrôle de son instance)

---

## Monorepo

### Package manager
- ✅ **Bun** (workspaces natives, rapide)

### Build tool webapp
- ✅ **Vite** (plus rapide que Next, pas besoin de SSR ici)

### Framework webapp
- ✅ **React 18 + TypeScript**

### Web3 lib
- ✅ **wagmi v2 + viem**
- ✅ **RainbowKit** pour connect wallet
- ✅ **@tanstack/react-query** (bundled avec wagmi)

### UI
- ✅ **Tailwind CSS**
- ✅ **shadcn/ui** components

### Router
- ✅ **react-router-dom v6**

### Nom du repo
- ✅ **`intuition-fee-proxy-template`** (nom actuel, descriptif)
- Le branding produit (Factory UI) sera sur `factory.intuition.box`

### Historique git
- ✅ **Garder l'historique V1** — branche `v2-upgradeable-factory` depuis main
- `git tag v1.0.0` sur le commit V1 actuel avant de commencer

### Webapp location
- ✅ **Dans ce monorepo** (`packages/webapp`)
- Cohérence contrats + UI + SDK dans un seul repo

### Hébergement webapp
- ✅ **Coolify sur Hetzner** (infra du project qui deploy la Factory officielle)
- ✅ SSL via Let's Encrypt (géré par Coolify)
- ✅ Build : `bun install && bun webapp:build`
- ✅ Output : `packages/webapp/dist`
- ✅ Domaine : `factory.intuition.box`
- 🗺️ **Roadmap** : Cloudflare en front si besoin (CDN global, DDoS)

---

## Déploiement

### Network test
- ✅ Intuition a un testnet (chainId 13579, RPC `https://testnet.rpc.intuition.systems`)
- ✅ Stratégie : dev local avec MockMultiVault → testnet pour intégration → mainnet

### Cutover V1 → V2
- ✅ Hard cutover (V1 template pas déployé officiellement, V2 = nouvelle release)

### Gouvernance de la Factory
- ✅ Gnosis Safe du project qui deploy la Factory officielle

---

## À valider avec l'équipe Intuition

- [ ] Pattern UUPS + withdraw + accumulation
- [ ] Suppression du paramètre `receiver` des 4 fonctions payables
- [ ] Factory ouverte à tous (permissionless)
- [ ] Suppression `receive()` et `_transferFee`
- [ ] Events compatibilité (backward-compat)
