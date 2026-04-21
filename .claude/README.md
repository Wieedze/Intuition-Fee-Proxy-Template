# .claude — Project context for Intuition Fee Proxy Factory

Contexte de collaboration sur le projet. Organisé du plus général au plus opérationnel.

## Fichiers

### État & planning
- [00-project-overview.md](./00-project-overview.md) — Vue d'ensemble (V1 + V2 + V2Sponsored + Factory)
- [01-current-state.md](./01-current-state.md) — **Source de vérité** : état actuel (V2 shipped, audit fixé, en attente Intuition)
- [02-v2-goals.md](./02-v2-goals.md) — Livrables V2 du bounty (historique — tous shipped)
- [03-monorepo-structure.md](./03-monorepo-structure.md) — Structure du monorepo
- [06-tech-decisions.md](./06-tech-decisions.md) — Décisions techniques (pattern UUPS, Factory, sponsored, etc.)
- [07-roadmap.md](./07-roadmap.md) — Features hors scope V2 (V2.1, V3, Pausable/gov)

### Opérationnel
- [08-rules.md](./08-rules.md) — **Règles du projet** (design, copy, code, storage)
- [09-skills.md](./09-skills.md) — **Playbooks** (ship une nouvelle version, test local, deploy, etc.)

## Status

**Phase actuelle** : V2 + V2Sponsored + Factory two-channel shipped localement, 166 tests passants, 18 audit findings tous traités. Branche `v2-upgradeable-factory`, PR ouverte contre `main` depuis 2026-04-18. En attente validation Intuition team avant testnet deploy + audit externe + mainnet.

**Si tu reprends le projet** : lis [01-current-state.md](./01-current-state.md) pour l'état, puis [08-rules.md](./08-rules.md) + [09-skills.md](./09-skills.md) pour les conventions et procédures. Les docs 00/02/03/06 servent de référence de design mais `01-current-state` est ce qui compte au quotidien.
