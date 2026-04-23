/**
 * End-to-end validation for the Sponsored fee-proxy channel (V2Sponsored).
 *
 * Covers the full B1 full-sponsorship surface as it stands today:
 *
 *   ① createProxy(Sponsored) — assert defaults + MIN_CLAIM_WINDOW_SECONDS
 *   ② admin fundPool
 *   ③ PUBLIC fundPool (non-admin) — permissionless contribution
 *   ④ user1 depositSponsored — pool pays assets + Sofia fee (fee-on-top)
 *   ⑤ user2 depositSponsored above maxClaimPerTx → Sponsored_ExceedsMaxPerTx
 *   ⑥ Raise cap + tighten window to 1h/1call → user2 succeeds then rate-limits
 *   ⑦ user3 independent per-user window still open
 *   ⑧ setClaimLimits < MIN_CLAIM_WINDOW_SECONDS → Sponsored_InvalidLimit
 *   ⑨ user4 createAtoms × 2 (assets = [0,0], no MV approval needed)
 *   ⑩ Admin reclaimFromPool + withdraw (both events + invariant)
 *   ⑪ Disabled paths: deposit(3 args) / fundPool(value=0) / reclaim > pool
 *   ⑫ Register v2.1.0-sponsored (real impl) + setDefault → next call emits VersionUsed
 *   ⑬ Register STANDARD impl on sponsored proxy → StorageLayoutMismatch
 *   ⑭ 2-step proxyAdmin transfer (transfer → accept, pending guards)
 *   ⑮ Final snapshot + cumulative assertions
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
import { ensureSigners } from "./ensureSigners";

const CHANNEL_SPONSORED = 1;
const FIXED_FEE_WEI = ethers.parseEther("0.1");
const PCT_BPS = 500n; // 5%
const FEE_DENOM = 10_000n;

function fmt(v: bigint): string {
  return ethers.formatEther(v);
}

function feeFor(assets: bigint, count = 1n): bigint {
  return FIXED_FEE_WEI * count + (assets * PCT_BPS) / FEE_DENOM;
}

async function main() {
  const [deployer, user1, user2, user3, user4, treasury, nonAdmin] =
    await ensureSigners(7);
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
  const PROXY_NAME = ethers.encodeBytes32String("E2E sponsored");
  const deployTx = await factory.connect(deployer).createProxy(
    multiVault,
    FIXED_FEE_WEI,
    PCT_BPS,
    [deployer.address],
    PROXY_NAME,
    CHANNEL_SPONSORED,
  );
  const deployRc = await deployTx.wait();
  const log = deployRc!.logs.find(
    (l: any) => l.address.toLowerCase() === factoryAddr.toLowerCase(),
  );
  const proxyAddr = "0x" + log!.topics[1].slice(26);
  console.log(`   proxy        → ${proxyAddr}`);

  const proxy = await ethers.getContractAt("IntuitionFeeProxyV2Sponsored", proxyAddr);
  const versioned = await ethers.getContractAt("IntuitionVersionedFeeProxy", proxyAddr);

  const version: string = await proxy.version();
  assert(version.includes("-sponsored"), `version "${version}" must contain "-sponsored"`);

  const maxPerTx: bigint = await proxy.maxClaimPerTx();
  const maxPerWindow: bigint = await proxy.maxClaimsPerWindow();
  const maxVolumePerWindow: bigint = await proxy.maxClaimVolumePerWindow();
  const windowSec: bigint = await proxy.claimWindowSeconds();
  const minWindowSec: bigint = await proxy.MIN_CLAIM_WINDOW_SECONDS();
  assertEq(maxPerTx, ethers.parseEther("1"), "default maxClaimPerTx = 1 TRUST");
  assertEq(maxPerWindow, 10n, "default maxClaimsPerWindow = 10");
  assertEq(maxVolumePerWindow, ethers.parseEther("10"), "default maxClaimVolumePerWindow = 10 TRUST");
  assertEq(windowSec, 86400n, "default claimWindowSeconds = 86400 (1 day)");
  assertEq(minWindowSec, 3600n, "MIN_CLAIM_WINDOW_SECONDS = 3600 (1 hour)");
  assertEq(await proxy.sponsorPool(), 0n, "initial sponsorPool == 0");
  assertEq(await proxy.accumulatedFees(), 0n, "initial accumulatedFees == 0");
  console.log(
    `   defaults     → ${fmt(maxPerTx)} TRUST/tx · ${maxPerWindow} calls + ${fmt(maxVolumePerWindow)} TRUST / ${windowSec}s · MIN window ${minWindowSec}s · ✓`,
  );

  // ════════════════════════════════════════════════════════════════════
  // ② Admin funds pool — PoolFunded event, pool = 2 TRUST
  // ════════════════════════════════════════════════════════════════════
  console.log("\n② admin fundPool(2 TRUST) …");
  const fund1Tx = await proxy.connect(deployer).fundPool({ value: ethers.parseEther("2") });
  const fund1Rc = await fund1Tx.wait();
  const fund1Log = fund1Rc!.logs.find((l: any) => {
    try {
      const parsed = proxy.interface.parseLog(l);
      return parsed?.name === "PoolFunded";
    } catch {
      return false;
    }
  });
  assert(Boolean(fund1Log), "PoolFunded event emitted by admin");
  assertEq(await proxy.sponsorPool(), ethers.parseEther("2"), "pool = 2 TRUST");
  console.log("   ✓ pool = 2 TRUST, PoolFunded(2, deployer) emitted");

  // ════════════════════════════════════════════════════════════════════
  // ③ PUBLIC fundPool — anyone can donate (permissionless)
  // ════════════════════════════════════════════════════════════════════
  console.log("\n③ public fundPool(1 TRUST) from non-admin — permissionless donation …");
  const fund2Tx = await proxy.connect(nonAdmin).fundPool({ value: ethers.parseEther("1") });
  const fund2Rc = await fund2Tx.wait();
  const fund2Log = fund2Rc!.logs.find((l: any) => {
    try {
      const parsed = proxy.interface.parseLog(l);
      return parsed?.name === "PoolFunded";
    } catch {
      return false;
    }
  });
  assert(Boolean(fund2Log), "PoolFunded event emitted by non-admin");
  const fund2Parsed = proxy.interface.parseLog(fund2Log)!;
  assertEq(fund2Parsed.args.by.toLowerCase(), nonAdmin.address.toLowerCase(), "PoolFunded.by = non-admin");
  assertEq(await proxy.sponsorPool(), ethers.parseEther("3"), "pool = 3 TRUST after public top-up");
  console.log("   ✓ pool = 3 TRUST, PoolFunded(1, nonAdmin) — non-admin accepted");

  // ════════════════════════════════════════════════════════════════════
  // ④ user1 depositSponsored(0.5 TRUST) — pool pays assets + fee
  // ════════════════════════════════════════════════════════════════════
  console.log("\n④ user1 depositSponsored(0.5 TRUST) — pool covers full cost …");
  const termId = ethers.encodeBytes32String("term-demo");
  const u1Assets = ethers.parseEther("0.5");
  const u1Fee = feeFor(u1Assets);
  const u1TotalRequired = u1Assets + u1Fee;
  const poolBefore4 = await proxy.sponsorPool();
  const accBefore4 = await proxy.accumulatedFees();
  const u1BalBefore = await ethers.provider.getBalance(user1.address);

  const u1Tx = await proxy
    .connect(user1)
    .depositSponsored(termId, 1n, 0n, u1Assets, { value: 0 });
  const u1Rc = await u1Tx.wait();
  const u1GasCost = u1Rc!.gasUsed * u1Rc!.gasPrice;
  const u1BalAfter = await ethers.provider.getBalance(user1.address);

  assertEq(u1BalBefore - u1BalAfter, u1GasCost, "user1 paid ONLY gas (full sponsorship)");
  assertEq(
    await proxy.sponsorPool(),
    poolBefore4 - u1TotalRequired,
    "pool decreased by (assets + fee)",
  );
  assertEq(
    await proxy.accumulatedFees(),
    accBefore4 + u1Fee,
    "accumulatedFees grew by fee",
  );
  const s1 = await proxy.getClaimStatus(user1.address);
  assertEq(s1[0], 1n, "user1 claim count = 1");
  assertEq(s1[1], u1TotalRequired, "user1 claim volume = assets + fee");
  const sm1 = await proxy.getSponsoredMetrics();
  assertEq(sm1[0], 1n, "totalSponsoredDeposits = 1");
  assertEq(sm1[1], u1TotalRequired, "totalSponsoredVolume = assets + fee");
  assertEq(sm1[2], 1n, "uniqueSponsoredReceivers = 1");
  console.log(
    `   ✓ pool -${fmt(u1TotalRequired)}  ·  fee +${fmt(u1Fee)}  ·  user1 wallet untouched`,
  );

  // Invariant: proxy balance == accumulatedFees + sponsorPool
  {
    const bal = await ethers.provider.getBalance(proxyAddr);
    const acc = await proxy.accumulatedFees();
    const pool = await proxy.sponsorPool();
    assertEq(bal, acc + pool, "proxy balance == accumulatedFees + sponsorPool");
  }

  // ════════════════════════════════════════════════════════════════════
  // ⑤ user2 depositSponsored(1 TRUST) → totalRequired > cap (1 TRUST)
  // ════════════════════════════════════════════════════════════════════
  console.log("\n⑤ user2 depositSponsored(1 TRUST) with cap=1 TRUST → Sponsored_ExceedsMaxPerTx …");
  await expectRevertWithName(
    () =>
      proxy
        .connect(user2)
        .depositSponsored(termId, 1n, 0n, ethers.parseEther("1"), { value: 0 }),
    "Sponsored_ExceedsMaxPerTx",
    "1 TRUST deposit exceeds 1 TRUST cap (fee on top)",
  );
  console.log("   ✓ cap enforced — fee-on-top pushes totalRequired above cap");

  // ════════════════════════════════════════════════════════════════════
  // ⑥ Raise cap, tighten window to 1h/1call — user2 succeeds then rate-limits
  // ════════════════════════════════════════════════════════════════════
  console.log("\n⑥ setClaimLimits(2 TRUST/tx, 1/1h, 10 TRUST/1h) …");
  const ONE_HOUR = 3600n;
  await (
    await proxy
      .connect(deployer)
      .setClaimLimits(ethers.parseEther("2"), 1n, ethers.parseEther("10"), ONE_HOUR)
  ).wait();
  // Top up so pool can cover: user2 0.5 TRUST + user3 0.5 TRUST + createAtoms later (0 assets)
  await (
    await proxy.connect(deployer).fundPool({ value: ethers.parseEther("2") })
  ).wait();

  console.log("   user2 1st depositSponsored(0.5 TRUST) → success");
  const u2Assets = ethers.parseEther("0.5");
  const u2Fee = feeFor(u2Assets);
  const u2Required = u2Assets + u2Fee;
  await (
    await proxy.connect(user2).depositSponsored(termId, 1n, 0n, u2Assets, { value: 0 })
  ).wait();
  const s2 = await proxy.getClaimStatus(user2.address);
  assertEq(s2[0], 1n, "user2 count = 1 in new window");

  console.log("   user2 2nd depositSponsored(0.1 TRUST) → Sponsored_RateLimited (maxPerWindow=1)");
  await expectRevertWithName(
    () =>
      proxy
        .connect(user2)
        .depositSponsored(termId, 1n, 0n, ethers.parseEther("0.1"), { value: 0 }),
    "Sponsored_RateLimited",
    "user2 2nd claim in 1-call window",
  );
  console.log(`   ✓ user2 consumed ${fmt(u2Required)} then rate-limited`);

  // ════════════════════════════════════════════════════════════════════
  // ⑦ user3 — windows are per-user
  // ════════════════════════════════════════════════════════════════════
  console.log("\n⑦ user3 depositSponsored(0.5 TRUST) — independent per-user window …");
  const u3Assets = ethers.parseEther("0.5");
  const u3Fee = feeFor(u3Assets);
  const u3Required = u3Assets + u3Fee;
  await (
    await proxy.connect(user3).depositSponsored(termId, 1n, 0n, u3Assets, { value: 0 })
  ).wait();
  const s3 = await proxy.getClaimStatus(user3.address);
  assertEq(s3[0], 1n, "user3 count = 1 (fresh window)");
  console.log(`   ✓ user3 drew ${fmt(u3Required)} from pool`);

  // ════════════════════════════════════════════════════════════════════
  // ⑧ MIN_CLAIM_WINDOW_SECONDS enforcement
  // ════════════════════════════════════════════════════════════════════
  console.log("\n⑧ setClaimLimits(…, 1800s) → Sponsored_InvalidLimit (< MIN 1h) …");
  await expectRevertWithName(
    () =>
      proxy
        .connect(deployer)
        .setClaimLimits(
          ethers.parseEther("2"),
          1n,
          ethers.parseEther("10"),
          1800n, // 30 min — below MIN_CLAIM_WINDOW_SECONDS
        ),
    "Sponsored_InvalidLimit",
    "window < 1 hour",
  );
  console.log("   ✓ 1-hour minimum enforced");

  // ════════════════════════════════════════════════════════════════════
  // ⑨ user4 createAtoms × 2 (assets = [0,0], no MV approval required)
  // ════════════════════════════════════════════════════════════════════
  console.log("\n⑨ user4 createAtoms × 2 (assets=[0,0], pool pays cost + fee) …");
  const atomCost = await proxy.getAtomCost();
  // Use unique suffixes so repeated testnet runs don't collide on atom IDs
  const suffix = Date.now().toString();
  const atomsData = [
    ethers.toUtf8Bytes(`ipfs://sponsored-alpha-${suffix}`),
    ethers.toUtf8Bytes(`ipfs://sponsored-beta-${suffix}`),
  ];
  const atomsAssets = [0n, 0n];
  const atomsFee = feeFor(0n, 0n); // nonZero count = 0 → fee = 0
  const atomsMvCost = atomCost * 2n;
  const atomsRequired = atomsMvCost + atomsFee;

  // Pool must cover atomsRequired AND sit under cap
  const poolBeforeAtoms = await proxy.sponsorPool();
  if (poolBeforeAtoms < atomsRequired) {
    const needed = atomsRequired - poolBeforeAtoms;
    console.log(`   topping up pool with ${fmt(needed)} TRUST for atomsRequired`);
    await (await proxy.connect(deployer).fundPool({ value: needed })).wait();
  }
  // Also raise cap if atomsRequired > current cap
  if (atomsRequired > (await proxy.maxClaimPerTx())) {
    console.log(`   raising cap to cover ${fmt(atomsRequired)} atomsRequired`);
    await (
      await proxy
        .connect(deployer)
        .setClaimLimits(atomsRequired * 2n, 10n, atomsRequired * 10n, ONE_HOUR)
    ).wait();
  }

  await (
    await proxy
      .connect(user4)
      .createAtoms(atomsData, atomsAssets, 1n, { value: 0 })
  ).wait();
  const m9 = await proxy.getMetrics();
  assertEq(m9.totalAtomsCreated, 2n, "totalAtomsCreated = 2");
  console.log(`   ✓ 2 atoms created, pool -${fmt(atomsRequired)}`);

  // ════════════════════════════════════════════════════════════════════
  // ⑩ reclaimFromPool + withdraw — both emit their events
  // ════════════════════════════════════════════════════════════════════
  console.log("\n⑩ reclaimFromPool(0.2 TRUST → treasury) + withdraw(fees → treasury) …");
  const tBefore = await ethers.provider.getBalance(treasury.address);
  const reclaimTx = await proxy
    .connect(deployer)
    .reclaimFromPool(ethers.parseEther("0.2"), treasury.address);
  const reclaimRc = await reclaimTx.wait();
  const reclaimLog = reclaimRc!.logs.find((l: any) => {
    try {
      const parsed = proxy.interface.parseLog(l);
      return parsed?.name === "PoolReclaimed";
    } catch {
      return false;
    }
  });
  assert(Boolean(reclaimLog), "PoolReclaimed event emitted");
  assertEq(
    (await ethers.provider.getBalance(treasury.address)) - tBefore,
    ethers.parseEther("0.2"),
    "treasury got 0.2 TRUST from reclaim",
  );

  const accBeforeW = await proxy.accumulatedFees();
  const poolBeforeW = await proxy.sponsorPool();
  const balBeforeW = await ethers.provider.getBalance(proxyAddr);
  assert(
    balBeforeW >= accBeforeW + poolBeforeW,
    "pre-withdraw invariant: balance ≥ acc + pool",
  );
  await (await proxy.connect(deployer).withdrawAll(treasury.address)).wait();
  assertEq(await proxy.accumulatedFees(), 0n, "fees drained to 0");
  assertEq(await proxy.sponsorPool(), poolBeforeW, "pool unchanged (withdraw can't touch pool)");
  assertEq(
    await ethers.provider.getBalance(proxyAddr),
    poolBeforeW,
    "proxy balance == pool (fees fully drained)",
  );
  console.log(`   ✓ reclaimed 0.2 · withdrew ${fmt(accBeforeW)} fees · pool intact`);

  // ════════════════════════════════════════════════════════════════════
  // ⑪ Disabled / revert paths
  // ════════════════════════════════════════════════════════════════════
  console.log("\n⑪ disabled paths …");
  console.log("   deposit(3 args) on sponsored → Sponsored_UseDepositSponsored");
  await expectRevertWithName(
    () => proxy.connect(user1).deposit(termId, 1n, 0n, { value: ethers.parseEther("0.2") }),
    "Sponsored_UseDepositSponsored",
    "3-arg deposit disabled on sponsored",
  );
  console.log("   fundPool(value=0) → Sponsored_NothingToCredit");
  await expectRevertWithName(
    () => proxy.connect(deployer).fundPool({ value: 0 }),
    "Sponsored_NothingToCredit",
    "empty fundPool",
  );
  console.log("   reclaimFromPool(pool+1) → Sponsored_InsufficientClaim");
  const poolNow = await proxy.sponsorPool();
  await expectRevertWithName(
    () => proxy.connect(deployer).reclaimFromPool(poolNow + 1n, treasury.address),
    "Sponsored_InsufficientClaim",
    "reclaim > pool",
  );
  console.log("   non-admin reclaimFromPool → IntuitionFeeProxy_NotWhitelistedAdmin");
  await expectRevertWithName(
    () => proxy.connect(nonAdmin).reclaimFromPool(1n, nonAdmin.address),
    "IntuitionFeeProxy_NotWhitelistedAdmin",
    "non-admin reclaim",
  );
  console.log("   non-admin setClaimLimits → IntuitionFeeProxy_NotWhitelistedAdmin");
  await expectRevertWithName(
    () =>
      proxy
        .connect(nonAdmin)
        .setClaimLimits(ethers.parseEther("1"), 1n, ethers.parseEther("10"), ONE_HOUR),
    "IntuitionFeeProxy_NotWhitelistedAdmin",
    "non-admin setClaimLimits",
  );
  console.log("   ✓ all disabled / gated paths enforced");

  // ════════════════════════════════════════════════════════════════════
  // ⑫ Versioning — register v2.1.0-sponsored (real) + setDefault
  //    Next write-path call emits VersionUsed(v2.1.0-sponsored, user).
  // ════════════════════════════════════════════════════════════════════
  console.log("\n⑫ Deploy V2.1 sponsored impl + registerVersion + setDefaultVersion …");
  const V21S = await ethers.getContractFactory("IntuitionFeeProxyV2_1Sponsored");
  const v21sImpl = await V21S.deploy();
  await v21sImpl.waitForDeployment();
  const v21sAddr = await v21sImpl.getAddress();

  const LABEL_V21S = ethers.encodeBytes32String("v2.1.0-sponsored");
  await (await versioned.connect(deployer).registerVersion(LABEL_V21S, v21sAddr)).wait();
  await (await versioned.connect(deployer).setDefaultVersion(LABEL_V21S)).wait();
  assertEq(
    ethers.decodeBytes32String(await versioned.getDefaultVersion()),
    "v2.1.0-sponsored",
    "default version is v2.1.0-sponsored",
  );

  // Use a fresh signer (treasury has no prior sponsored-claim activity) to
  // prove VersionUsed under the limits configured in ⑥ — no admin reset
  // needed. 0.3 TRUST deposit + fee stays well under the 2 TRUST per-tx
  // cap, and a fresh window accepts the first call.
  await (await proxy.connect(deployer).fundPool({ value: ethers.parseEther("1") })).wait();
  const checkTx = await proxy
    .connect(treasury)
    .depositSponsored(termId, 1n, 0n, ethers.parseEther("0.3"), { value: 0 });
  const checkRc = await checkTx.wait();
  const versionUsedTopic = ethers.id("VersionUsed(bytes32,address)");
  const versionUsedLog = checkRc!.logs.find(
    (l: any) =>
      l.topics[0]?.toLowerCase() === versionUsedTopic.toLowerCase() &&
      l.address.toLowerCase() === proxyAddr.toLowerCase(),
  );
  assert(Boolean(versionUsedLog), "VersionUsed event emitted under v2.1.0-sponsored default");
  const emittedVersion = ethers.decodeBytes32String(versionUsedLog!.topics[1]);
  assertEq(emittedVersion, "v2.1.0-sponsored", "VersionUsed.version = v2.1.0-sponsored");
  const emittedUser = "0x" + versionUsedLog!.topics[2].slice(26);
  assertEq(
    emittedUser.toLowerCase(),
    treasury.address.toLowerCase(),
    "VersionUsed.user = msg.sender (treasury)",
  );
  console.log("   ✓ v2.1.0-sponsored registered + promoted · VersionUsed emitted on next call");

  // ════════════════════════════════════════════════════════════════════
  // ⑬ Cross-family register → StorageLayoutMismatch
  //    Try to register a STANDARD impl (V2) on this SPONSORED proxy.
  // ════════════════════════════════════════════════════════════════════
  console.log("\n⑬ registerVersion(standard impl) on sponsored proxy → StorageLayoutMismatch …");
  const V2 = await ethers.getContractFactory("IntuitionFeeProxyV2");
  const stdImpl = await V2.deploy();
  await stdImpl.waitForDeployment();
  const stdAddr = await stdImpl.getAddress();
  const LABEL_BADFAMILY = ethers.encodeBytes32String("v99-badfamily");
  await expectRevertWithName(
    () => versioned.connect(deployer).registerVersion(LABEL_BADFAMILY, stdAddr),
    "VersionedFeeProxy_StorageLayoutMismatch",
    "cross-family register blocked",
  );
  console.log("   ✓ cross-family register blocked — STORAGE_COMPAT_ID guard");

  // ════════════════════════════════════════════════════════════════════
  // ⑭ 2-step proxyAdmin transfer
  // ════════════════════════════════════════════════════════════════════
  console.log("\n⑭ transferProxyAdmin(user4) → acceptProxyAdmin …");
  assertEq(
    (await versioned.proxyAdmin()).toLowerCase(),
    deployer.address.toLowerCase(),
    "proxyAdmin starts = deployer",
  );
  await (await versioned.connect(deployer).transferProxyAdmin(user4.address)).wait();
  assertEq(
    (await versioned.pendingProxyAdmin()).toLowerCase(),
    user4.address.toLowerCase(),
    "pendingProxyAdmin = user4",
  );
  // Guard: non-pending can't accept
  await expectRevertWithName(
    () => versioned.connect(nonAdmin).acceptProxyAdmin(),
    "VersionedFeeProxy_NotPendingProxyAdmin",
    "non-pending accept blocked",
  );
  await (await versioned.connect(user4).acceptProxyAdmin()).wait();
  assertEq(
    (await versioned.proxyAdmin()).toLowerCase(),
    user4.address.toLowerCase(),
    "proxyAdmin now = user4",
  );
  assertEq(
    await versioned.pendingProxyAdmin(),
    ethers.ZeroAddress,
    "pendingProxyAdmin cleared",
  );
  // Old admin can no longer manage versions
  await expectRevertWithName(
    () => versioned.connect(deployer).transferProxyAdmin(deployer.address),
    "VersionedFeeProxy_NotProxyAdmin",
    "old admin locked out",
  );
  console.log("   ✓ proxyAdmin rotated via 2-step, old admin locked out");

  // ════════════════════════════════════════════════════════════════════
  // ⑮ Final snapshot
  // ════════════════════════════════════════════════════════════════════
  console.log("\n" + "═".repeat(66));
  console.log(" E2E SPONSORED VALIDATION COMPLETE");
  console.log("═".repeat(66));
  const mF = await proxy.getMetrics();
  const smF = await proxy.getSponsoredMetrics();
  console.log(` proxy              ${proxyAddr}`);
  console.log(` version            ${await proxy.version()}`);
  console.log(` default version    ${ethers.decodeBytes32String(await versioned.getDefaultVersion())}`);
  console.log(` proxyAdmin         ${await versioned.proxyAdmin()}`);
  console.log(` sponsorPool        ${fmt(await proxy.sponsorPool())} TRUST`);
  console.log(` accumulatedFees    ${fmt(await proxy.accumulatedFees())} TRUST`);
  console.log(` totalFeesCollected ${fmt(await proxy.totalFeesCollectedAllTime())} TRUST`);
  console.log(` totalDeposits      ${mF.totalDeposits}`);
  console.log(` totalAtomsCreated  ${mF.totalAtomsCreated}`);
  console.log(` totalVolume        ${fmt(mF.totalVolume)} TRUST`);
  console.log(` totalUniqueUsers   ${mF.totalUniqueUsers}`);
  console.log(` sponsoredDeposits  ${smF[0]}`);
  console.log(` sponsoredVolume    ${fmt(smF[1])} TRUST`);
  console.log(` sponsoredReceivers ${smF[2]}`);
  console.log("═".repeat(66));

  // Hard final assertions
  assert(
    mF.totalDeposits >= 4n,
    "totalDeposits ≥ 4 (user1 ④ + user2 ⑥ + user3 ⑦ + treasury ⑫ VersionUsed call)",
  );
  assertEq(mF.totalAtomsCreated, 2n, "totalAtomsCreated = 2 (from ⑨)");
  // Sponsored metrics: user1 ④, user2 ⑥, user3 ⑦, user4 ⑨ (createAtoms), treasury ⑫
  assert(smF[0] >= 5n, "sponsoredDeposits ≥ 5");
  assertEq(
    smF[2],
    5n,
    "unique sponsored receivers = 5 (user1, user2, user3, user4, treasury)",
  );

  console.log(`\nOpen it in the webapp:  http://localhost:3000/proxy/${proxyAddr}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\nE2E sponsored validation failed:\n", error);
    process.exit(1);
  });
