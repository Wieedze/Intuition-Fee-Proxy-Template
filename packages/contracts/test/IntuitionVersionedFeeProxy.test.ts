import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import {
  IntuitionFeeProxyV2,
  IntuitionVersionedFeeProxy,
  MockMultiVault,
} from "../typechain-types";

describe("IntuitionVersionedFeeProxy (ERC-7936)", function () {
  const DEPOSIT_FEE = ethers.parseEther("0.1");
  const DEPOSIT_PERCENTAGE = 500n;
  const V2 = ethers.encodeBytes32String("v2.0.0");
  const V2_1 = ethers.encodeBytes32String("v2.1.0-beta");
  const V3 = ethers.encodeBytes32String("v3.0.0");

  async function deployFixture() {
    const [deployer, proxyAdmin, admin2, admin3, user, nonAdmin, newAdmin] =
      await ethers.getSigners();

    const MockMV = await ethers.getContractFactory("MockMultiVault");
    const mv = (await MockMV.deploy()) as unknown as MockMultiVault;
    await mv.waitForDeployment();

    const ImplFactory = await ethers.getContractFactory("IntuitionFeeProxyV2");
    const implV2 = await ImplFactory.deploy();
    await implV2.waitForDeployment();

    const initData = implV2.interface.encodeFunctionData("initialize", [
      await mv.getAddress(),
      DEPOSIT_FEE,
      DEPOSIT_PERCENTAGE,
      [proxyAdmin.address, admin2.address, admin3.address],
    ]);

    const VersionedFactory = await ethers.getContractFactory("IntuitionVersionedFeeProxy");
    const versioned = (await VersionedFactory.deploy(
      proxyAdmin.address,
      V2,
      await implV2.getAddress(),
      initData,
    )) as unknown as IntuitionVersionedFeeProxy;
    await versioned.waitForDeployment();

    const proxyAsV2 = (await ethers.getContractAt(
      "IntuitionFeeProxyV2",
      await versioned.getAddress(),
    )) as unknown as IntuitionFeeProxyV2;

    return {
      deployer,
      proxyAdmin,
      admin2,
      admin3,
      user,
      nonAdmin,
      newAdmin,
      mv,
      implV2,
      versioned,
      proxyAsV2,
      proxyAddress: await versioned.getAddress(),
    };
  }

  async function deployV3Impl(): Promise<string> {
    const V3Factory = await ethers.getContractFactory("IntuitionFeeProxyV3Mock");
    const v3 = await V3Factory.deploy();
    await v3.waitForDeployment();
    return await v3.getAddress();
  }

  // ============ Construction ============

  describe("Construction", function () {
    it("registers initial version, sets default and proxy-admin, runs initializer", async function () {
      const { versioned, proxyAdmin, implV2, proxyAsV2, mv } =
        await loadFixture(deployFixture);

      expect(await versioned.proxyAdmin()).to.equal(proxyAdmin.address);
      expect(await versioned.getDefaultVersion()).to.equal(V2);
      expect(await versioned.getVersions()).to.deep.equal([V2]);
      expect(await versioned.getImplementation(V2)).to.equal(await implV2.getAddress());

      // Initializer ran on the proxy's storage
      expect(await proxyAsV2.ethMultiVault()).to.equal(await mv.getAddress());
      expect(await proxyAsV2.depositFixedFee()).to.equal(DEPOSIT_FEE);
      expect(await proxyAsV2.adminCount()).to.equal(3n);
    });

    it("reverts on zero admin", async function () {
      const { implV2 } = await loadFixture(deployFixture);
      const VersionedFactory = await ethers.getContractFactory("IntuitionVersionedFeeProxy");
      await expect(
        VersionedFactory.deploy(ethers.ZeroAddress, V2, await implV2.getAddress(), "0x"),
      ).to.be.revertedWithCustomError(VersionedFactory, "IntuitionFeeProxy_ZeroAddress");
    });

    it("reverts on zero version", async function () {
      const { proxyAdmin, implV2 } = await loadFixture(deployFixture);
      const VersionedFactory = await ethers.getContractFactory("IntuitionVersionedFeeProxy");
      await expect(
        VersionedFactory.deploy(
          proxyAdmin.address,
          ethers.ZeroHash,
          await implV2.getAddress(),
          "0x",
        ),
      ).to.be.revertedWithCustomError(VersionedFactory, "VersionedFeeProxy_InvalidVersion");
    });

    it("reverts on EOA implementation", async function () {
      const [, , , , , , eoa] = await ethers.getSigners();
      const VersionedFactory = await ethers.getContractFactory("IntuitionVersionedFeeProxy");
      await expect(
        VersionedFactory.deploy(eoa.address, V2, eoa.address, "0x"),
      ).to.be.revertedWithCustomError(VersionedFactory, "VersionedFeeProxy_InvalidImplementation");
    });

    it("bubbles up initializer revert", async function () {
      const { proxyAdmin, mv } = await loadFixture(deployFixture);
      const ImplFactory = await ethers.getContractFactory("IntuitionFeeProxyV2");
      const impl = await ImplFactory.deploy();
      const badInit = impl.interface.encodeFunctionData("initialize", [
        await mv.getAddress(),
        DEPOSIT_FEE,
        10001n, // > MAX
        [proxyAdmin.address],
      ]);
      const VersionedFactory = await ethers.getContractFactory("IntuitionVersionedFeeProxy");
      await expect(
        VersionedFactory.deploy(proxyAdmin.address, V2, await impl.getAddress(), badInit),
      ).to.be.revertedWithCustomError(impl, "IntuitionFeeProxy_FeePercentageTooHigh");
    });
  });

  // ============ registerVersion / setDefault / remove ============

  describe("Version management", function () {
    it("admin registers a new version and switches default", async function () {
      const { versioned, proxyAdmin } = await loadFixture(deployFixture);
      const v3Addr = await deployV3Impl();

      await expect(versioned.connect(proxyAdmin).registerVersion(V3, v3Addr))
        .to.emit(versioned, "VersionRegistered")
        .withArgs(V3, v3Addr);
      expect(await versioned.getVersions()).to.deep.equal([V2, V3]);
      expect(await versioned.getImplementation(V3)).to.equal(v3Addr);

      await expect(versioned.connect(proxyAdmin).setDefaultVersion(V3))
        .to.emit(versioned, "DefaultVersionChanged")
        .withArgs(V2, V3);
      expect(await versioned.getDefaultVersion()).to.equal(V3);
    });

    it("non-admin cannot register", async function () {
      const { versioned, nonAdmin } = await loadFixture(deployFixture);
      const v3Addr = await deployV3Impl();
      await expect(
        versioned.connect(nonAdmin).registerVersion(V3, v3Addr),
      ).to.be.revertedWithCustomError(versioned, "VersionedFeeProxy_NotProxyAdmin");
    });

    it("reverts when registering duplicate version", async function () {
      const { versioned, proxyAdmin, implV2 } = await loadFixture(deployFixture);
      await expect(
        versioned.connect(proxyAdmin).registerVersion(V2, await implV2.getAddress()),
      ).to.be.revertedWithCustomError(versioned, "VersionedFeeProxy_VersionExists");
    });

    it("reverts when registering with zero version or non-contract impl", async function () {
      const { versioned, proxyAdmin, nonAdmin } = await loadFixture(deployFixture);
      const v3Addr = await deployV3Impl();
      await expect(
        versioned.connect(proxyAdmin).registerVersion(ethers.ZeroHash, v3Addr),
      ).to.be.revertedWithCustomError(versioned, "VersionedFeeProxy_InvalidVersion");
      await expect(
        versioned.connect(proxyAdmin).registerVersion(V3, nonAdmin.address),
      ).to.be.revertedWithCustomError(versioned, "VersionedFeeProxy_InvalidImplementation");
    });

    it("setDefaultVersion reverts for unknown version", async function () {
      const { versioned, proxyAdmin } = await loadFixture(deployFixture);
      await expect(
        versioned.connect(proxyAdmin).setDefaultVersion(V3),
      ).to.be.revertedWithCustomError(versioned, "VersionedFeeProxy_VersionNotFound");
    });

    it("removeVersion removes a non-default version", async function () {
      const { versioned, proxyAdmin } = await loadFixture(deployFixture);
      const v3Addr = await deployV3Impl();
      await versioned.connect(proxyAdmin).registerVersion(V3, v3Addr);

      await expect(versioned.connect(proxyAdmin).removeVersion(V3))
        .to.emit(versioned, "VersionRemoved")
        .withArgs(V3);
      expect(await versioned.getVersions()).to.deep.equal([V2]);
      expect(await versioned.getImplementation(V3)).to.equal(ethers.ZeroAddress);
    });

    it("removeVersion reverts when the target is the default", async function () {
      const { versioned, proxyAdmin } = await loadFixture(deployFixture);
      await expect(
        versioned.connect(proxyAdmin).removeVersion(V2),
      ).to.be.revertedWithCustomError(versioned, "VersionedFeeProxy_CannotRemoveDefault");
    });

    it("removeVersion reverts for unknown version", async function () {
      const { versioned, proxyAdmin } = await loadFixture(deployFixture);
      await expect(
        versioned.connect(proxyAdmin).removeVersion(V3),
      ).to.be.revertedWithCustomError(versioned, "VersionedFeeProxy_VersionNotFound");
    });

    it("setDefaultVersion is a no-op when already set", async function () {
      const { versioned, proxyAdmin } = await loadFixture(deployFixture);
      // Already V2 at deploy
      await expect(versioned.connect(proxyAdmin).setDefaultVersion(V2)).not.to.emit(
        versioned,
        "DefaultVersionChanged",
      );
    });
  });

  // ============ Fallback routing (default version UX) ============

  describe("Fallback routing", function () {
    it("routes V2 logic calls to the default version", async function () {
      const { proxyAsV2, user } = await loadFixture(deployFixture);
      const termId = ethers.zeroPadValue("0x01", 32);
      const total = await proxyAsV2.getTotalDepositCost(ethers.parseEther("1"));
      await proxyAsV2.connect(user).deposit(termId, 1n, 0n, { value: total });
      expect(await proxyAsV2.accumulatedFees()).to.be.gt(0n);
    });

    it("picks up the new default after switchover", async function () {
      const { versioned, proxyAsV2, proxyAddress, proxyAdmin } = await loadFixture(deployFixture);
      const v3Addr = await deployV3Impl();

      await versioned.connect(proxyAdmin).registerVersion(V3, v3Addr);
      await versioned.connect(proxyAdmin).setDefaultVersion(V3);

      // V3 inherits from V2 and adds version(); after switchover the fallback
      // should expose it.
      const asV3 = await ethers.getContractAt("IntuitionFeeProxyV3Mock", proxyAddress);
      expect(await asV3.version()).to.equal("v3-mock");
      // V2 reads still work because storage layout is shared
      expect(await proxyAsV2.depositFixedFee()).to.equal(DEPOSIT_FEE);
    });

    it("rejects direct ETH transfers (no receive())", async function () {
      const { versioned, user, proxyAddress } = await loadFixture(deployFixture);
      await expect(
        user.sendTransaction({ to: proxyAddress, value: ethers.parseEther("1") }),
      ).to.be.reverted;
      versioned; // silence unused
    });
  });

  // ============ executeAtVersion ============

  describe("executeAtVersion", function () {
    it("executes a view function against a pinned version", async function () {
      const { versioned, proxyAdmin, implV2, proxyAddress } = await loadFixture(deployFixture);
      const callData = implV2.interface.encodeFunctionData("depositFixedFee");

      // Pin to the V2 version explicitly
      const res = await versioned.executeAtVersion.staticCall(V2, callData);
      const decoded = ethers.AbiCoder.defaultAbiCoder().decode(["uint256"], res);
      expect(decoded[0]).to.equal(DEPOSIT_FEE);

      proxyAdmin; proxyAddress; // touch
    });

    it("reverts for unknown version", async function () {
      const { versioned } = await loadFixture(deployFixture);
      await expect(
        versioned.executeAtVersion(V2_1, "0x"),
      ).to.be.revertedWithCustomError(versioned, "VersionedFeeProxy_VersionNotFound");
    });

    it("pins to an old version after the default has moved", async function () {
      const { versioned, proxyAsV2, proxyAdmin, implV2, proxyAddress } =
        await loadFixture(deployFixture);
      const v3Addr = await deployV3Impl();

      await versioned.connect(proxyAdmin).registerVersion(V3, v3Addr);
      await versioned.connect(proxyAdmin).setDefaultVersion(V3);

      // Even after default moved, calling V2 via executeAtVersion works.
      const callData = implV2.interface.encodeFunctionData("depositFixedFee");
      const res = await versioned.executeAtVersion.staticCall(V2, callData);
      const [fee] = ethers.AbiCoder.defaultAbiCoder().decode(["uint256"], res);
      expect(fee).to.equal(DEPOSIT_FEE);
      proxyAsV2; proxyAddress; // touch
    });

    it("bubbles up revert reason from the implementation", async function () {
      const { versioned, proxyAsV2 } = await loadFixture(deployFixture);
      // Encode a call that will revert inside the impl:
      // deposit() with value=0 → InsufficientValue
      const callData = proxyAsV2.interface.encodeFunctionData("deposit", [
        ethers.zeroPadValue("0x01", 32),
        1n,
        0n,
      ]);
      await expect(
        versioned.executeAtVersion(V2, callData, { value: 0n }),
      ).to.be.revertedWithCustomError(proxyAsV2, "IntuitionFeeProxy_InsufficientValue");
    });
  });

  // ============ transferProxyAdmin ============

  describe("transferProxyAdmin", function () {
    it("transfers admin and old admin loses powers", async function () {
      const { versioned, proxyAdmin, newAdmin } = await loadFixture(deployFixture);
      const v3Addr = await deployV3Impl();

      await expect(versioned.connect(proxyAdmin).transferProxyAdmin(newAdmin.address))
        .to.emit(versioned, "ProxyAdminTransferred")
        .withArgs(proxyAdmin.address, newAdmin.address);
      expect(await versioned.proxyAdmin()).to.equal(newAdmin.address);

      // Old admin reverts
      await expect(
        versioned.connect(proxyAdmin).registerVersion(V3, v3Addr),
      ).to.be.revertedWithCustomError(versioned, "VersionedFeeProxy_NotProxyAdmin");

      // New admin can act
      await expect(versioned.connect(newAdmin).registerVersion(V3, v3Addr))
        .to.emit(versioned, "VersionRegistered")
        .withArgs(V3, v3Addr);
    });

    it("reverts on zero address", async function () {
      const { versioned, proxyAdmin } = await loadFixture(deployFixture);
      await expect(
        versioned.connect(proxyAdmin).transferProxyAdmin(ethers.ZeroAddress),
      ).to.be.revertedWithCustomError(versioned, "IntuitionFeeProxy_ZeroAddress");
    });

    it("non-admin cannot transfer", async function () {
      const { versioned, nonAdmin, newAdmin } = await loadFixture(deployFixture);
      await expect(
        versioned.connect(nonAdmin).transferProxyAdmin(newAdmin.address),
      ).to.be.revertedWithCustomError(versioned, "VersionedFeeProxy_NotProxyAdmin");
    });
  });
});
