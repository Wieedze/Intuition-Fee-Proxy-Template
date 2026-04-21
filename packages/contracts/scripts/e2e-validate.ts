/**
 * End-to-end validation script for the Standard fee-proxy channel.
 *
 * Beyond a smoke test — every step asserts the invariants it expects, so the
 * script fails loud if any accounting drifts. Covers:
 *
 *   ① Deploy (asserts zero initial state)
 *   ② userA createAtoms (batch × 3, with non-zero deposits)
 *   ③ userB createTriples (× 1, using atoms from ②)
 *   ④ userC depositBatch (× 2 terms)
 *   ⑤ userA createAtoms with overpay → assert refund + no ETH stuck (H-01)
 *   ⑥ Admin partial withdraw (totalFeesCollectedAllTime stays monotone)
 *   ⑦ Non-admin withdraw attempt → expect revert
 *   ⑧ withdraw(amount > accumulatedFees) → expect revert
 *   ⑨ Fee cap boundary: 1000 bps OK, 1001 bps revert (M-01)
 *   ⑩ Register v2.1.0 + setDefaultVersion
 *   ⑪ executeAtVersion pinning back to v2.0.0
 *   ⑫ Admin whitelist ops (add / revoke, last-admin guard)
 *   ⑬ Final withdrawAll
 *   ⑭ Cumulative assertions on metrics
 *
 * Usage (hardhat node must be up on :8545 and Factory deployed):
 *   bun contracts:e2e:local
 *   bun contracts:e2e:testnet
 */

import { ethers } from "hardhat";
import * as fs from "node:fs";
import * as path from "node:path";

import { multiVaultFor } from "./multiVaultAddresses";
import { assert, assertEq, expectRevertWithName } from "./assertionHelpers";

const VERSION_V2 = ethers.encodeBytes32String("v2.0.0");
const VERSION_V21 = ethers.encodeBytes32String("v2.1.0");

const FIXED_FEE_WEI = ethers.parseEther("0.1");
const PCT_BPS = 500n; // 5%
const FEE_DENOM = 10_000n;
const CHANNEL_STANDARD = 0;

function fmt(v: bigint): string {
  return ethers.formatEther(v);
}

