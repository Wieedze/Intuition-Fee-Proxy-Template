import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import {
  IntuitionFeeProxyV2,
  IntuitionFeeProxyV2_1,
  IntuitionVersionedFeeProxy,
  MockMultiVault,
} from "../typechain-types";

/// Covers the minimal-diff V2.1 impl: verifies the `VersionUsed` event
/// marker fires, that storage + fee behaviour is identical to V2, and
/// that version switching (pinned vs default) routes correctly on a proxy
/// that has both impls registered.
describe("IntuitionFeeProxyV2_1 — canonical versioning demo", function () {
  const DEPOSIT_FEE = ethers.parseEther("0.1");
  const DEPOSIT_PERCENTAGE = 500n; // 5%
  const FEE_DENOMINATOR = 10_000n;
  const MAX_FEE_BPS = 1000n;
  const MAX_FIXED_FEE = ethers.parseEther("10");

  const V2_LABEL = ethers.encodeBytes32String("v2.0.0");
  const V2_1_LABEL = ethers.encodeBytes32String("v2.1.0");
  // MUST match the `VERSION_LABEL` constant in IntuitionFeeProxyV2_1.sol.
  const V2_1_EVENT_LABEL = ethers.encodeBytes32String("v2.1.0");

  async function deployFixture() {
    const [deployer, admin, user] = await ethers.getSigners();

    // MultiVault mock with deterministic costs so we can compute expected fees.
    const MV = await ethers.getContractFactory("MockMultiVault");
    const mv = (await MV.deploy()) as unknown as MockMultiVault;
    await mv.waitForDeployment();

    // V2 impl — the "already deployed" canonical version the proxy boots on.
    const V2 = await ethers.getContractFactory("IntuitionFeeProxyV2");
    const v2Impl = (await V2.deploy()) as unknown as IntuitionFeeProxyV2;
    await v2Impl.waitForDeployment();

    // V2.1 impl — will be registered after proxy deployment to simulate the
    // "publish a new canonical version" flow.
    const V2_1 = await ethers.getContractFactory("IntuitionFeeProxyV2_1");
    const v2_1Impl = (await V2_1.deploy()) as unknown as IntuitionFeeProxyV2_1;
    await v2_1Impl.waitForDeployment();

    const initData = v2Impl.interface.encodeFunctionData("initialize", [
      await mv.getAddress(),
      DEPOSIT_FEE,
      DEPOSIT_PERCENTAGE,
      [admin.address],
    ]);

    const Versioned = await ethers.getContractFactory("IntuitionVersionedFeeProxy");
    const proxyDeployment = (await Versioned.deploy(
      admin.address,
      V2_LABEL,
      await v2Impl.getAddress(),
      initData,
      ethers.ZeroHash,
    )) as unknown as IntuitionVersionedFeeProxy;
    await proxyDeployment.waitForDeployment();

    const proxyAddress = await proxyDeployment.getAddress();

    // Two facets over the same proxy storage — one typed as V2, one as V2.1 —
    // so we can exercise either ABI without redeploying.
    const proxyAsV2 = (await ethers.getContractAt(
      "IntuitionFeeProxyV2",
      proxyAddress,
    )) as unknown as IntuitionFeeProxyV2;
    const proxyAsV2_1 = (await ethers.getContractAt(
      "IntuitionFeeProxyV2_1",
      proxyAddress,
    )) as unknown as IntuitionFeeProxyV2_1;
    const versioned = (await ethers.getContractAt(
      "IntuitionVersionedFeeProxy",
      proxyAddress,
    )) as unknown as IntuitionVersionedFeeProxy;

    return {
      deployer,
      admin,
      user,
      mv,
      v2Impl,
      v2_1Impl,
      proxyAddress,
      proxyAsV2,
      proxyAsV2_1,
      versioned,
    };
  }

  it("VERSION_LABEL constant matches the expected bytes32 encoding", async function () {
    const { v2_1Impl } = await loadFixture(deployFixture);
    expect(await v2_1Impl.VERSION_LABEL()).to.equal(V2_1_EVENT_LABEL);
  });

  it("emits VersionUsed on deposit when v2.1.0 is the default", async function () {
    const { admin, user, proxyAsV2, versioned, v2_1Impl } =
      await loadFixture(deployFixture);

    // Admin (= proxyAdmin) registers the new impl and promotes it.
    await versioned
      .connect(admin)
      .registerVersion(V2_1_LABEL, await v2_1Impl.getAddress());
    await versioned.connect(admin).setDefaultVersion(V2_1_LABEL);

    const termId = ethers.keccak256(ethers.toUtf8Bytes("term"));
    const depositAmount = ethers.parseEther("1");
    const fee = await proxyAsV2.calculateDepositFee(1, depositAmount);

    await expect(
      proxyAsV2
        .connect(user)
        .deposit(termId, 0, 0, MAX_FEE_BPS, MAX_FIXED_FEE, { value: depositAmount + fee }),
    )
      .to.emit(
        await ethers.getContractAt("IntuitionFeeProxyV2_1", await proxyAsV2.getAddress()),
        "VersionUsed",
      )
      .withArgs(V2_1_EVENT_LABEL, user.address);
  });

  it("does NOT emit VersionUsed while the default is still v2.0.0", async function () {
    const { user, proxyAsV2, proxyAsV2_1 } = await loadFixture(deployFixture);

    const termId = ethers.keccak256(ethers.toUtf8Bytes("term"));
    const depositAmount = ethers.parseEther("1");
    const fee = await proxyAsV2.calculateDepositFee(1, depositAmount);

    const tx = await proxyAsV2
      .connect(user)
      .deposit(termId, 0, 0, MAX_FEE_BPS, MAX_FIXED_FEE, { value: depositAmount + fee });
    const receipt = await tx.wait();

    const versionUsedTopic = proxyAsV2_1.interface.getEvent("VersionUsed")!.topicHash;
    const hit = receipt!.logs.some((l) => l.topics[0] === versionUsedTopic);
    expect(hit, "unexpected VersionUsed event under v2.0.0 default").to.be.false;
  });

  it("produces the same fees + storage diff as V2 when running under v2.1.0", async function () {
    const { admin, user, proxyAsV2, versioned, v2_1Impl } =
      await loadFixture(deployFixture);

    const termId = ethers.keccak256(ethers.toUtf8Bytes("term"));
    const depositAmount = ethers.parseEther("1");
    const fee = await proxyAsV2.calculateDepositFee(1, depositAmount);

    // Step 1 — a deposit under v2.0.0 (no event, fees accrue normally).
    await proxyAsV2.connect(user).deposit(termId, 0, 0, MAX_FEE_BPS, MAX_FIXED_FEE, { value: depositAmount + fee });
    const feesAfterV2 = await proxyAsV2.accumulatedFees();
    const depositsAfterV2 = await proxyAsV2.totalDeposits();

    // Step 2 — register + promote v2.1.0.
    await versioned
      .connect(admin)
      .registerVersion(V2_1_LABEL, await v2_1Impl.getAddress());
    await versioned.connect(admin).setDefaultVersion(V2_1_LABEL);

    // Step 3 — a second deposit, now under v2.1.0. Fee delta must be identical.
    await proxyAsV2.connect(user).deposit(termId, 0, 0, MAX_FEE_BPS, MAX_FIXED_FEE, { value: depositAmount + fee });
    const feesAfterV2_1 = await proxyAsV2.accumulatedFees();
    const depositsAfterV2_1 = await proxyAsV2.totalDeposits();

    const feeDeltaV2 = feesAfterV2;
    const feeDeltaV2_1 = feesAfterV2_1 - feesAfterV2;

    expect(feeDeltaV2_1).to.equal(
      feeDeltaV2,
      "v2.1.0 must charge the same fee as v2.0.0",
    );
    expect(depositsAfterV2).to.equal(1n);
    expect(depositsAfterV2_1).to.equal(2n);
    // Admin count lives in storage — it must survive the version swap untouched.
    expect(await proxyAsV2.adminCount()).to.equal(1n);
  });

  it("executeAtVersion(v2.0.0) still routes to v2 impl after v2.1.0 is default", async function () {
    const { admin, user, proxyAsV2, proxyAsV2_1, versioned, v2_1Impl } =
      await loadFixture(deployFixture);

    await versioned
      .connect(admin)
      .registerVersion(V2_1_LABEL, await v2_1Impl.getAddress());
    await versioned.connect(admin).setDefaultVersion(V2_1_LABEL);

    // Build the calldata for v2.0.0's deposit — same selector since V2.1
    // inherits the ABI, but the pinned execution routes through the V2 impl
    // bytecode which does NOT emit VersionUsed.
    const termId = ethers.keccak256(ethers.toUtf8Bytes("term"));
    const depositAmount = ethers.parseEther("1");
    const fee = await proxyAsV2.calculateDepositFee(1, depositAmount);

    const depositCalldata = proxyAsV2.interface.encodeFunctionData(
      "deposit",
      [termId, 0, 0, MAX_FEE_BPS, MAX_FIXED_FEE],
    );

    const tx = await versioned
      .connect(user)
      .executeAtVersion(V2_LABEL, depositCalldata, {
        value: depositAmount + fee,
      });
    const receipt = await tx.wait();

    const versionUsedTopic = proxyAsV2_1.interface.getEvent("VersionUsed")!.topicHash;
    const hit = receipt!.logs.some((l) => l.topics[0] === versionUsedTopic);
    expect(hit, "pinned v2.0.0 call must not emit VersionUsed").to.be.false;
  });

  it("the proxy's on-chain admin count and fees survive a version swap", async function () {
    const { admin, user, proxyAsV2, versioned, v2_1Impl } =
      await loadFixture(deployFixture);

    const termId = ethers.keccak256(ethers.toUtf8Bytes("term"));
    const depositAmount = ethers.parseEther("1");
    const fee = await proxyAsV2.calculateDepositFee(1, depositAmount);

    // Run a deposit first to generate non-zero fee state.
    await proxyAsV2.connect(user).deposit(termId, 0, 0, MAX_FEE_BPS, MAX_FIXED_FEE, { value: depositAmount + fee });
    const feesBefore = await proxyAsV2.accumulatedFees();
    const totalBefore = await proxyAsV2.totalFeesCollectedAllTime();

    // Swap default to v2.1.0.
    await versioned
      .connect(admin)
      .registerVersion(V2_1_LABEL, await v2_1Impl.getAddress());
    await versioned.connect(admin).setDefaultVersion(V2_1_LABEL);

    // All money-state reads must survive untouched — the swap is pure routing.
    expect(await proxyAsV2.accumulatedFees()).to.equal(feesBefore);
    expect(await proxyAsV2.totalFeesCollectedAllTime()).to.equal(totalBefore);
    expect(await proxyAsV2.adminCount()).to.equal(1n);
  });

  // Silence "unused" warnings for the fee-denominator constant.
  void FEE_DENOMINATOR;
});

