import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import {
  IntuitionFeeProxyV2,
  MockMultiVault,
} from "../typechain-types";

describe("IntuitionFeeProxyV2", function () {
  const DEPOSIT_FEE = ethers.parseEther("0.1"); // 0.1 TRUST fixed
  const DEPOSIT_PERCENTAGE = 500n; // 5%
  const FEE_DENOMINATOR = 10000n;

  const INITIAL_VERSION = ethers.encodeBytes32String("v2.0.0");

  async function deployFixture() {
    const [deployer, admin1, admin2, admin3, user, nonAdmin, withdrawTo] =
      await ethers.getSigners();

    const MockMultiVaultFactory = await ethers.getContractFactory("MockMultiVault");
    const mockMultiVault = (await MockMultiVaultFactory.deploy()) as unknown as MockMultiVault;
    await mockMultiVault.waitForDeployment();

    const ImplFactory = await ethers.getContractFactory("IntuitionFeeProxyV2");
    const impl = await ImplFactory.deploy();
    await impl.waitForDeployment();

    const initData = impl.interface.encodeFunctionData("initialize", [
      await mockMultiVault.getAddress(),
      DEPOSIT_FEE,
      DEPOSIT_PERCENTAGE,
      [admin1.address, admin2.address, admin3.address],
    ]);

    // Deploy the versioned proxy (ERC-7936) pointing at the V2 impl and
    // delegating the initializer call on deployment.
    const VersionedFactory = await ethers.getContractFactory("IntuitionVersionedFeeProxy");
    const proxyDeployment = await VersionedFactory.deploy(
      admin1.address,          // proxy-admin = first admin in V2 admins list
      INITIAL_VERSION,
      await impl.getAddress(),
      initData,
    );
    await proxyDeployment.waitForDeployment();

    const proxy = (await ethers.getContractAt(
      "IntuitionFeeProxyV2",
      await proxyDeployment.getAddress()
    )) as unknown as IntuitionFeeProxyV2;

    return {
      deployer,
      admin1,
      admin2,
      admin3,
      user,
      nonAdmin,
      withdrawTo,
      impl,
      mockMultiVault,
      proxy,
      proxyAddress: await proxyDeployment.getAddress(),
    };
  }

  // ============ Initialization ============

  describe("Initialization", function () {
    it("sets MultiVault, fees and admin whitelist", async function () {
      const { proxy, mockMultiVault, admin1, admin2, admin3 } =
        await loadFixture(deployFixture);

      expect(await proxy.ethMultiVault()).to.equal(await mockMultiVault.getAddress());
      expect(await proxy.depositFixedFee()).to.equal(DEPOSIT_FEE);
      expect(await proxy.depositPercentageFee()).to.equal(DEPOSIT_PERCENTAGE);
      expect(await proxy.whitelistedAdmins(admin1.address)).to.be.true;
      expect(await proxy.whitelistedAdmins(admin2.address)).to.be.true;
      expect(await proxy.whitelistedAdmins(admin3.address)).to.be.true;
      expect(await proxy.adminCount()).to.equal(3n);
      expect(await proxy.accumulatedFees()).to.equal(0n);
      expect(await proxy.totalFeesCollectedAllTime()).to.equal(0n);
    });

    it("reverts on double initialize", async function () {
      const { proxy, mockMultiVault, admin1 } = await loadFixture(deployFixture);
      await expect(
        proxy.initialize(
          await mockMultiVault.getAddress(),
          DEPOSIT_FEE,
          DEPOSIT_PERCENTAGE,
          [admin1.address]
        )
      ).to.be.revertedWithCustomError(proxy, "InvalidInitialization");
    });

    it("reverts when initializing the implementation directly", async function () {
      const { impl, mockMultiVault, admin1 } = await loadFixture(deployFixture);
      await expect(
        impl.initialize(
          await mockMultiVault.getAddress(),
          DEPOSIT_FEE,
          DEPOSIT_PERCENTAGE,
          [admin1.address]
        )
      ).to.be.revertedWithCustomError(impl, "InvalidInitialization");
    });

    it("reverts on zero MultiVault", async function () {
      const [, admin1] = await ethers.getSigners();
      const ImplFactory = await ethers.getContractFactory("IntuitionFeeProxyV2");
      const impl = await ImplFactory.deploy();
      const initData = impl.interface.encodeFunctionData("initialize", [
        ethers.ZeroAddress,
        DEPOSIT_FEE,
        DEPOSIT_PERCENTAGE,
        [admin1.address],
      ]);
      const VersionedFactory = await ethers.getContractFactory("IntuitionVersionedFeeProxy");
      await expect(
        VersionedFactory.deploy(admin1.address, INITIAL_VERSION, await impl.getAddress(), initData)
      ).to.be.revertedWithCustomError(impl, "IntuitionFeeProxy_InvalidMultiVaultAddress");
    });

    it("reverts when percentage > MAX", async function () {
      const { admin1, mockMultiVault } = await loadFixture(deployFixture);
      const ImplFactory = await ethers.getContractFactory("IntuitionFeeProxyV2");
      const impl = await ImplFactory.deploy();
      const initData = impl.interface.encodeFunctionData("initialize", [
        await mockMultiVault.getAddress(),
        DEPOSIT_FEE,
        10001n,
        [admin1.address],
      ]);
      const VersionedFactory = await ethers.getContractFactory("IntuitionVersionedFeeProxy");
      await expect(
        VersionedFactory.deploy(admin1.address, INITIAL_VERSION, await impl.getAddress(), initData)
      ).to.be.revertedWithCustomError(impl, "IntuitionFeeProxy_FeePercentageTooHigh");
    });

    it("reverts on empty admin list", async function () {
      const { admin1, mockMultiVault } = await loadFixture(deployFixture);
      const ImplFactory = await ethers.getContractFactory("IntuitionFeeProxyV2");
      const impl = await ImplFactory.deploy();
      const initData = impl.interface.encodeFunctionData("initialize", [
        await mockMultiVault.getAddress(),
        DEPOSIT_FEE,
        DEPOSIT_PERCENTAGE,
        [],
      ]);
      const VersionedFactory = await ethers.getContractFactory("IntuitionVersionedFeeProxy");
      await expect(
        VersionedFactory.deploy(admin1.address, INITIAL_VERSION, await impl.getAddress(), initData)
      ).to.be.revertedWithCustomError(impl, "IntuitionFeeProxy_NoAdminsProvided");
    });

    it("reverts when every admin entry is zero", async function () {
      const { admin1, mockMultiVault } = await loadFixture(deployFixture);
      const ImplFactory = await ethers.getContractFactory("IntuitionFeeProxyV2");
      const impl = await ImplFactory.deploy();
      const initData = impl.interface.encodeFunctionData("initialize", [
        await mockMultiVault.getAddress(),
        DEPOSIT_FEE,
        DEPOSIT_PERCENTAGE,
        [ethers.ZeroAddress, ethers.ZeroAddress],
      ]);
      const VersionedFactory = await ethers.getContractFactory("IntuitionVersionedFeeProxy");
      await expect(
        VersionedFactory.deploy(admin1.address, INITIAL_VERSION, await impl.getAddress(), initData)
      ).to.be.revertedWithCustomError(impl, "IntuitionFeeProxy_NoAdminsProvided");
    });

    it("dedupes and skips zero entries in admin list", async function () {
      const [, , , , , , , alice] = await ethers.getSigners();
      const { mockMultiVault } = await loadFixture(deployFixture);
      const ImplFactory = await ethers.getContractFactory("IntuitionFeeProxyV2");
      const impl = await ImplFactory.deploy();
      const initData = impl.interface.encodeFunctionData("initialize", [
        await mockMultiVault.getAddress(),
        DEPOSIT_FEE,
        DEPOSIT_PERCENTAGE,
        [alice.address, ethers.ZeroAddress, alice.address],
      ]);
      const VersionedFactory = await ethers.getContractFactory("IntuitionVersionedFeeProxy");
      const p = await VersionedFactory.deploy(
        alice.address,
        INITIAL_VERSION,
        await impl.getAddress(),
        initData
      );
      const typed = (await ethers.getContractAt(
        "IntuitionFeeProxyV2",
        await p.getAddress()
      )) as unknown as IntuitionFeeProxyV2;
      expect(await typed.adminCount()).to.equal(1n);
      expect(await typed.whitelistedAdmins(alice.address)).to.be.true;
    });
  });

  // ============ Fee calculation helpers ============

  describe("Fee calculation", function () {
    it("calculates deposit fee for a single deposit", async function () {
      const { proxy } = await loadFixture(deployFixture);
      const amt = ethers.parseEther("10");
      const expected = DEPOSIT_FEE + (amt * DEPOSIT_PERCENTAGE) / FEE_DENOMINATOR;
      expect(await proxy.calculateDepositFee(1n, amt)).to.equal(expected);
    });

    it("getTotalDepositCost = amount + fee", async function () {
      const { proxy } = await loadFixture(deployFixture);
      const amt = ethers.parseEther("10");
      const fee = await proxy.calculateDepositFee(1n, amt);
      expect(await proxy.getTotalDepositCost(amt)).to.equal(amt + fee);
    });

    it("getMultiVaultAmountFromValue is the inverse of getTotalDepositCost", async function () {
      const { proxy } = await loadFixture(deployFixture);
      const amt = ethers.parseEther("10");
      const total = await proxy.getTotalDepositCost(amt);
      const mv = await proxy.getMultiVaultAmountFromValue(total);
      expect(mv).to.be.closeTo(amt, 1n);
    });

    it("getMultiVaultAmountFromValue returns 0 if value <= fixedFee", async function () {
      const { proxy } = await loadFixture(deployFixture);
      expect(await proxy.getMultiVaultAmountFromValue(DEPOSIT_FEE)).to.equal(0n);
      expect(await proxy.getMultiVaultAmountFromValue(DEPOSIT_FEE - 1n)).to.equal(0n);
    });
  });

  // ============ Receiver = msg.sender (implicit) ============

  describe("Receiver is implicitly msg.sender", function () {
    it("createAtoms credits msg.sender on MultiVault", async function () {
      const { proxy, mockMultiVault, user } = await loadFixture(deployFixture);

      const data = [ethers.toUtf8Bytes("ipfs://a"), ethers.toUtf8Bytes("ipfs://b")];
      const assets = [ethers.parseEther("0.01"), ethers.parseEther("0.01")];
      const atomCost = await mockMultiVault.getAtomCost();
      const totalDeposit = assets[0] + assets[1];
      const fee = await proxy.calculateDepositFee(2n, totalDeposit);
      const mvCost = atomCost * 2n + totalDeposit;
      const total = fee + mvCost;

      await proxy.connect(user).createAtoms(data, assets, 1n, { value: total });
      expect(await mockMultiVault.lastDepositReceiver()).to.equal(user.address);
    });

    it("deposit passes msg.sender as receiver", async function () {
      const { proxy, mockMultiVault, user } = await loadFixture(deployFixture);
      const termId = ethers.zeroPadValue("0x01", 32);
      const total = await proxy.getTotalDepositCost(ethers.parseEther("1"));
      await proxy.connect(user).deposit(termId, 1n, 0n, { value: total });
      expect(await mockMultiVault.lastDepositReceiver()).to.equal(user.address);
    });

    it("depositBatch credits msg.sender for each term", async function () {
      const { proxy, mockMultiVault, user } = await loadFixture(deployFixture);
      const termIds = [ethers.zeroPadValue("0x01", 32), ethers.zeroPadValue("0x02", 32)];
      const curveIds = [1n, 1n];
      const assets = [ethers.parseEther("1"), ethers.parseEther("2")];
      const minShares = [0n, 0n];
      const totalDeposit = assets[0] + assets[1];
      const fee = await proxy.calculateDepositFee(2n, totalDeposit);

      await proxy.connect(user).depositBatch(termIds, curveIds, assets, minShares, {
        value: fee + totalDeposit,
      });

      expect(await mockMultiVault.getShares(user.address, termIds[0], 1n)).to.equal(assets[0]);
      expect(await mockMultiVault.getShares(user.address, termIds[1], 1n)).to.equal(assets[1]);
    });
  });

  // ============ Fee accumulation (not forwarding) ============

  describe("Fee accumulation", function () {
    it("accumulates fees in the contract instead of forwarding", async function () {
      const { proxy, user } = await loadFixture(deployFixture);
      const termId = ethers.zeroPadValue("0x01", 32);
      const amt = ethers.parseEther("1");
      const total = await proxy.getTotalDepositCost(amt);

      const before = await ethers.provider.getBalance(await proxy.getAddress());
      await proxy.connect(user).deposit(termId, 1n, 0n, { value: total });
      const after = await ethers.provider.getBalance(await proxy.getAddress());

      const fee = await proxy.calculateDepositFee(1n, amt);
      expect(after - before).to.be.closeTo(fee, 1n);
      expect(await proxy.accumulatedFees()).to.be.closeTo(fee, 1n);
      expect(await proxy.totalFeesCollectedAllTime()).to.be.closeTo(fee, 1n);
    });

    it("totalFeesCollectedAllTime is monotonic across withdraws", async function () {
      const { proxy, user, admin1, withdrawTo } = await loadFixture(deployFixture);
      const termId = ethers.zeroPadValue("0x01", 32);
      const total = await proxy.getTotalDepositCost(ethers.parseEther("1"));

      await proxy.connect(user).deposit(termId, 1n, 0n, { value: total });
      const beforeWithdraw = await proxy.totalFeesCollectedAllTime();

      await proxy.connect(admin1).withdrawAll(withdrawTo.address);
      expect(await proxy.accumulatedFees()).to.equal(0n);
      expect(await proxy.totalFeesCollectedAllTime()).to.equal(beforeWithdraw);

      await proxy.connect(user).deposit(termId, 1n, 0n, { value: total });
      expect(await proxy.totalFeesCollectedAllTime()).to.be.gt(beforeWithdraw);
    });

    it("emits FeesCollected and TransactionForwarded with correct operation", async function () {
      const { proxy, user } = await loadFixture(deployFixture);
      const termId = ethers.zeroPadValue("0x01", 32);
      const total = await proxy.getTotalDepositCost(ethers.parseEther("1"));

      await expect(proxy.connect(user).deposit(termId, 1n, 0n, { value: total }))
        .to.emit(proxy, "FeesCollected")
        .and.to.emit(proxy, "TransactionForwarded");
    });

    it("does not accrue fee when all assets are zero in createAtoms", async function () {
      const { proxy, mockMultiVault, user } = await loadFixture(deployFixture);
      const data = [ethers.toUtf8Bytes("ipfs://a")];
      const assets = [0n];
      const atomCost = await mockMultiVault.getAtomCost();

      await proxy.connect(user).createAtoms(data, assets, 1n, { value: atomCost });
      expect(await proxy.accumulatedFees()).to.equal(0n);
    });
  });

  // ============ Withdraw ============

  describe("withdraw / withdrawAll", function () {
    async function fundFixture() {
      const ctx = await loadFixture(deployFixture);
      const termId = ethers.zeroPadValue("0x01", 32);
      const total = await ctx.proxy.getTotalDepositCost(ethers.parseEther("10"));
      await ctx.proxy.connect(ctx.user).deposit(termId, 1n, 0n, { value: total });
      return ctx;
    }

    it("lets an admin withdraw a partial amount to an arbitrary address", async function () {
      const { proxy, admin1, withdrawTo } = await fundFixture();
      const before = await ethers.provider.getBalance(withdrawTo.address);
      const accumulated = await proxy.accumulatedFees();
      const amount = accumulated / 2n;

      await expect(proxy.connect(admin1).withdraw(withdrawTo.address, amount))
        .to.emit(proxy, "FeesWithdrawn")
        .withArgs(withdrawTo.address, amount, admin1.address);

      const after = await ethers.provider.getBalance(withdrawTo.address);
      expect(after - before).to.equal(amount);
      expect(await proxy.accumulatedFees()).to.equal(accumulated - amount);
    });

    it("withdrawAll empties accumulatedFees and pays recipient", async function () {
      const { proxy, admin2, withdrawTo } = await fundFixture();
      const accumulated = await proxy.accumulatedFees();
      const before = await ethers.provider.getBalance(withdrawTo.address);

      await expect(proxy.connect(admin2).withdrawAll(withdrawTo.address))
        .to.emit(proxy, "FeesWithdrawn")
        .withArgs(withdrawTo.address, accumulated, admin2.address);

      expect(await proxy.accumulatedFees()).to.equal(0n);
      const after = await ethers.provider.getBalance(withdrawTo.address);
      expect(after - before).to.equal(accumulated);
    });

    it("reverts for non-admin", async function () {
      const { proxy, nonAdmin, withdrawTo } = await fundFixture();
      await expect(
        proxy.connect(nonAdmin).withdraw(withdrawTo.address, 1n)
      ).to.be.revertedWithCustomError(proxy, "IntuitionFeeProxy_NotWhitelistedAdmin");
      await expect(
        proxy.connect(nonAdmin).withdrawAll(withdrawTo.address)
      ).to.be.revertedWithCustomError(proxy, "IntuitionFeeProxy_NotWhitelistedAdmin");
    });

    it("reverts on zero recipient", async function () {
      const { proxy, admin1 } = await fundFixture();
      await expect(
        proxy.connect(admin1).withdraw(ethers.ZeroAddress, 1n)
      ).to.be.revertedWithCustomError(proxy, "IntuitionFeeProxy_ZeroAddress");
      await expect(
        proxy.connect(admin1).withdrawAll(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(proxy, "IntuitionFeeProxy_ZeroAddress");
    });

    it("reverts on zero amount", async function () {
      const { proxy, admin1, withdrawTo } = await fundFixture();
      await expect(
        proxy.connect(admin1).withdraw(withdrawTo.address, 0n)
      ).to.be.revertedWithCustomError(proxy, "IntuitionFeeProxy_NothingToWithdraw");
    });

    it("withdrawAll reverts when nothing to withdraw", async function () {
      const { proxy, admin1, withdrawTo } = await loadFixture(deployFixture);
      await expect(
        proxy.connect(admin1).withdrawAll(withdrawTo.address)
      ).to.be.revertedWithCustomError(proxy, "IntuitionFeeProxy_NothingToWithdraw");
    });

    it("reverts if amount exceeds accumulatedFees", async function () {
      const { proxy, admin1, withdrawTo } = await fundFixture();
      const accumulated = await proxy.accumulatedFees();
      await expect(
        proxy.connect(admin1).withdraw(withdrawTo.address, accumulated + 1n)
      ).to.be.revertedWithCustomError(proxy, "IntuitionFeeProxy_InsufficientAccumulatedFees");
    });
  });

  // ============ Admin management ============

  describe("setWhitelistedAdmin", function () {
    it("admin can add + remove others", async function () {
      const { proxy, admin1, nonAdmin } = await loadFixture(deployFixture);
      await expect(proxy.connect(admin1).setWhitelistedAdmin(nonAdmin.address, true))
        .to.emit(proxy, "AdminWhitelistUpdated")
        .withArgs(nonAdmin.address, true);
      expect(await proxy.adminCount()).to.equal(4n);

      await expect(proxy.connect(admin1).setWhitelistedAdmin(nonAdmin.address, false))
        .to.emit(proxy, "AdminWhitelistUpdated")
        .withArgs(nonAdmin.address, false);
      expect(await proxy.adminCount()).to.equal(3n);
    });

    it("no-op on identical status (no event, no count change)", async function () {
      const { proxy, admin1 } = await loadFixture(deployFixture);
      const before = await proxy.adminCount();
      await expect(proxy.connect(admin1).setWhitelistedAdmin(admin1.address, true)).not.to.emit(
        proxy,
        "AdminWhitelistUpdated"
      );
      expect(await proxy.adminCount()).to.equal(before);
    });

    it("allows an admin to self-revoke when they are not the last one", async function () {
      const { proxy, admin1 } = await loadFixture(deployFixture);
      await proxy.connect(admin1).setWhitelistedAdmin(admin1.address, false);
      expect(await proxy.whitelistedAdmins(admin1.address)).to.be.false;
      expect(await proxy.adminCount()).to.equal(2n);
    });

    it("forbids the last admin from self-revoking", async function () {
      const { proxy, admin1, admin2, admin3 } = await loadFixture(deployFixture);
      await proxy.connect(admin1).setWhitelistedAdmin(admin2.address, false);
      await proxy.connect(admin1).setWhitelistedAdmin(admin3.address, false);
      expect(await proxy.adminCount()).to.equal(1n);

      await expect(
        proxy.connect(admin1).setWhitelistedAdmin(admin1.address, false)
      ).to.be.revertedWithCustomError(proxy, "IntuitionFeeProxy_LastAdminCannotRevoke");
    });

    it("the last admin can still be revoked by another admin", async function () {
      // Admin2 revokes admin1 (itself last) — but admin2 is still present.
      const { proxy, admin1, admin2, admin3 } = await loadFixture(deployFixture);
      await proxy.connect(admin1).setWhitelistedAdmin(admin3.address, false);
      // 2 admins left. admin2 revokes admin1 — admin2 remains.
      await proxy.connect(admin2).setWhitelistedAdmin(admin1.address, false);
      expect(await proxy.whitelistedAdmins(admin1.address)).to.be.false;
      expect(await proxy.adminCount()).to.equal(1n);
    });

    it("rejects zero address", async function () {
      const { proxy, admin1 } = await loadFixture(deployFixture);
      await expect(
        proxy.connect(admin1).setWhitelistedAdmin(ethers.ZeroAddress, true)
      ).to.be.revertedWithCustomError(proxy, "IntuitionFeeProxy_ZeroAddress");
    });

    it("non-admin cannot change whitelist", async function () {
      const { proxy, nonAdmin } = await loadFixture(deployFixture);
      await expect(
        proxy.connect(nonAdmin).setWhitelistedAdmin(nonAdmin.address, true)
      ).to.be.revertedWithCustomError(proxy, "IntuitionFeeProxy_NotWhitelistedAdmin");
    });
  });

  describe("Fee configuration admin calls", function () {
    it("admin can set fixed fee", async function () {
      const { proxy, admin1 } = await loadFixture(deployFixture);
      const newFee = ethers.parseEther("0.2");
      await expect(proxy.connect(admin1).setDepositFixedFee(newFee))
        .to.emit(proxy, "DepositFixedFeeUpdated")
        .withArgs(DEPOSIT_FEE, newFee);
      expect(await proxy.depositFixedFee()).to.equal(newFee);
    });

    it("admin can set percentage fee, capped at MAX", async function () {
      const { proxy, admin1 } = await loadFixture(deployFixture);
      await proxy.connect(admin1).setDepositPercentageFee(1000n);
      expect(await proxy.depositPercentageFee()).to.equal(1000n);
      await expect(
        proxy.connect(admin1).setDepositPercentageFee(10001n)
      ).to.be.revertedWithCustomError(proxy, "IntuitionFeeProxy_FeePercentageTooHigh");
    });

    it("non-admin cannot set fees", async function () {
      const { proxy, nonAdmin } = await loadFixture(deployFixture);
      await expect(
        proxy.connect(nonAdmin).setDepositFixedFee(1n)
      ).to.be.revertedWithCustomError(proxy, "IntuitionFeeProxy_NotWhitelistedAdmin");
    });
  });

  // ============ No receive() ============

  describe("No receive()", function () {
    it("rejects direct ETH transfers", async function () {
      const { proxy, user } = await loadFixture(deployFixture);
      await expect(
        user.sendTransaction({ to: await proxy.getAddress(), value: ethers.parseEther("1") })
      ).to.be.reverted;
    });
  });

  // ============ Revert paths for payable functions ============

  describe("Payable revert paths", function () {
    it("createAtoms reverts on wrong array lengths", async function () {
      const { proxy, user } = await loadFixture(deployFixture);
      await expect(
        proxy.connect(user).createAtoms(
          [ethers.toUtf8Bytes("a")],
          [ethers.parseEther("1"), ethers.parseEther("1")],
          1n,
          { value: ethers.parseEther("10") }
        )
      ).to.be.revertedWithCustomError(proxy, "IntuitionFeeProxy_WrongArrayLengths");
    });

    it("createAtoms reverts on insufficient value", async function () {
      const { proxy, user } = await loadFixture(deployFixture);
      await expect(
        proxy.connect(user).createAtoms(
          [ethers.toUtf8Bytes("a")],
          [ethers.parseEther("1")],
          1n,
          { value: 1n }
        )
      ).to.be.revertedWithCustomError(proxy, "IntuitionFeeProxy_InsufficientValue");
    });

    it("createTriples reverts on mismatched arrays", async function () {
      const { proxy, user } = await loadFixture(deployFixture);
      await expect(
        proxy.connect(user).createTriples(
          [ethers.zeroPadValue("0x01", 32)],
          [ethers.zeroPadValue("0x02", 32), ethers.zeroPadValue("0x03", 32)],
          [ethers.zeroPadValue("0x04", 32)],
          [0n],
          1n,
          { value: ethers.parseEther("1") }
        )
      ).to.be.revertedWithCustomError(proxy, "IntuitionFeeProxy_WrongArrayLengths");
    });

    it("deposit reverts when value <= fixed fee", async function () {
      const { proxy, user } = await loadFixture(deployFixture);
      const termId = ethers.zeroPadValue("0x01", 32);
      await expect(
        proxy.connect(user).deposit(termId, 1n, 0n, { value: DEPOSIT_FEE })
      ).to.be.revertedWithCustomError(proxy, "IntuitionFeeProxy_InsufficientValue");
    });

    it("depositBatch reverts on mismatched arrays", async function () {
      const { proxy, user } = await loadFixture(deployFixture);
      await expect(
        proxy.connect(user).depositBatch(
          [ethers.zeroPadValue("0x01", 32)],
          [1n, 1n],
          [ethers.parseEther("1")],
          [0n],
          { value: ethers.parseEther("2") }
        )
      ).to.be.revertedWithCustomError(proxy, "IntuitionFeeProxy_WrongArrayLengths");
    });
  });

  // ============ Metrics ============

  describe("Metrics", function () {
    it("initial state is all-zero", async function () {
      const { proxy } = await loadFixture(deployFixture);
      expect(await proxy.totalAtomsCreated()).to.equal(0n);
      expect(await proxy.totalTriplesCreated()).to.equal(0n);
      expect(await proxy.totalDeposits()).to.equal(0n);
      expect(await proxy.totalVolume()).to.equal(0n);
      expect(await proxy.totalUniqueUsers()).to.equal(0n);
      expect(await proxy.lastActivityBlock()).to.equal(0n);
    });

    it("deposit increments totalDeposits / totalVolume / uniqueUsers and sets lastActivityBlock", async function () {
      const { proxy, user } = await loadFixture(deployFixture);
      const termId = ethers.encodeBytes32String("term1");
      const total = ethers.parseEther("1");

      const tx = await proxy.connect(user).deposit(termId, 1n, 0n, { value: total });
      const rc = await tx.wait();

      const multiVaultAmount = (total - DEPOSIT_FEE) * FEE_DENOMINATOR / (FEE_DENOMINATOR + DEPOSIT_PERCENTAGE);
      expect(await proxy.totalDeposits()).to.equal(1n);
      expect(await proxy.totalVolume()).to.equal(multiVaultAmount);
      expect(await proxy.totalUniqueUsers()).to.equal(1n);
      expect(await proxy.totalAtomsCreated()).to.equal(0n);
      expect(await proxy.totalTriplesCreated()).to.equal(0n);
      expect(await proxy.lastActivityBlock()).to.equal(BigInt(rc!.blockNumber));
    });

    it("createAtoms increments totalAtomsCreated + totalDeposits (non-zero assets only)", async function () {
      const { proxy, mockMultiVault, user } = await loadFixture(deployFixture);
      const atomCost = await mockMultiVault.getAtomCost();

      // 3 atoms, 2 with non-zero deposit
      const data = [
        ethers.toUtf8Bytes("atom-a"),
        ethers.toUtf8Bytes("atom-b"),
        ethers.toUtf8Bytes("atom-c"),
      ];
      const assets = [ethers.parseEther("0.5"), 0n, ethers.parseEther("0.3")];
      const totalAssets = assets[0] + assets[1] + assets[2];
      const nonZeroCount = 2n;
      const fee = DEPOSIT_FEE * nonZeroCount + (totalAssets * DEPOSIT_PERCENTAGE) / FEE_DENOMINATOR;
      const value = fee + atomCost * 3n + totalAssets;

      await proxy.connect(user).createAtoms(data, assets, 1n, { value });

      expect(await proxy.totalAtomsCreated()).to.equal(3n);
      expect(await proxy.totalDeposits()).to.equal(nonZeroCount);
      expect(await proxy.totalVolume()).to.equal(totalAssets);
      expect(await proxy.totalUniqueUsers()).to.equal(1n);
    });

    it("createTriples increments totalTriplesCreated", async function () {
      const { proxy, mockMultiVault, user } = await loadFixture(deployFixture);
      const tripleCost = await mockMultiVault.getTripleCost();

      const subjectIds = [ethers.encodeBytes32String("s1"), ethers.encodeBytes32String("s2")];
      const predicateIds = [ethers.encodeBytes32String("p1"), ethers.encodeBytes32String("p2")];
      const objectIds = [ethers.encodeBytes32String("o1"), ethers.encodeBytes32String("o2")];
      const assets = [0n, 0n];
      const value = tripleCost * 2n;

      await proxy.connect(user).createTriples(subjectIds, predicateIds, objectIds, assets, 1n, { value });

      expect(await proxy.totalTriplesCreated()).to.equal(2n);
      expect(await proxy.totalDeposits()).to.equal(0n); // all assets zero
      expect(await proxy.totalUniqueUsers()).to.equal(1n);
    });

    it("depositBatch counts each term as a deposit and sums the volume", async function () {
      const { proxy, user } = await loadFixture(deployFixture);
      const termIds = [ethers.encodeBytes32String("t1"), ethers.encodeBytes32String("t2")];
      const curveIds = [1n, 1n];
      const assets = [ethers.parseEther("0.5"), ethers.parseEther("0.5")];
      const minShares = [0n, 0n];
      const totalDeposit = assets[0] + assets[1];
      const fee = DEPOSIT_FEE * 2n + (totalDeposit * DEPOSIT_PERCENTAGE) / FEE_DENOMINATOR;

      await proxy.connect(user).depositBatch(termIds, curveIds, assets, minShares, {
        value: totalDeposit + fee,
      });

      expect(await proxy.totalDeposits()).to.equal(2n);
      expect(await proxy.totalVolume()).to.equal(totalDeposit);
    });

    it("uniqueUsers counts each address only once across multiple calls", async function () {
      const { proxy, user, admin1 } = await loadFixture(deployFixture);
      const termId = ethers.encodeBytes32String("term1");
      const total = ethers.parseEther("1");

      await proxy.connect(user).deposit(termId, 1n, 0n, { value: total });
      await proxy.connect(user).deposit(termId, 1n, 0n, { value: total });
      expect(await proxy.totalUniqueUsers()).to.equal(1n);

      await proxy.connect(admin1).deposit(termId, 1n, 0n, { value: total });
      expect(await proxy.totalUniqueUsers()).to.equal(2n);
    });

    it("hasInteracted reflects first-touch status", async function () {
      const { proxy, user, admin1 } = await loadFixture(deployFixture);
      expect(await proxy.hasInteracted(user.address)).to.be.false;

      const termId = ethers.encodeBytes32String("term1");
      await proxy.connect(user).deposit(termId, 1n, 0n, { value: ethers.parseEther("1") });

      expect(await proxy.hasInteracted(user.address)).to.be.true;
      expect(await proxy.hasInteracted(admin1.address)).to.be.false;
    });

    it("getMetrics returns the full aggregate tuple", async function () {
      const { proxy, user } = await loadFixture(deployFixture);
      const termId = ethers.encodeBytes32String("term1");
      await proxy.connect(user).deposit(termId, 1n, 0n, { value: ethers.parseEther("1") });

      const m = await proxy.getMetrics();
      expect(m.totalAtomsCreated).to.equal(0n);
      expect(m.totalTriplesCreated).to.equal(0n);
      expect(m.totalDeposits).to.equal(1n);
      expect(m.totalVolume).to.be.gt(0n);
      expect(m.totalUniqueUsers).to.equal(1n);
      expect(m.lastActivityBlock).to.be.gt(0n);
    });

    it("emits MetricsUpdated on every write-path call", async function () {
      const { proxy, user } = await loadFixture(deployFixture);
      const termId = ethers.encodeBytes32String("term1");
      await expect(
        proxy.connect(user).deposit(termId, 1n, 0n, { value: ethers.parseEther("1") })
      ).to.emit(proxy, "MetricsUpdated");
    });
  });
});
