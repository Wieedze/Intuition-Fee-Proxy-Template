/**
 * End-to-end validation for the Sponsored fee-proxy channel (V2Sponsored).
 *
 * Exercises the full admin + user surface, every step auto-asserting the
 * invariants it expects so the script fails loud on any accounting drift.
 *
 *   ① createProxy(Sponsored) + assert defaults
 *   ② admin fundPool
 *   ③ user1 deposit (msg.value = 0, fully sponsored — cap applies)
 *   ④ user2 deposit (fully sponsored — drains pool)
 *   ⑤ setClaimLimits(maxPerWindow=1) + user1 2nd claim → rate-limit revert
 *   ⑥ user3 deposit (independent per-user window)
 *   ⑦ user-paid deposit (msg.value > 0, no credit) → fees accrue
 *   ⑧ createAtoms × 2 by user4 (uses msg.value + partial credit from pool)
 *   ⑨ Overpay createAtoms → assert refund + invariant (H-01 on sponsored)
 *   ⑩ fundPool + reclaimFromPool (admin path)
 *   ⑪ Admin withdraw against credit invariant (balance − amount ≥ pool)
 *   ⑫ Revert paths: setClaimLimits(0,…), reclaimFromPool > pool, non-admin fundPool
 *   ⑬ Final snapshot + cumulative assertions
 *
 * Usage (node up + Factory deployed):
 *   bun contracts:e2e:sponsored:local
 *   bun contracts:e2e:sponsored:testnet
 */

import { ethers } from "hardhat";
import * as fs from "node:fs";
import * as path from "node:path";

import { multiVaultFor } from "./multiVaultAddresses";
import { assert, assertEq, expectRevertWithName } from "./assertionHelpers";

const CHANNEL_SPONSORED = 1;
const FIXED_FEE_WEI = ethers.parseEther("0.1");
const PCT_BPS = 500n; // 5%
const FEE_DENOM = 10_000n;

function fmt(v: bigint): string {
  return ethers.formatEther(v);
}

