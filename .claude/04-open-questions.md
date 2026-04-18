# Questions ouvertes — à explorer avant l'implémentation

Ce fichier liste tout ce qu'on doit clarifier avant de coder. **Priorité sur les fonctions du contrat V2**.

---

## 🎯 Contrat V2 — Fonctions à définir précisément

### A. Fonctions héritées de V1 — garder telles quelles ?

| Fonction V1 | Status V2 | Question |
|-------------|-----------|----------|
| `createAtoms(receiver, data[], assets[], curveId)` | ✅ Supprimer `receiver` | Devient `createAtoms(data[], assets[], curveId)` |
| `createTriples(receiver, subjectIds[], predicateIds[], objectIds[], assets[], curveId)` | ✅ Supprimer `receiver` | Idem |
| `deposit(receiver, termId, curveId, minShares)` | ✅ Supprimer `receiver` | Devient `deposit(termId, curveId, minShares)` |
| `depositBatch(receiver, termIds[], curveIds[], assets[], minShares[])` | ✅ Supprimer `receiver` | Idem |

**Question 1** : ✅ **TRANCHÉ** — Option B : supprimer `receiver`. Le proxy est un fee layer pur. Le sponsoring sera un contrat séparé si besoin futur.

**Question 2** : ✅ **TRANCHÉ** — Pas de `redeem` côté user. MultiVault n'autorise pas le redeem via un proxy. Users retirent directement via MultiVault. Scope du proxy = dépôts uniquement.

### B. Nouvelles fonctions admin

| Fonction | Signature proposée | À valider |
|----------|-------------------|-----------|
| `withdraw` | `withdraw(address to, uint256 amount)` | ✅ |
| `withdrawAll` | `withdrawAll(address to)` | Nécessaire ou `withdraw(to, accumulatedFees)` suffit ? |
| `setDepositFixedFee` | Héritée V1 | ✅ |
| `setDepositPercentageFee` | Héritée V1 | ✅ |
| `setWhitelistedAdmin` | Héritée V1 | ✅ |
| `setEthMultiVault` | `setEthMultiVault(address)` | **Nouveau** : permettre de changer le MultiVault cible en cas de migration Intuition ? |
| `pause` / `unpause` | `pause()` / `unpause()` | **Nouveau** : ajouter Pausable pour urgences ? |
| `setDeploymentFee` (Factory) | `setDeploymentFee(uint256)` | Factory peut prendre un fee de déploiement ? |

**Question 3** : ✅ **TRANCHÉ** — Pas de Pausable (hors scope bounty). Upgrade UUPS suffit comme mécanisme de réparation.

**Question 4** : ✅ **TRANCHÉ** — Pas de setter. `ethMultiVault` fixé à l'initialize. Standard industrie (Uniswap/1inch/CoW). Si MultiVault V2 : upgrade UUPS (exception).

### C. Fonctions view / helpers

| Fonction | Signature | À valider |
|----------|-----------|-----------|
| `calculateDepositFee` | Héritée V1 | ✅ |
| `getTotalDepositCost` | Héritée V1 | ✅ |
| `getTotalCreationCost` | Héritée V1 | ✅ |
| `getMultiVaultAmountFromValue` | Héritée V1 | ✅ |
| `accumulatedFees` | `uint256 public` | **Nouveau** : montant en attente de withdraw |
| `totalFeesCollectedAllTime` | `uint256 public` | **Nouveau** : stat cumulative (ne décroît jamais) |
| Passthrough `getAtomCost`, `getTripleCost`, etc. | Héritées V1 | ✅ |

**Question 5** : ✅ **TRANCHÉ** — Pas de helper custom. Multicall3 est déployé sur Intuition mainnet (`0xcA11bde05977b3631167028862bE2a173976CA11`) → wagmi/viem batch automatiquement via `useReadContracts`.

### D. Events

| Event | V1 | V2 |
|-------|----|----|
| `FeesCollected` | ✅ | Garder pour backward compat |
| `TransactionForwarded` | ✅ | Garder |
| `MultiVaultSuccess` | ✅ | Garder |
| `FeesWithdrawn` | ❌ | **Nouveau** : `(address to, uint256 amount, address by)` |
| `DepositFixedFeeUpdated` | ✅ | Garder |
| `DepositPercentageFeeUpdated` | ✅ | Garder |
| `FeeRecipientUpdated` | ✅ | **Supprimer** (plus de recipient) |
| `AdminWhitelistUpdated` | ✅ | Garder |
| `Initialized` | ❌ | **Nouveau** : émis par `initialize()` |
| `Paused` / `Unpaused` | ❌ | Si on ajoute Pausable |

**Question 6** : ✅ **TRANCHÉ** — Events finaux :
- `FeesCollected(user, amount, operation)` → **garder** (dashboard)
- `TransactionForwarded(...)` → **garder** (dashboard)
- `MultiVaultSuccess(...)` → **garder** (debug)
- `DepositFixedFeeUpdated`, `DepositPercentageFeeUpdated` → **garder**
- `AdminWhitelistUpdated` → **garder**
- `FeeRecipientUpdated` → **❌ SUPPRIMER** (plus de recipient)
- `FeesWithdrawn(to, amount, by)` → **✅ NOUVEAU**
- `Initialized`, `Upgraded` → automatiques via OZ

