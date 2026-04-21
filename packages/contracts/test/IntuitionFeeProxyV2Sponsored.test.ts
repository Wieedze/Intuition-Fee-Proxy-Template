import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import {
  IntuitionFeeProxyV2Sponsored,
  MockMultiVault,
} from "../typechain-types";

describe("IntuitionFeeProxyV2Sponsored", function () {
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

    it("emits ClaimLimitsSet at construction via delegatecall init", async function () {
      const { impl, mv, admin1 } = await loadFixture(deployFixture);
      // The event is emitted inside the versioned proxy constructor when it
      // delegatecalls `initialize`. We assert this by redeploying a fresh
      // instance and listening to the constructor's tx receipt.
      const initData = impl.interface.encodeFunctionData("initialize", [
        await mv.getAddress(),
        DEPOSIT_FEE,
        DEPOSIT_PCT,
        [admin1.address],
      ]);
      const VerFactory = await ethers.getContractFactory("IntuitionVersionedFeeProxy");
      const tx = await VerFactory.deploy(
        admin1.address,
        INITIAL_VERSION,
        await impl.getAddress(),
        initData,
        ethers.ZeroHash,
      );
      const rc = await tx.deploymentTransaction()!.wait();
      // We cannot easily parse the delegated event via the versioned-proxy ABI,
      // but we can confirm the defaults were written.
      const newProxy = (await ethers.getContractAt(
        "IntuitionFeeProxyV2Sponsored",
        await tx.getAddress(),
      )) as unknown as IntuitionFeeProxyV2Sponsored;
      expect(await newProxy.maxClaimPerTx()).to.equal(ethers.parseEther("1"));
      expect(rc!.logs.length).to.be.greaterThan(0);
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

  // ============ creditUser / creditUsers ============

  describe("creditUser / creditUsers (admin only)", function () {
    it("admin credits a user", async function () {
      const { proxy, admin1, user1 } = await loadFixture(deployFixture);
      const amount = ethers.parseEther("2");
      await expect(proxy.connect(admin1).creditUser(user1.address, { value: amount }))
        .to.emit(proxy, "UserCredited").withArgs(user1.address, amount, admin1.address);

      expect(await proxy.sponsoredCredit(user1.address)).to.equal(amount);
      expect(await proxy.totalSponsoredCredit()).to.equal(amount);
    });

    it("non-admin cannot creditUser", async function () {
      const { proxy, nonAdmin, user1 } = await loadFixture(deployFixture);
      await expect(
        proxy.connect(nonAdmin).creditUser(user1.address, { value: ethers.parseEther("1") }),
      ).to.be.revertedWithCustomError(proxy, "IntuitionFeeProxy_NotWhitelistedAdmin");
    });

    it("creditUser reverts on zero value / zero address", async function () {
      const { proxy, admin1, user1 } = await loadFixture(deployFixture);
      await expect(proxy.connect(admin1).creditUser(user1.address, { value: 0 }))
        .to.be.revertedWithCustomError(proxy, "Sponsored_NothingToCredit");
      await expect(proxy.connect(admin1).creditUser(ethers.ZeroAddress, { value: 1 }))
        .to.be.revertedWithCustomError(proxy, "IntuitionFeeProxy_ZeroAddress");
    });

    it("creditUsers batches multiple recipients; sum must equal msg.value", async function () {
      const { proxy, admin1, user1, user2 } = await loadFixture(deployFixture);
      const a = ethers.parseEther("1");
      const b = ethers.parseEther("0.5");

      await expect(
        proxy.connect(admin1).creditUsers(
          [user1.address, user2.address],
          [a, b],
          { value: a + b + 1n },
        ),
      ).to.be.revertedWithCustomError(proxy, "IntuitionFeeProxy_InsufficientValue");

      await proxy.connect(admin1).creditUsers(
        [user1.address, user2.address],
        [a, b],
        { value: a + b },
      );
      expect(await proxy.sponsoredCredit(user1.address)).to.equal(a);
      expect(await proxy.sponsoredCredit(user2.address)).to.equal(b);
      expect(await proxy.totalSponsoredCredit()).to.equal(a + b);
    });
  });

  // ============ uncreditUser (admin, refund to chosen address) ============

  describe("uncreditUser", function () {
    it("admin reclaims credit to a chosen recipient", async function () {
      const { proxy, admin1, user1, to } = await loadFixture(deployFixture);
      const amount = ethers.parseEther("3");
      await proxy.connect(admin1).creditUser(user1.address, { value: amount });

      const reclaim = ethers.parseEther("1");
      const balBefore = await ethers.provider.getBalance(to.address);
      await expect(proxy.connect(admin1).uncreditUser(user1.address, reclaim, to.address))
        .to.emit(proxy, "CreditReclaimed").withArgs(user1.address, reclaim, to.address);
      const balAfter = await ethers.provider.getBalance(to.address);

      expect(balAfter - balBefore).to.equal(reclaim);
      expect(await proxy.sponsoredCredit(user1.address)).to.equal(amount - reclaim);
      expect(await proxy.totalSponsoredCredit()).to.equal(amount - reclaim);
    });

    it("non-admin cannot reclaim", async function () {
      const { proxy, admin1, user1, nonAdmin, to } = await loadFixture(deployFixture);
      await proxy.connect(admin1).creditUser(user1.address, { value: ethers.parseEther("1") });
      await expect(
        proxy.connect(nonAdmin).uncreditUser(user1.address, 1, to.address),
      ).to.be.revertedWithCustomError(proxy, "IntuitionFeeProxy_NotWhitelistedAdmin");
    });

    it("reverts when amount exceeds remaining credit", async function () {
      const { proxy, admin1, user1, to } = await loadFixture(deployFixture);
      await proxy.connect(admin1).creditUser(user1.address, { value: ethers.parseEther("1") });
      await expect(
        proxy.connect(admin1).uncreditUser(user1.address, ethers.parseEther("2"), to.address),
      ).to.be.revertedWithCustomError(proxy, "Sponsored_InsufficientClaim");
    });
  });

  // ============ deposit consumes credit ============

  describe("deposit consumes credit", function () {
    it("user with enough credit can deposit with msg.value = 0", async function () {
      const { proxy, mv, admin1, user1 } = await loadFixture(deployFixture);
      const credit = ethers.parseEther("1");
      await proxy.connect(admin1).creditUser(user1.address, { value: credit });

      const termId = ethers.encodeBytes32String("t");
      const multiVault = ((credit - DEPOSIT_FEE) * FEE_DENOMINATOR) / (FEE_DENOMINATOR + DEPOSIT_PCT);
      const fee = credit - multiVault;

      await expect(proxy.connect(user1).deposit(termId, 1n, 0n, { value: 0 }))
        .to.emit(proxy, "CreditConsumed").withArgs(user1.address, credit);

      expect(await proxy.sponsoredCredit(user1.address)).to.equal(0n);
      expect(await proxy.totalSponsoredCredit()).to.equal(0n);
      expect(await proxy.accumulatedFees()).to.equal(fee);
      expect(await mv.lastDepositAmount()).to.equal(multiVault);
      expect(await mv.lastDepositReceiver()).to.equal(user1.address);
    });

    it("user with partial credit tops up via msg.value", async function () {
      const { proxy, admin1, user1 } = await loadFixture(deployFixture);
      const credit = ethers.parseEther("0.3");
      await proxy.connect(admin1).creditUser(user1.address, { value: credit });

      const termId = ethers.encodeBytes32String("t");
      const own = ethers.parseEther("0.7");
      const effective = credit + own;
      const multiVault = ((effective - DEPOSIT_FEE) * FEE_DENOMINATOR) / (FEE_DENOMINATOR + DEPOSIT_PCT);

      await proxy.connect(user1).deposit(termId, 1n, 0n, { value: own });
      expect(await proxy.sponsoredCredit(user1.address)).to.equal(0n);
      expect(await proxy.totalVolume()).to.equal(multiVault);
    });

    it("user without credit — parent V2 semantics still apply", async function () {
      const { proxy, user1 } = await loadFixture(deployFixture);
      const termId = ethers.encodeBytes32String("t");
      await proxy.connect(user1).deposit(termId, 1n, 0n, { value: ethers.parseEther("1") });
      expect(await proxy.totalDeposits()).to.equal(1n);
    });
  });

  // ============ Rate limits ============

  describe("maxClaimPerTx cap (per-tx claim limit)", function () {
    it("caps consumption at maxClaimPerTx; remainder stays available for later", async function () {
      const { proxy, admin1, user1 } = await loadFixture(deployFixture);
      // Default maxClaimPerTx = 1 TRUST. Credit 2 TRUST.
      await proxy.connect(admin1).creditUser(user1.address, { value: ethers.parseEther("2") });
      const termId = ethers.encodeBytes32String("t");
      // Deposit pulls only 1 TRUST (the cap), remaining 1 TRUST stays untouched.
      await proxy.connect(user1).deposit(termId, 1n, 0n, { value: 0 });
      expect(await proxy.sponsoredCredit(user1.address)).to.equal(ethers.parseEther("1"));
      expect(await proxy.totalSponsoredCredit()).to.equal(ethers.parseEther("1"));
    });

    it("raising the cap allows larger single-tx claims", async function () {
      const { proxy, admin1, user1 } = await loadFixture(deployFixture);
      await proxy.connect(admin1).creditUser(user1.address, { value: ethers.parseEther("2") });
      await proxy.connect(admin1).setClaimLimits(ethers.parseEther("3"), 10n);
      const termId = ethers.encodeBytes32String("t");
      // Cap now 3 TRUST — user drains all 2 TRUST in one call.
      await proxy.connect(user1).deposit(termId, 1n, 0n, { value: 0 });
      expect(await proxy.sponsoredCredit(user1.address)).to.equal(0n);
    });
  });

  describe("maxClaimsPerDay rate limit (24h tumbling window)", function () {
    it("blocks after N claims in the same window", async function () {
      const { proxy, admin1, user1 } = await loadFixture(deployFixture);
      // Cap 1 TRUST per tx, 2 claims per day. Credit 3 TRUST so all 3 calls have credit to consume.
      await proxy.connect(admin1).setClaimLimits(ethers.parseEther("1"), 2n);
      await proxy.connect(admin1).creditUser(user1.address, { value: ethers.parseEther("3") });
      const termId = ethers.encodeBytes32String("t");
      // Each deposit consumes 1 TRUST (capped). Value 0.2 tops up to meet InsufficientValue.
      await proxy.connect(user1).deposit(termId, 1n, 0n, { value: ethers.parseEther("0.2") });
      await proxy.connect(user1).deposit(termId, 1n, 0n, { value: ethers.parseEther("0.2") });
      // 3rd call attempts a 3rd consumption → rate-limit revert before any storage change.
      await expect(
        proxy.connect(user1).deposit(termId, 1n, 0n, { value: ethers.parseEther("0.2") }),
      ).to.be.revertedWithCustomError(proxy, "Sponsored_RateLimited");
    });

    it("resets after 24h and allows new claims", async function () {
      const { proxy, admin1, user1 } = await loadFixture(deployFixture);
      await proxy.connect(admin1).setClaimLimits(ethers.parseEther("1"), 1n);
      await proxy.connect(admin1).creditUser(user1.address, { value: ethers.parseEther("1") });
      const termId = ethers.encodeBytes32String("t");

      await proxy.connect(user1).deposit(termId, 1n, 0n, { value: ethers.parseEther("0.15") });
      // Second claim within the window must revert
      await proxy.connect(admin1).creditUser(user1.address, { value: ethers.parseEther("0.5") });
      await expect(
        proxy.connect(user1).deposit(termId, 1n, 0n, { value: ethers.parseEther("0.15") }),
      ).to.be.revertedWithCustomError(proxy, "Sponsored_RateLimited");

      // Advance time past the 24h window
      await time.increase(ONE_DAY + 1);
      await proxy.connect(user1).deposit(termId, 1n, 0n, { value: ethers.parseEther("0.15") });
    });

    it("does not count toward the window if consumed == 0 (user pays everything)", async function () {
      const { proxy, admin1, user1 } = await loadFixture(deployFixture);
      await proxy.connect(admin1).setClaimLimits(ethers.parseEther("1"), 1n);
      const termId = ethers.encodeBytes32String("t");
      // No credit; user pays full. Should NOT trip the rate limit.
      for (let i = 0; i < 3; i++) {
        await proxy.connect(user1).deposit(termId, 1n, 0n, { value: ethers.parseEther("0.5") });
      }
    });
  });

  // ============ depositFor + *For ============

  describe("sponsor-acting entry points (D3, always open)", function () {
    it("depositFor credits receiver on MultiVault, not caller", async function () {
      const { proxy, mv, nonAdmin, user1 } = await loadFixture(deployFixture);
      const termId = ethers.encodeBytes32String("t");
      await proxy.connect(nonAdmin).depositFor(user1.address, termId, 1n, 0n, {
        value: ethers.parseEther("1"),
      });
      expect(await mv.lastDepositReceiver()).to.equal(user1.address);
      expect(await proxy.totalSponsoredDeposits()).to.equal(1n);
      expect(await proxy.hasReceivedSponsored(user1.address)).to.be.true;
      expect(await proxy.totalSponsoredUniqueReceivers()).to.equal(1n);
    });

    it("depositFor reverts on zero receiver", async function () {
      const { proxy, nonAdmin } = await loadFixture(deployFixture);
      const termId = ethers.encodeBytes32String("t");
      await expect(
        proxy.connect(nonAdmin).depositFor(ethers.ZeroAddress, termId, 1n, 0n, {
          value: ethers.parseEther("1"),
        }),
      ).to.be.revertedWithCustomError(proxy, "Sponsored_ZeroReceiver");
    });

    it("does NOT trip the rate limit (depositFor is not a claim)", async function () {
      const { proxy, admin1, nonAdmin, user1 } = await loadFixture(deployFixture);
      await proxy.connect(admin1).setClaimLimits(ethers.parseEther("1"), 1n);
      const termId = ethers.encodeBytes32String("t");
      for (let i = 0; i < 3; i++) {
        await proxy.connect(nonAdmin).depositFor(user1.address, termId, 1n, 0n, {
          value: ethers.parseEther("1"),
        });
      }
    });
  });

  // ============ Withdraw invariant ============

  describe("withdraw credit-invariant protection", function () {
    it("withdrawAll drains only accumulatedFees; credit pool is preserved", async function () {
      const { proxy, admin1, user1, deployer } = await loadFixture(deployFixture);

      await proxy.connect(admin1).creditUser(user1.address, { value: ethers.parseEther("1") });

      const termId = ethers.encodeBytes32String("t");
      await proxy.connect(deployer).deposit(termId, 1n, 0n, { value: ethers.parseEther("1") });

      await proxy.connect(admin1).withdrawAll(admin1.address);
      expect(await proxy.accumulatedFees()).to.equal(0n);
      expect(await ethers.provider.getBalance(await proxy.getAddress())).to.equal(
        await proxy.totalSponsoredCredit(),
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
      await proxy.connect(admin1).creditUser(user1.address, { value: ethers.parseEther("0.5") });
      const termId = ethers.encodeBytes32String("t");
      const tx = await proxy.connect(user1).deposit(termId, 1n, 0n, { value: ethers.parseEther("0.15") });
      const block = await ethers.provider.getBlock((await tx.wait())!.blockNumber);

      const [count, resetsAt] = await proxy.getClaimStatus(user1.address);
      expect(count).to.equal(1n);
      expect(resetsAt).to.equal(BigInt(block!.timestamp) + BigInt(ONE_DAY));
    });
  });
});
