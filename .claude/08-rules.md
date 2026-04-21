# Rules — conventions du projet

Règles dures pour contribuer à ce repo. Toute contribution (humaine ou IA) doit les suivre.

---

## Design & visuel (webapp)

### Palette

- **Base neutre warm** : off-white paper (`#FBFAF6`) en light, near-black warm (`#0A0908`) en dark. Aucun noir pur.
- **Accent unique : burnt orange** (`#D9572F` light, `#F07A3F` dark). Utilisé avec parcimonie — CTA primaire, active state, bordure des callouts importants.
- **Interdit formellement** : violet, indigo, emerald néon, cyan fluo, gradients multi-couleurs. Ces teintes signalent un template v0/Lovable/Claude Artifacts.
- Tous les tokens passent par CSS variables sémantiques (`canvas`, `surface`, `line`, `ink`, `muted`, `subtle`, `brand`). Jamais de `zinc-*`, `gray-*`, `emerald-*` en dur dans les classNames.

### Typographie

- **Geist** (sans) + **Geist Mono**. Rien d'autre.
- Headings : `font-semibold` ou `font-medium`, `tracking-tight`. **Jamais** `font-extrabold` + `tracking-tight` sur H1 (signal template SaaS).
- Pas d'uppercase décoratif partout — uniquement sur les labels de section de la sidebar docs et sur les kickers au-dessus des titres de page (`text-[11px] uppercase tracking-wider`).

### Composants

- Pas de pills uppercase monospace décoratives (`● ERC-7936`, `● LIVE`, `● FLOW` etc.) — signal v0 très fort.
- Pas de `animate-glow-pulse`, `shadow-glow`, halos emerald néon.
- Shadows discrètes, layered : `shadow-xs/sm/md/lg` via CSS vars — jamais de grosse ombre floue.
- Cards centrées dans leur container (`mx-auto` sur le max-w de la page).

### Copy

- **Anglais éditorial sobre**. Pas de marketing-speak : éviter "one-click", "spin up", "ship fast", "blazing", "next-gen", "revolutionary".
- **Ne jamais revendiquer un audit tant qu'il n'a pas eu lieu.** Le mot "audited" est banni du webapp. Utiliser "pinned", "versioned", "reviewed" selon le contexte.
- Microcopy d'état concret : "Confirm in wallet…", "Mining…", "No proxies yet", pas de texte vague type "Loading…" tout seul.
- Footer minimal — pas de `● LIVE` avec dot qui pulse.

### Layout

- `max-w-6xl mx-auto px-6` sur le container de page.
- Pages avec contenu form/detail : `max-w-2xl` ou `max-w-3xl` + `mx-auto` pour centrer.
- Light/dark mode toggle dans le header, persistant via localStorage.
- Toutes les pages doivent rendre proprement en light ET dark mode — pas d'éléments avec `text-amber-100` ou équivalents qui disparaissent sur un des fonds.

---

## Copy produit

- **Nom officiel** : "Intuition Proxy Factory" (dans header, `<title>`, meta description).
- Branding wordmark : `Intuition` (semi-bold) · `Proxy Factory` (regular muted) · `v2` (tag font-mono borderé).
- Pas de "⌘" en prefix ni de "→" dans les titres. Les flèches `→` sont OK en fin de link textuel (`See docs →`).

---

## Code Solidity — règles d'or pour implémentations V2+

Ces règles sont ce qui garantit la sécurité de l'upgrade pattern. Les enfreindre = corrompre la storage d'un proxy existant.

1. **Inherit from the previous version** (`IntuitionFeeProxyV2` → `IntuitionFeeProxyV21` → `V22`…). Jamais redéfinir ou réordonner des state vars du parent.
2. **Append-only storage.** Nouvelles vars à la fin, avant le `__gap`. Shrink le `__gap` d'autant de slots qu'on ajoute.
3. **`_disableInitializers()` dans le constructeur.** Toujours. L'impl ne doit jamais s'initialiser elle-même après son déploiement.
4. **`reinitializer(n)` si migration de state one-shot** — incrémenter `n` à chaque version pour garantir non-rejouable.
5. **Exposer `function version() external pure returns (string memory)`** pour introspection (dashboards, diff).
6. **Préserver les signatures publiques existantes.** Aucun selector ne change de sémantique. Casser ça trahit les users qui ont pinné.
7. **Jamais de `_authorizeUpgrade` ni UUPS dans l'impl.** Tout upgrade passe par le versioned proxy (`registerVersion` + `setDefaultVersion`).
8. **Tag + verify on-chain.** Commit tagué = bytecode déployé = adresse vérifiée sur l'explorer. Cohérent partout.

---

## Code TypeScript / React

- Pas d'`any` sauf cas vraiment forcé (cast cross-lib).
- Hooks custom dans `packages/webapp/src/hooks/`, une responsabilité par hook.
- Pas de commentaires qui expliquent *quoi* — uniquement *pourquoi* quand c'est non-évident.
- Pas de fichier `README.md` ou doc générée à la racine des composants sauf demande explicite.
- Préférer `Link` (react-router) pour la nav interne, `<a target="_blank" rel="noopener noreferrer">` pour l'externe.

---

## Tests

- **Tous les tests doivent passer.** Tout commit qui en casse un est à rejeter / fix avant merge.
- Sur nouvelle impl V2.X : dupliquer la suite parent et ajouter la couverture des nouvelles features. Zéro régression.
- Les tests metrics vérifient les counters explicitement (pas juste "le call n'a pas revert").

---

## UX de déploiement

- **Admins field au déploiement : vide par défaut.** Ne jamais pré-remplir avec le wallet connecté.
- **Callout multisig obligatoire** sous le champ Admins : "Heads up — use a multisig (e.g. a Safe) as admin. A single EOA is a single point of failure for fee withdrawals and version upgrades."
- Le champ MultiVault address est pré-rempli avec l'adresse du network actif (via SDK).

---

## Git & commits

- Messages de commit au format Conventional Commits : `feat(scope): …`, `fix(scope): …`, `refactor(scope): …`, `chore(scope): …`.
- Scopes utilisés : `contracts`, `webapp`, `sdk`, `scripts`, `docs`, ou combinés (`contracts,sdk`).
- Une logique par commit. Pas de mega-commit "fix everything".
- Les commits IA doivent avoir un trailer `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.
- **Jamais** `git push --force` sur `main` ni `v2-upgradeable-factory` sans discussion explicite.

---

## Environnement

- L'user (`max`) fait tourner le dev server Vite ; l'agent (root dans ce setup) **ne doit pas** lancer `bun webapp:dev` ou `bun run build` côté webapp. Il peut par contre exécuter `bun contracts:compile` / `bun contracts:test`.
- Après tout commit créé par l'agent, exécuter `chown -R max:max .git` — sinon le fetch/push suivant du user fail avec "insufficient permission for adding an object to repository database .git/objects".
