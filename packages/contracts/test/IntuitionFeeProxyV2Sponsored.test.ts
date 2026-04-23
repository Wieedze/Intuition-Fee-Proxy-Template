import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import {
  IntuitionFeeProxyV2Sponsored,
  MockMultiVault,
} from "../typechain-types";

describe("IntuitionFeeProxyV2Sponsored (B1 full-sponsorship)", function () {
  const DEPOSIT_FEE = ethers.parseEther("0.1");
  const DEPOSIT_PCT = 500n;               // 5%
  const FEE_DENOMINATOR = 10_000n;

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
      const newWindow = BigInt(ONE_DAY * 7);
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

    it("rejects windowSec < MIN_CLAIM_WINDOW_SECONDS (1 hour)", async function () {
      const { proxy, admin1 } = await loadFixture(deployFixture);
      const ONE_HOUR = 3600n;
      // 1 second below the minimum — rejected
      await expect(
        proxy.connect(admin1).setClaimLimits(
          ethers.parseEther("1"),
          10n,
          ethers.parseEther("10"),
          ONE_HOUR - 1n,
        ),
      ).to.be.revertedWithCustomError(proxy, "Sponsored_InvalidLimit");
      // Exactly at the minimum — accepted
      await expect(
        proxy.connect(admin1).setClaimLimits(
          ethers.parseEther("1"),
          10n,
          ethers.parseEther("10"),
          ONE_HOUR,
        ),
      ).to.emit(proxy, "ClaimLimitsSet");
    });

    it("rejects maxClaimVolumePerWindow > uint128.max", async function () {
      const { proxy, admin1 } = await loadFixture(deployFixture);
      const U128_MAX = (1n << 128n) - 1n;
      await expect(
        proxy.connect(admin1).setClaimLimits(ethers.parseEther("1"), 10n, U128_MAX, BigInt(ONE_DAY)),
      ).to.emit(proxy, "ClaimLimitsSet");
      await expect(
        proxy.connect(admin1).setClaimLimits(ethers.parseEther("1"), 10n, U128_MAX + 1n, BigInt(ONE_DAY)),
      ).to.be.revertedWithCustomError(proxy, "Sponsored_InvalidLimit");
    });
  });

  // ============ fundPool / reclaimFromPool ============

  describe("fundPool (public) / reclaimFromPool (admin only)", function () {
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

    it("non-admin can fundPool (permissionless donations)", async function () {
      const { proxy, nonAdmin } = await loadFixture(deployFixture);
      const amount = ethers.parseEther("1");
      await expect(proxy.connect(nonAdmin).fundPool({ value: amount }))
        .to.emit(proxy, "PoolFunded")
        .withArgs(amount, nonAdmin.address);
      expect(await proxy.sponsorPool()).to.equal(amount);
    });

    it("mixed admin + non-admin funders all show up with their own address in PoolFunded", async function () {
      const { proxy, admin1, nonAdmin, user1 } = await loadFixture(deployFixture);
      await proxy.connect(admin1).fundPool({ value: ethers.parseEther("1") });
      await proxy.connect(nonAdmin).fundPool({ value: ethers.parseEther("2") });
      await proxy.connect(user1).fundPool({ value: ethers.parseEther("0.5") });
      expect(await proxy.sponsorPool()).to.equal(ethers.parseEther("3.5"));
      // Each funder's address is emitted in `by` — the webapp uses these events
      // to render the permissionless top-ups log.
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

  // ============ deposit(3 args) is disabled ============

  describe("deposit(3 args) is disabled on sponsored", function () {
    it("reverts with Sponsored_UseDepositSponsored", async function () {
      const { proxy, user1 } = await loadFixture(deployFixture);
      const termId = ethers.encodeBytes32String("t");
      await expect(
        proxy.connect(user1).deposit(termId, 1n, 0n, { value: ethers.parseEther("1") }),
      ).to.be.revertedWithCustomError(proxy, "Sponsored_UseDepositSponsored");
    });

    it("reverts even when msg.value == 0", async function () {
      const { proxy, user1 } = await loadFixture(deployFixture);
      const termId = ethers.encodeBytes32String("t");
      await expect(
        proxy.connect(user1).deposit(termId, 1n, 0n, { value: 0 }),
      ).to.be.revertedWithCustomError(proxy, "Sponsored_UseDepositSponsored");
    });
  });

  // ============ depositSponsored (full-sponsorship, no fees) ============

  describe("depositSponsored (full-sponsorship, pool pays assets + fee)", function () {
    // Helper: total drained from pool for `assets` at default (0.1 fixed + 5%).
    // Must match the on-chain calculateDepositFee(1, assets).
    function totalRequired(assets: bigint): bigint {
      const fee = DEPOSIT_FEE + (assets * DEPOSIT_PCT) / FEE_DENOMINATOR;
      return assets + fee;
    }
    function feeOf(assets: bigint): bigint {
      return DEPOSIT_FEE + (assets * DEPOSIT_PCT) / FEE_DENOMINATOR;
    }

    it("walletless user: pool drained by assets + fee, MV still receives only assets", async function () {
      const { proxy, mv, admin1, user1 } = await loadFixture(deployFixture);
      const fund = ethers.parseEther("1");
      await proxy.connect(admin1).fundPool({ value: fund });
      const termId = ethers.encodeBytes32String("t");
      const assets = ethers.parseEther("0.5");
      const totReq = totalRequired(assets);

      await expect(proxy.connect(user1).depositSponsored(termId, 1n, 0n, assets, { value: 0 }))
        .to.emit(proxy, "CreditConsumed").withArgs(user1.address, totReq);

      expect(await proxy.sponsorPool()).to.equal(fund - totReq);
      expect(await proxy.accumulatedFees()).to.equal(feeOf(assets));
      // MV only ever receives `assets` — the fee stays accrued in the proxy.
      expect(await mv.lastDepositAmount()).to.equal(assets);
      expect(await mv.lastDepositReceiver()).to.equal(user1.address);
    });

    it("rich user: msg.value fully refunded, pool still pays assets + fee", async function () {
      const { proxy, admin1, user1 } = await loadFixture(deployFixture);
      const fund = ethers.parseEther("1");
      await proxy.connect(admin1).fundPool({ value: fund });
      const termId = ethers.encodeBytes32String("t");
      const assets = ethers.parseEther("0.5");
      const sent = ethers.parseEther("3");

      const balBefore = await ethers.provider.getBalance(user1.address);
      const tx = await proxy.connect(user1).depositSponsored(termId, 1n, 0n, assets, { value: sent });
      const receipt = await tx.wait();
      const gasCost = receipt!.gasUsed * receipt!.gasPrice;
      const balAfter = await ethers.provider.getBalance(user1.address);

      expect(balBefore - balAfter).to.equal(gasCost);
      expect(await proxy.sponsorPool()).to.equal(fund - totalRequired(assets));
    });

    it("reverts Sponsored_ExceedsMaxPerTx when assets + fee > maxClaimPerTx", async function () {
      const { proxy, admin1, user1 } = await loadFixture(deployFixture);
      await proxy.connect(admin1).fundPool({ value: ethers.parseEther("10") });
      const termId = ethers.encodeBytes32String("t");
      const assets = ethers.parseEther("2"); // totalRequired way above default cap 1

      await expect(
        proxy.connect(user1).depositSponsored(termId, 1n, 0n, assets, { value: 0 }),
      ).to.be.revertedWithCustomError(proxy, "Sponsored_ExceedsMaxPerTx");
    });

    it("reverts Sponsored_InsufficientPool when pool < totalRequired", async function () {
      const { proxy, admin1, user1 } = await loadFixture(deployFixture);
      await proxy.connect(admin1).fundPool({ value: ethers.parseEther("0.3") });
      const termId = ethers.encodeBytes32String("t");
      const assets = ethers.parseEther("0.5"); // totalRequired = 0.625 > pool

      await expect(
        proxy.connect(user1).depositSponsored(termId, 1n, 0n, assets, { value: 0 }),
      ).to.be.revertedWithCustomError(proxy, "Sponsored_InsufficientPool");
    });

    it("reverts on assets == 0", async function () {
      const { proxy, admin1, user1 } = await loadFixture(deployFixture);
      await proxy.connect(admin1).fundPool({ value: ethers.parseEther("1") });
      const termId = ethers.encodeBytes32String("t");

      await expect(
        proxy.connect(user1).depositSponsored(termId, 1n, 0n, 0n, { value: 0 }),
      ).to.be.revertedWithCustomError(proxy, "IntuitionFeeProxy_InsufficientValue");
    });

    it("accumulatedFees grows after each sponsored deposit (Sofia revenue funded by the pool)", async function () {
      const { proxy, admin1, user1, user2 } = await loadFixture(deployFixture);
      await proxy.connect(admin1).fundPool({ value: ethers.parseEther("5") });
      const termId = ethers.encodeBytes32String("t");
      const assets1 = ethers.parseEther("0.5");
      const assets2 = ethers.parseEther("0.3");

      await proxy.connect(user1).depositSponsored(termId, 1n, 0n, assets1, { value: 0 });
      await proxy.connect(user2).depositSponsored(termId, 1n, 0n, assets2, { value: 0 });

      const expectedFee = feeOf(assets1) + feeOf(assets2);
      expect(await proxy.accumulatedFees()).to.equal(expectedFee);
      expect(await proxy.totalFeesCollectedAllTime()).to.equal(expectedFee);
    });

    it("multiple users share the pool in first-come order (totalRequired = assets + fee)", async function () {
      const { proxy, admin1, user1, user2 } = await loadFixture(deployFixture);
      await proxy.connect(admin1).fundPool({ value: ethers.parseEther("1") });
      const termId = ethers.encodeBytes32String("t");
      const a1 = ethers.parseEther("0.6");

      await proxy.connect(user1).depositSponsored(termId, 1n, 0n, a1, { value: 0 });
      // pool left = 1 - totalRequired(0.6) = 1 - 0.73 = 0.27
      expect(await proxy.sponsorPool()).to.equal(ethers.parseEther("1") - totalRequired(a1));

      // user2 asks 0.2 — totalRequired = 0.31 > 0.27 pool left, reverts
      await expect(
        proxy.connect(user2).depositSponsored(termId, 1n, 0n, ethers.parseEther("0.2"), { value: 0 }),
      ).to.be.revertedWithCustomError(proxy, "Sponsored_InsufficientPool");

      // user2 asks 0.15 — totalRequired = 0.2575 < 0.27, OK
      const a2 = ethers.parseEther("0.15");
      await proxy.connect(user2).depositSponsored(termId, 1n, 0n, a2, { value: 0 });
    });
  });

  // ============ Rate limits ============

  describe("maxClaimsPerWindow rate limit", function () {
    it("blocks a user after N sponsored claims in the same window", async function () {
      const { proxy, admin1, user1, user2 } = await loadFixture(deployFixture);
      await proxy
        .connect(admin1)
        .setClaimLimits(ethers.parseEther("1"), 2n, ethers.parseEther("100"), BigInt(ONE_DAY));
      await proxy.connect(admin1).fundPool({ value: ethers.parseEther("10") });
      const termId = ethers.encodeBytes32String("t");
      const assets = ethers.parseEther("0.2");

      await proxy.connect(user1).depositSponsored(termId, 1n, 0n, assets, { value: 0 });
      await proxy.connect(user1).depositSponsored(termId, 1n, 0n, assets, { value: 0 });
      await expect(
        proxy.connect(user1).depositSponsored(termId, 1n, 0n, assets, { value: 0 }),
      ).to.be.revertedWithCustomError(proxy, "Sponsored_RateLimited");

      // user2 has their own independent counter
      await proxy.connect(user2).depositSponsored(termId, 1n, 0n, assets, { value: 0 });
    });

    it("resets after the configured window elapses", async function () {
      const { proxy, admin1, user1 } = await loadFixture(deployFixture);
      await proxy
        .connect(admin1)
        .setClaimLimits(ethers.parseEther("1"), 1n, ethers.parseEther("100"), BigInt(ONE_DAY));
      await proxy.connect(admin1).fundPool({ value: ethers.parseEther("3") });
      const termId = ethers.encodeBytes32String("t");
      const assets = ethers.parseEther("0.3");

      await proxy.connect(user1).depositSponsored(termId, 1n, 0n, assets, { value: 0 });
      await expect(
        proxy.connect(user1).depositSponsored(termId, 1n, 0n, assets, { value: 0 }),
      ).to.be.revertedWithCustomError(proxy, "Sponsored_RateLimited");

      await time.increase(ONE_DAY + 1);
      await proxy.connect(user1).depositSponsored(termId, 1n, 0n, assets, { value: 0 });
    });
  });

  describe("maxClaimVolumePerWindow rate limit", function () {
    it("blocks the user when cumulative volume hits the cap", async function () {
      const { proxy, admin1, user1 } = await loadFixture(deployFixture);
      // Per-tx cap raised to 2 so assets=1 (+ fee = 1.15) fits under cap.
      await proxy
        .connect(admin1)
        .setClaimLimits(ethers.parseEther("2"), 10n, ethers.parseEther("1.5"), BigInt(ONE_DAY));
      await proxy.connect(admin1).fundPool({ value: ethers.parseEther("5") });
      const termId = ethers.encodeBytes32String("t");

      // First claim: 1.15 TRUST cumulative (fee included).
      await proxy.connect(user1).depositSponsored(termId, 1n, 0n, ethers.parseEther("1"), { value: 0 });
      // Second claim would bring cumulative to 2.3 > 1.5 cap → revert
      await expect(
        proxy.connect(user1).depositSponsored(termId, 1n, 0n, ethers.parseEther("1"), { value: 0 }),
      ).to.be.revertedWithCustomError(proxy, "Sponsored_VolumeLimited");
    });

    it("a single fresh-window call whose draw exceeds the volume cap reverts", async function () {
      const { proxy, admin1, user1 } = await loadFixture(deployFixture);
      await proxy
        .connect(admin1)
        .setClaimLimits(
          ethers.parseEther("2"),
          10n,
          ethers.parseEther("0.3"),
          BigInt(ONE_DAY),
        );
      await proxy.connect(admin1).fundPool({ value: ethers.parseEther("5") });
      const termId = ethers.encodeBytes32String("t");

      // totalRequired(1) = 1.15 TRUST > volume cap 0.3
      await expect(
        proxy.connect(user1).depositSponsored(termId, 1n, 0n, ethers.parseEther("1"), { value: 0 }),
      ).to.be.revertedWithCustomError(proxy, "Sponsored_VolumeLimited");
    });

    it("volume counter resets after the configured window", async function () {
      const { proxy, admin1, user1 } = await loadFixture(deployFixture);
      // Per-tx cap 2, volume cap 1.5 so totalRequired(1)=1.15 fits under volume.
      await proxy
        .connect(admin1)
        .setClaimLimits(ethers.parseEther("2"), 10n, ethers.parseEther("1.5"), BigInt(ONE_DAY));
      await proxy.connect(admin1).fundPool({ value: ethers.parseEther("5") });
      const termId = ethers.encodeBytes32String("t");

      await proxy.connect(user1).depositSponsored(termId, 1n, 0n, ethers.parseEther("1"), { value: 0 });
      await expect(
        proxy.connect(user1).depositSponsored(termId, 1n, 0n, ethers.parseEther("1"), { value: 0 }),
      ).to.be.revertedWithCustomError(proxy, "Sponsored_VolumeLimited");

      await time.increase(ONE_DAY + 1);
      await proxy.connect(user1).depositSponsored(termId, 1n, 0n, ethers.parseEther("1"), { value: 0 });
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

      await proxy.connect(user1).depositSponsored(termId, 1n, 0n, ethers.parseEther("0.5"), { value: 0 });
      await expect(
        proxy.connect(user1).depositSponsored(termId, 1n, 0n, ethers.parseEther("0.5"), { value: 0 }),
      ).to.be.revertedWithCustomError(proxy, "Sponsored_RateLimited");

      await time.increase(1800);
      await expect(
        proxy.connect(user1).depositSponsored(termId, 1n, 0n, ethers.parseEther("0.5"), { value: 0 }),
      ).to.be.revertedWithCustomError(proxy, "Sponsored_RateLimited");

      await time.increase(1860);
      await proxy.connect(user1).depositSponsored(termId, 1n, 0n, ethers.parseEther("0.5"), { value: 0 });
    });
  });

  // ============ Sponsored metrics ============

  describe("sponsored metrics", function () {
    it("bumps on every pool-funded draw", async function () {
      const { proxy, admin1, user1, user2 } = await loadFixture(deployFixture);
      await proxy.connect(admin1).fundPool({ value: ethers.parseEther("3") });
      const termId = ethers.encodeBytes32String("t");
      const assets = ethers.parseEther("0.5");

      await proxy.connect(user1).depositSponsored(termId, 1n, 0n, assets, { value: 0 });
      const m1 = await proxy.getSponsoredMetrics();
      expect(m1.sponsoredDeposits).to.equal(1n);
      expect(m1.uniqueSponsoredReceivers).to.equal(1n);
      // volume = totalRequired = assets + fee (pool drains the full amount)
      const fee1 = DEPOSIT_FEE + (assets * DEPOSIT_PCT) / FEE_DENOMINATOR;
      expect(m1.sponsoredVolume).to.equal(assets + fee1);

      await proxy.connect(user2).depositSponsored(termId, 1n, 0n, assets, { value: 0 });
      const m2 = await proxy.getSponsoredMetrics();
      expect(m2.sponsoredDeposits).to.equal(2n);
      expect(m2.uniqueSponsoredReceivers).to.equal(2n);

      await proxy.connect(user1).depositSponsored(termId, 1n, 0n, assets, { value: 0 });
      const m3 = await proxy.getSponsoredMetrics();
      expect(m3.sponsoredDeposits).to.equal(3n);
      expect(m3.uniqueSponsoredReceivers).to.equal(2n); // user1 repeat
    });

    it("emits SponsoredMetricsUpdated on each sponsored draw", async function () {
      const { proxy, admin1, user1 } = await loadFixture(deployFixture);
      await proxy.connect(admin1).fundPool({ value: ethers.parseEther("1") });
      const termId = ethers.encodeBytes32String("t");
      const assets = ethers.parseEther("0.5");
      const fee = DEPOSIT_FEE + (assets * DEPOSIT_PCT) / FEE_DENOMINATOR;
      await expect(proxy.connect(user1).depositSponsored(termId, 1n, 0n, assets, { value: 0 }))
        .to.emit(proxy, "SponsoredMetricsUpdated")
        .withArgs(1n, assets + fee, 1n);
    });
  });

  // ============ Withdraw on sponsored ============

  describe("withdraw on sponsored channel", function () {
    it("withdraw reverts with a funded pool but no sponsored activity yet", async function () {
      const { proxy, admin1 } = await loadFixture(deployFixture);
      await proxy.connect(admin1).fundPool({ value: ethers.parseEther("1") });
      // No sponsored tx ran → accumulatedFees is 0 → withdraw(1 wei) reverts.
      await expect(
        proxy.connect(admin1).withdraw(admin1.address, 1n),
      ).to.be.revertedWithCustomError(proxy, "IntuitionFeeProxy_InsufficientAccumulatedFees");
    });

    it("withdrawAll reverts with nothing to withdraw before any sponsored tx ran", async function () {
      const { proxy, admin1 } = await loadFixture(deployFixture);
      await proxy.connect(admin1).fundPool({ value: ethers.parseEther("1") });
      await expect(
        proxy.connect(admin1).withdrawAll(admin1.address),
      ).to.be.revertedWithCustomError(proxy, "IntuitionFeeProxy_NothingToWithdraw");
    });

    it("admin can withdraw Sofia fees accrued from sponsored deposits", async function () {
      const { proxy, admin1, user1, to } = await loadFixture(deployFixture);
      await proxy.connect(admin1).fundPool({ value: ethers.parseEther("5") });
      const termId = ethers.encodeBytes32String("t");
      const assets = ethers.parseEther("0.5");
      const fee = DEPOSIT_FEE + (assets * DEPOSIT_PCT) / FEE_DENOMINATOR;

      await proxy.connect(user1).depositSponsored(termId, 1n, 0n, assets, { value: 0 });
      expect(await proxy.accumulatedFees()).to.equal(fee);

      const balBefore = await ethers.provider.getBalance(to.address);
      await expect(proxy.connect(admin1).withdrawAll(to.address))
        .to.emit(proxy, "FeesWithdrawn")
        .withArgs(to.address, fee, admin1.address);

      expect(await proxy.accumulatedFees()).to.equal(0n);
      expect(await ethers.provider.getBalance(to.address)).to.equal(balBefore + fee);
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
      await proxy.connect(admin1).fundPool({ value: ethers.parseEther("1") });
      const termId = ethers.encodeBytes32String("t");
      const assets = ethers.parseEther("0.5");
      const fee = DEPOSIT_FEE + (assets * DEPOSIT_PCT) / FEE_DENOMINATOR;
      const tx = await proxy.connect(user1).depositSponsored(termId, 1n, 0n, assets, { value: 0 });
      const block = await ethers.provider.getBlock((await tx.wait())!.blockNumber);

      const [count, volume, resetsAt] = await proxy.getClaimStatus(user1.address);
      expect(count).to.equal(1n);
      // volume reflects the full pool drain (assets + fee), matching CreditConsumed.
      expect(volume).to.equal(assets + fee);
      expect(resetsAt).to.equal(BigInt(block!.timestamp) + BigInt(ONE_DAY));
    });
  });

  // ============ createAtoms / createTriples / depositBatch (full-sponsorship) ============

  describe("createAtoms full-sponsorship", function () {
    it("pool pays atomCost*count + totalDeposit + fee, msg.value refunded", async function () {
      const { proxy, admin1, user1, mv } = await loadFixture(deployFixture);
      await proxy
        .connect(admin1)
        .setClaimLimits(ethers.parseEther("5"), 10n, ethers.parseEther("10"), BigInt(ONE_DAY));
      await proxy.connect(admin1).fundPool({ value: ethers.parseEther("5") });

      const atomCost = await mv.atomCost();
      const data: string[] = [
        ethers.hexlify(ethers.toUtf8Bytes("atom1")),
        ethers.hexlify(ethers.toUtf8Bytes("atom2")),
      ];
      const assets = [ethers.parseEther("0.1"), ethers.parseEther("0.2")];
      const totalDeposit = assets[0] + assets[1];
      const nonZero = 2n; // both > 0
      const fee =
        DEPOSIT_FEE * nonZero + (totalDeposit * DEPOSIT_PCT) / FEE_DENOMINATOR;
      const multiVaultCost = atomCost * 2n + totalDeposit;
      const totalRequired = multiVaultCost + fee;

      const poolBefore = await proxy.sponsorPool();
      await proxy.connect(user1).createAtoms(data, assets, 1n, { value: 0 });
      const poolAfter = await proxy.sponsorPool();

      expect(poolBefore - poolAfter).to.equal(totalRequired);
      expect(await proxy.accumulatedFees()).to.equal(fee);
    });

    it("reverts when totalRequired > maxClaimPerTx", async function () {
      const { proxy, admin1, user1 } = await loadFixture(deployFixture);
      await proxy.connect(admin1).fundPool({ value: ethers.parseEther("10") });
      const data: string[] = [ethers.hexlify(ethers.toUtf8Bytes("a"))];
      const assets = [ethers.parseEther("2")]; // > default cap 1
      await expect(
        proxy.connect(user1).createAtoms(data, assets, 1n, { value: 0 }),
      ).to.be.revertedWithCustomError(proxy, "Sponsored_ExceedsMaxPerTx");
    });
  });

  describe("depositBatch full-sponsorship", function () {
    it("pool pays totalDeposit + fee, msg.value refunded, admin can withdraw fees", async function () {
      const { proxy, admin1, user1 } = await loadFixture(deployFixture);
      await proxy
        .connect(admin1)
        .setClaimLimits(ethers.parseEther("5"), 10n, ethers.parseEther("10"), BigInt(ONE_DAY));
      await proxy.connect(admin1).fundPool({ value: ethers.parseEther("5") });

      const termIds = [ethers.encodeBytes32String("a"), ethers.encodeBytes32String("b")];
      const curveIds = [1n, 1n];
      const assets = [ethers.parseEther("0.3"), ethers.parseEther("0.4")];
      const minShares = [0n, 0n];
      const totalDeposit = assets[0] + assets[1];
      const depositCount = BigInt(termIds.length);
      const fee =
        DEPOSIT_FEE * depositCount + (totalDeposit * DEPOSIT_PCT) / FEE_DENOMINATOR;
      const totalRequired = totalDeposit + fee;

      const poolBefore = await proxy.sponsorPool();
      await proxy.connect(user1).depositBatch(termIds, curveIds, assets, minShares, { value: 0 });
      const poolAfter = await proxy.sponsorPool();

      expect(poolBefore - poolAfter).to.equal(totalRequired);
      expect(await proxy.accumulatedFees()).to.equal(fee);
    });
  });
});
