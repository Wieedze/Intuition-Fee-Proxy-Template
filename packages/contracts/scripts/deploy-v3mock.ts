/**
 * One-off helper: deploys IntuitionFeeProxyV3Mock and prints its address.
 *
 * Use this to get an implementation address you can paste into the webapp's
 * "Register new version" form when testing the upgrade UX manually.
 *
 * Usage:
 *   bun contracts:deploy:v3mock
 */

import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`Deployer: ${deployer.address}`);

  const V3MockFactory = await ethers.getContractFactory("IntuitionFeeProxyV3Mock");
  const v3 = await V3MockFactory.deploy();
  await v3.waitForDeployment();

  const addr = await v3.getAddress();
  console.log(`\nIntuitionFeeProxyV3Mock → ${addr}`);
  console.log(`\nPaste this into the webapp on /proxy/<yourProxy> — "Register new version":`);
  console.log(`  Label:                  v2.1.0`);
  console.log(`  Implementation address: ${addr}`);
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
