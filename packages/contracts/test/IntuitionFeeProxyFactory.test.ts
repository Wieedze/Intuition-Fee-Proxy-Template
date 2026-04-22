import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import {
  IntuitionFeeProxyFactory,
  IntuitionFeeProxyFactoryV2Mock,
  IntuitionFeeProxyV2,
  IntuitionVersionedFeeProxy,
  MockMultiVault,
} from "../typechain-types";

describe("IntuitionFeeProxyFactory (UUPS)", function () {
  const DEPOSIT_FEE = ethers.parseEther("0.1");
  const DEPOSIT_PERCENTAGE = 500n;
  const V2 = ethers.encodeBytes32String("v2.0.0");

  async function deployFixture() {
    const [factoryOwner, deployerA, deployerB, admin1, admin2, user] =
      await ethers.getSigners();

    // Mock MultiVault
    const MockMV = await ethers.getContractFactory("MockMultiVault");
    const mv = (await MockMV.deploy()) as unknown as MockMultiVault;
    await mv.waitForDeployment();

    // Logic implementation for fee-proxy instances
    const ImplFactory = await ethers.getContractFactory("IntuitionFeeProxyV2");
    const implV2 = await ImplFactory.deploy();
    await implV2.waitForDeployment();

    // Factory implementation
    const FactoryImplFactory = await ethers.getContractFactory("IntuitionFeeProxyFactory");
    const factoryImpl = await FactoryImplFactory.deploy();
    await factoryImpl.waitForDeployment();

    // Deploy the UUPS proxy in front of the factory + initialize
    const initData = factoryImpl.interface.encodeFunctionData("initialize", [
      await implV2.getAddress(),
      V2,
      factoryOwner.address,
    ]);
    const ERC1967ProxyFactory = await ethers.getContractFactory("ERC1967Proxy");
    const factoryProxy = await ERC1967ProxyFactory.deploy(
      await factoryImpl.getAddress(),
      initData,
    );
    await factoryProxy.waitForDeployment();

    const factory = (await ethers.getContractAt(
      "IntuitionFeeProxyFactory",
      await factoryProxy.getAddress(),
    )) as unknown as IntuitionFeeProxyFactory;

    return {
      factoryOwner,
      deployerA,
      deployerB,
      admin1,
      admin2,
      user,
      mv,
      implV2,
      factoryImpl,
      factory,
    };
  }

  // ============ Initialization ============

  describe("Initialization", function () {
    it("sets owner, currentImplementation and currentVersion", async function () {
      const { factory, factoryOwner, implV2 } = await loadFixture(deployFixture);
      expect(await factory.owner()).to.equal(factoryOwner.address);
      expect(await factory.currentImplementation()).to.equal(await implV2.getAddress());
      expect(await factory.currentVersion()).to.equal(V2);
    });

    it("reverts on double initialize", async function () {
      const { factory, factoryOwner, implV2 } = await loadFixture(deployFixture);
      await expect(
        factory.initialize(await implV2.getAddress(), V2, factoryOwner.address),
      ).to.be.revertedWithCustomError(factory, "InvalidInitialization");
    });

    it("reverts on initialize directly on the implementation", async function () {
      const { factoryImpl, factoryOwner, implV2 } = await loadFixture(deployFixture);
      await expect(
        factoryImpl.initialize(await implV2.getAddress(), V2, factoryOwner.address),
      ).to.be.revertedWithCustomError(factoryImpl, "InvalidInitialization");
    });

    it("reverts on zero implementation", async function () {
      const { factoryOwner } = await loadFixture(deployFixture);
      const Fresh = await ethers.getContractFactory("IntuitionFeeProxyFactory");
      const impl = await Fresh.deploy();
      const initData = impl.interface.encodeFunctionData("initialize", [
        ethers.ZeroAddress,
        V2,
        factoryOwner.address,
      ]);
      const ERC1967ProxyFactory = await ethers.getContractFactory("ERC1967Proxy");
      await expect(
        ERC1967ProxyFactory.deploy(await impl.getAddress(), initData),
      ).to.be.revertedWithCustomError(impl, "IntuitionFeeProxyFactory_InvalidImplementation");
    });

    it("reverts on zero version", async function () {
      const { factoryOwner, implV2 } = await loadFixture(deployFixture);
      const Fresh = await ethers.getContractFactory("IntuitionFeeProxyFactory");
      const impl = await Fresh.deploy();
      const initData = impl.interface.encodeFunctionData("initialize", [
        await implV2.getAddress(),
        ethers.ZeroHash,
        factoryOwner.address,
      ]);
      const ERC1967ProxyFactory = await ethers.getContractFactory("ERC1967Proxy");
      await expect(
        ERC1967ProxyFactory.deploy(await impl.getAddress(), initData),
      ).to.be.revertedWithCustomError(impl, "IntuitionFeeProxyFactory_InvalidVersion");
    });
  });

  // ============ createProxy ============

  describe("createProxy", function () {
    it("deploys a VersionedFeeProxy, initializes the V2 logic, registers the registry entry", async function () {
      const { factory, deployerA, admin1, admin2, mv, implV2 } =
        await loadFixture(deployFixture);

      const tx = await factory
        .connect(deployerA)
        .createProxy(
          await mv.getAddress(),
          DEPOSIT_FEE,
          DEPOSIT_PERCENTAGE,
          [admin1.address, admin2.address],
          ethers.ZeroHash,
          0 /* Standard */,
        );
      const receipt = await tx.wait();

      const log = receipt!.logs.find(
        (l: any) => "fragment" in l && l.fragment?.name === "ProxyCreated",
      ) as any;
      expect(log, "ProxyCreated not found").to.exist;
      const proxyAddr: string = log.args.proxy;

      expect(log.args.deployer).to.equal(deployerA.address);
      expect(log.args.implementation).to.equal(await implV2.getAddress());
      expect(log.args.initialVersion).to.equal(V2);
      expect(log.args.ethMultiVault).to.equal(await mv.getAddress());
      expect(log.args.depositFixedFee).to.equal(DEPOSIT_FEE);
      expect(log.args.depositPercentageFee).to.equal(DEPOSIT_PERCENTAGE);

      // Registry
      expect(await factory.isProxyFromFactory(proxyAddr)).to.be.true;
      expect(await factory.allProxiesLength()).to.equal(1n);
      expect(await factory.getProxiesByDeployer(deployerA.address)).to.deep.equal([proxyAddr]);

      // ERC-7936 interface on the deployed proxy
      const versioned = (await ethers.getContractAt(
        "IntuitionVersionedFeeProxy",
        proxyAddr,
      )) as unknown as IntuitionVersionedFeeProxy;
      expect(await versioned.proxyAdmin()).to.equal(admin1.address); // = initialAdmins[0]
      expect(await versioned.getDefaultVersion()).to.equal(V2);
      expect(await versioned.getVersions()).to.deep.equal([V2]);
      expect(await versioned.getImplementation(V2)).to.equal(await implV2.getAddress());

      // V2 logic initialized correctly (via fallback routing)
      const asV2 = (await ethers.getContractAt(
        "IntuitionFeeProxyV2",
        proxyAddr,
      )) as unknown as IntuitionFeeProxyV2;
      expect(await asV2.ethMultiVault()).to.equal(await mv.getAddress());
      expect(await asV2.adminCount()).to.equal(2n);
      expect(await asV2.whitelistedAdmins(admin1.address)).to.be.true;
      expect(await asV2.whitelistedAdmins(admin2.address)).to.be.true;
    });

    it("tracks multiple proxies per deployer and globally", async function () {
      const { factory, deployerA, deployerB, admin1, mv } = await loadFixture(deployFixture);
      await factory
        .connect(deployerA)
        .createProxy(await mv.getAddress(), DEPOSIT_FEE, DEPOSIT_PERCENTAGE, [admin1.address], ethers.ZeroHash, 0 /* Standard */);
      await factory
        .connect(deployerA)
        .createProxy(await mv.getAddress(), 0n, 0n, [admin1.address], ethers.ZeroHash, 0 /* Standard */);
      await factory
        .connect(deployerB)
        .createProxy(await mv.getAddress(), DEPOSIT_FEE, DEPOSIT_PERCENTAGE, [admin1.address], ethers.ZeroHash, 0 /* Standard */);

      expect(await factory.allProxiesLength()).to.equal(3n);
      expect((await factory.getProxiesByDeployer(deployerA.address)).length).to.equal(2);
      expect((await factory.getProxiesByDeployer(deployerB.address)).length).to.equal(1);
    });

    it("bubbles up initializer revert from the logic impl", async function () {
      const { factory, deployerA, admin1, implV2 } = await loadFixture(deployFixture);
      await expect(
        factory
          .connect(deployerA)
          .createProxy(ethers.ZeroAddress, DEPOSIT_FEE, DEPOSIT_PERCENTAGE, [admin1.address], ethers.ZeroHash, 0 /* Standard */),
      ).to.be.revertedWithCustomError(implV2, "IntuitionFeeProxy_InvalidMultiVaultAddress");
    });

    it("factory owner is NOT automatically admin of deployed instances", async function () {
      const { factory, factoryOwner, deployerA, admin1, mv } = await loadFixture(deployFixture);
      const tx = await factory
        .connect(deployerA)
        .createProxy(await mv.getAddress(), DEPOSIT_FEE, DEPOSIT_PERCENTAGE, [admin1.address], ethers.ZeroHash, 0 /* Standard */);
      const receipt = await tx.wait();
      const log = receipt!.logs.find(
        (l: any) => "fragment" in l && l.fragment?.name === "ProxyCreated",
      ) as any;

      const asV2 = (await ethers.getContractAt(
        "IntuitionFeeProxyV2",
        log.args.proxy,
      )) as unknown as IntuitionFeeProxyV2;

      expect(await asV2.whitelistedAdmins(factoryOwner.address)).to.be.false;
      expect(await asV2.whitelistedAdmins(deployerA.address)).to.be.false;
      expect(await asV2.whitelistedAdmins(admin1.address)).to.be.true;
    });
  });

  // ============ setImplementation ============

  describe("setImplementation", function () {
    it("owner can update impl + version, emits event", async function () {
      const { factory, factoryOwner, implV2 } = await loadFixture(deployFixture);
      const Fresh = await ethers.getContractFactory("IntuitionFeeProxyV2");
      const newImpl = await Fresh.deploy();
      await newImpl.waitForDeployment();
      const NEW_V = ethers.encodeBytes32String("v2.1.0");

      await expect(
        factory.connect(factoryOwner).setImplementation(await newImpl.getAddress(), NEW_V),
      )
        .to.emit(factory, "ImplementationUpdated")
        .withArgs(await implV2.getAddress(), await newImpl.getAddress(), V2, NEW_V);

      expect(await factory.currentImplementation()).to.equal(await newImpl.getAddress());
      expect(await factory.currentVersion()).to.equal(NEW_V);
    });

    it("non-owner reverts", async function () {
      const { factory, deployerA, implV2 } = await loadFixture(deployFixture);
      await expect(
        factory.connect(deployerA).setImplementation(await implV2.getAddress(), V2),
      ).to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");
    });

    it("rejects zero impl / EOA / zero version", async function () {
      const { factory, factoryOwner, user, implV2 } = await loadFixture(deployFixture);
      await expect(
        factory.connect(factoryOwner).setImplementation(ethers.ZeroAddress, V2),
      ).to.be.revertedWithCustomError(factory, "IntuitionFeeProxyFactory_InvalidImplementation");
      await expect(
        factory.connect(factoryOwner).setImplementation(user.address, V2),
      ).to.be.revertedWithCustomError(factory, "IntuitionFeeProxyFactory_InvalidImplementation");
      await expect(
        factory
          .connect(factoryOwner)
          .setImplementation(await implV2.getAddress(), ethers.ZeroHash),
      ).to.be.revertedWithCustomError(factory, "IntuitionFeeProxyFactory_InvalidVersion");
    });

    it("updating impl does not affect existing proxies", async function () {
      const { factory, factoryOwner, deployerA, admin1, mv, implV2 } =
        await loadFixture(deployFixture);
      // Deploy one proxy with current impl
      const tx = await factory
        .connect(deployerA)
        .createProxy(await mv.getAddress(), DEPOSIT_FEE, DEPOSIT_PERCENTAGE, [admin1.address], ethers.ZeroHash, 0 /* Standard */);
      const receipt = await tx.wait();
      const log = receipt!.logs.find(
        (l: any) => "fragment" in l && l.fragment?.name === "ProxyCreated",
      ) as any;
      const oldProxyAddr: string = log.args.proxy;

      // Update factory's impl pointer
      const Fresh = await ethers.getContractFactory("IntuitionFeeProxyV2");
      const newImpl = await Fresh.deploy();
      await newImpl.waitForDeployment();
      await factory
        .connect(factoryOwner)
        .setImplementation(await newImpl.getAddress(), ethers.encodeBytes32String("v2.1.0"));

      // Old proxy still points at the original impl
      const oldVersioned = (await ethers.getContractAt(
        "IntuitionVersionedFeeProxy",
        oldProxyAddr,
      )) as unknown as IntuitionVersionedFeeProxy;
      expect(await oldVersioned.getImplementation(V2)).to.equal(await implV2.getAddress());

      // Fresh deploy now uses new impl + version
      const tx2 = await factory
        .connect(deployerA)
        .createProxy(await mv.getAddress(), DEPOSIT_FEE, DEPOSIT_PERCENTAGE, [admin1.address], ethers.ZeroHash, 0 /* Standard */);
      const r2 = await tx2.wait();
      const log2 = r2!.logs.find(
        (l: any) => "fragment" in l && l.fragment?.name === "ProxyCreated",
      ) as any;
      const freshAddr: string = log2.args.proxy;
      const freshVersioned = (await ethers.getContractAt(
        "IntuitionVersionedFeeProxy",
        freshAddr,
      )) as unknown as IntuitionVersionedFeeProxy;
      expect(await freshVersioned.getDefaultVersion()).to.equal(
        ethers.encodeBytes32String("v2.1.0"),
      );
      expect(await freshVersioned.getImplementation(ethers.encodeBytes32String("v2.1.0"))).to.equal(
        await newImpl.getAddress(),
      );
    });
  });

  // ============ Channel family enforcement (H-2) ============

  describe("channel family enforcement", function () {
    it("setImplementation rejects a sponsored impl (ChannelMismatch)", async function () {
      const { factory, factoryOwner } = await loadFixture(deployFixture);
      const SponsoredFactory = await ethers.getContractFactory("IntuitionFeeProxyV2Sponsored");
      const sponsoredImpl = await SponsoredFactory.deploy();
      await sponsoredImpl.waitForDeployment();

      await expect(
        factory
          .connect(factoryOwner)
          .setImplementation(
            await sponsoredImpl.getAddress(),
            ethers.encodeBytes32String("v2.0.0-sponsored"),
          ),
      ).to.be.revertedWithCustomError(factory, "IntuitionFeeProxyFactory_ChannelMismatch");
    });

    it("setSponsoredImplementation rejects a standard V2 impl (ChannelMismatch)", async function () {
      const { factory, factoryOwner, implV2 } = await loadFixture(deployFixture);
      await expect(
        factory
          .connect(factoryOwner)
          .setSponsoredImplementation(
            await implV2.getAddress(),
            ethers.encodeBytes32String("v2.0.0"),
          ),
      ).to.be.revertedWithCustomError(factory, "IntuitionFeeProxyFactory_ChannelMismatch");
    });

    it("setImplementation accepts a standard V2 impl", async function () {
      const { factory, factoryOwner } = await loadFixture(deployFixture);
      const Fresh = await ethers.getContractFactory("IntuitionFeeProxyV2");
      const impl = await Fresh.deploy();
      await impl.waitForDeployment();
      await expect(
        factory
          .connect(factoryOwner)
          .setImplementation(await impl.getAddress(), ethers.encodeBytes32String("v2.1.0")),
      ).to.emit(factory, "ImplementationUpdated");
    });

    it("setSponsoredImplementation accepts a sponsored impl", async function () {
      const { factory, factoryOwner } = await loadFixture(deployFixture);
      const SponsoredFactory = await ethers.getContractFactory("IntuitionFeeProxyV2Sponsored");
      const sponsoredImpl = await SponsoredFactory.deploy();
      await sponsoredImpl.waitForDeployment();
      await expect(
        factory
          .connect(factoryOwner)
          .setSponsoredImplementation(
            await sponsoredImpl.getAddress(),
            ethers.encodeBytes32String("v2.0.0-sponsored"),
          ),
      ).to.emit(factory, "SponsoredImplementationUpdated");
    });

    it("both setters reject impls without a channel() getter (legacy)", async function () {
      const { factory, factoryOwner } = await loadFixture(deployFixture);
      // MockMultiVault doesn't implement channel() — stands in for any
      // contract that isn't a V2-family impl.
      const MockMV = await ethers.getContractFactory("MockMultiVault");
      const legacy = await MockMV.deploy();
      await legacy.waitForDeployment();

      await expect(
        factory
          .connect(factoryOwner)
          .setImplementation(await legacy.getAddress(), ethers.encodeBytes32String("legacy")),
      ).to.be.revertedWithCustomError(factory, "IntuitionFeeProxyFactory_ChannelMismatch");

      await expect(
        factory
          .connect(factoryOwner)
          .setSponsoredImplementation(await legacy.getAddress(), ethers.encodeBytes32String("legacy")),
      ).to.be.revertedWithCustomError(factory, "IntuitionFeeProxyFactory_ChannelMismatch");
    });
  });

  // ============ UUPS upgrade of the factory itself ============

  describe("Factory UUPS upgrade", function () {
    it("owner can upgrade the factory, state preserved, new ABI exposed", async function () {
      const { factory, factoryOwner, implV2 } = await loadFixture(deployFixture);

      const MockFactory = await ethers.getContractFactory("IntuitionFeeProxyFactoryV2Mock");
      const mockImpl = await MockFactory.deploy();
      await mockImpl.waitForDeployment();

      await factory.connect(factoryOwner).upgradeToAndCall(await mockImpl.getAddress(), "0x");

      const upgraded = (await ethers.getContractAt(
        "IntuitionFeeProxyFactoryV2Mock",
        await factory.getAddress(),
      )) as unknown as IntuitionFeeProxyFactoryV2Mock;
      expect(await upgraded.version()).to.equal("factory-v2-mock");
      // State preserved
      expect(await upgraded.currentImplementation()).to.equal(await implV2.getAddress());
      expect(await upgraded.currentVersion()).to.equal(V2);
      expect(await upgraded.owner()).to.equal(factoryOwner.address);
    });

    it("non-owner cannot upgrade", async function () {
      const { factory, deployerA } = await loadFixture(deployFixture);
      const MockFactory = await ethers.getContractFactory("IntuitionFeeProxyFactoryV2Mock");
      const mockImpl = await MockFactory.deploy();
      await mockImpl.waitForDeployment();
      await expect(
        factory.connect(deployerA).upgradeToAndCall(await mockImpl.getAddress(), "0x"),
      ).to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");
    });
  });

  // ============ Name forwarding ============

  describe("name", function () {
    it("forwards the provided name into the deployed proxy", async function () {
      const { factory, mv, deployerA, admin1 } = await loadFixture(deployFixture);
      const NAME = ethers.encodeBytes32String("My DAO Fees");
      const tx = await factory
        .connect(deployerA)
        .createProxy(
          await mv.getAddress(),
          DEPOSIT_FEE,
          DEPOSIT_PERCENTAGE,
          [admin1.address],
          NAME,
          0 /* Standard */,
        );
      const receipt = await tx.wait();
      const log = receipt!.logs.find(
        (l: any) => "fragment" in l && l.fragment?.name === "ProxyCreated",
      ) as any;
      const proxyAddr: string = log.args.proxy;
      const proxy = await ethers.getContractAt(
        "IntuitionVersionedFeeProxy",
        proxyAddr,
      );
      expect(await proxy.getName()).to.equal(NAME);
    });

    it("includes the name in the ProxyCreated event", async function () {
      const { factory, mv, deployerA, admin1 } = await loadFixture(deployFixture);
      const NAME = ethers.encodeBytes32String("Named");
      const tx = factory
        .connect(deployerA)
        .createProxy(
          await mv.getAddress(),
          DEPOSIT_FEE,
          DEPOSIT_PERCENTAGE,
          [admin1.address],
          NAME,
          0 /* Standard */,
        );
      const receipt = await (await tx).wait();
      const log = receipt!.logs.find(
        (l: any) => "fragment" in l && l.fragment?.name === "ProxyCreated",
      ) as any;
      expect(log.args.name).to.equal(NAME);
    });
  });
});
