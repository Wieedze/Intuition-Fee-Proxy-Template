# SAFE_TX_RUNBOOK

Operations manual for the `@intuition-fee-proxy/safe-tx` tooling. Audience: anyone holding an admin role on a deployed `IntuitionFeeProxy` or `IntuitionFeeProxyFactory`.

For background on **why** this stack exists, see [`.claude/SAFE_INTEGRATION_PLAN.md`](.claude/SAFE_INTEGRATION_PLAN.md).

---

## 0. Quick reference

```bash
# Inspect what's pending on the Safe
bun safe:tx list --safe 0xSAFE

# Propose an admin op (owner #1)
bun safe:tx <op-name> [op-flags] --safe 0xSAFE --signer env

# Co-sign (owner #2 ... N)
bun safe:tx confirm --hash 0xSAFETXHASH --safe 0xSAFE --signer env

# Execute once quorum is reached (anyone)
bun safe:tx execute --hash 0xSAFETXHASH --safe 0xSAFE --signer env

# One-shot migration: rotate EOA admin -> Safe
bun safe:rotate-admin --proxy 0xPROXY --safe 0xSAFE --eoa 0xEOA --dry-run
```

`bun safe:tx --help` lists every available op subcommand.

---

## 1. Pre-flight checks (every time)

Before proposing **any** admin op, confirm:

1. **You're targeting the right network.** Only `intuition-mainnet` (chain id 1155) is supported. There is no testnet path — see Section 8.
2. **The Safe is the admin of your target proxy.** Run:
   ```bash
   cast call $PROXY "whitelistedAdmins(address)(bool)" $SAFE \
     --rpc-url https://rpc.intuition.systems
   ```
   Expect `true`. If `false`, your op will revert with `IntuitionFeeProxy_NotWhitelistedAdmin`. Either rotate the admin first (Section 3) or use the EOA that currently holds the role.
3. **Your `PROPOSER_PK` is a Safe owner.** Run:
   ```bash
   cast call $SAFE "getOwners()(address[])" --rpc-url https://rpc.intuition.systems
   ```
   The address derived from `PROPOSER_PK` must appear in that list. Otherwise the propose POST is rejected by Den's STS.
4. **Den's STS is reachable.** Quick ping:
   ```bash
   curl -sf https://safe-transaction-intuition.onchainden.com/api/v1/about/ | head -c 80
   ```
   If this fails, follow Section 7 (Den down fallback).

---

## 2. Routine admin operation flow

The standard flow is: one owner proposes, the rest co-sign, anyone executes.

### Step 2.1 — Propose

Pick the right op. Each one is its own subcommand. Examples:

```bash
# Lower the fixed deposit fee to 50 wei
bun safe:tx set-deposit-fixed-fee \
  --proxy 0xPROXY --value 50 \
  --safe 0xSAFE --signer env

# Withdraw 1 TRUST from the proxy treasury
bun safe:tx withdraw \
  --proxy 0xPROXY --recipient 0xRECIPIENT --amount 1000000000000000000 \
  --safe 0xSAFE --signer env

# Register a new V2 implementation in the factory
bun safe:tx factory-set-implementation \
  --factory 0xFACTORY --new-impl 0xNEW_IMPL --new-version v3.0.0 \
  --safe 0xSAFE --signer env

# Upgrade a UUPS proxy to a new implementation
bun safe:tx upgrade-to-and-call \
  --proxy 0xPROXY --new-impl 0xNEW_IMPL \
  --safe 0xSAFE --signer env
```

