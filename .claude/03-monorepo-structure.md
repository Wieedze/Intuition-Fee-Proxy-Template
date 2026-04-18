# Structure monorepo — Bun workspaces + Vite

## Stack

- **Bun** comme package manager et workspace manager
- **Vite + React 18 + TypeScript** pour la webapp
- **Hardhat + TypeScript** pour les contrats (conservé)
- **SDK partagé** : ABIs + addresses + types générés

## Arborescence

```
intuition-fee-proxy-template/
├── package.json                          # Bun workspaces
├── bun.lock
├── tsconfig.base.json                    # Config TS partagée
├── .gitignore
├── .claude/                              # Ce dossier
├── docs/                                 # Audit, announcements
├── scripts/
│   └── sync-abis.ts                      # Copier ABIs après compile
│
├── packages/
│   ├── contracts/                        # Hardhat
│   │   ├── src/
│   │   │   ├── IntuitionFeeProxy.sol     # V1 (conservé pour référence)
│   │   │   ├── IntuitionFeeProxyV2.sol   # V2 (nouveau)
│   │   │   ├── IntuitionFeeProxyFactory.sol
│   │   │   ├── interfaces/
│   │   │   │   ├── IEthMultiVault.sol
│   │   │   │   └── IIntuitionFeeProxyV2.sol
│   │   │   ├── libraries/
│   │   │   │   └── Errors.sol
│   │   │   └── test/
│   │   │       └── MockMultiVault.sol
│   │   ├── test/
│   │   │   ├── IntuitionFeeProxy.test.ts
│   │   │   ├── IntuitionFeeProxyV2.test.ts
│   │   │   └── IntuitionFeeProxyFactory.test.ts
│   │   ├── scripts/
│   │   │   └── deploy-v2-*.ts
│   │   ├── hardhat.config.ts
│   │   └── package.json
│   │
│   ├── sdk/                              # Shared ABIs + addresses
│   │   ├── src/
│   │   │   ├── abis/                     # Auto-synced from artifacts
│   │   │   ├── addresses.ts
│   │   │   ├── chains.ts
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   └── webapp/                           # Vite + React Factory UI
│       ├── src/
│       │   ├── App.tsx
│       │   ├── main.tsx
│       │   ├── pages/
│       │   ├── components/
│       │   ├── hooks/
│       │   └── lib/
│       ├── index.html
│       ├── vite.config.ts
│       ├── tsconfig.json
│       └── package.json
```

## Config root

**package.json** :
```json
{
  "name": "intuition-fee-proxy-template",
  "private": true,
  "workspaces": ["packages/*"],
  "scripts": {
    "contracts:compile": "bun --filter @intuition-fee-proxy/contracts compile",
    "contracts:test": "bun --filter @intuition-fee-proxy/contracts test",
    "sdk:build": "bun --filter @intuition-fee-proxy/sdk build",
    "sdk:sync": "bun run scripts/sync-abis.ts",
    "webapp:dev": "bun --filter @intuition-fee-proxy/webapp dev",
    "webapp:build": "bun --filter @intuition-fee-proxy/webapp build"
  }
}
```

## Synchronisation ABIs

Script `scripts/sync-abis.ts` qui après compile Hardhat :
1. Lit `packages/contracts/artifacts/src/*.sol/*.json`
2. Extrait le champ `abi`
3. Écrit dans `packages/sdk/src/abis/*.json`
4. La webapp peut ensuite `import { IntuitionFeeProxyV2ABI } from '@intuition-fee-proxy/sdk'`

## Dépendances workspace

**packages/webapp/package.json** :
```json
{
  "dependencies": {
    "@intuition-fee-proxy/sdk": "workspace:*",
    "react": "^18.3.0",
    "wagmi": "^2.x",
    "viem": "^2.x",
    "@rainbow-me/rainbowkit": "^2.x",
    "@tanstack/react-query": "^5.x",
    "react-router-dom": "^6.x"
  }
}
```
