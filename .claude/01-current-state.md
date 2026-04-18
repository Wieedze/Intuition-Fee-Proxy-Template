# État actuel — V1 template

## Contrat V1

- **Fichier** : `packages/contracts/src/IntuitionFeeProxy.sol`
- **Immutable** : pas de proxy, pas d'upgrade path possible
- **Pas déployé officiellement** — c'est un template que les devs forkent

## Problèmes identifiés sur V1

### 1. Receiver non validé (bug sécu)

Dans `createAtoms`, `createTriples`, `deposit`, `depositBatch`, le paramètre `receiver` n'est pas validé contre `msg.sender`. Un attaquant peut forger une tx qui paye les fees d'un user mais redirige les shares vers une autre adresse.

**Scenario d'attaque** :
- dApp malveillante propose une tx `proxy.deposit(receiver = DAPP_WALLET, ...)`
- User signe sans voir que `receiver` ≠ son wallet
- User paye l'ETH + fees → dApp reçoit les shares
- User arnaqué

Référence : **[Fee-Proxy-Template#1](https://github.com/intuition-box/Fee-Proxy-Template/issues/1)** (issue GitHub).

### 2. Risque de fonds bloqués via `receive()`

Le contrat a `receive() external payable {}` qui accepte n'importe quel ETH entrant. Sans fonction `withdraw`, tout ETH envoyé directement (ou refund de MultiVault) est perdu.

**Cause probable** : refunds de MultiVault sur des calls où `msg.value` > coût réel.

### 3. Fee forwarding immédiat

`_transferFee()` envoie les fees au recipient à chaque transaction :
- **+** : pas de fees bloquées
- **-** : coûteux en gas, et chaque tx peut revert si le recipient rejette l'appel
- **-** : pas de flexibilité (ex: accumulation de fees pour des opérations batch)

### 4. Pas d'upgrade path

Contrat immutable → impossible de fix sans redéploiement complet.

## Ce qui fonctionne bien en V1 (à garder)

- Modèle `whitelistedAdmins[]` multi-admin (pas Ownable)
- Calcul des fees (fixed + percentage) + formule inverse pour `deposit(msg.value)`
- Events `FeesCollected`, `TransactionForwarded`, `MultiVaultSuccess`
- `MockMultiVault.sol` pour les tests

## Stack actuel

- **Solidity** : ^0.8.21
- **Hardhat** + TypeScript
- **ethers v6**
- **typechain-types** généré
- **Tests** : `packages/contracts/test/IntuitionFeeProxy.test.ts`
- **Scripts** : `packages/contracts/scripts/deploy.ts`
