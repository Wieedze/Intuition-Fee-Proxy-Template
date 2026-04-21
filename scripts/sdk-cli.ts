#!/usr/bin/env bun
/**
 * Minimal CLI demo that pings a locally-deployed fee proxy using ONLY the
 * `@intuition-fee-proxy/sdk` + `viem`. No hardhat, no typechain — exactly
 * what an external integrator would run.
 *
 * Usage (from the repo root, with a hardhat node on :8545 and a Factory
 * deployed via `bun contracts:deploy:local`):
 *
 *   bun run scripts/sdk-cli.ts                  # list all proxies + headline stats
 *   bun run scripts/sdk-cli.ts stats <0xProxy>  # full dump of one proxy
 *
 * Reads the Factory address from `packages/webapp/.env.local`
 * (VITE_FACTORY_ADDRESS — written by the deploy script).
 */
import {
  createPublicClient,
  formatEther,
  hexToString,
  http,
  type Address,
  type PublicClient,
} from "viem";
import * as fs from "node:fs";
import * as path from "node:path";

import {
  IntuitionVersionedFeeProxyABI,
  fetchAllProxies,
  readProxyMetrics,
  readProxyStats,
  readProxyVersionLabel,
  readProxyVersions,
  readSponsorPool,
  readSponsoredMetrics,
} from "@intuition-fee-proxy/sdk";

const RPC_URL = process.env.RPC_URL ?? "http://127.0.0.1:8545";

function resolveFactory(): Address {
  if (process.env.VITE_FACTORY_ADDRESS) {
    return process.env.VITE_FACTORY_ADDRESS as Address;
  }
  const envPath = path.resolve(
    __dirname,
    "../packages/webapp/.env.local",
  );
  if (!fs.existsSync(envPath)) {
    throw new Error(
      `Missing ${envPath}. Run \`bun contracts:deploy:local\` first, or set VITE_FACTORY_ADDRESS in the env.`,
    );
  }
  const txt = fs.readFileSync(envPath, "utf-8");
  const m = /VITE_FACTORY_ADDRESS=(\S+)/.exec(txt);
  if (!m?.[1]) {
    throw new Error(
      "VITE_FACTORY_ADDRESS not found in packages/webapp/.env.local",
    );
  }
  return m[1] as Address;
}

function fmt(v: bigint | undefined): string {
  return v === undefined ? "—" : `${formatEther(v)} TRUST`;
}

function decodeLabel(hex: `0x${string}` | undefined): string {
  if (!hex) return "—";
  try {
    return hexToString(hex, { size: 32 }).replace(/\0+$/, "") || "—";
  } catch {
    return "—";
  }
}

async function cmdList(client: PublicClient, factory: Address) {
  const proxies = await fetchAllProxies(client, factory);
  console.log(`\nFactory   ${factory}`);
  console.log(`Proxies   ${proxies.length}\n`);
  if (proxies.length === 0) {
    console.log("  (none deployed yet)");
    return;
  }
  for (const addr of proxies) {
    const [stats, versionStr, versionInfo, pool] = await Promise.all([
      readProxyStats(client, addr).catch(() => undefined),
      readProxyVersionLabel(client, addr).catch(() => undefined),
      readProxyVersions(client, addr).catch(() => undefined),
      readSponsorPool(client, addr).catch(() => undefined),
    ]);
    // `version()` is a V2Sponsored-only getter (reverts on standard), so we
    // use its presence to detect the channel. The "which version is running"
    // question is answered by the ERC-7936 `defaultVersion` label, which
    // exists for both channels.
    const channel = versionStr?.includes("-sponsored") ? "sponsored" : "standard";
    const defaultLabel = decodeLabel(versionInfo?.defaultVersion);
    console.log(`  ${addr}`);
    console.log(
      `    channel=${channel}  default=${defaultLabel}  fees=${fmt(
        stats?.accumulatedFees,
      )}${pool !== undefined ? `  pool=${fmt(pool)}` : ""}`,
    );
  }
}