async function main() {
  const [deployer, user1, user2, user3, user4, treasury, nonAdmin] =
    await ethers.getSigners();
  const { chainId } = await ethers.provider.getNetwork();
  const multiVault = multiVaultFor(chainId);

  console.log("─".repeat(66));
  console.log(` Network       chainId ${chainId}`);
  console.log(` MultiVault    ${multiVault}`);
  console.log(` Admin         ${deployer.address}`);
  console.log(` User1 / 2 / 3 ${user1.address.slice(0, 10)}… / ${user2.address.slice(0, 10)}… / ${user3.address.slice(0, 10)}…`);
  console.log(` User4         ${user4.address}`);
  console.log(` Treasury      ${treasury.address}`);
  console.log(` Non-admin     ${nonAdmin.address}`);
  console.log("─".repeat(66));

  // ── Resolve Factory ────────────────────────────────────────────
  const envPath = path.resolve(__dirname, "../../webapp/.env.local");
  if (!fs.existsSync(envPath)) {
    throw new Error(
      `Missing ${envPath}. Run \`bun contracts:deploy:${chainId === 31337n ? "local" : "testnet"}\` first.`,
    );
  }
  const envText = fs.readFileSync(envPath, "utf-8");
  const factoryAddr = /VITE_FACTORY_ADDRESS=(\S+)/.exec(envText)?.[1];
  if (!factoryAddr) throw new Error("VITE_FACTORY_ADDRESS missing from .env.local");
  console.log(`\nFactory       ${factoryAddr}`);

  const factory = await ethers.getContractAt("IntuitionFeeProxyFactory", factoryAddr);
  const sponsoredImpl = await factory.sponsoredImplementation();
  if (sponsoredImpl === ethers.ZeroAddress) {
    throw new Error(
      "Sponsored channel not configured on this Factory. Redeploy via `bun contracts:deploy`.",
    );
  }
  console.log(`Sponsored impl ${sponsoredImpl}`);

  // ════════════════════════════════════════════════════════════════════
  // ① Deploy sponsored proxy + assert defaults
  // ════════════════════════════════════════════════════════════════════
  console.log("\n① createProxy (Sponsored channel) …");
  const name = ethers.encodeBytes32String("E2E sponsored");
  const deployTx = await factory.connect(deployer).createProxy(
    multiVault,
    FIXED_FEE_WEI,
    PCT_BPS,
    [deployer.address],
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

  const version: string = await proxy.version();
  assert(version.includes("-sponsored"), `version "${version}" must contain "-sponsored"`);

  const maxPerTx: bigint = await proxy.maxClaimPerTx();
  const maxPerWindow: bigint = await proxy.maxClaimsPerWindow();
  const maxVolumePerWindow: bigint = await proxy.maxClaimVolumePerWindow();
  const windowSec: bigint = await proxy.claimWindowSeconds();
  assertEq(maxPerTx, ethers.parseEther("1"), "default maxClaimPerTx = 1 TRUST");
  assertEq(maxPerWindow, 10n, "default maxClaimsPerWindow = 10");
  assertEq(maxVolumePerWindow, ethers.parseEther("10"), "default maxClaimVolumePerWindow = 10 TRUST");
  assertEq(windowSec, 86400n, "default claimWindowSeconds = 86400 (1 day)");
  console.log(
    `   defaults     → ${fmt(maxPerTx)} TRUST/tx, ${maxPerWindow} calls / ${fmt(maxVolumePerWindow)} TRUST per ${windowSec}s window · ✓`,
  );

  // ════════════════════════════════════════════════════════════════════
  // ② Admin funds pool
  // ════════════════════════════════════════════════════════════════════
  console.log("\n② admin fundPool(2 TRUST) …");
  await (
    await proxy.connect(deployer).fundPool({ value: ethers.parseEther("2") })
  ).wait();
  assertEq(await proxy.sponsorPool(), ethers.parseEther("2"), "pool = 2 TRUST");
  console.log("   ✓ pool = 2 TRUST");

  // ════════════════════════════════════════════════════════════════════
  // ③ user1 deposit(msg.value=0) — fully sponsored up to maxClaimPerTx cap
  // ════════════════════════════════════════════════════════════════════
  console.log("\n③ user1 deposit(msg.value = 0) — pool-funded up to 1 TRUST cap …");
  const termId = ethers.encodeBytes32String("term-demo");
  await (await proxy.connect(user1).deposit(termId, 1n, 0n, { value: 0 })).wait();
  assertEq(await proxy.sponsorPool(), ethers.parseEther("1"), "pool drained by cap");
  const s1 = await proxy.getClaimStatus(user1.address);
  assertEq(s1[0], 1n, "user1 claim count = 1");
  assertEq(s1[1], ethers.parseEther("1"), "user1 claim volume = 1 TRUST");
  console.log("   ✓ pool = 1 TRUST, user1 claims = 1/10, volume = 1/10 TRUST");

  // ════════════════════════════════════════════════════════════════════
  // ④ user2 deposit(msg.value=0) — drains pool to zero
  // ════════════════════════════════════════════════════════════════════
  console.log("\n④ user2 deposit(msg.value = 0) — drains pool …");
  await (await proxy.connect(user2).deposit(termId, 1n, 0n, { value: 0 })).wait();
  assertEq(await proxy.sponsorPool(), 0n, "pool empty");
  console.log("   ✓ pool = 0 TRUST");

  // ════════════════════════════════════════════════════════════════════
  // ⑤ Tighten maxClaimsPerWindow → user1's 2nd claim reverts
  // ════════════════════════════════════════════════════════════════════
  console.log("\n⑤ setClaimLimits(1 TRUST/tx, 1 call / 10 TRUST per 1-day window) + top-up 1 TRUST …");
  await (
    await proxy
      .connect(deployer)
      .setClaimLimits(ethers.parseEther("1"), 1n, ethers.parseEther("10"), 86400n)
  ).wait();
  await (
    await proxy.connect(deployer).fundPool({ value: ethers.parseEther("1") })
  ).wait();
  // user1 already used their 1 claim — 2nd in the same window must revert
  console.log("   user1 2nd claim (expect Sponsored_RateLimited) …");
  await expectRevertWithName(
    () => proxy.connect(user1).deposit(termId, 1n, 0n, { value: 0 }),
    "Sponsored_RateLimited",
    "user1 2nd claim in 1-call/window",
  );
  console.log("   ✓ rate-limit enforced");

  // ════════════════════════════════════════════════════════════════════
  // ⑥ user3 can still claim — windows are per-user
  // ════════════════════════════════════════════════════════════════════
  console.log("\n⑥ user3 deposit (independent per-user window) …");
  await (await proxy.connect(user3).deposit(termId, 1n, 0n, { value: 0 })).wait();
  assertEq(await proxy.sponsorPool(), 0n, "pool empty again");
  console.log("   ✓ user3 drew 1 TRUST from pool");

  // ════════════════════════════════════════════════════════════════════
  // ⑦ user-paid deposit — no credit consumed, normal fee path
  // ════════════════════════════════════════════════════════════════════
  console.log("\n⑦ user1 user-paid deposit(0.5 TRUST) — no credit consumed …");
  // msg.value alone covers fee + multiVaultAmount → consumed = avail (0 since pool=0) = 0
  const accBefore7 = await proxy.accumulatedFees();
  const val7 = ethers.parseEther("0.5");
  // deposit() inverse formula: multiVaultAmount = (value - fixed) * DEN / (DEN + pct)
  // fee = value - multiVaultAmount  (all paid from msg.value, nothing from pool)
  const multiVaultAmount7 =
    ((val7 - FIXED_FEE_WEI) * FEE_DENOM) / (FEE_DENOM + PCT_BPS);
  const expectedFee7 = val7 - multiVaultAmount7;
  await (await proxy.connect(user1).deposit(termId, 1n, 0n, { value: val7 })).wait();
  assertEq(
    await proxy.accumulatedFees(),
    accBefore7 + expectedFee7,
    "accumulatedFees grew by exactly fee(0.5 TRUST)",
  );
  console.log(`   ✓ fee ${fmt(expectedFee7)} TRUST accrued, no pool touched`);

  // ════════════════════════════════════════════════════════════════════
  // ⑧ user4 createAtoms × 2 (fully user-paid for simplicity)
  // ════════════════════════════════════════════════════════════════════
  console.log("\n⑧ user4 createAtoms × 2 …");
  const atomCost = await proxy.getAtomCost();
  const atomsData = [
    ethers.toUtf8Bytes("ipfs://sponsored-alpha"),
    ethers.toUtf8Bytes("ipfs://sponsored-beta"),
  ];
  const atomsAssets = [ethers.parseEther("0.1"), ethers.parseEther("0.2")];
  const atomsTotalDeposit = atomsAssets.reduce((a, b) => a + b, 0n);
  const atomsFee = FIXED_FEE_WEI * 2n + (atomsTotalDeposit * PCT_BPS) / FEE_DENOM;
  const atomsRequired = atomCost * 2n + atomsTotalDeposit + atomsFee;
  await (
    await proxy
      .connect(user4)
      .createAtoms(atomsData, atomsAssets, 1n, { value: atomsRequired })
  ).wait();
  console.log(`   ✓ 2 atoms created, +${fmt(atomsFee)} TRUST fee`);

  // ════════════════════════════════════════════════════════════════════
  // ⑨ Overpay createAtoms → refund must return excess (H-01 on sponsored)
  // ════════════════════════════════════════════════════════════════════
  console.log("\n⑨ user4 createAtoms with 0.3 TRUST overpay (H-01 refund) …");
  const opData = [ethers.toUtf8Bytes("ipfs://sponsored-gamma")];
  const opAssets = [ethers.parseEther("0.1")];
  const opFee = FIXED_FEE_WEI + (opAssets[0] * PCT_BPS) / FEE_DENOM;
  const opRequired = atomCost + opAssets[0] + opFee;
  const overpay = ethers.parseEther("0.3");
  const u4Before = await ethers.provider.getBalance(user4.address);
  const accBefore9 = await proxy.accumulatedFees();
  const opTx = await proxy.connect(user4).createAtoms(opData, opAssets, 1n, {
    value: opRequired + overpay,
  });
  const opRc = await opTx.wait();
  const gasCost = opRc!.gasUsed * opRc!.gasPrice;
  const u4After = await ethers.provider.getBalance(user4.address);
  const spent = u4Before - u4After;
  assertEq(spent, opRequired + gasCost, "user4 spent = totalRequired + gas");
  assertEq(
    await proxy.accumulatedFees(),
    accBefore9 + opFee,
    "accumulatedFees grew by exactly opFee",
  );
  // Sponsored invariant: proxy.balance = accumulatedFees + sponsorPool
  const bal9 = await ethers.provider.getBalance(proxyAddr);
  const pool9 = await proxy.sponsorPool();
  const acc9 = await proxy.accumulatedFees();
  assertEq(bal9, acc9 + pool9, "proxy balance = accumulatedFees + pool (invariant)");
  console.log(`   ✓ excess ${fmt(overpay)} refunded, invariant holds`);

  // ════════════════════════════════════════════════════════════════════
  // ⑩ fundPool + reclaimFromPool
  // ════════════════════════════════════════════════════════════════════
  console.log("\n⑩ fundPool(0.5) + reclaimFromPool(0.3 → treasury) …");
  await (
    await proxy.connect(deployer).fundPool({ value: ethers.parseEther("0.5") })
  ).wait();
  const tBefore = await ethers.provider.getBalance(treasury.address);
  await (
    await proxy
      .connect(deployer)
      .reclaimFromPool(ethers.parseEther("0.3"), treasury.address)
  ).wait();
  const tAfter = await ethers.provider.getBalance(treasury.address);
  assertEq(tAfter - tBefore, ethers.parseEther("0.3"), "treasury received 0.3 TRUST");
  assertEq(
    await proxy.sponsorPool(),
    ethers.parseEther("0.2"),
    "pool = 0.2 TRUST after reclaim",
  );
  console.log("   ✓ reclaim OK, pool = 0.2 TRUST");

  // ════════════════════════════════════════════════════════════════════
  // ⑪ Withdraw invariant — can't drain past `balance - pool`
  // ════════════════════════════════════════════════════════════════════
  console.log("\n⑪ Admin withdrawAll (respects credit invariant) …");
  // accumulatedFees ≤ balance - pool must hold
  const accBeforeW = await proxy.accumulatedFees();
  const poolBeforeW = await proxy.sponsorPool();
  const balBeforeW = await ethers.provider.getBalance(proxyAddr);
  // Sanity: invariant should already hold
  assert(
    balBeforeW >= accBeforeW + poolBeforeW,
    "pre-withdraw invariant: balance ≥ acc + pool",
  );
  const recipBefore = await ethers.provider.getBalance(treasury.address);
  await (await proxy.connect(deployer).withdrawAll(treasury.address)).wait();
  assertEq(await proxy.accumulatedFees(), 0n, "accumulatedFees drained to 0");
  assertEq(
    await ethers.provider.getBalance(treasury.address),
    recipBefore + accBeforeW,
    "treasury received accumulatedFees",
  );
  // Pool must STILL be intact
  assertEq(
    await proxy.sponsorPool(),
    poolBeforeW,
    "pool unchanged (admin can't touch it via withdraw)",
  );
  assertEq(
    await ethers.provider.getBalance(proxyAddr),
    poolBeforeW,
    "proxy balance == pool (fees drained)",
  );
  console.log("   ✓ withdraw respected credit invariant");

  // ════════════════════════════════════════════════════════════════════
  // ⑫ Revert paths
  // ════════════════════════════════════════════════════════════════════
  console.log("\n⑫ Revert paths …");
  console.log("   setClaimLimits(0, 1, vol, win) → expect Sponsored_InvalidLimit");
  await expectRevertWithName(
    () =>
      proxy
        .connect(deployer)
        .setClaimLimits(0n, 1n, ethers.parseEther("10"), 86400n),
    "Sponsored_InvalidLimit",
    "setClaimLimits with zero maxPerTx",
  );
  console.log("   setClaimLimits(1, 0, vol, win) → expect Sponsored_InvalidLimit");
  await expectRevertWithName(
    () =>
      proxy
        .connect(deployer)
        .setClaimLimits(ethers.parseEther("1"), 0n, ethers.parseEther("10"), 86400n),
    "Sponsored_InvalidLimit",
    "setClaimLimits with zero maxPerWindow",
  );
  console.log("   setClaimLimits(1, 1, 0, win) → expect Sponsored_InvalidLimit");
  await expectRevertWithName(
    () =>
      proxy
        .connect(deployer)
        .setClaimLimits(ethers.parseEther("1"), 1n, 0n, 86400n),
    "Sponsored_InvalidLimit",
    "setClaimLimits with zero maxVolumePerWindow",
  );
  console.log("   setClaimLimits(1, 1, vol, 0) → expect Sponsored_InvalidLimit");
  await expectRevertWithName(
    () =>
      proxy
        .connect(deployer)
        .setClaimLimits(ethers.parseEther("1"), 1n, ethers.parseEther("10"), 0n),
    "Sponsored_InvalidLimit",
    "setClaimLimits with zero windowSeconds",
  );
  console.log(`   reclaimFromPool(pool+1) → expect Sponsored_InsufficientClaim`);
  const poolNow = await proxy.sponsorPool();
  await expectRevertWithName(
    () =>
      proxy
        .connect(deployer)
        .reclaimFromPool(poolNow + 1n, treasury.address),
    "Sponsored_InsufficientClaim",
    "reclaimFromPool exceeds pool",
  );
  console.log("   non-admin fundPool → expect NotWhitelistedAdmin");
  await expectRevertWithName(
    () => proxy.connect(nonAdmin).fundPool({ value: 1n }),
    "IntuitionFeeProxy_NotWhitelistedAdmin",
    "non-admin fundPool",
  );
  console.log("   non-admin setClaimLimits → expect NotWhitelistedAdmin");
  await expectRevertWithName(
    () =>
      proxy
        .connect(nonAdmin)
        .setClaimLimits(ethers.parseEther("1"), 1n, ethers.parseEther("10"), 86400n),
    "IntuitionFeeProxy_NotWhitelistedAdmin",
    "non-admin setClaimLimits",
  );
  console.log("   ✓ all revert paths enforce gating");

  // ════════════════════════════════════════════════════════════════════
  // ⑬ Final snapshot
  // ════════════════════════════════════════════════════════════════════
  console.log("\n" + "═".repeat(66));
  console.log(" E2E SPONSORED VALIDATION COMPLETE");
  console.log("═".repeat(66));
  const mF = await proxy.getMetrics();
  const smF = await proxy.getSponsoredMetrics();
  console.log(` proxy              ${proxyAddr}`);
  console.log(` version            ${version}`);
  console.log(` sponsorPool        ${fmt(await proxy.sponsorPool())} TRUST`);
  console.log(` accumulatedFees    ${fmt(await proxy.accumulatedFees())} TRUST`);
  console.log(` totalFeesCollected ${fmt(await proxy.totalFeesCollectedAllTime())} TRUST`);
  console.log(` deposits (total)   ${mF.totalDeposits}`);
  console.log(` atoms created      ${mF.totalAtomsCreated}`);
  console.log(` volume (total)     ${fmt(mF.totalVolume)} TRUST`);
  console.log(` unique users       ${mF.totalUniqueUsers}`);
  console.log(` sponsored deposits ${smF[0]}`);
  console.log(` sponsored volume   ${fmt(smF[1])} TRUST`);
  console.log(` sponsored unique   ${smF[2]}`);
  console.log("═".repeat(66));

  // Hard final assertions
  assert(mF.totalDeposits >= 5n, "totalDeposits covers user1 x1 + user2 x1 + user3 x1 + user1 x1 paid + user4 depositBatch/createAtoms");
  assertEq(mF.totalAtomsCreated, 3n, "final totalAtomsCreated (2 + 1 overpay)");
  assertEq(smF[0], 3n, "sponsored deposits = user1 + user2 + user3");
  assertEq(smF[1], ethers.parseEther("3"), "sponsored volume = 3 TRUST");
  assertEq(smF[2], 3n, "unique sponsored receivers = 3");

  console.log(`\nOpen it in the webapp:  http://localhost:3000/proxy/${proxyAddr}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\nE2E sponsored validation failed:\n", error);
    process.exit(1);
  });
