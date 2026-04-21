# Skills — playbooks opérationnels

Procédures concrètes pour les tâches récurrentes. Chaque skill = un objectif + les étapes exactes. Si tu dévies, documente pourquoi dans le PR.

---

## Skill 1 — Lancer le stack local (3 terminaux)

**Objectif** : dev environnement complet — hardhat node + contrats déployés + webapp branchée.

```bash
# Terminal 1 — node hardhat
bun contracts:node
# → copie une des PK Account #0-19 pour MetaMask

# Terminal 2 — deploy stack complet
bun contracts:deploy:local
# → écrit automatiquement packages/webapp/.env.local

# Terminal 3 — webapp
bun webapp:dev
# → http://localhost:3000
```

**MetaMask** :
- Add network → RPC `http://127.0.0.1:8545`, chainId `31337`, symbole ETH
- Import Account #0 (deployer = factory owner)
- MockMultiVault local = `0x5FbDB2315678afecb367f032d93F642f64180aa3` (nonce 0 déterministe sur fresh node)

---

## Skill 2 — Valider en E2E (après changements contrats)

**Objectif** : preuve vivante que le flow complet marche sur la build courante.

```bash
# 1. Tests unitaires (prérequis : doit être vert avant E2E)
bun contracts:test
# → doit afficher "124 passing" (ou plus si nouvelles suites)

# 2. Préflight : redeploy pour prendre en compte les changements Solidity
bun contracts:deploy:local

# 3. E2E complet
bun contracts:e2e:local
```

Le script E2E imprime un snapshot metrics à chaque étape :
1. createProxy (depuis Factory) → état initial zéro
2. userA deposit 1 TRUST → `deposits=1, users=1`
3. Deploy V3Mock + registerVersion("v2.1.0") + setDefaultVersion
4. userB deposit via v2.1.0 → `deposits=2, users=2` (metrics persistent cross-version ✓)
5. executeAtVersion("v2.0.0") → pin vers l'ancienne impl prouvé
6. withdrawAll → accumulatedFees reset, totalFeesCollectedAllTime monotone

Si un step rate ou un compteur diverge de l'attendu → bug, fix avant de passer à la suite.

---

## Skill 3 — Ship une nouvelle version d'impl (V2.1, V2.2, …)

**Objectif** : ajouter une feature ou fix un bug dans la logique, via le version registry, sans toucher aux proxies déployés.

Workflow strict (référencé aussi dans `/docs/workflow` du webapp) :

1. **Écrire `IntuitionFeeProxyVXX.sol`** inheritant du parent. Append-only storage. Shrink le `__gap` d'autant de slots ajoutés. Expose `version()` pure. Voir [08-rules.md](./08-rules.md) section "Code Solidity".

2. **Dupliquer la suite de tests** du parent + ajouter les tests des nouveaux flows. `bun contracts:test` → tout vert.

3. **Deploy l'impl seule sur testnet** (pas tout le stack — juste l'impl) : écrire un script `scripts/deploy-v2_1.ts` qui ne fait que `ImplFactory.deploy()` et imprime l'adresse. Validation manuelle sur un proxy test.

4. **Audit externe** — Spearbit, Trail of Bits, Code4rena, OpenZeppelin. Publier le rapport avant le mainnet deploy.

5. **Deploy mainnet one-shot + verify source** sur Intuition Explorer.

6. **Ajouter l'adresse canonique à la SDK** : update `packages/sdk/src/addresses.ts` avec `CANONICAL_IMPLEMENTATIONS.mainnet['v2.1.0'] = '0x…'`.

7. **Communication** : changelog + article + X post. Chaque admin de proxy peut alors aller sur son webapp → Register new version → paste l'adresse.

---

## Skill 4 — Tester l'UX d'upgrade manuellement dans le webapp

**Objectif** : valider que le formulaire "Register new version" + "Set as default" marche comme attendu, sans passer par le script E2E.

```bash
# Stack local tournant (Skill 1) + proxy déployé via webapp

# Déployer un V3Mock pour avoir une adresse à coller
bun contracts:deploy:v3mock:local
# → copie l'adresse imprimée
```

Dans le webapp :
1. `/proxy/<ton-proxy>` → section "Register new version"
2. Label : `v2.1.0` · Implementation address : adresse V3Mock
3. Click Register → sign → attendre mining
4. La ligne "v2.1.0" apparaît dans la liste des versions
5. Section "Set default version" → dropdown → `v2.1.0` → Set as default
6. Le badge `DEFAULT` se déplace sur v2.1.0

**Test de rollback** : dropdown → `v2.0.0` → Set as default. Retour instantané à l'ancienne logique, sans redéploiement.

---

## Skill 5 — Sync ABIs après changement contrats

**Objectif** : propager les interfaces changées aux consumers (webapp via SDK).

```bash
bun contracts:compile
bun sdk:sync
# → copie les 4 JSON ABI (V1, V2, Factory, Versioned) dans packages/sdk/src/abis/
```