async function cmdStats(client: PublicClient, proxy: Address) {
  const [stats, metrics, versionInfo, version, pool, sMetrics] =
    await Promise.all([
      readProxyStats(client, proxy),
      readProxyMetrics(client, proxy),
      readProxyVersions(client, proxy),
      readProxyVersionLabel(client, proxy),
      readSponsorPool(client, proxy),
      readSponsoredMetrics(client, proxy),
    ]);

  const isSponsored = version?.includes("-sponsored") ?? false;
  const label = (v?: `0x${string}`) => decodeLabel(v);

  console.log(`\nProxy  ${proxy}`);
  console.log(`───────────────────────────────────────────────────────────`);
  console.log(` channel              ${isSponsored ? "sponsored" : "standard"}`);
  console.log(` version()            ${version ?? "—"}`);
  console.log(` defaultVersion       ${label(versionInfo.defaultVersion)}`);
  console.log(
    ` registered versions  ${versionInfo.versions.map(label).join(", ") || "—"}`,
  );
  console.log(` proxyAdmin           ${versionInfo.proxyAdmin ?? "—"}`);
  console.log(` pendingProxyAdmin    ${versionInfo.pendingProxyAdmin ?? "—"}`);
  console.log(`───────────────────────────────────────────────────────────`);
  console.log(` ethMultiVault        ${stats.ethMultiVault}`);
  console.log(` fixed fee / deposit  ${fmt(stats.depositFixedFee)}`);
  console.log(
    ` percentage fee       ${(Number(stats.depositPercentageFee) / 100).toFixed(2)} %`,
  );
  console.log(` accumulatedFees      ${fmt(stats.accumulatedFees)}`);
  console.log(` total all-time       ${fmt(stats.totalFeesCollectedAllTime)}`);
  console.log(` adminCount           ${stats.adminCount}`);
  console.log(`───────────────────────────────────────────────────────────`);
  console.log(` metrics.deposits     ${metrics.totalDeposits}`);
  console.log(` metrics.volume       ${fmt(metrics.totalVolume)}`);
  console.log(` metrics.atoms        ${metrics.totalAtomsCreated}`);
  console.log(` metrics.triples      ${metrics.totalTriplesCreated}`);
  console.log(` metrics.unique users ${metrics.totalUniqueUsers}`);
  console.log(` lastActivityBlock    ${metrics.lastActivityBlock}`);
  if (isSponsored) {
    console.log(`───────────────────────────────────────────────────────────`);
    console.log(` sponsorPool          ${fmt(pool)}`);
    if (sMetrics) {
      console.log(` sponsored deposits   ${sMetrics.sponsoredDeposits}`);
      console.log(` sponsored volume     ${fmt(sMetrics.sponsoredVolume)}`);
      console.log(
        ` sponsored receivers  ${sMetrics.uniqueSponsoredReceivers}`,
      );
    }
  }
  console.log(`───────────────────────────────────────────────────────────`);
  // Sanity: expose that we're hitting the right ABI by reading
  // getDefaultVersion via the imported ABI directly — proves the SDK is
  // what the script is actually using.
  const dvHex = (await client.readContract({
    abi: IntuitionVersionedFeeProxyABI as any,
    address: proxy,
    functionName: "getDefaultVersion",
  })) as `0x${string}`;
  console.log(
    ` (sanity via SDK ABI) getDefaultVersion = ${decodeLabel(dvHex)}`,
  );
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const client = createPublicClient({ transport: http(RPC_URL) }) as PublicClient;
  const factory = resolveFactory();

  if (!cmd || cmd === "list") {
    await cmdList(client, factory);
    return;
  }
  if (cmd === "stats") {
    const target = rest[0] as Address | undefined;
    if (!target) {
      // No arg: pick the most recent proxy from the Factory's registry.
      const proxies = await fetchAllProxies(client, factory);
      if (proxies.length === 0) {
        console.error("No proxies registered on the Factory yet.");
        process.exit(1);
      }
      await cmdStats(client, proxies[proxies.length - 1]);
      return;
    }
    await cmdStats(client, target);
    return;
  }

  console.error(
    `Unknown command: ${cmd}\n` +
      `Usage:\n` +
      `  bun run scripts/sdk-cli.ts [list]\n` +
      `  bun run scripts/sdk-cli.ts stats [proxyAddress]\n`,
  );
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
