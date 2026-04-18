# Plan d'implémentation — phase par phase

**⚠️ Ordre strict à respecter**. Chaque phase dépend de la précédente.

---

## Phase 0 — Alignement et décisions

**Input** : [04-open-questions.md](./04-open-questions.md)

**Tasks** :
- Répondre aux questions 1-25
- Valider le nom du repo et la stratégie git
- Contact avec l'équipe Intuition pour pre-validation
- Mettre à jour [06-tech-decisions.md](./06-tech-decisions.md) avec les réponses

**Exit criteria** : toutes les questions critiques (1-13) sont tranchées.

---

## Phase 1 — Restructuration monorepo

**Tasks** :
1. Créer la structure Bun workspaces
   - `package.json` root avec workspaces
   - `tsconfig.base.json`
   - Bouger le code actuel dans `packages/contracts/`
2. Créer `packages/sdk/` avec scaffolding
3. Créer `packages/webapp/` avec `bun create vite` (React + TS)
4. Script `scripts/sync-abis.ts` pour copier les ABIs
5. Tester :
   - `bun install` fonctionne
   - `bun contracts:compile` fonctionne
   - `bun contracts:test` passe (V1 tests)
   - `bun webapp:dev` lance Vite

**Exit criteria** : monorepo fonctionne, V1 tests passent.

**Fichiers créés** :
- `/package.json`, `/bun.lockb`, `/tsconfig.base.json`
- `/packages/contracts/*` (déplacement du code actuel)
- `/packages/sdk/package.json`, `/packages/sdk/src/index.ts`
- `/packages/webapp/*` (scaffolding Vite)
- `/scripts/sync-abis.ts`

---

## Phase 2 — Contrat V2 (implementation logique)

### 2.1 Étendre Errors.sol

**Fichier** : `packages/contracts/src/libraries/Errors.sol`

Ajouter :
```solidity
error IntuitionFeeProxy_ReceiverNotSender();
error IntuitionFeeProxy_NothingToWithdraw();
error IntuitionFeeProxy_WithdrawFailed();
error IntuitionFeeProxy_AlreadyInitialized();
error IntuitionFeeProxy_InvalidImplementation();
error IntuitionFeeProxy_NoAdminsProvided();
// + si on ajoute Pausable:
error IntuitionFeeProxy_Paused();
```

### 2.2 Interface V2

**Fichier** : `packages/contracts/src/interfaces/IIntuitionFeeProxyV2.sol`

Signatures publiques de V2 (pour Factory et tooling).

### 2.3 IntuitionFeeProxyV2.sol

**Fichier** : `packages/contracts/src/IntuitionFeeProxyV2.sol`

Sections :
1. Imports OZ upgradeable (`Initializable`, `UUPSUpgradeable`, `ReentrancyGuardUpgradeable`)
2. Storage (voir [06-tech-decisions.md](./06-tech-decisions.md) pour layout)
3. Events
4. Modifiers (`onlyWhitelistedAdmin`)
5. Constructor (`_disableInitializers()`)
6. `initialize(...)`
7. `_authorizeUpgrade()` (UUPS)
8. Fee calculation functions
9. Admin functions (setDeposit*, setWhitelistedAdmin, withdraw, withdrawAll)
10. Proxy functions (createAtoms, createTriples, deposit, depositBatch) avec check receiver
11. View functions (passthrough MultiVault)
12. Storage gap `uint256[43] __gap`
13. **PAS DE `receive()`**

### 2.4 Install OZ upgradeable

```bash
bun --cwd packages/contracts add @openzeppelin/contracts-upgradeable @openzeppelin/contracts
bun --cwd packages/contracts add -D @openzeppelin/hardhat-upgrades
```

### 2.5 Compile + fix

- `bun contracts:compile`
- Résoudre les erreurs de compilation

**Exit criteria** : le contrat compile, pas de warning critique.

---

## Phase 3 — Tests V2

**Fichier** : `packages/contracts/test/IntuitionFeeProxyV2.test.ts`