---

## 🏭 Factory — fonctions

### Core

- `createProxy(multiVault, fixedFee, pctFee, admins[])` → déploie un ERC1967Proxy
- `getProxiesByDeployer(address)` → liste des proxies d'un user
- `allProxies()` → tous les proxies
- `isProxyFromFactory(address)` → bool

### Admin de la Factory

- `setImplementation(address)` → change l'impl pour futurs deploys
- `setDeploymentFee(uint256)` → fee de déploiement (si on en veut)
- `withdrawDeploymentFees(address to)` → si fee > 0

**Question 7** : ✅ **TRANCHÉ** — Factory gratuite. Monétisation via le fee proxy lui-même, pas au déploiement.

**Question 8** : ✅ **TRANCHÉ** — CREATE standard. CREATE2 ne sert à rien dans notre cas (single chain, pas de counterfactual, pas d'AA).

**Question 9** : ✅ **TRANCHÉ** — Pas de cap. Le gas est déjà anti-spam. Webapp gère la pagination si besoin.

---

## 🔐 Sécurité et gouvernance

**Question 10** : ✅ **TRANCHÉ** — Owner Factory = Gnosis Safe du project qui deploy la Factory officielle.

**Question 11** : ✅ **TRANCHÉ** — Option B. Admin peut se révoquer sauf s'il est le dernier. Maintenir `adminCount` en storage. Revert si `adminCount == 1` et `admin == msg.sender && !status`.

**Question 12** : ✅ **TRANCHÉ** — V2 : `onlyWhitelistedAdmin` (bounty-compliant). V2.1 : TimelockController 48h à documenter dans roadmap / article.

**Question 13** : ✅ **TRANCHÉ** — V2 : pas de timelock sur les fees. Cohérent avec l'upgrade. V2.1 : timelock sur fees (roadmap).

---

## 🌐 Webapp

**Question 14** : ✅ **TRANCHÉ** — Coolify sur Hetzner existant. SSL Let's Encrypt. Sous-domaine sur `intuition.box`. Cloudflare en roadmap.

**Question 15** : ✅ **TRANCHÉ** — `factory.intuition.box`

**Question 16** : ✅ **TRANCHÉ** — Deux vues :
- "My Deployed Proxies" : indexé par `proxiesByDeployer[connected]`
- "Where I'm Admin" : scan pour voir où le wallet connecté est admin
- Explorer global (tous les proxies) : en roadmap V2.1
- Warning UI si admin = EOA au moment du deploy

**Question 17** : ✅ **TRANCHÉ** — Webapp 100% séparée. La Factory est générique (utilisable par n'importe quel project).

---

## 📦 Monorepo

**Question 18** : ✅ **TRANCHÉ** — Garder `intuition-fee-proxy-template`. Branding produit sur `factory.intuition.box`.

**Question 19** : ✅ **TRANCHÉ** — Garder l'historique. Branche `v2-upgradeable-factory`. Tag `v1.0.0` sur le commit actuel.

**Question 20** : ✅ **TRANCHÉ** — Dans ce monorepo (`packages/webapp`).

---

## 🚀 Déploiement

**Question 21** : ✅ **TRANCHÉ** — Même stratégie que V1 :
- Local : Hardhat + MockMultiVault (tests unitaires)
- Testnet : Intuition Testnet MultiVault `0x2Ece8D4dEdcB9918A398528f3fa4688b1d2CAB91`
- Mainnet : Intuition Mainnet MultiVault `0x6E35cF57A41fA15eA0EaE9C33e751b01A784Fe7e`

**Question 22** : ✅ **TRANCHÉ** — Hard cutover direct (V1 template pas déployé officiellement, V2 = nouvelle release).
- Plan : deploy V2 → update les 2 apps → push → V1 orphelin

**Question 23** : ✅ **TRANCHÉ** — Option A. Indexer V1 + V2 dans le dashboard (same events signature). Refonte complète du dashboard fee proxy plus tard (roadmap).

---

## ⚖️ Légal / communication

**Question 24** : ✅ **TRANCHÉ** — Angle "Discovery & Fix". Mentionner le bug receive() et comment V2 le fix, sans nommer le montant ni qui a perdu. Factuel, pro, focus sur l'amélioration. Aucun user impacté (les fonds étaient ceux du dev).

**Question 25** : ✅ **TRANCHÉ** — Out of scope V2. Pas de disclaimer ni de badge "verified" pour le MVP. À ajouter en roadmap si besoin.

---

## Prochaines étapes suggérées

1. **Session d'exploration V2 contract** : passer en revue chaque fonction une par une, définir signature exacte + comportement
2. **Session exploration Factory** : valider le scope (features, fee ou gratuit, caps)
3. **Session webapp** : wireframes des 3-4 pages principales
4. **Contact Intuition Team** : envoyer résumé V2 pour pre-validation avant code