describe("IntuitionFeeProxyV2_1Sponsored — sponsored versioning demo", function () {
  const DEPOSIT_FEE = ethers.parseEther("0.1");
  const DEPOSIT_PERCENTAGE = 500n;

  const V2_SPONSORED_LABEL = ethers.encodeBytes32String("v2.0.0-sponsored");

  it("version() returns v2.1.0-sponsored when that impl is the default", async function () {
    const [deployer, admin] = await ethers.getSigners();

    const MV = await ethers.getContractFactory("MockMultiVault");
    const mv = await MV.deploy();
    await mv.waitForDeployment();

    // Deploy V2Sponsored impl as the initial pin.
    const V2S = await ethers.getContractFactory("IntuitionFeeProxyV2Sponsored");
    const v2sImpl = await V2S.deploy();
    await v2sImpl.waitForDeployment();

    // Deploy V2_1Sponsored for later registration.
    const V2_1S = await ethers.getContractFactory("IntuitionFeeProxyV2_1Sponsored");
    const v2_1sImpl = await V2_1S.deploy();
    await v2_1sImpl.waitForDeployment();

    const initData = v2sImpl.interface.encodeFunctionData("initialize", [
      await mv.getAddress(),
      DEPOSIT_FEE,
      DEPOSIT_PERCENTAGE,
      [admin.address],
    ]);

    const Versioned = await ethers.getContractFactory("IntuitionVersionedFeeProxy");
    const proxyDeployment = await Versioned.deploy(
      admin.address,
      V2_SPONSORED_LABEL,
      await v2sImpl.getAddress(),
      initData,
      ethers.ZeroHash,
    );
    await proxyDeployment.waitForDeployment();

    const proxyAddress = await proxyDeployment.getAddress();

    // Initially pinned to v2.0.0-sponsored — version() reflects it.
    const asV2S = await ethers.getContractAt(
      "IntuitionFeeProxyV2Sponsored",
      proxyAddress,
    );
    expect(await asV2S.version()).to.equal("v2.0.0-sponsored");

    // Register + promote v2.1.0-sponsored.
    const versioned = await ethers.getContractAt(
      "IntuitionVersionedFeeProxy",
      proxyAddress,
    );
    const V2_1_SPONSORED_LABEL = ethers.encodeBytes32String("v2.1.0-sponsored");
    await versioned
      .connect(admin)
      .registerVersion(V2_1_SPONSORED_LABEL, await v2_1sImpl.getAddress());
    await versioned.connect(admin).setDefaultVersion(V2_1_SPONSORED_LABEL);

    // After promotion, version() returns the new label — proof the routing
    // honours `setDefaultVersion` on sponsored proxies too.
    expect(await asV2S.version()).to.equal("v2.1.0-sponsored");
    void deployer;
  });
});
