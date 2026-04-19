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

### Pausable mechanism (audit finding I-02)
**Contexte** : V2 n'a pas de pause. En cas de bug critique, seule réponse = upgrade via `registerVersion` + `setDefaultVersion`, ce qui peut prendre des minutes à quelques heures en multisig. L'audit (I-02, 2026-04-19) recommande un circuit-breaker pour fermer les entrées payables instantanément.

**Implémentation technique** (straightforward, testée localement puis rollback le 2026-04-19 faute de consensus sur la gouvernance) :
- Hériter `PausableUpgradeable` (ERC-7201 namespaced, pas de collision storage)
- `pause()` / `unpause()` gated
- `whenNotPaused` sur `deposit/createAtoms/createTriples/depositBatch` + `*For` du Sponsored
- `withdraw`/`withdrawAll` restent dispo (admin rescue)
- `__Pausable_init()` dans `_initializeV2`

**Questions en attente retour équipe Intuition** :
1. **Qui détient le droit de pause** ?
   - Option A : les `whitelistedAdmins` existants du proxy (= déployeur + ses co-admins). Simple, aligné avec le modèle actuel, mais n'offre pas de filet de sécurité Intuition-level.
   - Option B : un admin `intuition.box` / multi-sig Intuition *en plus* des admins du proxy. Intéressant si Intuition veut se réserver un droit d'administration d'urgence sur *tous* les proxys déployés via la Factory.
   - Option C : un rôle `PAUSER_ROLE` dédié (via OZ `AccessControl`) — plus granulaire, permet EOA "guardian" pour pause rapide + multisig pour unpause.
2. **Question liée — C-01 F2 (freeze one-way du versioning)** : même design question. Qui peut appeler `freezeVersioning()` ? Et est-ce qu'on ajoute un admin Intuition *dédié* à cette décision ?
3. **Trade-off centralisation** : un pause-admin Intuition sur tous les proxys signifie qu'Intuition peut stopper n'importe quel proxy tiers. Pas évident que c'est désirable.

**Communication attendue** : l'équipe Intuition doit trancher (A/B/C) avant qu'on implémente I-02 + C-01 F2. Les deux features reposent sur le même choix gouvernance.

### depositForWithSig (EIP-712 receiver consent)

**Contexte** : V2Sponsored ships with `depositFor`/`createAtomsFor` where the sponsor acts on behalf of a receiver without any on-chain consent from that receiver. Safe for the target use case (dApp onboarding its own users, trust is implicit in the service sign-up) but unsafe for open sponsoring platforms where any sponsor could force-mint shares onto an unwilling address.

**Implémentation** :
- Add `depositForWithSig(receiver, sig, nonce, ...)` sister functions alongside each `*For` fn
- EIP-712 domain + typed-data struct for `SponsoredDeposit { receiver, termId, curveId, minShares, nonce, deadline }`
- On-chain verify via `ecrecover`, replay protection via `mapping(address => uint256) nonces`
- Frontend: popup `wallet.signTypedData(...)` before the sponsor submits

**Quand ajouter** : when a cross-org sponsoring use case emerges (open sponsoring platform, regulated context requiring explicit consent, or adversarial airdrop-spam concern). Non-breaking — ships as V2.1Sponsored via the version registry, existing proxies adopt on their own schedule.

**Trade-off** : ~150 lines of code + ~30% test surface, more UX friction (user signs per deposit), ~3k extra gas per call, typical signature-bug audit risk. YAGNI until demand.

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
