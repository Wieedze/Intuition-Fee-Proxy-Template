import { ethers, network } from "hardhat";

/**
 * Standalone deployment of `IntuitionFeeProxyV2_1` — the demo-versioning
 * impl. Deploys ONLY the new implementation contract; the existing Factory
 * and proxies keep their current wiring. Admins of a proxy can then:
 *
 *   1. Call `registerVersion(bytes32("v2.1.0"), <printed address>)` via the
 *      ProxyDetail webapp, OR
 *   2. See the new version auto-suggested in the dropdown once the SDK
 *      registry includes `v2.1.0` for this network.
 *
 * Usage:
 *   bun contracts:deploy:v2_1:local      # hardhat node
 *   bun contracts:deploy:v2_1:testnet    # intuition testnet
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

  console.log("\n① Deploying IntuitionFeeProxyV2_1 (standard impl)…");
  const V2_1 = await ethers.getContractFactory("IntuitionFeeProxyV2_1");
  const standardImpl = await V2_1.deploy();
  await standardImpl.waitForDeployment();
  const standardAddr = await standardImpl.getAddress();

  console.log("\n② Deploying IntuitionFeeProxyV2_1Sponsored (sponsored impl)…");
  const V2_1S = await ethers.getContractFactory("IntuitionFeeProxyV2_1Sponsored");
  const sponsoredImpl = await V2_1S.deploy();
  await sponsoredImpl.waitForDeployment();
  const sponsoredAddr = await sponsoredImpl.getAddress();

  console.log("\n" + "═".repeat(60));
  console.log(" V2.1 DEPLOYMENT");
  console.log("═".repeat(60));
  console.log(` standard impl       ${standardAddr}`);
  console.log(` sponsored impl      ${sponsoredAddr}`);
  console.log(` labels              v2.1.0  +  v2.1.0-sponsored`);
  console.log("═".repeat(60));

  console.log("\nNext steps:");
  console.log("  1. Verify the impls on the block explorer (optional).");
  console.log("  2. Paste both addresses into packages/sdk/src/versions.ts");
  console.log("     under CANONICAL_VERSIONS[<network>].versions.");
  console.log("  3. Rebuild the SDK (`bun sdk:build`) + reload the webapp —");
  console.log("     both versions appear in the ProxyDetail 'Register new version'");
  console.log("     dropdown (family-filtered: standard proxies see v2.1.0 only,");
  console.log("     sponsored proxies see v2.1.0-sponsored only).");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\nDeployment failed:\n", err);
    process.exit(1);
  });
