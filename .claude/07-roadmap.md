# Roadmap — au-delà de V2

Features discutées pendant la planification V2 mais déplacées hors scope pour rester bounty-compliant. À considérer pour V2.1+.

## Status update (2026-04-19)

Intégré directement dans V2 après coup (hors scope initial mais utile) :

- ✅ **Metrics on-chain agrégées** — baked into V2 : `totalAtomsCreated`, `totalTriplesCreated`, `totalDeposits`, `totalVolume`, `totalUniqueUsers`, `lastActivityBlock`. Event `MetricsUpdated` émis à chaque call write-path. Backend on-chain prêt pour un dashboard — il reste la viz front à construire (voir "Dashboard multi-instance" plus bas).

Tout le reste ci-dessous est toujours V2.1+ / V3.

## V2.1 — Sécurité renforcée

### TimelockController sur les upgrades (48h delay)
**Contexte** : V2 permet à n'importe quel admin d'upgrade immédiatement. Standard pro = délai de 48h pour laisser les users exit s'ils n'ont pas confiance.

**Implémentation** :
- Deploy `TimelockController` OpenZeppelin séparé (proposers/executors = ProjectSafe, delay = 48h)
- Option 1 (sans modif contrat) : ajouter Timelock comme whitelistedAdmin, retirer Safe → tous les admin calls passent par Timelock
- Option 2 (avec upgrade V2.1) : ajouter variable `upgradeAdmin` séparée → Timelock uniquement sur upgrade, reste des actions admin immédiat

**Référence** : pattern utilisé par Uniswap V4, Aave V3, Compound, EigenLayer.

**Communication** : annoncer dans l'article V2 comme "V2.1 will introduce a 48h TimelockController on upgrades for additional user protection".

### TimelockController sur les changements de fees (48h delay)
**Contexte** : V2 permet à un admin de changer les fees instantanément (`setDepositFixedFee`, `setDepositPercentageFee`). Users peuvent être piégés si l'admin augmente les fees juste avant leur tx (front-running admin).

**Implémentation** :
- Même Timelock que pour les upgrades (ou séparé si on veut des délais différents)
- Délai 48h sur `setDepositFixedFee` et `setDepositPercentageFee`
- Users voient le changement proposé et peuvent éviter le proxy pendant 48h

**Pattern** : transparence totale sur les changements économiques.

**Communication** : "V2.1 adds 48h timelock on all fee changes — you'll know about any fee update 48h in advance."

### Cron / Keeper pour withdraw automatique
**Contexte** : V2 demande à l'admin de trigger `withdraw()` manuellement. Fees accumulées sur le contrat = exposition.

**Implémentation** :
- Option A : simple cron (EOA whitelistée + GitHub Actions) qui call `withdrawAll()` toutes les X heures
- Option B : Gelato Network (décentralisé, paye via fees)

**Hors scope bounty**, peut être fait off-chain sans modif contrat.

## V3 — Features supplémentaires

### Contrat séparé pour sponsoring
**Contexte** : V2 supprime le paramètre `receiver` (le proxy est un fee layer pur). Si un project veut permettre à un wallet de payer pour un autre user (dApps onboarding, cadeaux), il faut un **contrat dédié au sponsoring**.

**Implémentation** :
- Contrat `IntuitionSponsorProxy` distinct
- Flow : sponsor paye → sponsee reçoit les shares, avec son consentement explicite
- Ne pas mélanger avec le fee proxy

### CREATE2 pour la Factory
**Contexte** : V2 utilise CREATE standard. Si besoin multi-chain ou counterfactual → CREATE2.

**Implémentation** :
- `createProxyWithSalt(salt, ...)` dans la Factory
- `computeProxyAddress(salt, ...)` helper view

**Ajouter si** : Intuition lance d'autres chains, ou pattern d'AA (ERC-4337) émerge.

### Dashboard Fee Proxy (multi-instance)
**Contexte** : besoin d'un dashboard pour visualiser les stats des instances deployées via la Factory :
- Multi-instance (toutes les instances déployées via Factory)
- Stats par instance + stats globales
- Comparaison entre instances
- Historique des events

**Implémentation** : app web séparée (ou extension webapp) avec indexer des events on-chain.

**Quand** : après le lancement V2 stabilisé, selon besoins.

### Disclaimer légal + système "Verified"
**Contexte** : Factory permissionless = n'importe qui deploy. Pour éviter les malentendus légaux et valoriser les instances officielles.

**Implémentation** :
- Liste d'addresses "verified" dans le SDK
- Badge UI "✓ Verified" automatique pour les instances officielles
- Disclaimer en footer : "Third-party instances are not audited or endorsed"

**Ajouter si** : Factory gagne en adoption, instances tierces apparaissent, ou besoin légal émerge.

### Cloudflare CDN devant la webapp
**Contexte** : V2 utilise Coolify sur Hetzner (datacenter Allemagne) pour servir la webapp. Latence bonne pour EU, moins bonne pour Asie/US.

**Implémentation** :
- Ajouter `intuition.box` (ou sous-domaine) sur Cloudflare
- Nameservers Cloudflare ou CNAME partiel
- SSL Full (strict)
- Cache rules pour assets statiques

**Bénéfices** :
- CDN mondial → chargement rapide partout
- DDoS protection
- Analytics gratuites

**Ajouter si** : traffic croît, users worldwide, pics d'activité.

### Pausable mechanism
**Contexte** : V2 n'a pas de pause. En cas de bug critique, seule réponse = upgrade.

**Implémentation** :
- Hériter `PausableUpgradeable`
- `pause()` / `unpause()` onlyAdmin
- `whenNotPaused` sur les fonctions critiques

**Trade-off** : centralisation. Peut-être pas désiré.

### Governance on-chain
**Contexte** : V2 utilise multisig. Pour protocol vraiment permissionless, transition vers DAO.

**Implémentation** : token gov + contrat de vote + Timelock. Gros chantier, V3+.

---

## Priorisation suggérée

| Feature | Priorité | Effort | Impact users |
|---------|----------|--------|--------------|
| TimelockController upgrades | 🔴 Haute | Moyen | Élevé (trust) |
| Cron withdraw | 🟡 Moyenne | Faible | Moyen (sécu) |
| Contrat sponsoring | 🟢 Basse | Élevé | Selon use case |
| CREATE2 Factory | 🟢 Basse | Faible | Selon besoin multi-chain |
| Pausable | 🟢 Basse | Faible | Moyen (urgence) |
| DAO governance | 🔵 Future | Très élevé | Élevé long-terme |