Si une nouvelle fonction a été ajoutée dans V2 et que le webapp doit l'utiliser, vérifier aussi :
- `packages/sdk/src/index.ts` exporte bien le nouvel ABI
- Le hook webapp (`useProxy.ts` etc.) consomme la fonction via viem/wagmi

Oublier `sync` → le webapp plantera avec "Function X not found in ABI" à la première interaction.

---

## Skill 6 — Ajouter une page au webapp

**Objectif** : nouvelle route + nav entry, aligné sur les conventions du projet.

1. Créer `packages/webapp/src/pages/XxxPage.tsx`
2. Utiliser **uniquement** les tokens sémantiques (`bg-surface`, `text-ink`, `border-line`, etc.) — pas de `bg-zinc-*`
3. Le root div de la page : `max-w-Nxl mx-auto space-y-Y` pour centrer
4. Ajouter la route dans `packages/webapp/src/App.tsx`
5. Ajouter dans la nav : éditer `NAV_ITEMS` dans [`packages/webapp/src/components/Layout.tsx`](../packages/webapp/src/components/Layout.tsx)
6. Vérifier le rendu en **light** ET **dark** mode

Pas de font-extrabold sur les H1. Pas de pill uppercase décoratif. Voir [08-rules.md](./08-rules.md) Design.

---

## Skill 7 — Ajouter une section à la page /docs

**Objectif** : nouveau topic dans la doc webapp avec sa route propre.

1. Ajouter un ID dans le type `SectionId` (ex: `'metrics-dashboard'`)
2. Ajouter l'entrée dans le bon groupe de `GROUPS` dans [`packages/webapp/src/pages/Docs.tsx`](../packages/webapp/src/pages/Docs.tsx)
3. Écrire un composant `function MetricsDashboard()` retournant le contenu (utiliser `<PageHeader>`, `<P>`, `<H3>`, `<Code>`, `<Block>`, `<Callout>`, `<Step>`, `<Rule>` déjà définis dans le fichier)
4. Ajouter le case correspondant dans `SectionContent`
5. Le routing `/docs/:section` marche automatiquement, le sidebar et le Previous/Next aussi

---

## Skill 8 — Debug "insufficient permission for adding an object to repository database .git/objects"

**Cause** : l'agent Claude tourne en root, ses `git commit` créent des fichiers root-owned dans `.git`, le user `max` ne peut plus écrire dedans.

**Fix** :
```bash
sudo chown -R max:max .git
```

**Prévention** : après tout commit créé par un agent, exécuter automatiquement `chown -R max:max .git`. Cette règle est inscrite dans la mémoire Claude (voir `/root/.claude/projects/…/memory/feedback_git_ownership.md`).

---

## Skill 9 — Commit split (plusieurs scopes en un seul working tree)

**Objectif** : commits atomiques même quand une session a modifié plusieurs scopes.

Process :
1. `git status --short` — lister tous les changements
2. Regrouper par scope (`contracts/`, `webapp/`, `sdk/`, `scripts/`, etc.)
3. Pour chaque scope, un commit : `git add <files spécifiques>` puis `git commit -m "<type>(<scope>): <summary>"`
4. Préférer `git add <file>` explicite à `git add .` pour éviter d'inclure des fichiers hors scope
5. Après tous les commits : `chown -R max:max .git` + `git log --oneline -N` pour vérifier l'ordre
6. `git push` uniquement après confirmation du user

**Exemple de split** (session du 2026-04-19) :
- `feat(contracts): aggregate metrics on V2` — V2.sol + interface + tests
- `chore(scripts): e2e validation + v3mock deploy helpers` — 2 scripts + package.json
- `fix(webapp): UX polish and centered page containers` — pages polish
- `feat(webapp): multi-section docs with left sidebar` — Docs.tsx + App.tsx route

---

## Skill 10 — Répondre à une question "comment ça marche" sur l'architecture

**Objectif** : expliquer le pattern ERC-7936 sans mélanger les concepts.

**Règle** : toujours distinguer ces 3 choses :

| Concept | Rôle | Adresse |
|---|---|---|
| **Factory** | Déploie des proxies | 1 par chain |
| **Proxy** | Router + storage | 1 par deployment (par user) |
| **Implementation** | Logique pure | 1 par version, partagée par tous les proxies |

Points clés à marteler :
- L'impl est **déployée UNE SEULE FOIS** par version, partagée par tous les proxies
- Le proxy **ne contient pas la logique**, il `delegatecall` l'impl
- Ce qu'on "register" sur un proxy, c'est l'adresse d'une **impl nue**, jamais un autre proxy
- La storage vit dans le proxy, pas dans l'impl
- `executeAtVersion("v2.0.0")` pin vers l'impl immutable correspondant au label
- Rollback = `setDefaultVersion("v2.0.0")`, instant, sans redéploiement

Pour plus de détail : renvoyer vers `/docs/proxy-vs-impl` et `/docs/workflow`.
