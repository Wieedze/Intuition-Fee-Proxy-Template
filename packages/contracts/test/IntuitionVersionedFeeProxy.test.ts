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
      ethers.ZeroHash,
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
        VersionedFactory.deploy(ethers.ZeroAddress, V2, await implV2.getAddress(), "0x", ethers.ZeroHash),
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
          ethers.ZeroHash,
        ),
      ).to.be.revertedWithCustomError(VersionedFactory, "VersionedFeeProxy_InvalidVersion");
    });

    it("reverts on EOA implementation", async function () {
      const [, , , , , , eoa] = await ethers.getSigners();
      const VersionedFactory = await ethers.getContractFactory("IntuitionVersionedFeeProxy");
      await expect(
        VersionedFactory.deploy(eoa.address, V2, eoa.address, "0x", ethers.ZeroHash),
      ).to.be.revertedWithCustomError(VersionedFactory, "VersionedFeeProxy_InvalidImplementation");
    });

    it("bubbles up initializer revert", async function () {
      const { proxyAdmin, mv } = await loadFixture(deployFixture);
      const ImplFactory = await ethers.getContractFactory("IntuitionFeeProxyV2");
      const impl = await ImplFactory.deploy();
      const badInit = impl.interface.encodeFunctionData("initialize", [
        await mv.getAddress(),
        DEPOSIT_FEE,
        1001n, // > MAX (1000 = 10%)
        [proxyAdmin.address],
      ]);
      const VersionedFactory = await ethers.getContractFactory("IntuitionVersionedFeeProxy");
      await expect(
        VersionedFactory.deploy(proxyAdmin.address, V2, await impl.getAddress(), badInit, ethers.ZeroHash),
      ).to.be.revertedWithCustomError(impl, "IntuitionFeeProxy_FeePercentageTooHigh");
    });

    it("reverts on empty initData even when admin/version/impl are valid", async function () {
      // F9 guard: a direct deploy without initData would leave the impl
      // storage uninitialized, letting anyone front-run an
      // `executeAtVersion(v, initialize_calldata)` call to seize first-admin.
      const { proxyAdmin, implV2 } = await loadFixture(deployFixture);
      const VersionedFactory = await ethers.getContractFactory("IntuitionVersionedFeeProxy");
      await expect(
        VersionedFactory.deploy(
          proxyAdmin.address,
          V2,
          await implV2.getAddress(),
          "0x",
          ethers.ZeroHash,
        ),
      ).to.be.revertedWithCustomError(VersionedFactory, "VersionedFeeProxy_InvalidImplementation");
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

    it("registerVersion rejects a sponsored impl on a standard-family proxy (StorageLayoutMismatch)", async function () {
      const { versioned, proxyAdmin } = await loadFixture(deployFixture);
      const SponsoredFactory = await ethers.getContractFactory("IntuitionFeeProxyV2Sponsored");
      const sponsoredImpl = await SponsoredFactory.deploy();
      await sponsoredImpl.waitForDeployment();
      await expect(
        versioned
          .connect(proxyAdmin)
          .registerVersion(
            ethers.encodeBytes32String("wrong-family"),
            await sponsoredImpl.getAddress(),
          ),
      ).to.be.revertedWithCustomError(versioned, "VersionedFeeProxy_StorageLayoutMismatch");
    });

    it("registerVersion rejects an impl without STORAGE_COMPAT_ID getter (legacy)", async function () {
      const { versioned, proxyAdmin, mv } = await loadFixture(deployFixture);
      // MockMultiVault has no STORAGE_COMPAT_ID — stands in for any legacy
      // contract or non-V2-family impl.
      await expect(
        versioned
          .connect(proxyAdmin)
          .registerVersion(
            ethers.encodeBytes32String("legacy"),
            await mv.getAddress(),
          ),
      ).to.be.revertedWithCustomError(versioned, "VersionedFeeProxy_StorageLayoutMismatch");
    });

    it("registerVersion accepts a same-family derivative (V2 → V3Mock)", async function () {
      const { versioned, proxyAdmin } = await loadFixture(deployFixture);
      const v3Addr = await deployV3Impl();
      await expect(
        versioned
          .connect(proxyAdmin)
          .registerVersion(ethers.encodeBytes32String("v3"), v3Addr),
      ).to.emit(versioned, "VersionRegistered");
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
      await proxyAsV2.connect(user).deposit(termId, 1n, 0n, 1000n, ethers.parseEther("10"), { value: total });
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

  // ============ EIP-1967 mirror (tooling compat) ============

  describe("EIP-1967 implementation slot mirror", function () {
    const EIP1967_IMPL_SLOT =
      "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";

    const slotToAddress = (slotValue: string): string =>
      ethers.getAddress("0x" + slotValue.slice(-40));

    it("constructor writes the initial impl into the EIP-1967 slot", async function () {
      const { proxyAddress, implV2 } = await loadFixture(deployFixture);
      const raw = await ethers.provider.getStorage(proxyAddress, EIP1967_IMPL_SLOT);
      expect(slotToAddress(raw)).to.equal(await implV2.getAddress());
    });

    it("constructor emits Upgraded(initialImpl)", async function () {
      const { proxyAddress, implV2 } = await loadFixture(deployFixture);
      // The deployFixture already deployed the proxy — read its deploy tx's logs
      // and confirm the Upgraded event fired with the initialImpl address.
      const proxyContract = await ethers.getContractAt(
        "IntuitionVersionedFeeProxy",
        proxyAddress,
      );
      const iface = proxyContract.interface;
      const upgradedTopic = iface.getEvent("Upgraded")!.topicHash;
      const logs = await ethers.provider.getLogs({
        address: proxyAddress,
        fromBlock: 0,
        topics: [upgradedTopic],
      });
      expect(logs.length).to.be.greaterThan(0);
      const parsed = iface.parseLog({ topics: [...logs[0].topics], data: logs[0].data });
      expect(parsed!.args.implementation).to.equal(await implV2.getAddress());
    });

    it("setDefaultVersion updates the EIP-1967 slot + emits Upgraded", async function () {
      const { versioned, proxyAddress, proxyAdmin } = await loadFixture(deployFixture);
      const v3Addr = await deployV3Impl();
      await versioned.connect(proxyAdmin).registerVersion(V3, v3Addr);

      await expect(versioned.connect(proxyAdmin).setDefaultVersion(V3))
        .to.emit(versioned, "Upgraded")
        .withArgs(v3Addr);

      const raw = await ethers.provider.getStorage(proxyAddress, EIP1967_IMPL_SLOT);
      expect(slotToAddress(raw)).to.equal(v3Addr);
    });

    it("setDefaultVersion is a no-op when already set — does NOT re-emit Upgraded", async function () {
      const { versioned, proxyAdmin } = await loadFixture(deployFixture);
      await expect(versioned.connect(proxyAdmin).setDefaultVersion(V2))
        .to.not.emit(versioned, "Upgraded");
    });

    it("ERC-7201 mapping remains the authoritative source (routing unchanged)", async function () {
      const { versioned, proxyAsV2, proxyAdmin } = await loadFixture(deployFixture);
      const v3Addr = await deployV3Impl();
      await versioned.connect(proxyAdmin).registerVersion(V3, v3Addr);
      await versioned.connect(proxyAdmin).setDefaultVersion(V3);

      // Internal state query via ERC-7201 getter still works + matches.
      expect(await versioned.getImplementation(V3)).to.equal(v3Addr);
      // Routing via fallback reaches V3 (depositFixedFee still readable via inherited V2 layout).
      expect(await proxyAsV2.depositFixedFee()).to.equal(DEPOSIT_FEE);
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
        1000n,
        ethers.parseEther("10"),
      ]);
      await expect(
        versioned.executeAtVersion(V2, callData, { value: 0n }),
      ).to.be.revertedWithCustomError(proxyAsV2, "IntuitionFeeProxy_InsufficientValue");
    });
  });

  // ============ ERC-165 ============

  describe("ERC-165 supportsInterface", function () {
    const ERC165_ID = "0x01ffc9a7";

    it("returns true for ERC-165", async function () {
      const { versioned } = await loadFixture(deployFixture);
      expect(await versioned.supportsInterface(ERC165_ID)).to.be.true;
    });

    it("returns true for IIntuitionVersionedFeeProxy", async function () {
      const { versioned } = await loadFixture(deployFixture);
      // Compute the interface id by XOR'ing all function selectors of the interface.
      const iface = versioned.interface;
      // Pick the canonical selectors from the interface fragments
      const selectors = [
        "registerVersion(bytes32,address)",
        "removeVersion(bytes32)",
        "setDefaultVersion(bytes32)",
        "transferProxyAdmin(address)",
        "acceptProxyAdmin()",
        "setName(bytes32)",
        "getImplementation(bytes32)",
        "getDefaultVersion()",
        "getVersions()",
        "proxyAdmin()",
        "pendingProxyAdmin()",
        "getName()",
        "executeAtVersion(bytes32,bytes)",
      ];
      let id = 0n;
      for (const sig of selectors) {
        const sel = BigInt(ethers.id(sig).slice(0, 10));
        id ^= sel;
      }
      const interfaceId = "0x" + id.toString(16).padStart(8, "0");
      expect(await versioned.supportsInterface(interfaceId)).to.be.true;
    });

    it("returns false for a random / unrelated interfaceId", async function () {
      const { versioned } = await loadFixture(deployFixture);
      expect(await versioned.supportsInterface("0xdeadbeef")).to.be.false;
    });
  });

  // ============ transferProxyAdmin ============

  describe("transferProxyAdmin", function () {
    it("2-step transfer: pending is set, accept finalises, old admin loses powers", async function () {
      const { versioned, proxyAdmin, newAdmin } = await loadFixture(deployFixture);
      const v3Addr = await deployV3Impl();

      // Step 1 — current admin initiates transfer (pending only)
      await expect(versioned.connect(proxyAdmin).transferProxyAdmin(newAdmin.address))
        .to.emit(versioned, "ProxyAdminTransferStarted")
        .withArgs(proxyAdmin.address, newAdmin.address);
      expect(await versioned.proxyAdmin()).to.equal(proxyAdmin.address);
      expect(await versioned.pendingProxyAdmin()).to.equal(newAdmin.address);

      // Before acceptance: old admin still has powers
      await expect(versioned.connect(proxyAdmin).registerVersion(V3, v3Addr))
        .to.emit(versioned, "VersionRegistered")
        .withArgs(V3, v3Addr);
      // And new admin cannot yet act
      await expect(
        versioned.connect(newAdmin).registerVersion(ethers.encodeBytes32String("v99"), v3Addr),
      ).to.be.revertedWithCustomError(versioned, "VersionedFeeProxy_NotProxyAdmin");

      // Step 2 — pending admin accepts
      await expect(versioned.connect(newAdmin).acceptProxyAdmin())
        .to.emit(versioned, "ProxyAdminTransferred")
        .withArgs(proxyAdmin.address, newAdmin.address);
      expect(await versioned.proxyAdmin()).to.equal(newAdmin.address);
      expect(await versioned.pendingProxyAdmin()).to.equal(ethers.ZeroAddress);

      // Old admin now reverts
      await expect(
        versioned.connect(proxyAdmin).registerVersion(ethers.encodeBytes32String("v100"), v3Addr),
      ).to.be.revertedWithCustomError(versioned, "VersionedFeeProxy_NotProxyAdmin");
    });

    it("transferProxyAdmin reverts on zero address", async function () {
      const { versioned, proxyAdmin } = await loadFixture(deployFixture);
      await expect(
        versioned.connect(proxyAdmin).transferProxyAdmin(ethers.ZeroAddress),
      ).to.be.revertedWithCustomError(versioned, "IntuitionFeeProxy_ZeroAddress");
    });

    it("non-admin cannot initiate transfer", async function () {
      const { versioned, nonAdmin, newAdmin } = await loadFixture(deployFixture);
      await expect(
        versioned.connect(nonAdmin).transferProxyAdmin(newAdmin.address),
      ).to.be.revertedWithCustomError(versioned, "VersionedFeeProxy_NotProxyAdmin");
    });

    it("acceptProxyAdmin reverts when called by non-pending address", async function () {
      const { versioned, proxyAdmin, newAdmin, nonAdmin } = await loadFixture(deployFixture);

      // No pending admin yet → anyone should revert
      await expect(
        versioned.connect(newAdmin).acceptProxyAdmin(),
      ).to.be.revertedWithCustomError(versioned, "VersionedFeeProxy_NotPendingProxyAdmin");

      // After transferProxyAdmin, only `newAdmin` can accept
      await versioned.connect(proxyAdmin).transferProxyAdmin(newAdmin.address);
      await expect(
        versioned.connect(nonAdmin).acceptProxyAdmin(),
      ).to.be.revertedWithCustomError(versioned, "VersionedFeeProxy_NotPendingProxyAdmin");
      await expect(
        versioned.connect(proxyAdmin).acceptProxyAdmin(),
      ).to.be.revertedWithCustomError(versioned, "VersionedFeeProxy_NotPendingProxyAdmin");
    });

    it("transferProxyAdmin overwrites a pending candidate", async function () {
      const { versioned, proxyAdmin, newAdmin, nonAdmin } = await loadFixture(deployFixture);
      await versioned.connect(proxyAdmin).transferProxyAdmin(newAdmin.address);
      expect(await versioned.pendingProxyAdmin()).to.equal(newAdmin.address);

      await versioned.connect(proxyAdmin).transferProxyAdmin(nonAdmin.address);
      expect(await versioned.pendingProxyAdmin()).to.equal(nonAdmin.address);

      // Old pending can no longer accept
      await expect(
        versioned.connect(newAdmin).acceptProxyAdmin(),
      ).to.be.revertedWithCustomError(versioned, "VersionedFeeProxy_NotPendingProxyAdmin");
    });
  });

  // ============ Name ============

  describe("name", function () {
    it("initializes to zero when no initialName is provided", async function () {
      const { versioned } = await loadFixture(deployFixture);
      expect(await versioned.getName()).to.equal(ethers.ZeroHash);
    });

    it("emits NameChanged on constructor when initialName is non-zero", async function () {
      const { proxyAdmin, implV2, mv } = await loadFixture(deployFixture);
      const initData = implV2.interface.encodeFunctionData("initialize", [
        await mv.getAddress(),
        0n,
        0n,
        [proxyAdmin.address],
      ]);
      const VersionedFactory = await ethers.getContractFactory("IntuitionVersionedFeeProxy");
      const NAME = ethers.encodeBytes32String("My DAO Fees");
      const deployed = await VersionedFactory.deploy(
        proxyAdmin.address,
        V2,
        await implV2.getAddress(),
        initData,
        NAME,
      );
      await deployed.waitForDeployment();
      const deployTx = deployed.deploymentTransaction();
      await expect(deployTx)
        .to.emit(deployed, "NameChanged")
        .withArgs(ethers.ZeroHash, NAME);
      const typed = (await ethers.getContractAt(
        "IntuitionVersionedFeeProxy",
        await deployed.getAddress(),
      )) as unknown as IntuitionVersionedFeeProxy;
      expect(await typed.getName()).to.equal(NAME);
    });

    it("proxyAdmin can set a new name", async function () {
      const { versioned, proxyAdmin } = await loadFixture(deployFixture);
      const NAME = ethers.encodeBytes32String("Renamed Proxy");
      await expect(versioned.connect(proxyAdmin).setName(NAME))
        .to.emit(versioned, "NameChanged")
        .withArgs(ethers.ZeroHash, NAME);
      expect(await versioned.getName()).to.equal(NAME);
    });

    it("proxyAdmin can clear the name with bytes32(0)", async function () {
      const { versioned, proxyAdmin } = await loadFixture(deployFixture);
      const NAME = ethers.encodeBytes32String("x");
      await versioned.connect(proxyAdmin).setName(NAME);
      await expect(versioned.connect(proxyAdmin).setName(ethers.ZeroHash))
        .to.emit(versioned, "NameChanged")
        .withArgs(NAME, ethers.ZeroHash);
      expect(await versioned.getName()).to.equal(ethers.ZeroHash);
    });

    it("setName is a no-op (no event) when the new name equals the old one", async function () {
      const { versioned, proxyAdmin } = await loadFixture(deployFixture);
      const NAME = ethers.encodeBytes32String("Same");
      await versioned.connect(proxyAdmin).setName(NAME);
      await expect(
        versioned.connect(proxyAdmin).setName(NAME),
      ).to.not.emit(versioned, "NameChanged");
    });

    it("non-admin cannot setName", async function () {
      const { versioned, nonAdmin } = await loadFixture(deployFixture);
      await expect(
        versioned.connect(nonAdmin).setName(ethers.encodeBytes32String("pwn")),
      ).to.be.revertedWithCustomError(versioned, "VersionedFeeProxy_NotProxyAdmin");
    });
  });
});
