import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import {
  IntuitionFeeProxyV2Sponsored,
  MockMultiVault,
} from "../typechain-types";

describe("IntuitionFeeProxyV2Sponsored (shared pool model)", function () {
  const DEPOSIT_FEE = ethers.parseEther("0.1");
  const DEPOSIT_PCT = 500n;               // 5%
  const FEE_DENOMINATOR = 10000n;

  const INITIAL_VERSION = ethers.encodeBytes32String("v2.0.0-sponsored");
  const ONE_DAY = 86400;

  async function deployFixture() {
    const [deployer, admin1, admin2, user1, user2, user3, to, nonAdmin] =
      await ethers.getSigners();

    const MvFactory = await ethers.getContractFactory("MockMultiVault");
    const mv = (await MvFactory.deploy()) as unknown as MockMultiVault;
    await mv.waitForDeployment();

    const ImplFactory = await ethers.getContractFactory("IntuitionFeeProxyV2Sponsored");
    const impl = await ImplFactory.deploy();
    await impl.waitForDeployment();

    const initData = impl.interface.encodeFunctionData("initialize", [
      await mv.getAddress(),
      DEPOSIT_FEE,
      DEPOSIT_PCT,
      [admin1.address, admin2.address],
    ]);

    const VerFactory = await ethers.getContractFactory("IntuitionVersionedFeeProxy");
    const vp = await VerFactory.deploy(
      admin1.address,
      INITIAL_VERSION,
      await impl.getAddress(),
      initData,
      ethers.ZeroHash,
    );
    await vp.waitForDeployment();

    const proxy = (await ethers.getContractAt(
      "IntuitionFeeProxyV2Sponsored",
      await vp.getAddress(),
    )) as unknown as IntuitionFeeProxyV2Sponsored;

    return { deployer, admin1, admin2, user1, user2, user3, to, nonAdmin, impl, mv, proxy };
  }

  // ============ Init defaults ============

  describe("initialization defaults", function () {
    it("version() returns the sponsored marker", async function () {
      const { proxy } = await loadFixture(deployFixture);
      expect(await proxy.version()).to.equal("v2.0.0-sponsored");
    });

    it("claim limits default to 1 TRUST / 10 per day", async function () {
      const { proxy } = await loadFixture(deployFixture);
      expect(await proxy.maxClaimPerTx()).to.equal(ethers.parseEther("1"));
      expect(await proxy.maxClaimsPerDay()).to.equal(10n);
    });

    it("pool starts empty", async function () {
      const { proxy } = await loadFixture(deployFixture);
      expect(await proxy.sponsorPool()).to.equal(0n);
    });
  });

  // ============ setClaimLimits ============

  describe("setClaimLimits", function () {
    it("admin can set new limits and emit event", async function () {
      const { proxy, admin1 } = await loadFixture(deployFixture);
      const newMaxPerTx = ethers.parseEther("5");
      const newMaxPerDay = 20n;
      await expect(proxy.connect(admin1).setClaimLimits(newMaxPerTx, newMaxPerDay))
        .to.emit(proxy, "ClaimLimitsSet").withArgs(newMaxPerTx, newMaxPerDay);
      expect(await proxy.maxClaimPerTx()).to.equal(newMaxPerTx);
      expect(await proxy.maxClaimsPerDay()).to.equal(newMaxPerDay);
    });

    it("reverts if any max is zero (no 'unlimited' escape)", async function () {
      const { proxy, admin1 } = await loadFixture(deployFixture);
      await expect(proxy.connect(admin1).setClaimLimits(0, 10n))
        .to.be.revertedWithCustomError(proxy, "Sponsored_InvalidLimit");
      await expect(proxy.connect(admin1).setClaimLimits(ethers.parseEther("1"), 0))
        .to.be.revertedWithCustomError(proxy, "Sponsored_InvalidLimit");
    });

    it("non-admin cannot change limits", async function () {
      const { proxy, nonAdmin } = await loadFixture(deployFixture);
      await expect(proxy.connect(nonAdmin).setClaimLimits(ethers.parseEther("1"), 10n))
        .to.be.revertedWithCustomError(proxy, "IntuitionFeeProxy_NotWhitelistedAdmin");
    });
  });

  // ============ fundPool / reclaimFromPool ============

  describe("fundPool / reclaimFromPool (admin only)", function () {
    it("admin funds the pool; balance updates", async function () {
      const { proxy, admin1 } = await loadFixture(deployFixture);
      const amount = ethers.parseEther("5");
      await expect(proxy.connect(admin1).fundPool({ value: amount }))
        .to.emit(proxy, "PoolFunded").withArgs(amount, admin1.address);
      expect(await proxy.sponsorPool()).to.equal(amount);
    });

    it("non-admin cannot fundPool", async function () {
      const { proxy, nonAdmin } = await loadFixture(deployFixture);
      await expect(
        proxy.connect(nonAdmin).fundPool({ value: ethers.parseEther("1") }),
      ).to.be.revertedWithCustomError(proxy, "IntuitionFeeProxy_NotWhitelistedAdmin");
    });

    it("fundPool reverts on zero msg.value", async function () {
      const { proxy, admin1 } = await loadFixture(deployFixture);
      await expect(proxy.connect(admin1).fundPool({ value: 0 }))
        .to.be.revertedWithCustomError(proxy, "Sponsored_NothingToCredit");
    });

    it("admin reclaims pool to a chosen recipient", async function () {
      const { proxy, admin1, to } = await loadFixture(deployFixture);
      const fund = ethers.parseEther("3");
      await proxy.connect(admin1).fundPool({ value: fund });

      const reclaim = ethers.parseEther("1");
      const balBefore = await ethers.provider.getBalance(to.address);
      await expect(proxy.connect(admin1).reclaimFromPool(reclaim, to.address))
        .to.emit(proxy, "PoolReclaimed").withArgs(reclaim, to.address, admin1.address);
      const balAfter = await ethers.provider.getBalance(to.address);

      expect(balAfter - balBefore).to.equal(reclaim);
      expect(await proxy.sponsorPool()).to.equal(fund - reclaim);
    });

    it("reclaimFromPool reverts when amount exceeds pool", async function () {
      const { proxy, admin1, to } = await loadFixture(deployFixture);
      await proxy.connect(admin1).fundPool({ value: ethers.parseEther("1") });
      await expect(
        proxy.connect(admin1).reclaimFromPool(ethers.parseEther("2"), to.address),
      ).to.be.revertedWithCustomError(proxy, "Sponsored_InsufficientClaim");
    });

    it("non-admin cannot reclaim", async function () {
      const { proxy, admin1, nonAdmin, to } = await loadFixture(deployFixture);
      await proxy.connect(admin1).fundPool({ value: ethers.parseEther("1") });
      await expect(
        proxy.connect(nonAdmin).reclaimFromPool(1, to.address),
      ).to.be.revertedWithCustomError(proxy, "IntuitionFeeProxy_NotWhitelistedAdmin");
    });
  });

  // ============ deposit consumes pool (D1) ============

  describe("deposit consumes the shared pool", function () {
    it("user with msg.value=0 and funded pool drains pool up to cap", async function () {
      const { proxy, mv, admin1, user1 } = await loadFixture(deployFixture);
      const fund = ethers.parseEther("1");
      await proxy.connect(admin1).fundPool({ value: fund });

      const termId = ethers.encodeBytes32String("t");
      const multiVault = ((fund - DEPOSIT_FEE) * FEE_DENOMINATOR) / (FEE_DENOMINATOR + DEPOSIT_PCT);
      const fee = fund - multiVault;

      await expect(proxy.connect(user1).deposit(termId, 1n, 0n, { value: 0 }))
        .to.emit(proxy, "CreditConsumed").withArgs(user1.address, fund);

      expect(await proxy.sponsorPool()).to.equal(0n);
      expect(await proxy.accumulatedFees()).to.equal(fee);
      expect(await mv.lastDepositAmount()).to.equal(multiVault);
      expect(await mv.lastDepositReceiver()).to.equal(user1.address);
    });

    it("multiple users share the same pool (first come, first served)", async function () {
      const { proxy, admin1, user1, user2 } = await loadFixture(deployFixture);
      // Fund pool with 2 TRUST; default cap 1 TRUST per call.
      await proxy.connect(admin1).fundPool({ value: ethers.parseEther("2") });
      const termId = ethers.encodeBytes32String("t");

      await proxy.connect(user1).deposit(termId, 1n, 0n, { value: 0 });
      // Pool down to 1 TRUST.
      expect(await proxy.sponsorPool()).to.equal(ethers.parseEther("1"));

      await proxy.connect(user2).deposit(termId, 1n, 0n, { value: 0 });
      expect(await proxy.sponsorPool()).to.equal(0n);
    });

    it("user tops up via msg.value when pool is short", async function () {
      const { proxy, admin1, user1 } = await loadFixture(deployFixture);
      const fund = ethers.parseEther("0.3");
      await proxy.connect(admin1).fundPool({ value: fund });

      const termId = ethers.encodeBytes32String("t");
      const own = ethers.parseEther("0.7");
      const effective = fund + own;
      const multiVault = ((effective - DEPOSIT_FEE) * FEE_DENOMINATOR) / (FEE_DENOMINATOR + DEPOSIT_PCT);

      await proxy.connect(user1).deposit(termId, 1n, 0n, { value: own });
      expect(await proxy.sponsorPool()).to.equal(0n);
      expect(await proxy.totalVolume()).to.equal(multiVault);
    });

    it("user without pool funding — parent V2 semantics still apply", async function () {
      const { proxy, user1 } = await loadFixture(deployFixture);
      const termId = ethers.encodeBytes32String("t");
      await proxy.connect(user1).deposit(termId, 1n, 0n, { value: ethers.parseEther("1") });
      expect(await proxy.totalDeposits()).to.equal(1n);
      expect(await proxy.sponsorPool()).to.equal(0n);
    });
  });

  // ============ Rate limits ============

  describe("maxClaimPerTx cap (per-tx claim limit)", function () {
    it("caps consumption at maxClaimPerTx; pool remainder stays for later", async function () {
      const { proxy, admin1, user1 } = await loadFixture(deployFixture);
      // Default maxClaimPerTx = 1 TRUST. Fund pool with 2 TRUST.
      await proxy.connect(admin1).fundPool({ value: ethers.parseEther("2") });
      const termId = ethers.encodeBytes32String("t");
      // Deposit pulls only 1 TRUST (the cap), pool stays at 1 TRUST.
      await proxy.connect(user1).deposit(termId, 1n, 0n, { value: 0 });
      expect(await proxy.sponsorPool()).to.equal(ethers.parseEther("1"));
    });

    it("raising the cap allows larger single-tx claims", async function () {
      const { proxy, admin1, user1 } = await loadFixture(deployFixture);
      await proxy.connect(admin1).fundPool({ value: ethers.parseEther("2") });
      await proxy.connect(admin1).setClaimLimits(ethers.parseEther("3"), 10n);
      const termId = ethers.encodeBytes32String("t");
      await proxy.connect(user1).deposit(termId, 1n, 0n, { value: 0 });
      expect(await proxy.sponsorPool()).to.equal(0n);
    });
  });

  describe("maxClaimsPerDay rate limit (24h tumbling window, per-user)", function () {
    it("blocks a user after N claims in the same window", async function () {
      const { proxy, admin1, user1, user2 } = await loadFixture(deployFixture);
      // Cap 1 TRUST per tx, 2 claims per day per user. Fund pool with 6 TRUST so there's plenty.
      await proxy.connect(admin1).setClaimLimits(ethers.parseEther("1"), 2n);
      await proxy.connect(admin1).fundPool({ value: ethers.parseEther("6") });
      const termId = ethers.encodeBytes32String("t");

      // user1 hits the limit after 2 claims.
      await proxy.connect(user1).deposit(termId, 1n, 0n, { value: ethers.parseEther("0.2") });
      await proxy.connect(user1).deposit(termId, 1n, 0n, { value: ethers.parseEther("0.2") });
      await expect(
        proxy.connect(user1).deposit(termId, 1n, 0n, { value: ethers.parseEther("0.2") }),
      ).to.be.revertedWithCustomError(proxy, "Sponsored_RateLimited");

      // user2 has their own independent counter — still works.
      await proxy.connect(user2).deposit(termId, 1n, 0n, { value: ethers.parseEther("0.2") });
    });

    it("resets after 24h and allows new claims", async function () {
      const { proxy, admin1, user1 } = await loadFixture(deployFixture);
      await proxy.connect(admin1).setClaimLimits(ethers.parseEther("1"), 1n);
      await proxy.connect(admin1).fundPool({ value: ethers.parseEther("3") });
      const termId = ethers.encodeBytes32String("t");

      await proxy.connect(user1).deposit(termId, 1n, 0n, { value: ethers.parseEther("0.15") });
      await expect(
        proxy.connect(user1).deposit(termId, 1n, 0n, { value: ethers.parseEther("0.15") }),
      ).to.be.revertedWithCustomError(proxy, "Sponsored_RateLimited");

      await time.increase(ONE_DAY + 1);
      await proxy.connect(user1).deposit(termId, 1n, 0n, { value: ethers.parseEther("0.15") });
    });

    it("does not count toward the window if consumed == 0 (user pays everything)", async function () {
      const { proxy, admin1, user1 } = await loadFixture(deployFixture);
      await proxy.connect(admin1).setClaimLimits(ethers.parseEther("1"), 1n);
      const termId = ethers.encodeBytes32String("t");
      // No pool; user pays full. Should NOT trip the rate limit.
      for (let i = 0; i < 3; i++) {
        await proxy.connect(user1).deposit(termId, 1n, 0n, { value: ethers.parseEther("0.5") });
      }
    });
  });

  // ============ depositFor (D3) ============

  describe("depositFor (D3, admin-only, pool-funded)", function () {
    it("admin depositFor drains pool and mints shares to the receiver", async function () {
      const { proxy, mv, admin1, user1 } = await loadFixture(deployFixture);
      await proxy.connect(admin1).fundPool({ value: ethers.parseEther("1") });

      const termId = ethers.encodeBytes32String("t");
      await proxy.connect(admin1).depositFor(user1.address, termId, 1n, 0n);

      expect(await mv.lastDepositReceiver()).to.equal(user1.address);
      expect(await proxy.sponsorPool()).to.equal(0n);
      expect(await proxy.totalSponsoredDeposits()).to.equal(1n);
      expect(await proxy.hasReceivedSponsored(user1.address)).to.be.true;
      expect(await proxy.totalSponsoredUniqueReceivers()).to.equal(1n);
    });

    it("non-admin cannot call depositFor", async function () {
      const { proxy, admin1, nonAdmin, user1 } = await loadFixture(deployFixture);
      await proxy.connect(admin1).fundPool({ value: ethers.parseEther("1") });
      const termId = ethers.encodeBytes32String("t");
      await expect(
        proxy.connect(nonAdmin).depositFor(user1.address, termId, 1n, 0n),
      ).to.be.revertedWithCustomError(proxy, "IntuitionFeeProxy_NotWhitelistedAdmin");
    });

    it("depositFor reverts on zero receiver", async function () {
      const { proxy, admin1 } = await loadFixture(deployFixture);
      await proxy.connect(admin1).fundPool({ value: ethers.parseEther("1") });
      const termId = ethers.encodeBytes32String("t");
      await expect(
        proxy.connect(admin1).depositFor(ethers.ZeroAddress, termId, 1n, 0n),
      ).to.be.revertedWithCustomError(proxy, "Sponsored_ZeroReceiver");
    });

    it("admin can top up from msg.value when the pool is short", async function () {
      const { proxy, admin1, user1 } = await loadFixture(deployFixture);
      await proxy.connect(admin1).fundPool({ value: ethers.parseEther("0.3") });
      const termId = ethers.encodeBytes32String("t");
      await proxy.connect(admin1).depositFor(user1.address, termId, 1n, 0n, {
        value: ethers.parseEther("0.7"),
      });
      expect(await proxy.sponsorPool()).to.equal(0n);
    });

    it("depositFor trips the rate limit on the receiver", async function () {
      const { proxy, admin1, user1 } = await loadFixture(deployFixture);
      await proxy.connect(admin1).setClaimLimits(ethers.parseEther("1"), 1n);
      await proxy.connect(admin1).fundPool({ value: ethers.parseEther("3") });
      const termId = ethers.encodeBytes32String("t");

      await proxy.connect(admin1).depositFor(user1.address, termId, 1n, 0n);
      await expect(
        proxy.connect(admin1).depositFor(user1.address, termId, 1n, 0n),
      ).to.be.revertedWithCustomError(proxy, "Sponsored_RateLimited");
    });
  });

  // ============ Withdraw invariant ============

  describe("withdraw credit-invariant protection", function () {
    it("withdrawAll drains only accumulatedFees; pool is preserved", async function () {
      const { proxy, admin1, deployer } = await loadFixture(deployFixture);

      await proxy.connect(admin1).fundPool({ value: ethers.parseEther("1") });

      const termId = ethers.encodeBytes32String("t");
      await proxy.connect(deployer).deposit(termId, 1n, 0n, { value: ethers.parseEther("1") });

      await proxy.connect(admin1).withdrawAll(admin1.address);
      expect(await proxy.accumulatedFees()).to.equal(0n);
      expect(await ethers.provider.getBalance(await proxy.getAddress())).to.equal(
        await proxy.sponsorPool(),
      );
    });
  });

  // ============ getClaimStatus view ============

  describe("getClaimStatus", function () {
    it("returns (0, 0) for a user who never claimed", async function () {
      const { proxy, user1 } = await loadFixture(deployFixture);
      const [count, resetsAt] = await proxy.getClaimStatus(user1.address);
      expect(count).to.equal(0n);
      expect(resetsAt).to.equal(0n);
    });

    it("tracks count and window after a claim", async function () {
      const { proxy, admin1, user1 } = await loadFixture(deployFixture);
      await proxy.connect(admin1).fundPool({ value: ethers.parseEther("0.5") });
      const termId = ethers.encodeBytes32String("t");
      const tx = await proxy.connect(user1).deposit(termId, 1n, 0n, { value: ethers.parseEther("0.15") });
      const block = await ethers.provider.getBlock((await tx.wait())!.blockNumber);

      const [count, resetsAt] = await proxy.getClaimStatus(user1.address);
      expect(count).to.equal(1n);
      expect(resetsAt).to.equal(BigInt(block!.timestamp) + BigInt(ONE_DAY));
    });
  });
});
