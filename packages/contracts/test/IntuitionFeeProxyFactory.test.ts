import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import {
  IntuitionFeeProxyV2,
  IntuitionFeeProxyFactory,
  MockMultiVault,
} from "../typechain-types";

describe("IntuitionFeeProxyFactory", function () {
  const DEPOSIT_FEE = ethers.parseEther("0.1");
  const DEPOSIT_PERCENTAGE = 500n;

  async function deployFixture() {
    const [factoryOwner, deployerA, deployerB, admin1, admin2, user] =
      await ethers.getSigners();

    const MockMVFactory = await ethers.getContractFactory("MockMultiVault");
    const mv = (await MockMVFactory.deploy()) as unknown as MockMultiVault;
    await mv.waitForDeployment();

    const ImplFactory = await ethers.getContractFactory("IntuitionFeeProxyV2");
    const impl = await ImplFactory.deploy();
    await impl.waitForDeployment();

    const FactoryFactory = await ethers.getContractFactory("IntuitionFeeProxyFactory");
    const factory = (await FactoryFactory.connect(factoryOwner).deploy(
      await impl.getAddress()
    )) as unknown as IntuitionFeeProxyFactory;
    await factory.waitForDeployment();

    return { factoryOwner, deployerA, deployerB, admin1, admin2, user, mv, impl, factory };
  }

  describe("Construction", function () {
    it("sets owner and initial implementation", async function () {
      const { factory, factoryOwner, impl } = await loadFixture(deployFixture);
      expect(await factory.owner()).to.equal(factoryOwner.address);
      expect(await factory.currentImplementation()).to.equal(await impl.getAddress());
    });

    it("rejects zero implementation at deploy", async function () {
      const FactoryFactory = await ethers.getContractFactory("IntuitionFeeProxyFactory");
      await expect(
        FactoryFactory.deploy(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(FactoryFactory, "IntuitionFeeProxyFactory_InvalidImplementation");
    });

    it("rejects EOA as implementation", async function () {
      const [, randomEoa] = await ethers.getSigners();
      const FactoryFactory = await ethers.getContractFactory("IntuitionFeeProxyFactory");
      await expect(
        FactoryFactory.deploy(randomEoa.address)
      ).to.be.revertedWithCustomError(FactoryFactory, "IntuitionFeeProxyFactory_InvalidImplementation");
    });
  });

  describe("createProxy", function () {
    it("deploys and initializes a proxy, emits ProxyCreated, registers it", async function () {
      const { factory, deployerA, admin1, admin2, mv, impl } = await loadFixture(deployFixture);

      const tx = await factory
        .connect(deployerA)
        .createProxy(await mv.getAddress(), DEPOSIT_FEE, DEPOSIT_PERCENTAGE, [
          admin1.address,
          admin2.address,
        ]);
      const receipt = await tx.wait();

      // Extract proxy address from the event
      const log = receipt!.logs.find(
        (l) => "fragment" in l && (l as any).fragment?.name === "ProxyCreated"
      ) as any;
      expect(log, "ProxyCreated event not found").to.exist;
      const proxyAddr: string = log.args.proxy;

      expect(log.args.deployer).to.equal(deployerA.address);
      expect(log.args.implementation).to.equal(await impl.getAddress());
      expect(log.args.ethMultiVault).to.equal(await mv.getAddress());
      expect(log.args.depositFixedFee).to.equal(DEPOSIT_FEE);
      expect(log.args.depositPercentageFee).to.equal(DEPOSIT_PERCENTAGE);

      // Registry
      expect(await factory.isProxyFromFactory(proxyAddr)).to.be.true;
      expect(await factory.allProxiesLength()).to.equal(1n);
      const byA = await factory.getProxiesByDeployer(deployerA.address);
      expect(byA).to.deep.equal([proxyAddr]);

      // Initialized correctly
      const proxy = (await ethers.getContractAt(
        "IntuitionFeeProxyV2",
        proxyAddr
      )) as unknown as IntuitionFeeProxyV2;
      expect(await proxy.ethMultiVault()).to.equal(await mv.getAddress());
      expect(await proxy.depositFixedFee()).to.equal(DEPOSIT_FEE);
      expect(await proxy.depositPercentageFee()).to.equal(DEPOSIT_PERCENTAGE);
      expect(await proxy.whitelistedAdmins(admin1.address)).to.be.true;
      expect(await proxy.whitelistedAdmins(admin2.address)).to.be.true;
      expect(await proxy.adminCount()).to.equal(2n);
    });

    it("tracks proxies per deployer and globally", async function () {
      const { factory, deployerA, deployerB, admin1, mv } = await loadFixture(deployFixture);

      await factory
        .connect(deployerA)
        .createProxy(await mv.getAddress(), DEPOSIT_FEE, DEPOSIT_PERCENTAGE, [admin1.address]);
      await factory
        .connect(deployerA)
        .createProxy(await mv.getAddress(), 0n, 0n, [admin1.address]);
      await factory
        .connect(deployerB)
        .createProxy(await mv.getAddress(), DEPOSIT_FEE, DEPOSIT_PERCENTAGE, [admin1.address]);

      expect(await factory.allProxiesLength()).to.equal(3n);
      expect((await factory.getProxiesByDeployer(deployerA.address)).length).to.equal(2);
      expect((await factory.getProxiesByDeployer(deployerB.address)).length).to.equal(1);
    });

    it("bubbles up initializer revert (e.g. zero MultiVault)", async function () {
      const { factory, deployerA, admin1, impl } = await loadFixture(deployFixture);
      await expect(
        factory
          .connect(deployerA)
          .createProxy(ethers.ZeroAddress, DEPOSIT_FEE, DEPOSIT_PERCENTAGE, [admin1.address])
      ).to.be.revertedWithCustomError(impl, "IntuitionFeeProxy_InvalidMultiVaultAddress");
    });

    it("factory owner is NOT automatically admin of created instances", async function () {
      const { factory, factoryOwner, deployerA, admin1, mv } = await loadFixture(deployFixture);
      const tx = await factory
        .connect(deployerA)
        .createProxy(await mv.getAddress(), DEPOSIT_FEE, DEPOSIT_PERCENTAGE, [admin1.address]);
      const receipt = await tx.wait();
      const log = receipt!.logs.find(
        (l) => "fragment" in l && (l as any).fragment?.name === "ProxyCreated"
      ) as any;
      const proxy = (await ethers.getContractAt(
        "IntuitionFeeProxyV2",
        log.args.proxy
      )) as unknown as IntuitionFeeProxyV2;

      expect(await proxy.whitelistedAdmins(factoryOwner.address)).to.be.false;
      expect(await proxy.whitelistedAdmins(deployerA.address)).to.be.false;
      expect(await proxy.whitelistedAdmins(admin1.address)).to.be.true;
    });

    it("isProxyFromFactory is false for arbitrary addresses", async function () {
      const { factory, user } = await loadFixture(deployFixture);
      expect(await factory.isProxyFromFactory(user.address)).to.be.false;
      expect(await factory.isProxyFromFactory(ethers.ZeroAddress)).to.be.false;
    });
  });

  describe("setImplementation", function () {
    it("owner can update, emits event", async function () {
      const { factory, factoryOwner, impl } = await loadFixture(deployFixture);

      const NewImpl = await ethers.getContractFactory("IntuitionFeeProxyV3Mock");
      const newImpl = await NewImpl.deploy();
      await newImpl.waitForDeployment();

      await expect(factory.connect(factoryOwner).setImplementation(await newImpl.getAddress()))
        .to.emit(factory, "ImplementationUpdated")
        .withArgs(await impl.getAddress(), await newImpl.getAddress());

      expect(await factory.currentImplementation()).to.equal(await newImpl.getAddress());
    });

    it("non-owner cannot update", async function () {
      const { factory, deployerA } = await loadFixture(deployFixture);
      const NewImpl = await ethers.getContractFactory("IntuitionFeeProxyV3Mock");
      const newImpl = await NewImpl.deploy();
      await newImpl.waitForDeployment();

      await expect(
        factory.connect(deployerA).setImplementation(await newImpl.getAddress())
      ).to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");
    });

    it("rejects zero and EOA implementations", async function () {
      const { factory, factoryOwner, user } = await loadFixture(deployFixture);
      await expect(
        factory.connect(factoryOwner).setImplementation(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(factory, "IntuitionFeeProxyFactory_InvalidImplementation");
      await expect(
        factory.connect(factoryOwner).setImplementation(user.address)
      ).to.be.revertedWithCustomError(factory, "IntuitionFeeProxyFactory_InvalidImplementation");
    });

    it("updating impl does not affect existing proxies", async function () {
      const { factory, factoryOwner, deployerA, admin1, mv } = await loadFixture(deployFixture);
      const tx = await factory
        .connect(deployerA)
        .createProxy(await mv.getAddress(), DEPOSIT_FEE, DEPOSIT_PERCENTAGE, [admin1.address]);
      const receipt = await tx.wait();
      const log = receipt!.logs.find(
        (l) => "fragment" in l && (l as any).fragment?.name === "ProxyCreated"
      ) as any;
      const existingProxyAddr: string = log.args.proxy;

      const NewImpl = await ethers.getContractFactory("IntuitionFeeProxyV3Mock");
      const newImpl = await NewImpl.deploy();
      await newImpl.waitForDeployment();
      await factory.connect(factoryOwner).setImplementation(await newImpl.getAddress());

      // Existing instance still exposes V2 ABI (no `version()`); it has its own upgrade path.
      const asV3Mock = await ethers.getContractAt("IntuitionFeeProxyV3Mock", existingProxyAddr);
      await expect(asV3Mock.version()).to.be.reverted;

      // Fresh deploy now uses new impl
      const tx2 = await factory
        .connect(deployerA)
        .createProxy(await mv.getAddress(), DEPOSIT_FEE, DEPOSIT_PERCENTAGE, [admin1.address]);
      const r2 = await tx2.wait();
      const log2 = r2!.logs.find(
        (l) => "fragment" in l && (l as any).fragment?.name === "ProxyCreated"
      ) as any;
      const freshAddr: string = log2.args.proxy;
      const fresh = await ethers.getContractAt("IntuitionFeeProxyV3Mock", freshAddr);
      expect(await fresh.version()).to.equal("v3-mock");
    });
  });
});