Groupes de tests :
1. **Initialization** (init success, double init revert, init on impl revert, zero admins revert)
2. **Receiver validation** (4 fonctions, positive + negative cases)
3. **Fee calculation** (reprendre les tests V1, doivent tous passer)
4. **Accumulation** (`accumulatedFees` increments, `totalFeesCollectedAllTime` monotone)
5. **Withdraw** (admin success, non-admin revert, amount > accumulated revert, reentrancy safe, zero address revert)
6. **Admin functions** (setDepositFixedFee, setDepositPercentageFee, setWhitelistedAdmin)
7. **Upgrade UUPS** (admin can upgrade, non-admin revert, state preserved after upgrade, storage layout check)
8. **No `receive()`** (envoi direct d'ETH revert)

**Exit criteria** : `bun contracts:test` passe avec > 95% coverage sur V2.

---

## Phase 4 — Factory contract

### 4.1 IntuitionFeeProxyFactory.sol

**Fichier** : `packages/contracts/src/IntuitionFeeProxyFactory.sol`

Sections :
1. Imports (`ERC1967Proxy`, `Ownable`)
2. Storage (`currentImplementation`, `proxiesByDeployer`, `allProxies`, `isProxyFromFactory`)
3. Events (`ProxyCreated`, `ImplementationUpdated`)
4. Constructor (`_initialImplementation`, owner = msg.sender)
5. `createProxy(...)` : deploy ERC1967Proxy + initialize
6. `setImplementation(address)` onlyOwner
7. View functions (`getProxiesByDeployer`, `allProxiesLength`, etc.)

### 4.2 Tests Factory

**Fichier** : `packages/contracts/test/IntuitionFeeProxyFactory.test.ts`

Tests :
- Create multiple proxies from different deployers
- Verify isolation (owner of factory ≠ admin of instances)
- `setImplementation` ne change pas les instances existantes
- `ProxyCreated` event bien émis
- `getProxiesByDeployer` retourne la bonne liste

**Exit criteria** : tests Factory passent.

---

## Phase 5 — SDK

**Fichier** : `packages/sdk/src/index.ts`

Exports :
```ts
export { default as IntuitionFeeProxyV2ABI } from './abis/IntuitionFeeProxyV2.json'
export { default as IntuitionFeeProxyFactoryABI } from './abis/IntuitionFeeProxyFactory.json'
export * from './addresses'
export * from './types'
```

**Fichier** : `packages/sdk/src/addresses.ts`

```ts
export const ADDRESSES = {
  intuitionMainnet: {
    factory: '0x...',     // à remplir après deploy
    implementation: '0x...',
    multiVault: '0x...',
  },
} as const
```

**Exit criteria** : la webapp peut importer `@intuition-fee-proxy/sdk` et accéder aux ABIs.

---

## Phase 6 — Webapp MVP

### 6.1 Setup

- wagmi v2 + viem + RainbowKit config
- Router (react-router-dom)
- Tailwind + shadcn/ui base
- Config chains (Intuition mainnet)

### 6.2 Pages

1. **Home** (`/`) : landing, CTA "Deploy your fee proxy"
2. **Deploy** (`/deploy`) : formulaire → createProxy
3. **My Proxies** (`/my-proxies`) : liste des proxies du wallet connecté
4. **Proxy Detail** (`/proxy/:address`) : stats, withdraw, update fees

### 6.3 Hooks principaux

- `useDeployProxy()` : writeContract pour `factory.createProxy`
- `useMyProxies()` : readContract `getProxiesByDeployer(address)`
- `useProxyStats(address)` : multiread (accumulatedFees, fees, admins)
- `useWithdraw(proxyAddress)` : writeContract `withdraw`

### 6.4 Deploy webapp

- Vercel (ou Netlify) avec variables d'env pour factory address

**Exit criteria** : webapp en prod, deploy d'un proxy fonctionne end-to-end.

---

## Phase 7 — Déploiement mainnet

### 7.1 Ordre

1. Deploy `IntuitionFeeProxyV2` (implementation)
2. Verify sur Intuition Explorer
3. Deploy `IntuitionFeeProxyFactory(impl)`
4. Verify
5. Update `packages/sdk/src/addresses.ts` avec les vraies addresses
6. Re-deploy webapp
7. Deploy la première instance officielle via la Factory
8. Mettre à jour le frontend avec la nouvelle address de l'instance

### 7.2 Monitoring 48h

- Watcher sur les events (`FeesCollected`, `FeesWithdrawn`)
- Vérifier que `accumulatedFees` correspond à la balance du contrat
- Alerter si un upgrade est appelé

**Exit criteria** : pas de régression pendant 48h, dashboard metrics fonctionne.

---

## Phase 8 — Communication

### 8.1 AUDIT_V2.md

**Fichier** : `/docs/AUDIT_V2.md`

- Diff V1 → V2 (fonctions, events, storage)
- Storage layout avec `__gap`
- Slither report
- Matrice de risques
- Coverage report

### 8.2 V2_ANNOUNCEMENT.md

**Fichier** : `/docs/V2_ANNOUNCEMENT.md`

Draft article :
- Contexte V1 + bug (receiver non validé)
- Le receive() dangereux éliminé
- Nouveau pattern accumulate + withdraw
- Factory permissionless pour 1-clic deploy
- Call-to-action webapp

### 8.3 X post

280 caractères max, avec lien vers l'article.

**Exit criteria** : article publié, X post envoyé, Intuition validate.

---

## Résumé des exit criteria par phase

| Phase | Exit criteria |
|-------|---------------|
| 0 | Questions critiques répondues + pré-validation Intuition |
| 1 | Monorepo fonctionne, V1 tests passent |
| 2 | V2 compile sans warning |
| 3 | V2 tests > 95% coverage |
| 4 | Factory tests passent |
| 5 | SDK importable depuis webapp |
| 6 | Webapp deploy fonctionne end-to-end |
| 7 | Mainnet stable 48h |
| 8 | Communication publiée |
