import { ethers, network } from "hardhat";

/**
 * Standalone redeployment of the `IntuitionFeeProxyV2` + `IntuitionFeeProxyV2Sponsored`
 * canonical implementations. Use this when the published canonical addresses
 * predate a storage-compat change (e.g. the `STORAGE_COMPAT_ID()` addition in
 * commit 7cdcac9) and need to be refreshed so downstream proxies can register
 * newer versions.
 *
 * Does NOT touch the Factory or any existing proxies.
 *
 * Usage:
 *   bun contracts:deploy:v2_0:testnet
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  const { chainId } = await ethers.provider.getNetwork();
  const balance = await ethers.provider.getBalance(deployer.address);

  console.log("─".repeat(60));
  console.log(`Network:     ${network.name} (chainId ${chainId})`);
  console.log(`Deployer:    ${deployer.address}`);
  console.log(`Balance:     ${ethers.formatEther(balance)} ETH/TRUST`);
  console.log("─".repeat(60));

  console.log("\n① Deploying IntuitionFeeProxyV2 (standard impl)…");
  const V2 = await ethers.getContractFactory("IntuitionFeeProxyV2");
  const standardImpl = await V2.deploy();
  await standardImpl.waitForDeployment();
  const standardAddr = await standardImpl.getAddress();

  console.log("\n② Deploying IntuitionFeeProxyV2Sponsored (sponsored impl)…");
  const V2S = await ethers.getContractFactory("IntuitionFeeProxyV2Sponsored");
  const sponsoredImpl = await V2S.deploy();
  await sponsoredImpl.waitForDeployment();
  const sponsoredAddr = await sponsoredImpl.getAddress();

  console.log("\n" + "═".repeat(60));
  console.log(" V2.0 DEPLOYMENT");
  console.log("═".repeat(60));
  console.log(` standard impl       ${standardAddr}`);
  console.log(` sponsored impl      ${sponsoredAddr}`);
  console.log(` labels              v2.0.0  +  v2.0.0-sponsored`);
  console.log("═".repeat(60));

  console.log("\nNext steps:");
  console.log("  1. Paste both addresses into packages/sdk/src/versions.ts");
  console.log("     under CANONICAL_VERSIONS[<network>].versions.");
  console.log("  2. Rebuild the SDK (`bun sdk:build`) + reload the webapp.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\nDeployment failed:\n", err);
    process.exit(1);
  });
