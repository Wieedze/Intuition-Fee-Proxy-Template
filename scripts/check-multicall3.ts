#!/usr/bin/env bun
/**
 * Check whether Multicall3 is deployed at its canonical address on each
 * supported Intuition network (local hardhat, testnet, mainnet). Prints a
 * summary you can use to decide whether to:
 *   - add the `contracts.multicall3` entry in chains.ts (if deployed),
 *   - deploy Multicall3 via the deterministic deployer (if absent),
 *   - or keep the Promise.all fallback in the SDK readers (fine either way).
 *
 * Usage:
 *   bun run scripts/check-multicall3.ts
 *
 * Env overrides:
 *   LOCAL_RPC     = http://127.0.0.1:8545
 *   TESTNET_RPC   = https://testnet.rpc.intuition.systems
 *   MAINNET_RPC   = https://rpc.intuition.systems
 */
import { createPublicClient, http, type Address, type PublicClient } from "viem";

const MULTICALL3: Address = "0xcA11bde05977b3631167028862bE2a173976CA11";

type Target = { name: string; chainId: number; rpc: string };

const TARGETS: Target[] = [
  {
    name: "Local hardhat",
    chainId: 31337,
    rpc: process.env.LOCAL_RPC ?? "http://127.0.0.1:8545",
  },
  {
    name: "Intuition Testnet",
    chainId: 13579,
    rpc: process.env.TESTNET_RPC ?? "https://testnet.rpc.intuition.systems",
  },
  {
    name: "Intuition Mainnet",
    chainId: 1155,
    rpc: process.env.MAINNET_RPC ?? "https://rpc.intuition.systems",
  },
];

async function check(target: Target): Promise<{
  target: Target;
  reachable: boolean;
  hasMulticall3: boolean;
  chainIdOk?: boolean;
  err?: string;
}> {
  try {
    const client = createPublicClient({
      transport: http(target.rpc, { timeout: 5_000, retryCount: 0 }),
    }) as PublicClient;
    const chainId = await client.getChainId();
    const code = await client.getBytecode({ address: MULTICALL3 });
    const hasMulticall3 = Boolean(code && code !== "0x");
    return {
      target,
      reachable: true,
      chainIdOk: chainId === target.chainId,
      hasMulticall3,
    };
  } catch (e: any) {
    return {
      target,
      reachable: false,
      hasMulticall3: false,
      err: e?.shortMessage ?? e?.message ?? String(e),
    };
  }
}

async function main() {
  console.log(`\nMulticall3 canonical addr:  ${MULTICALL3}`);
  console.log("─".repeat(72));
  const results = await Promise.all(TARGETS.map(check));
  for (const r of results) {
    const chainTag = r.reachable
      ? r.chainIdOk
        ? `chain ${r.target.chainId} ✓`
        : `WRONG CHAIN at RPC`
      : "unreachable";
    const mc3Tag = r.reachable
      ? r.hasMulticall3
        ? "Multicall3 ✅ deployed"
        : "Multicall3 ❌ MISSING"
      : "—";
    console.log(
      `  ${r.target.name.padEnd(20)}  ${chainTag.padEnd(22)}  ${mc3Tag}`,
    );
    if (!r.reachable && r.err) {
      console.log(`    (${r.err})`);
    }
  }
  console.log("─".repeat(72));

  // Quick recommendations
  const testnet = results.find((r) => r.target.chainId === 13579);
  const mainnet = results.find((r) => r.target.chainId === 1155);

  console.log("\nRecommendations:");
  if (testnet?.reachable && testnet.hasMulticall3) {
    console.log("  • Testnet: add `contracts.multicall3.address` to INTUITION_TESTNET in packages/sdk/src/chains.ts");
  } else if (testnet?.reachable && !testnet.hasMulticall3) {
    console.log("  • Testnet: Multicall3 absent. Either deploy via the EIP-2470 deterministic deployer, or keep the SDK Promise.all fallback.");
  }
  if (mainnet?.reachable && !mainnet.hasMulticall3) {
    console.log("  • Mainnet: canonical addr is declared in chains.ts but the contract is NOT deployed yet. Remove the declaration or deploy it first — otherwise `client.multicall()` will error on mainnet.");
  } else if (mainnet?.reachable && mainnet.hasMulticall3) {
    console.log("  • Mainnet: Multicall3 ✅ already deployed, chains.ts entry is correct.");
  }
  console.log(
    "  • If any target is unreachable, add its RPC via env var (LOCAL_RPC / TESTNET_RPC / MAINNET_RPC).",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