Output prints:
- `safeTxHash` (save it — you'll share it with the other owners)
- The Den UI URL where the tx now appears in the queue
- The proposer address

### Step 2.2 — Co-sign

Other owners can co-sign in two equivalent ways:

**Den UI (recommended for non-developer owners):**
1. Open the Den URL printed in step 2.1
2. Find the pending tx by `safeTxHash`
3. Click "Confirm" and approve in the connected wallet

**CLI (for developers / scripts):**
```bash
bun safe:tx confirm --hash 0xSAFETXHASH --safe 0xSAFE --signer env
```

Repeat with each owner's `PROPOSER_PK` until threshold is reached.

### Step 2.3 — Execute

Once `confirmations.length >= threshold` (default 2 for the reference Safe), anyone can execute:

```bash
bun safe:tx execute --hash 0xSAFETXHASH --safe 0xSAFE --signer env
```

The executor:
- Does NOT need to be a Safe owner — any address with TRUST for gas works
- Pays the gas (typically a few cents on Intuition)

Output prints the tx hash, then waits for the receipt and reports `success` or `Reverted`.

---

## 3. Rotation: EOA admin → Safe admin

This is a **one-shot** migration done once per proxy. After it lands, all admin ops go through the Safe.

### Step 3.1 — Dry-run first

```bash
bun safe:rotate-admin --dry-run \
  --proxy 0xPROXY --safe 0xSAFE --eoa 0xEOA
```

The dry-run reads on-chain state, prints the planned actions, and exits **without sending or signing anything**. No `PROPOSER_PK` required. Verify the output before continuing.

### Step 3.2 — Run the rotation

`PROPOSER_PK` must be the EOA admin's private key. The address it derives must:
- Match `--eoa` exactly (Step 1 sends from this account)
- Also be a Safe owner (Step 2 needs to propose via STS)

```bash
export PROPOSER_PK=0x...
bun safe:rotate-admin \
  --proxy 0xPROXY --safe 0xSAFE --eoa 0xEOA
```

The script does:

1. **Step 1 (EOA tx)**: `setWhitelistedAdmin(safe, true)` — Safe joins the admin list. Single tx, EOA pays gas.
2. **Step 2 (propose)**: builds + signs a SafeTx that calls `setWhitelistedAdmin(eoa, false)`, posts it to Den's STS. Other owners co-sign + execute via Section 2.3 to finalize the revoke.

After both steps land, the Safe is the **sole** admin of the proxy.

### Step 3.3 — Run partial rotation (keep EOA temporarily)

If you want both EOA and Safe to have admin access for a transition period:

```bash
bun safe:rotate-admin --no-revoke \
  --proxy 0xPROXY --safe 0xSAFE --eoa 0xEOA
```

Only Step 1 runs. Revoke the EOA later with:
```bash
bun safe:tx set-whitelisted-admin \
  --proxy 0xPROXY --admin 0xEOA --status false \
  --safe 0xSAFE --signer env
```

---

## 4. Recovering from a failed op

### Op was proposed but never reaches quorum

- Owners can refuse to sign. The tx stays pending in Den indefinitely.
- To withdraw the proposal, propose a different tx with the **same nonce** that does nothing (e.g., `setDepositFixedFee(currentValue)` — a no-op). Owners sign that one instead, executing it consumes the nonce, and the original proposal becomes invalid.

### Op executed but reverted

The Safe's nonce still increments — the tx slot is consumed. Investigate why:
- Pre-flight check skipped? (e.g., Safe not actually admin)
- Op-specific revert? (e.g., `FeeTooHigh` if you set a fee above `MAX_FEE_PERCENTAGE`)

Re-propose the corrected op. The new SafeTx uses the next nonce automatically.

### Wrong calldata sent

- If proposed and not yet executed: cancel via the same-nonce no-op trick above.
- If already executed: the change is on-chain. Propose the inverse op to undo.

---

## 5. Fallback: Den's STS is down

The api-kit mode depends on `https://safe-transaction-intuition.onchainden.com`. If that's unreachable (rare but possible — third-party infra), fall back to direct execution **without Den**.

The `direct-sign` mode is shipped as a library (no CLI subcommand yet). Quick recipe in a Node/Bun REPL or a one-off script:

```ts
import { createPublicClient, createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import {
  buildSafeTx, signSafeTx, aggregateSignatures, executeSafeTx,
  buildPreApprovedSignature,
} from '@intuition-fee-proxy/safe-tx/src/modes/direct-sign.js'
import { ops } from '@intuition-fee-proxy/safe-tx'
import { INTUITION_MAINNET, getViemChain } from '@intuition-fee-proxy/safe-tx'

const chain = getViemChain(INTUITION_MAINNET)
const publicClient = createPublicClient({ chain, transport: http() })

// 1. Build the SafeTx
const op = ops.v2Admin.setDepositFixedFee('0xPROXY', 100n)
const payload = await buildSafeTx({ safe: '0xSAFE', chainId: 1155, op }, publicClient)

// 2. Each owner signs locally
const ownerA = privateKeyToAccount(process.env.OWNER_A_PK)
const ownerB = privateKeyToAccount(process.env.OWNER_B_PK)
const sigA = await signSafeTx(payload, ownerA)
const sigB = await signSafeTx(payload, ownerB)

// 3. Aggregate + execute on-chain
const signatures = aggregateSignatures([sigA, sigB])
const executor = privateKeyToAccount(process.env.EXECUTOR_PK)
const walletClient = createWalletClient({ chain, transport: http(), account: executor })
const txHash = await executeSafeTx({
  payload, signatures, walletClient, account: executor.address,
})
```

The signatures can also be collected via `Safe.approveHash(safeTxHash)` on-chain instead of EIP-712, then executed with `buildPreApprovedSignature(owner)` blobs. See `test/integration/direct-sign.test.ts` for the pattern.

If you want this as a CLI subcommand, file an issue or open a PR — the library is ready, only the wrapper is missing.

---

## 6. Validation checklist (before any mainnet op)

- [ ] `bun safe:tx list --safe 0xSAFE` returns the expected pending state (or empty)
- [ ] The proxy your op targets actually exists and the Safe is admin (`cast call ... whitelistedAdmins(safe)`)
- [ ] You ran `--dry-run` (or read the propose output) and the calldata matches what you intended (use Den UI's transaction simulation if in doubt — Tenderly-powered)
- [ ] Threshold owners are reachable for co-signing
- [ ] You have TRUST in the executor account for gas

For high-stakes ops (UUPS upgrade, ownership transfer), do a **dry-run on Anvil fork** first:
```bash
anvil --fork-url https://rpc.intuition.systems --fork-block-number 3250000 &
# point your scripts at http://127.0.0.1:8545 instead of mainnet
```
The Safe state on the fork is identical to mainnet — what works there will work in prod.

---

## 7. Out of scope (intentional)

- **Testnet (chain id 13579)**: no Safe canonical contracts deployed there, no STS coverage. Will not be supported. Use Anvil fork mainnet for any testing.
- **Mode `direct` via CLI**: lib is ready, CLI wrapper deferred. Use Section 5 recipe.
- **Hardware wallet signers**: `--signer ledger` and `--signer walletconnect` exist as stubs — they throw with a clear "not yet implemented" message. Use Den UI with your own Ledger/WC-connected wallet for now.
- **Pause / unpause ops**: parked on Intuition governance decision. See `project_security_audit.md` (audit C-01 F2 + I-02).
- **Self-hosting Safe Transaction Service**: overkill for the current scope. If Den becomes unreliable, revisit.

---

## 8. Reference: deployed addresses

Snapshot at 2026-04-23. Update when re-deploying.

| Role | Address |
|---|---|
| Reference Safe (2-of-3) | `0xf10D442D0fB934D4037DC30769a6EfCf2f54F7B6` |
| Safe Singleton (v1.3.0+L2) | `0xfb1bffC9d739B8D520DaF37dF666da4C687191EA` |
| Safe Singleton (v1.4.1+L2) | `0x29fcB43b46531BcA003ddC8FCB67FFE91900C762` |
| Safe ProxyFactory (Den) | `0xC22834581EbC8527d974F8a1c97E1bEA4EF910BC` |
| Safe FallbackHandler (canonical 1.3.0) | `0x017062a1dE2FE6b99BE3d9d37841FeD19F573804` |
| Den Safe Transaction Service | `https://safe-transaction-intuition.onchainden.com` |
| Den UI | `https://safe.onchainden.com/home?safe=int:<addr>` |
| Public RPC | `https://rpc.intuition.systems` |

---

## 9. Getting help

- Tooling source: [`packages/safe-tx/`](packages/safe-tx/)
- Integration plan: [`.claude/SAFE_INTEGRATION_PLAN.md`](.claude/SAFE_INTEGRATION_PLAN.md)
- Audit context: see audit-related commits and `project_security_audit.md` in memory
- Den documentation: https://docs.onchainden.com
- Safe Transaction Service API: https://docs.safe.global/core-api/api-safe-transaction-service