async function main() {
  const [deployer, userA, userB, userC, feeRecipient, nonAdmin] =
    await ethers.getSigners();
  const { chainId } = await ethers.provider.getNetwork();
  const multiVault = multiVaultFor(chainId);

  console.log("─".repeat(66));
  console.log(` Network       chainId ${chainId}`);
  console.log(` MultiVault    ${multiVault}`);
  console.log(` Deployer      ${deployer.address}  (initial admin)`);
  console.log(` User A        ${userA.address}`);
  console.log(` User B        ${userB.address}`);
  console.log(` User C        ${userC.address}`);
  console.log(` Fee recipient ${feeRecipient.address}`);
  console.log(` Non-admin     ${nonAdmin.address}`);
  console.log("─".repeat(66));

  // ── Resolve Factory from webapp .env.local ────────────────────────
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

  // ════════════════════════════════════════════════════════════════════
  // ① createProxy (Standard channel)
  // ════════════════════════════════════════════════════════════════════
  console.log("\n① createProxy (Standard channel) …");
  const PROXY_NAME = ethers.encodeBytes32String("E2E standard");
  const deployTx = await factory.connect(deployer).createProxy(
    multiVault,
    FIXED_FEE_WEI,
    PCT_BPS,
    [deployer.address],
    PROXY_NAME,
    CHANNEL_STANDARD,
  );
  const deployRc = await deployTx.wait();
  const log = deployRc!.logs.find(
    (l: any) => l.address.toLowerCase() === factoryAddr.toLowerCase(),
  );
  const proxyAddr = "0x" + log!.topics[1].slice(26);
  console.log(`   proxy  →  ${proxyAddr}`);

  const proxy = await ethers.getContractAt("IntuitionFeeProxyV2", proxyAddr);
  const versioned = await ethers.getContractAt("IntuitionVersionedFeeProxy", proxyAddr);

  // Initial state assertions
  const m0 = await proxy.getMetrics();
  assertEq(m0.totalAtomsCreated, 0n, "initial totalAtomsCreated");
  assertEq(m0.totalTriplesCreated, 0n, "initial totalTriplesCreated");
  assertEq(m0.totalDeposits, 0n, "initial totalDeposits");
  assertEq(m0.totalVolume, 0n, "initial totalVolume");
  assertEq(m0.totalUniqueUsers, 0n, "initial totalUniqueUsers");
  assertEq(await proxy.accumulatedFees(), 0n, "initial accumulatedFees");
  assertEq(await proxy.totalFeesCollectedAllTime(), 0n, "initial totalFeesCollectedAllTime");
  assertEq(await proxy.adminCount(), 1n, "initial adminCount");
  assert(await proxy.whitelistedAdmins(deployer.address), "deployer is whitelisted");
  console.log("   ✓ initial state clean");

  // ════════════════════════════════════════════════════════════════════
  // ② userA createAtoms — batch of 3 atoms with deposits
  // ════════════════════════════════════════════════════════════════════
  console.log("\n② userA createAtoms × 3 with deposits …");
  const atomCost = await proxy.getAtomCost();
  const atomsData = [
    ethers.toUtf8Bytes("ipfs://atom-alpha"),
    ethers.toUtf8Bytes("ipfs://atom-beta"),
    ethers.toUtf8Bytes("ipfs://atom-gamma"),
  ];
  const atomsAssets = [
    ethers.parseEther("0.1"),
    ethers.parseEther("0.2"),
    ethers.parseEther("0.3"),
  ];
  const atomsTotalDeposit = atomsAssets.reduce((a, b) => a + b, 0n);
  const atomsFee =
    FIXED_FEE_WEI * 3n + (atomsTotalDeposit * PCT_BPS) / FEE_DENOM;
  const atomsRequired = atomCost * 3n + atomsTotalDeposit + atomsFee;
  const atomsTx = await proxy
    .connect(userA)
    .createAtoms(atomsData, atomsAssets, 1n, { value: atomsRequired });
  const atomsRc = await atomsTx.wait();
  // Grab atom IDs from MultiVault calls (read via static call now that they exist)
  const atomIds: string[] = [];
  for (let i = 0; i < atomsData.length; i++) {
    // Each createAtoms call on the MV emits a specific event; easier: compute via MV helper
    atomIds.push(await proxy.calculateAtomId(atomsData[i]));
  }
  // Note: depending on the MV, calculateAtomId may return the canonical hash; for the
  // mock it's just keccak256(data). We use the IDs the proxy reports.
  console.log(`   atomIds[0]  →  ${atomIds[0]}`);
  const m2 = await proxy.getMetrics();
  assertEq(m2.totalAtomsCreated, 3n, "totalAtomsCreated after ②");
  assertEq(m2.totalDeposits, 3n, "totalDeposits after ② (3 non-zero assets)");
  assertEq(m2.totalVolume, atomsTotalDeposit, "totalVolume after ②");
  assertEq(m2.totalUniqueUsers, 1n, "totalUniqueUsers after ②");
  assertEq(await proxy.accumulatedFees(), atomsFee, "accumulatedFees after ②");
  assertEq(
    await ethers.provider.getBalance(proxyAddr),
    atomsFee,
    "proxy balance == accumulatedFees after ②",
  );
  console.log(`   ✓ accrued ${fmt(atomsFee)} TRUST in fees`);

  // ════════════════════════════════════════════════════════════════════
  // ③ userB createTriples — 1 triple using atoms from ②
  // ════════════════════════════════════════════════════════════════════
  console.log("\n③ userB createTriples × 1 …");
  const tripleCost = await proxy.getTripleCost();
  const tripleAsset = ethers.parseEther("0.15");
  const tripleFee = FIXED_FEE_WEI + (tripleAsset * PCT_BPS) / FEE_DENOM;
  const tripleRequired = tripleCost + tripleAsset + tripleFee;
  await (
    await proxy
      .connect(userB)
      .createTriples(
        [atomIds[0]],
        [atomIds[1]],
        [atomIds[2]],
        [tripleAsset],
        1n,
        { value: tripleRequired },
      )
  ).wait();
  const m3 = await proxy.getMetrics();
  assertEq(m3.totalTriplesCreated, 1n, "totalTriplesCreated after ③");
  assertEq(m3.totalDeposits, 4n, "totalDeposits after ③");
  assertEq(m3.totalUniqueUsers, 2n, "totalUniqueUsers after ③ (A, B)");
  assertEq(
    await proxy.accumulatedFees(),
    atomsFee + tripleFee,
    "accumulatedFees after ③",
  );
  console.log(`   ✓ triple created, +${fmt(tripleFee)} TRUST fee`);

  // ════════════════════════════════════════════════════════════════════
  // ④ userC depositBatch — 2 terms
  // ════════════════════════════════════════════════════════════════════
  console.log("\n④ userC depositBatch × 2 …");
  const batchAssets = [ethers.parseEther("0.1"), ethers.parseEther("0.2")];
  const batchTotal = batchAssets[0] + batchAssets[1];
  const batchFee = FIXED_FEE_WEI * 2n + (batchTotal * PCT_BPS) / FEE_DENOM;
  const batchRequired = batchTotal + batchFee;
  await (
    await proxy
      .connect(userC)
      .depositBatch(
        [atomIds[0], atomIds[1]],
        [1n, 1n],
        batchAssets,
        [0n, 0n],
        { value: batchRequired },
      )
  ).wait();
  const m4 = await proxy.getMetrics();
  assertEq(m4.totalDeposits, 6n, "totalDeposits after ④ (4 + 2)");
  assertEq(m4.totalUniqueUsers, 3n, "totalUniqueUsers after ④ (A, B, C)");
  assertEq(
    await proxy.accumulatedFees(),
    atomsFee + tripleFee + batchFee,
    "accumulatedFees after ④",
  );
  console.log(`   ✓ batch OK, +${fmt(batchFee)} TRUST fee`);

  // ════════════════════════════════════════════════════════════════════
  // ⑤ Overpay createAtoms → must refund excess (H-01)
  // ════════════════════════════════════════════════════════════════════
  console.log("\n⑤ userA createAtoms with 0.5 TRUST overpay (H-01 refund test) …");
  const opData = [ethers.toUtf8Bytes("ipfs://atom-delta")];
  const opAssets = [ethers.parseEther("0.1")];
  const opFee = FIXED_FEE_WEI + (opAssets[0] * PCT_BPS) / FEE_DENOM;
  const opRequired = atomCost + opAssets[0] + opFee;
  const overpay = ethers.parseEther("0.5");
  const userABefore = await ethers.provider.getBalance(userA.address);
  const accBefore5 = await proxy.accumulatedFees();
  const opTx = await proxy.connect(userA).createAtoms(opData, opAssets, 1n, {
    value: opRequired + overpay,
  });
  const opRc = await opTx.wait();
  const gasCost = opRc!.gasUsed * opRc!.gasPrice;
  const userAAfter = await ethers.provider.getBalance(userA.address);
  const spent = userABefore - userAAfter;
  // spent must equal exactly (opRequired + gas) — not (opRequired + overpay + gas)
  assertEq(spent, opRequired + gasCost, "userA spent = totalRequired + gas (refund worked)");
  assertEq(
    await proxy.accumulatedFees(),
    accBefore5 + opFee,
    "accumulatedFees grew by exactly opFee",
  );
  assertEq(
    await ethers.provider.getBalance(proxyAddr),
    await proxy.accumulatedFees(),
    "proxy balance == accumulatedFees (no stuck ETH)",
  );
  console.log(`   ✓ excess ${fmt(overpay)} TRUST refunded, no stuck ETH`);

  const accAfterDeposits = await proxy.accumulatedFees();
  const totalFeesHistorical = accAfterDeposits;

  // ════════════════════════════════════════════════════════════════════
  // ⑥ Admin partial withdraw
  // ════════════════════════════════════════════════════════════════════
  console.log("\n⑥ Admin partial withdraw (half of accumulatedFees) …");
  const half = accAfterDeposits / 2n;
  const recipBefore = await ethers.provider.getBalance(feeRecipient.address);
  await (
    await proxy.connect(deployer).withdraw(feeRecipient.address, half)
  ).wait();
  assertEq(
    await proxy.accumulatedFees(),
    accAfterDeposits - half,
    "accumulatedFees halved",
  );
  assertEq(
    await ethers.provider.getBalance(feeRecipient.address),
    recipBefore + half,
    "feeRecipient got the withdrawn amount",
  );
  assertEq(
    await proxy.totalFeesCollectedAllTime(),
    totalFeesHistorical,
    "totalFeesCollectedAllTime is monotone (unchanged by withdraw)",
  );
  console.log(`   ✓ withdrew ${fmt(half)} TRUST, monotone counter preserved`);

  // ════════════════════════════════════════════════════════════════════
  // ⑦ Non-admin withdraw attempt → revert
  // ════════════════════════════════════════════════════════════════════
  console.log("\n⑦ Non-admin withdraw attempt → expect revert …");
  await expectRevertWithName(
    () => proxy.connect(nonAdmin).withdraw(nonAdmin.address, 1n),
    "IntuitionFeeProxy_NotWhitelistedAdmin",
    "non-admin withdraw",
  );
  console.log("   ✓ non-admin correctly blocked");

  // ════════════════════════════════════════════════════════════════════
  // ⑧ Withdraw exceeding accumulatedFees → revert
  // ════════════════════════════════════════════════════════════════════
  console.log("\n⑧ Withdraw amount > accumulatedFees → expect revert …");
  const tooMuch = (await proxy.accumulatedFees()) + 1n;
  await expectRevertWithName(
    () => proxy.connect(deployer).withdraw(feeRecipient.address, tooMuch),
    "IntuitionFeeProxy_InsufficientAccumulatedFees",
    "overdraw",
  );
  console.log("   ✓ overdraw correctly blocked");

  // ════════════════════════════════════════════════════════════════════
  // ⑨ Fee cap boundary (M-01: MAX 1000 bps = 10%)
  // ════════════════════════════════════════════════════════════════════
  console.log("\n⑨ Fee cap boundary (M-01) …");
  await (await proxy.connect(deployer).setDepositPercentageFee(1000n)).wait();
  assertEq(await proxy.depositPercentageFee(), 1000n, "1000 bps accepted");
  await expectRevertWithName(
    () => proxy.connect(deployer).setDepositPercentageFee(1001n),
    "IntuitionFeeProxy_FeePercentageTooHigh",
    "percentage fee 1001 bps (above cap)",
  );
  // Restore original config so downstream deposit math stays predictable
  await (await proxy.connect(deployer).setDepositPercentageFee(PCT_BPS)).wait();
  console.log("   ✓ cap enforced at 1000 bps");

  // ════════════════════════════════════════════════════════════════════
  // ⑩ Register v2.1.0 (V3Mock) + setDefault
  // ════════════════════════════════════════════════════════════════════
  console.log("\n⑩ Deploy V3Mock and register as v2.1.0 …");
  const V3MockFactory = await ethers.getContractFactory("IntuitionFeeProxyV3Mock");
  const v3Impl = await V3MockFactory.deploy();
  await v3Impl.waitForDeployment();
  const v3Addr = await v3Impl.getAddress();
  await (await versioned.connect(deployer).registerVersion(VERSION_V21, v3Addr)).wait();
  await (await versioned.connect(deployer).setDefaultVersion(VERSION_V21)).wait();
  const registeredVersions = (await versioned.getVersions()).map(
    ethers.decodeBytes32String,
  );
  assertEq(registeredVersions.length, 2, "2 versions registered (v2.0.0 + v2.1.0)");
  assertEq(
    ethers.decodeBytes32String(await versioned.getDefaultVersion()),
    "v2.1.0",
    "defaultVersion is v2.1.0",
  );
  console.log(`   ✓ versions: ${registeredVersions.join(", ")} · default: v2.1.0`);

  // ════════════════════════════════════════════════════════════════════
  // ⑪ executeAtVersion — userA pins back to v2.0.0 for one deposit
  // ════════════════════════════════════════════════════════════════════
  console.log("\n⑪ userA executeAtVersion(v2.0.0) deposit 0.3 TRUST …");
  const depositCalldata = proxy.interface.encodeFunctionData("deposit", [
    atomIds[0],
    1n,
    0n,
  ]);
  await (
    await versioned
      .connect(userA)
      .executeAtVersion(VERSION_V2, depositCalldata, {
        value: ethers.parseEther("0.3"),
      })
  ).wait();
  const m11 = await proxy.getMetrics();
  assert(
    m11.totalDeposits === 8n,
    `totalDeposits == 8 after ⑪ (got ${m11.totalDeposits})`,
  );
  console.log("   ✓ executeAtVersion increments same metrics (shared storage)");

  // ════════════════════════════════════════════════════════════════════
  // ⑫ Admin whitelist ops — add userA as admin, then revoke deployer
  // ════════════════════════════════════════════════════════════════════
  console.log("\n⑫ Admin whitelist — add userA, then userA revokes deployer …");
  await (
    await proxy.connect(deployer).setWhitelistedAdmin(userA.address, true)
  ).wait();
  assertEq(await proxy.adminCount(), 2n, "adminCount bumped to 2");
  assert(await proxy.whitelistedAdmins(userA.address), "userA is admin");

  // Last-admin self-revoke guard: try deployer revoking themselves when there
  // are 2 admins — should succeed (guard only triggers when adminCount == 1).
  // But for the test we want to exercise the *revoke-by-other* path.
  await (
    await proxy.connect(userA).setWhitelistedAdmin(deployer.address, false)
  ).wait();
  assertEq(await proxy.adminCount(), 1n, "adminCount back to 1");
  assert(!(await proxy.whitelistedAdmins(deployer.address)), "deployer revoked");

  // Now userA is the sole admin — self-revoke must fail (L-01)
  await expectRevertWithName(
    () => proxy.connect(userA).setWhitelistedAdmin(userA.address, false),
    "IntuitionFeeProxy_LastAdminCannotRevoke",
    "last-admin self-revoke (L-01)",
  );
  console.log("   ✓ adminship rotated + last-admin guard enforced");

  // ════════════════════════════════════════════════════════════════════
  // ⑬ Final withdrawAll by userA (now sole admin)
  // ════════════════════════════════════════════════════════════════════
  console.log("\n⑬ Final withdrawAll to feeRecipient …");
  const accBeforeFinal = await proxy.accumulatedFees();
  const recipBeforeFinal = await ethers.provider.getBalance(feeRecipient.address);
  await (
    await proxy.connect(userA).withdrawAll(feeRecipient.address)
  ).wait();
  assertEq(await proxy.accumulatedFees(), 0n, "accumulatedFees drained");
  assertEq(
    await ethers.provider.getBalance(feeRecipient.address),
    recipBeforeFinal + accBeforeFinal,
    "feeRecipient received full remainder",
  );
  assertEq(
    await ethers.provider.getBalance(proxyAddr),
    0n,
    "proxy balance is zero (all ETH dispatched)",
  );
  console.log(`   ✓ withdrew ${fmt(accBeforeFinal)} TRUST, proxy balance clean`);

  // ════════════════════════════════════════════════════════════════════
  // ⑭ Summary — cumulative assertions
  // ════════════════════════════════════════════════════════════════════
  console.log("\n" + "═".repeat(66));
  console.log(" E2E STANDARD VALIDATION COMPLETE");
  console.log("═".repeat(66));
  const mF = await proxy.getMetrics();
  const totalAllTime = await proxy.totalFeesCollectedAllTime();
  console.log(` totalAtomsCreated    ${mF.totalAtomsCreated}            (expected 4: 3 in ② + 1 in ⑤)`);
  console.log(` totalTriplesCreated  ${mF.totalTriplesCreated}            (expected 1: ③)`);
  console.log(` totalDeposits        ${mF.totalDeposits}            (expected 8: 3+1+2+1+1)`);
  console.log(` totalVolume          ${fmt(mF.totalVolume)} TRUST`);
  console.log(` totalUniqueUsers     ${mF.totalUniqueUsers}            (expected 3: A, B, C)`);
  console.log(` lastActivityBlock    ${mF.lastActivityBlock}`);
  console.log(` totalFeesCollected   ${fmt(totalAllTime)} TRUST  (all-time, monotone)`);
  console.log(` accumulatedFees      ${fmt(await proxy.accumulatedFees())} TRUST  (drained to 0)`);
  console.log(` proxy balance        ${fmt(await ethers.provider.getBalance(proxyAddr))} TRUST`);
  console.log(` adminCount           ${await proxy.adminCount()}`);
  console.log(` versions             ${(await versioned.getVersions()).map(ethers.decodeBytes32String).join(", ")}`);
  console.log(` default version      ${ethers.decodeBytes32String(await versioned.getDefaultVersion())}`);
  console.log(` proxy address        ${proxyAddr}`);
  console.log("═".repeat(66));

  // Final hard assertions
  assertEq(mF.totalAtomsCreated, 4n, "final totalAtomsCreated");
  assertEq(mF.totalTriplesCreated, 1n, "final totalTriplesCreated");
  assertEq(mF.totalDeposits, 8n, "final totalDeposits");
  assertEq(mF.totalUniqueUsers, 3n, "final totalUniqueUsers");
  assert(totalAllTime > 0n, "totalFeesCollectedAllTime > 0");

  console.log("\nOpen it in the webapp:  http://localhost:3000/proxy/" + proxyAddr);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\nE2E standard validation failed:\n", error);
    process.exit(1);
  });
