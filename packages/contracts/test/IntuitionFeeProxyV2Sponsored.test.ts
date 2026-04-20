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
  const DEFAULT_MAX_PER_TX = ethers.parseEther("1");
  const DEFAULT_MAX_PER_WINDOW = 10n;
  const DEFAULT_MAX_VOLUME_PER_WINDOW = ethers.parseEther("10");
  const DEFAULT_WINDOW_SEC = BigInt(ONE_DAY);

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

    it("claim limits default to 1 TRUST / 10 calls / 10 TRUST / 1 day", async function () {
      const { proxy } = await loadFixture(deployFixture);
      expect(await proxy.maxClaimPerTx()).to.equal(DEFAULT_MAX_PER_TX);
      expect(await proxy.maxClaimsPerWindow()).to.equal(DEFAULT_MAX_PER_WINDOW);
      expect(await proxy.maxClaimVolumePerWindow()).to.equal(DEFAULT_MAX_VOLUME_PER_WINDOW);
      expect(await proxy.claimWindowSeconds()).to.equal(DEFAULT_WINDOW_SEC);
    });

    it("pool starts empty", async function () {
      const { proxy } = await loadFixture(deployFixture);
      expect(await proxy.sponsorPool()).to.equal(0n);
    });
  });

  // ============ setClaimLimits ============

  describe("setClaimLimits", function () {
    it("admin can set all four knobs and emits ClaimLimitsSet", async function () {
      const { proxy, admin1 } = await loadFixture(deployFixture);
      const newPerTx = ethers.parseEther("5");
      const newPerWindow = 20n;
      const newVolume = ethers.parseEther("50");
      const newWindow = BigInt(ONE_DAY * 7); // 1 week
      await expect(
        proxy.connect(admin1).setClaimLimits(newPerTx, newPerWindow, newVolume, newWindow),
      )
        .to.emit(proxy, "ClaimLimitsSet")
        .withArgs(newPerTx, newPerWindow, newVolume, newWindow);
      expect(await proxy.maxClaimPerTx()).to.equal(newPerTx);
      expect(await proxy.maxClaimsPerWindow()).to.equal(newPerWindow);
      expect(await proxy.maxClaimVolumePerWindow()).to.equal(newVolume);
      expect(await proxy.claimWindowSeconds()).to.equal(newWindow);
    });

    it("reverts if any of the four knobs is zero (no 'unlimited' escape)", async function () {
      const { proxy, admin1 } = await loadFixture(deployFixture);
      const perTx = ethers.parseEther("1");
      const vol = ethers.parseEther("5");
      const win = BigInt(ONE_DAY);
      await expect(proxy.connect(admin1).setClaimLimits(0, 10n, vol, win))
        .to.be.revertedWithCustomError(proxy, "Sponsored_InvalidLimit");
      await expect(proxy.connect(admin1).setClaimLimits(perTx, 0, vol, win))
        .to.be.revertedWithCustomError(proxy, "Sponsored_InvalidLimit");
      await expect(proxy.connect(admin1).setClaimLimits(perTx, 10n, 0, win))
        .to.be.revertedWithCustomError(proxy, "Sponsored_InvalidLimit");
      await expect(proxy.connect(admin1).setClaimLimits(perTx, 10n, vol, 0))
        .to.be.revertedWithCustomError(proxy, "Sponsored_InvalidLimit");
    });

    it("non-admin cannot change limits", async function () {
      const { proxy, nonAdmin } = await loadFixture(deployFixture);
      await expect(
        proxy
          .connect(nonAdmin)
          .setClaimLimits(ethers.parseEther("1"), 10n, ethers.parseEther("10"), BigInt(ONE_DAY)),
      ).to.be.revertedWithCustomError(proxy, "IntuitionFeeProxy_NotWhitelistedAdmin");
    });

    it("rejects maxClaimVolumePerWindow > uint128.max (prevents silent truncation in ClaimWindow.volume)", async function () {
      const { proxy, admin1 } = await loadFixture(deployFixture);
      const U128_MAX = (1n << 128n) - 1n;
      // Exactly uint128.max is allowed
      await expect(
        proxy.connect(admin1).setClaimLimits(ethers.parseEther("1"), 10n, U128_MAX, BigInt(ONE_DAY)),
      ).to.emit(proxy, "ClaimLimitsSet");
      // One wei over reverts
      await expect(
        proxy.connect(admin1).setClaimLimits(ethers.parseEther("1"), 10n, U128_MAX + 1n, BigInt(ONE_DAY)),
      ).to.be.revertedWithCustomError(proxy, "Sponsored_InvalidLimit");
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

    it("fundPool is re-callable; balance accumulates across top-ups", async function () {
      const { proxy, admin1, admin2 } = await loadFixture(deployFixture);
      await proxy.connect(admin1).fundPool({ value: ethers.parseEther("1") });
      await proxy.connect(admin2).fundPool({ value: ethers.parseEther("2.5") });
      await proxy.connect(admin1).fundPool({ value: ethers.parseEther("0.5") });
      expect(await proxy.sponsorPool()).to.equal(ethers.parseEther("4"));
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
      await proxy
        .connect(admin1)
        .setClaimLimits(ethers.parseEther("3"), 10n, ethers.parseEther("10"), BigInt(ONE_DAY));
      const termId = ethers.encodeBytes32String("t");
      await proxy.connect(user1).deposit(termId, 1n, 0n, { value: 0 });
      expect(await proxy.sponsorPool()).to.equal(0n);
    });
  });

  describe("maxClaimsPerWindow rate limit (per-user count cap)", function () {
    it("blocks a user after N claims in the same window", async function () {
      const { proxy, admin1, user1, user2 } = await loadFixture(deployFixture);
      // Cap 1 TRUST per tx, 2 claims per window, plenty of volume headroom.
      await proxy
        .connect(admin1)
        .setClaimLimits(ethers.parseEther("1"), 2n, ethers.parseEther("100"), BigInt(ONE_DAY));
      await proxy.connect(admin1).fundPool({ value: ethers.parseEther("6") });
      const termId = ethers.encodeBytes32String("t");

      // user1 hits the count cap after 2 claims.
      await proxy.connect(user1).deposit(termId, 1n, 0n, { value: ethers.parseEther("0.2") });
      await proxy.connect(user1).deposit(termId, 1n, 0n, { value: ethers.parseEther("0.2") });
      await expect(
        proxy.connect(user1).deposit(termId, 1n, 0n, { value: ethers.parseEther("0.2") }),
      ).to.be.revertedWithCustomError(proxy, "Sponsored_RateLimited");

      // user2 has their own independent counter — still works.
      await proxy.connect(user2).deposit(termId, 1n, 0n, { value: ethers.parseEther("0.2") });
    });

    it("resets after the configured window elapses", async function () {
      const { proxy, admin1, user1 } = await loadFixture(deployFixture);
      await proxy
        .connect(admin1)
        .setClaimLimits(ethers.parseEther("1"), 1n, ethers.parseEther("100"), BigInt(ONE_DAY));
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
      await proxy
        .connect(admin1)
        .setClaimLimits(ethers.parseEther("1"), 1n, ethers.parseEther("100"), BigInt(ONE_DAY));
      const termId = ethers.encodeBytes32String("t");
      // No pool; user pays full. Should NOT trip the rate limit.
      for (let i = 0; i < 3; i++) {
        await proxy.connect(user1).deposit(termId, 1n, 0n, { value: ethers.parseEther("0.5") });
      }
    });
  });

  describe("maxClaimVolumePerWindow rate limit (per-user cumulative TRUST)", function () {
    it("blocks the user when cumulative volume hits the cap, before the count cap", async function () {
      const { proxy, admin1, user1 } = await loadFixture(deployFixture);
      // 1 TRUST per tx, 10 claims / window (headroom), BUT only 1.5 TRUST cumulative.
      await proxy
        .connect(admin1)
        .setClaimLimits(ethers.parseEther("1"), 10n, ethers.parseEther("1.5"), BigInt(ONE_DAY));
      await proxy.connect(admin1).fundPool({ value: ethers.parseEther("5") });
      const termId = ethers.encodeBytes32String("t");

      // First claim: draws full cap (1 TRUST) — cumulative = 1 TRUST.
      await proxy.connect(user1).deposit(termId, 1n, 0n, { value: 0 });
      // Second claim would bring cumulative to 2 TRUST, exceeds 1.5 cap → revert.
      await expect(
        proxy.connect(user1).deposit(termId, 1n, 0n, { value: 0 }),
      ).to.be.revertedWithCustomError(proxy, "Sponsored_VolumeLimited");
    });

    it("a single fresh-window call whose draw exceeds the volume cap reverts", async function () {
      const { proxy, admin1, user1 } = await loadFixture(deployFixture);
      // Per-tx cap 1 TRUST, but volume cap only 0.3 TRUST.
      await proxy
        .connect(admin1)
        .setClaimLimits(
          ethers.parseEther("1"),
          10n,
          ethers.parseEther("0.3"),
          BigInt(ONE_DAY),
        );
      await proxy.connect(admin1).fundPool({ value: ethers.parseEther("5") });
      const termId = ethers.encodeBytes32String("t");
      // deposit() calls _consumeCredit(0) which returns maxClaimPerTx = 1 TRUST
      // → exceeds the 0.3 TRUST volume cap on a cold user → revert.
      await expect(
        proxy.connect(user1).deposit(termId, 1n, 0n, { value: 0 }),
      ).to.be.revertedWithCustomError(proxy, "Sponsored_VolumeLimited");
    });

    it("volume counter resets after the configured window", async function () {
      const { proxy, admin1, user1 } = await loadFixture(deployFixture);
      await proxy
        .connect(admin1)
        .setClaimLimits(ethers.parseEther("1"), 10n, ethers.parseEther("1"), BigInt(ONE_DAY));
      await proxy.connect(admin1).fundPool({ value: ethers.parseEther("5") });
      const termId = ethers.encodeBytes32String("t");

      // Exhaust the 1-TRUST volume cap in a single claim.
      await proxy.connect(user1).deposit(termId, 1n, 0n, { value: 0 });
      await expect(
        proxy.connect(user1).deposit(termId, 1n, 0n, { value: 0 }),
      ).to.be.revertedWithCustomError(proxy, "Sponsored_VolumeLimited");

      // Roll the window forward → reset.
      await time.increase(ONE_DAY + 1);
      await proxy.connect(user1).deposit(termId, 1n, 0n, { value: 0 });
    });
  });

  describe("configurable claimWindowSeconds", function () {
    it("a 1-hour window resets after 1h (not 24h)", async function () {
      const { proxy, admin1, user1 } = await loadFixture(deployFixture);
      const ONE_HOUR = 3600;
      await proxy
        .connect(admin1)
        .setClaimLimits(ethers.parseEther("1"), 1n, ethers.parseEther("10"), BigInt(ONE_HOUR));
      await proxy.connect(admin1).fundPool({ value: ethers.parseEther("5") });
      const termId = ethers.encodeBytes32String("t");

      await proxy.connect(user1).deposit(termId, 1n, 0n, { value: 0 });
      await expect(
        proxy.connect(user1).deposit(termId, 1n, 0n, { value: 0 }),
      ).to.be.revertedWithCustomError(proxy, "Sponsored_RateLimited");

      // 30 minutes — still in the window.
      await time.increase(1800);
      await expect(
        proxy.connect(user1).deposit(termId, 1n, 0n, { value: 0 }),
      ).to.be.revertedWithCustomError(proxy, "Sponsored_RateLimited");

      // +31 minutes → past the 1-hour window → reset.
      await time.increase(1860);
      await proxy.connect(user1).deposit(termId, 1n, 0n, { value: 0 });
    });

    it("a 1-week window does NOT reset after 1 day", async function () {
      const { proxy, admin1, user1 } = await loadFixture(deployFixture);
      const ONE_WEEK = ONE_DAY * 7;
      await proxy
        .connect(admin1)
        .setClaimLimits(ethers.parseEther("1"), 1n, ethers.parseEther("10"), BigInt(ONE_WEEK));
      await proxy.connect(admin1).fundPool({ value: ethers.parseEther("5") });
      const termId = ethers.encodeBytes32String("t");

      await proxy.connect(user1).deposit(termId, 1n, 0n, { value: 0 });
      await time.increase(ONE_DAY + 1);
      await expect(
        proxy.connect(user1).deposit(termId, 1n, 0n, { value: 0 }),
      ).to.be.revertedWithCustomError(proxy, "Sponsored_RateLimited");
    });
  });

  // ============ Sponsored metrics bumping on D1 pool draws ============

  describe("sponsored metrics track pool-funded draws", function () {
    it("bumps totalSponsoredDeposits / Volume / UniqueReceivers when the user consumes credit", async function () {
      const { proxy, admin1, user1, user2 } = await loadFixture(deployFixture);
      await proxy.connect(admin1).fundPool({ value: ethers.parseEther("3") });
      const termId = ethers.encodeBytes32String("t");

      // user1 first draw
      await proxy.connect(user1).deposit(termId, 1n, 0n, { value: 0 });
      const m1 = await proxy.getSponsoredMetrics();
      expect(m1.sponsoredDeposits).to.equal(1n);
      expect(m1.uniqueSponsoredReceivers).to.equal(1n);
      expect(m1.sponsoredVolume).to.equal(ethers.parseEther("1")); // drained exactly the cap

      // user2 first draw — receivers +1, deposits +1
      await proxy.connect(user2).deposit(termId, 1n, 0n, { value: 0 });
      const m2 = await proxy.getSponsoredMetrics();
      expect(m2.sponsoredDeposits).to.equal(2n);
      expect(m2.uniqueSponsoredReceivers).to.equal(2n);

      // user1 second draw — deposits +1, receivers unchanged
      await proxy.connect(user1).deposit(termId, 1n, 0n, { value: 0 });
      const m3 = await proxy.getSponsoredMetrics();
      expect(m3.sponsoredDeposits).to.equal(3n);
      expect(m3.uniqueSponsoredReceivers).to.equal(2n);
    });

    it("does NOT bump sponsored metrics when the user pays fully from msg.value", async function () {
      const { proxy, user1 } = await loadFixture(deployFixture);
      const termId = ethers.encodeBytes32String("t");
      // no pool funded; user pays out of their own wallet
      await proxy.connect(user1).deposit(termId, 1n, 0n, { value: ethers.parseEther("1") });
      const m = await proxy.getSponsoredMetrics();
      expect(m.sponsoredDeposits).to.equal(0n);
      expect(m.sponsoredVolume).to.equal(0n);
      expect(m.uniqueSponsoredReceivers).to.equal(0n);
      expect(await proxy.hasReceivedSponsored(user1.address)).to.be.false;
    });

    it("emits SponsoredMetricsUpdated on each pool-funded draw", async function () {
      const { proxy, admin1, user1 } = await loadFixture(deployFixture);
      await proxy.connect(admin1).fundPool({ value: ethers.parseEther("1") });
      const termId = ethers.encodeBytes32String("t");
      await expect(proxy.connect(user1).deposit(termId, 1n, 0n, { value: 0 }))
        .to.emit(proxy, "SponsoredMetricsUpdated")
        .withArgs(1n, ethers.parseEther("1"), 1n);
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
    it("returns (0, 0, 0) for a user who never claimed", async function () {
      const { proxy, user1 } = await loadFixture(deployFixture);
      const [count, volume, resetsAt] = await proxy.getClaimStatus(user1.address);
      expect(count).to.equal(0n);
      expect(volume).to.equal(0n);
      expect(resetsAt).to.equal(0n);
    });

    it("tracks count, volume and window after a claim", async function () {
      const { proxy, admin1, user1 } = await loadFixture(deployFixture);
      await proxy.connect(admin1).fundPool({ value: ethers.parseEther("0.5") });
      const termId = ethers.encodeBytes32String("t");
      const tx = await proxy.connect(user1).deposit(termId, 1n, 0n, { value: ethers.parseEther("0.15") });
      const block = await ethers.provider.getBlock((await tx.wait())!.blockNumber);

      const [count, volume, resetsAt] = await proxy.getClaimStatus(user1.address);
      expect(count).to.equal(1n);
      expect(volume).to.equal(ethers.parseEther("0.5")); // drained the whole pool
      expect(resetsAt).to.equal(BigInt(block!.timestamp) + BigInt(ONE_DAY));
    });
  });
});
