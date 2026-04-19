/**
 * End-to-end validation script for the versioned fee proxy.
 *
 * Walks through the full lifecycle: deploy a proxy via the Factory, make
 * end-user calls, register and swap a new logic version, pin an old version
 * via `executeAtVersion`, and finally withdraw accumulated fees. Prints a
 * metrics snapshot at each step so you can eyeball that the aggregates in
 * `getMetrics()` line up with the calls made.
 *
 * Usage (with the hardhat node running on :8545):
 *   bun --filter @intuition-fee-proxy/contracts hardhat run scripts/e2e-validate.ts --network localhost
 */

import { ethers } from "hardhat";
import * as fs from "node:fs";
import * as path from "node:path";

// First fresh deploy on a hardhat node — nonce 0 from deployer always lands here.
const MOCK_MULTIVAULT = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const VERSION_V2 = ethers.encodeBytes32String("v2.0.0");
const VERSION_V21 = ethers.encodeBytes32String("v2.1.0");

async function main() {
  const [deployer, userA, userB, feeRecipient] = await ethers.getSigners();
  const { chainId } = await ethers.provider.getNetwork();

  console.log("─".repeat(66));
  console.log(` Network       chainId ${chainId}`);
  console.log(` Deployer      ${deployer.address}`);
  console.log(` User A        ${userA.address}`);
  console.log(` User B        ${userB.address}`);
  console.log(` Fee recipient ${feeRecipient.address}`);
  console.log("─".repeat(66));

  // ── Resolve Factory from webapp .env.local ────────────────────────
  const envPath = path.resolve(__dirname, "../../webapp/.env.local");
  if (!fs.existsSync(envPath)) {
    throw new Error(`Missing ${envPath}. Run \`bun contracts:deploy:local\` first.`);
  }
  const envText = fs.readFileSync(envPath, "utf-8");
  const factoryAddr = /VITE_FACTORY_ADDRESS=(\S+)/.exec(envText)?.[1];
  if (!factoryAddr) throw new Error("VITE_FACTORY_ADDRESS missing from .env.local");
  console.log(`\nFactory       ${factoryAddr}`);

  const factory = await ethers.getContractAt("IntuitionFeeProxyFactory", factoryAddr);

  // ── 1. Deploy a fresh proxy via the Factory ───────────────────────
  console.log("\n① createProxy …");
  const deployTx = await factory.connect(deployer).createProxy(
    MOCK_MULTIVAULT,
    ethers.parseEther("0.1"),   // 0.1 TRUST fixed fee per deposit
    500n,                        // 5% percentage fee
    [deployer.address],          // initial admin (fee withdrawals)
  );
  const deployRc = await deployTx.wait();
  // ProxyCreated(proxy, …) — proxy is the first indexed arg
  const log = deployRc!.logs.find((l: any) => l.address.toLowerCase() === factoryAddr.toLowerCase());
  const proxyAddr = "0x" + log!.topics[1].slice(26);
  console.log(`   proxy  →  ${proxyAddr}`);

  const proxy = await ethers.getContractAt("IntuitionFeeProxyV2", proxyAddr);
  const versioned = await ethers.getContractAt("IntuitionVersionedFeeProxy", proxyAddr);

  await printMetrics(proxy, "after deploy (expected: all zero)");

  // ── 2. End-user deposit via default (v2.0.0) ──────────────────────
  console.log("\n② userA deposit 1 TRUST …");
  const termId = ethers.encodeBytes32String("term-demo");
  await (await proxy.connect(userA).deposit(termId, 1n, 0n, { value: ethers.parseEther("1") })).wait();
  await printMetrics(proxy, "after userA deposit");

  // ── 3. Register v2.1.0 (V3Mock as logic) ──────────────────────────
  console.log("\n③ deploy V3Mock and register as v2.1.0 …");
  const V3MockFactory = await ethers.getContractFactory("IntuitionFeeProxyV3Mock");
  const v3Impl = await V3MockFactory.deploy();
  await v3Impl.waitForDeployment();
  const v3Addr = await v3Impl.getAddress();
  console.log(`   V3Mock  →  ${v3Addr}`);

  await (await versioned.connect(deployer).registerVersion(VERSION_V21, v3Addr)).wait();
  console.log(`   versions registered: ${(await versioned.getVersions()).map(ethers.decodeBytes32String).join(", ")}`);

  // ── 4. Swap default to v2.1.0 ─────────────────────────────────────
  console.log("\n④ setDefaultVersion(v2.1.0) …");
  await (await versioned.connect(deployer).setDefaultVersion(VERSION_V21)).wait();
  console.log(`   default  →  ${ethers.decodeBytes32String(await versioned.getDefaultVersion())}`);

  // ── 5. Deposit via new default (v2.1.0) from userB ────────────────
  console.log("\n⑤ userB deposit 1 TRUST (hits v2.1.0 default) …");
  await (await proxy.connect(userB).deposit(termId, 1n, 0n, { value: ethers.parseEther("1") })).wait();
  await printMetrics(proxy, "after userB deposit via v2.1.0 (metrics persist across versions)");

  // ── 6. executeAtVersion — pin to v2.0.0 ───────────────────────────
  console.log("\n⑥ executeAtVersion(v2.0.0, depositData) from userA …");
  const depositCalldata = proxy.interface.encodeFunctionData("deposit", [termId, 1n, 0n]);
  await (await versioned.connect(userA).executeAtVersion(
    VERSION_V2,
    depositCalldata,
    { value: ethers.parseEther("1") }
  )).wait();
  await printMetrics(proxy, "after executeAtVersion(v2.0.0)");

  // ── 7. Withdraw accumulated fees ──────────────────────────────────
  console.log("\n⑦ withdrawAll to feeRecipient …");
  const accBefore = await proxy.accumulatedFees();
  console.log(`   accumulatedFees before  →  ${ethers.formatEther(accBefore)} TRUST`);
  await (await proxy.connect(deployer).withdrawAll(feeRecipient.address)).wait();
  const accAfter = await proxy.accumulatedFees();
  console.log(`   accumulatedFees after   →  ${ethers.formatEther(accAfter)} TRUST`);
  console.log(`   totalFeesCollectedAllTime  →  ${ethers.formatEther(await proxy.totalFeesCollectedAllTime())} TRUST  (monotonic)`);

  // ── Summary ───────────────────────────────────────────────────────
  console.log("\n" + "═".repeat(66));
  console.log(" E2E VALIDATION COMPLETE");
  console.log("═".repeat(66));
  const m = await proxy.getMetrics();
  console.log(` totalAtomsCreated    ${m.totalAtomsCreated}`);
  console.log(` totalTriplesCreated  ${m.totalTriplesCreated}`);
  console.log(` totalDeposits        ${m.totalDeposits}            (expected 3: userA, userB, userA-via-v2.0.0)`);
  console.log(` totalVolume          ${ethers.formatEther(m.totalVolume)} TRUST`);
  console.log(` totalUniqueUsers     ${m.totalUniqueUsers}            (expected 2: userA, userB)`);
  console.log(` lastActivityBlock    ${m.lastActivityBlock}`);
  console.log(` versions registered  ${(await versioned.getVersions()).map(ethers.decodeBytes32String).join(", ")}`);
  console.log(` default version      ${ethers.decodeBytes32String(await versioned.getDefaultVersion())}`);
  console.log(` proxy address        ${proxyAddr}`);
  console.log("═".repeat(66));
  console.log("\nOpen it in the webapp:  http://localhost:3000/proxy/" + proxyAddr);
}

async function printMetrics(proxy: any, label: string) {
  const m = await proxy.getMetrics();
  const acc = await proxy.accumulatedFees();
  console.log(`   [${label}]`);
  console.log(`     atoms=${m.totalAtomsCreated}  triples=${m.totalTriplesCreated}  deposits=${m.totalDeposits}  volume=${ethers.formatEther(m.totalVolume)}  users=${m.totalUniqueUsers}  accumulatedFees=${ethers.formatEther(acc)}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\nE2E validation failed:\n", error);
    process.exit(1);
  });
