# État actuel — V2 shipped localement

## En une phrase

V2 upgradeable + Factory permissionless + webapp complet + docs multi-sections + metrics on-chain, tout testé localement, en attente de validation par l'équipe Intuition avant testnet / audit / mainnet.

## Ce qui existe

### Contrats

- `IntuitionFeeProxyV2.sol` — logique métier (deposit, createAtoms, createTriples, depositBatch, fees, admins, metrics). Inherit safe pour V2.1+ via `__gap[36]` restants.
- `IntuitionVersionedFeeProxy.sol` — proxy ERC-7936 avec storage namespacée. Admin (idéalement Safe) peut `registerVersion` / `setDefaultVersion` / `transferProxyAdmin`. Users peuvent `executeAtVersion` pour pin.
- `IntuitionFeeProxyFactory.sol` — UUPS upgradeable, permissionless, `createProxy` déploie une instance par appel.
- `IIntuitionFeeProxyV2.sol` — interface complète incl. la struct `ProxyMetrics` et les getters metrics.
- Mocks : `MockMultiVault`, `IntuitionFeeProxyV3Mock` (pour tester le flow d'upgrade).
- `IntuitionFeeProxy.sol` (V1) — conservé pour compat rétrograde / dashboards historiques.

### Tests — 124 passing

- `IntuitionFeeProxyV2.test.ts` : init, calcul fees, accumulation, withdraw, admin whitelist, metrics complet.
- `IntuitionFeeProxyFactory.test.ts` : création de proxies, ownership, UUPS upgrade.
- `IntuitionVersionedFeeProxy.test.ts` : registry, default, executeAtVersion, transferProxyAdmin.

### SDK

- ABIs synced pour les 4 contrats (V1, V2, Factory, Versioned).
- `MULTIVAULT_ADDRESSES` + `V2_ADDRESSES` tables par network (mainnet/testnet).
- Chains exports pour wagmi.

### Webapp

- Pages : Home, Deploy, MyProxies, ProxyDetail, Docs (multi-sections avec sidebar).
- Tokens sémantiques via CSS vars (canvas/surface/line/ink/muted/subtle/brand) — light + dark mode avec toggle persistant localStorage.
- Fonts : Geist + Geist Mono.
- Palette : warm paper neutrals + burnt-orange accent (`#D9572F` light, `#F07A3F` dark).
- Hooks : `useFactory`, `useProxy`, `useVersionedProxy`.
- `.env.local` auto-écrit par le script de deploy.

### Scripts

- `packages/contracts/scripts/deploy.ts` — stack complet (Mock MV + V2 impl + Factory impl + ERC1967 proxy + init).
- `packages/contracts/scripts/e2e-validate.ts` — validation E2E complète (deposits, register, setDefault, executeAtVersion, withdraw, metrics snapshot à chaque étape).
- `packages/contracts/scripts/deploy-v3mock.ts` — helper pour avoir une adresse d'impl à coller dans le formulaire webapp.
- `scripts/sync-abis.ts` — copie les ABIs compilés vers le SDK.

## Issues résolues depuis V1

1. **Receiver non validé** → supprimé complètement. `msg.sender` est toujours le receiver (V2 = fee layer pur, pas de sponsoring).
2. **Fonds bloqués via `receive()`** → supprimé. Les transfers ETH directs reverts (foot-gun gone).
3. **Fee forwarding immédiat** → remplacé par `accumulatedFees` + `withdraw` / `withdrawAll` pattern.
4. **Pas d'upgrade path** → ERC-7936 versioned proxy avec registry de versions.

## Ce qui reste à faire

**Phase 7 — Deploy / Audit** (bloqué sur validation Intuition) :
- [ ] Retour de l'équipe Intuition sur la design V2 (envoyé 2026-04-18)
- [ ] Testnet deploy (chainId 13579)
- [ ] Audit externe (Spearbit / Trail of Bits / Code4rena)
- [ ] Mainnet deploy (chainId 1155)
- [ ] Publier adresses canoniques dans SDK

**Phase 8 — Communication** :
- [ ] Article + X post
- [ ] Mettre à jour `intuition.systems` / `intuition.box` avec lien vers la factory

**Post-V2** : voir [07-roadmap.md](./07-roadmap.md) pour V2.1 (TimelockController) et V3 (sponsoring, CREATE2, governance, etc.).
