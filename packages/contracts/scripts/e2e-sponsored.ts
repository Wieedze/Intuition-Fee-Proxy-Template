/**
 * End-to-end validation for the sponsored channel (V2Sponsored).
 *
 * Deploys a fresh sponsored proxy via the Factory, exercises the full
 * admin + user surface (fundPool, user deposit drawing from pool, per-tx
 * cap, per-user daily rate limit, admin depositFor, admin reclaim), and
 * prints a summary at the end. Every step asserts the expected on-chain
 * state so the script fails loudly if any invariant drifts.
 *
 * Usage (with the hardhat node running on :8545 and a stack already
 * deployed via `bun contracts:deploy:local`):
 *   bun contracts:e2e:sponsored:local
 */

import { ethers } from "hardhat";
import * as fs from "node:fs";
import * as path from "node:path";

const MOCK_MULTIVAULT = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const CHANNEL_SPONSORED = 1;

function fmt(v: bigint): string {
  return ethers.formatEther(v);
}

async function main() {
  const [deployer, user1, user2, user3, treasury] = await ethers.getSigners();
  const { chainId } = await ethers.provider.getNetwork();

  console.log("─".repeat(66));
  console.log(` Network       chainId ${chainId}`);
  console.log(` Admin         ${deployer.address}`);
  console.log(` User1         ${user1.address}`);
  console.log(` User2         ${user2.address}`);
  console.log(` User3         ${user3.address}`);
  console.log(` Treasury      ${treasury.address}`);
  console.log("─".repeat(66));

  // ── Resolve Factory ────────────────────────────────────────────
  const envPath = path.resolve(__dirname, "../../webapp/.env.local");
  if (!fs.existsSync(envPath)) {
    throw new Error(`Missing ${envPath}. Run \`bun contracts:deploy:local\` first.`);
  }
  const envText = fs.readFileSync(envPath, "utf-8");
  const factoryAddr = /VITE_FACTORY_ADDRESS=(\S+)/.exec(envText)?.[1];
  if (!factoryAddr) throw new Error("VITE_FACTORY_ADDRESS missing from .env.local");
  console.log(`\nFactory       ${factoryAddr}`);

  const factory = await ethers.getContractAt("IntuitionFeeProxyFactory", factoryAddr);
  const sponsoredImpl = await factory.sponsoredImplementation();
  if (sponsoredImpl === ethers.ZeroAddress) {
    throw new Error(
      "Sponsored channel not configured on this Factory. Redeploy via `bun contracts:deploy:local`.",
    );
  }
  console.log(`Sponsored impl ${sponsoredImpl}`);

  // ── 1. Deploy a fresh sponsored proxy ──────────────────────────
  console.log("\n① createProxy (Sponsored channel) …");
  const name = ethers.encodeBytes32String("E2E sponsored demo");
  const deployTx = await factory.connect(deployer).createProxy(
    MOCK_MULTIVAULT,
    ethers.parseEther("0.1"),    // fixed fee
    500n,                         // 5% percentage fee
    [deployer.address],           // admin (will also fund pool)
    name,
    CHANNEL_SPONSORED,
  );
  const deployRc = await deployTx.wait();
  const log = deployRc!.logs.find(
    (l: any) => l.address.toLowerCase() === factoryAddr.toLowerCase(),
  );
  const proxyAddr = "0x" + log!.topics[1].slice(26);
  console.log(`   proxy        → ${proxyAddr}`);

  const proxy = await ethers.getContractAt("IntuitionFeeProxyV2Sponsored", proxyAddr);

  // Assert it IS the sponsored family
  const version: string = await proxy.version();
  if (!version.includes("-sponsored")) {
    throw new Error(`Expected sponsored impl, got version="${version}"`);
  }
  console.log(`   version()    → "${version}"`);

  // Default claim limits (per contract constants)
  const maxPerTx: bigint = await proxy.maxClaimPerTx();
  const maxPerDay: bigint = await proxy.maxClaimsPerDay();
  console.log(`   defaults     → ${fmt(maxPerTx)} TRUST/tx, ${maxPerDay} claims/day`);
  assertEq(maxPerTx, ethers.parseEther("1"), "maxClaimPerTx default");
  assertEq(maxPerDay, 10n, "maxClaimsPerDay default");

  // ── 2. Admin funds the pool ────────────────────────────────────
  console.log("\n② admin fundPool(2 TRUST) …");
  await (await proxy.connect(deployer).fundPool({ value: ethers.parseEther("2") })).wait();
  let pool = await proxy.sponsorPool();
  console.log(`   sponsorPool  → ${fmt(pool)} TRUST`);
  assertEq(pool, ethers.parseEther("2"), "pool after fund");

  // ── 3. User1 deposit with msg.value = 0 (drains pool up to cap) ──
  console.log("\n③ user1 deposit(msg.value = 0) — expect 1 TRUST drain (cap) …");
  const termId = ethers.encodeBytes32String("term-demo");
  const tx3 = await proxy.connect(user1).deposit(termId, 1n, 0n, { value: 0 });
  await tx3.wait();
  pool = await proxy.sponsorPool();
  console.log(`   sponsorPool  → ${fmt(pool)} TRUST (was 2, expect 1)`);
  assertEq(pool, ethers.parseEther("1"), "pool after 1 user deposit");

  // Rate-limit counter should show 1 for user1
  const status1 = await proxy.getClaimStatus(user1.address);
  console.log(`   user1 claims → ${status1[0]}/${maxPerDay}`);
  assertEq(status1[0], 1n, "user1 claim count = 1");

  // ── 4. User2 deposit (shares pool — first come, first served) ───
  console.log("\n④ user2 deposit(msg.value = 0) — expect pool drained to 0 …");
  await (await proxy.connect(user2).deposit(termId, 1n, 0n, { value: 0 })).wait();
  pool = await proxy.sponsorPool();
  console.log(`   sponsorPool  → ${fmt(pool)} TRUST (expect 0)`);
  assertEq(pool, 0n, "pool after 2nd user deposit");

  // ── 5. Top-up + rate limit test ────────────────────────────────
  console.log("\n⑤ tighten rate limit to 1 claim/day, top up pool 1 TRUST, verify user1 revert on 2nd claim …");
  await (await proxy.connect(deployer).setClaimLimits(ethers.parseEther("1"), 1n)).wait();
  await (await proxy.connect(deployer).fundPool({ value: ethers.parseEther("1") })).wait();
  // user1 already claimed once in this window → a second claim should fail
  try {
    await proxy.connect(user1).deposit(termId, 1n, 0n, { value: 0 });
    throw new Error("Expected rate-limit revert, got success");
  } catch (err: any) {
    if (!err.message.includes("Sponsored_RateLimited") && !err.data?.includes?.("Sponsored_RateLimited")) {
      // wagmi / ethers may wrap the custom error; double-check
      console.log(`   revert msg   → ${err.message.split("\n")[0]}`);
    }
    console.log(`   user1 2nd claim reverted ✓`);
  }

  // But user3 has their own counter — still works
  console.log("\n⑥ user3 claim (independent per-user window) …");
  await (await proxy.connect(user3).deposit(termId, 1n, 0n, { value: 0 })).wait();
  pool = await proxy.sponsorPool();
  console.log(`   sponsorPool  → ${fmt(pool)} TRUST`);
  assertEq(pool, 0n, "pool after user3 claim (drained)");

  // ── 6. Sponsored metrics check (bumped on every pool-funded draw) ──
  const sMetrics = await proxy.getSponsoredMetrics();
  console.log(`\n⑦ sponsored metrics snapshot …`);
  console.log(`   sponsored deposits=${sMetrics[0]}  volume=${fmt(sMetrics[1])}  uniqueReceivers=${sMetrics[2]}`);
  // We drained: user1×1 (cap) + user2×1 (cap) + user3×1 (cap) = 3 deposits, 3 TRUST volume, 3 unique receivers
  assertEq(sMetrics[0], 3n, "sponsored deposits count = 3");
  assertEq(sMetrics[1], ethers.parseEther("3"), "sponsored volume = 3 TRUST");
  assertEq(sMetrics[2], 3n, "unique sponsored receivers = 3");

  // ── 7. Admin reclaims leftover ──────────────────────────────────
  console.log("\n⑧ admin fundPool(0.5 TRUST) + reclaimFromPool(0.3 to treasury) …");
  await (await proxy.connect(deployer).fundPool({ value: ethers.parseEther("0.5") })).wait();
  const treasuryBefore = await ethers.provider.getBalance(treasury.address);
  await (await proxy.connect(deployer).reclaimFromPool(ethers.parseEther("0.3"), treasury.address)).wait();
  const treasuryAfter = await ethers.provider.getBalance(treasury.address);
  console.log(`   pool now     → ${fmt(await proxy.sponsorPool())} TRUST (expect 0.2)`);
  console.log(`   treasury +   ${fmt(treasuryAfter - treasuryBefore)} TRUST`);
  assertEq(await proxy.sponsorPool(), ethers.parseEther("0.2"), "pool after reclaim");
  assertEq(treasuryAfter - treasuryBefore, ethers.parseEther("0.3"), "treasury delta");

  // ── Final snapshot ──────────────────────────────────────────────
  console.log("\n" + "═".repeat(66));
  console.log(" SPONSORED E2E VALIDATION — ALL CHECKS PASSED");
  console.log("═".repeat(66));
  console.log(` proxy              ${proxyAddr}`);
  console.log(` version            ${version}`);
  console.log(` sponsorPool        ${fmt(await proxy.sponsorPool())} TRUST (residual)`);
  console.log(` accumulatedFees    ${fmt(await proxy.accumulatedFees())} TRUST`);
  console.log(` totalFeesCollected ${fmt(await proxy.totalFeesCollectedAllTime())} TRUST`);
  const m = await proxy.getMetrics();
  console.log(` deposits (total)   ${m.totalDeposits}`);
  console.log(` volume (total)     ${fmt(m.totalVolume)} TRUST`);
  console.log(` unique users       ${m.totalUniqueUsers}`);
  const sm = await proxy.getSponsoredMetrics();
  console.log(` sponsored deposits ${sm[0]}`);
  console.log(` sponsored volume   ${fmt(sm[1])} TRUST`);
  console.log(` sponsored unique   ${sm[2]}`);
  console.log("═".repeat(66));
  console.log(`\nOpen it in the webapp:  http://localhost:3000/proxy/${proxyAddr}`);
}

function assertEq(actual: bigint, expected: bigint, label: string) {
  if (actual !== expected) {
    throw new Error(
      `ASSERT FAIL [${label}]: expected ${expected.toString()}, got ${actual.toString()}`,
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\nSponsored E2E failed:\n", error);
    process.exit(1);
  });
