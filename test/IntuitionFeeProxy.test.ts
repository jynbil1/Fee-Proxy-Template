import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { IntuitionFeeProxy, MockMultiVault } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("IntuitionFeeProxy", function () {
  // Constants - customize these for your deployment
  const FEE_RECIPIENT = "0x0000000000000000000000000000000000000001"; // Replace with your address
  const DEPOSIT_FEE = ethers.parseEther("0.1"); // 0.1 TRUST per deposit
  const DEPOSIT_PERCENTAGE = 500n; // 5%
  const FEE_DENOMINATOR = 10000n;

  // Fixture to deploy contracts
  async function deployFixture() {
    const [owner, admin1, admin2, admin3, user, nonAdmin] = await ethers.getSigners();

    // Deploy MockMultiVault
    const MockMultiVaultFactory = await ethers.getContractFactory("MockMultiVault");
    const mockMultiVault = await MockMultiVaultFactory.deploy();
    await mockMultiVault.waitForDeployment();

    // Deploy IntuitionFeeProxy
    const IntuitionFeeProxyFactory = await ethers.getContractFactory("IntuitionFeeProxy");
    const proxy = await IntuitionFeeProxyFactory.deploy(
      await mockMultiVault.getAddress(),
      FEE_RECIPIENT,
      DEPOSIT_FEE,
      DEPOSIT_PERCENTAGE,
      [admin1.address, admin2.address, admin3.address]
    );
    await proxy.waitForDeployment();

    return { proxy, mockMultiVault, owner, admin1, admin2, admin3, user, nonAdmin };
  }

  describe("Initialization", function () {
    it("Should set correct MultiVault address", async function () {
      const { proxy, mockMultiVault } = await loadFixture(deployFixture);
      expect(await proxy.ethMultiVault()).to.equal(await mockMultiVault.getAddress());
    });

    it("Should set correct fee recipient", async function () {
      const { proxy } = await loadFixture(deployFixture);
      expect(await proxy.feeRecipient()).to.equal(FEE_RECIPIENT);
    });

    it("Should set correct deposit fees", async function () {
      const { proxy } = await loadFixture(deployFixture);
      expect(await proxy.depositFixedFee()).to.equal(DEPOSIT_FEE);
      expect(await proxy.depositPercentageFee()).to.equal(DEPOSIT_PERCENTAGE);
    });

    it("Should whitelist initial admins", async function () {
      const { proxy, admin1, admin2, admin3 } = await loadFixture(deployFixture);
      expect(await proxy.whitelistedAdmins(admin1.address)).to.be.true;
      expect(await proxy.whitelistedAdmins(admin2.address)).to.be.true;
      expect(await proxy.whitelistedAdmins(admin3.address)).to.be.true;
    });

    it("Should not whitelist non-admins", async function () {
      const { proxy, nonAdmin } = await loadFixture(deployFixture);
      expect(await proxy.whitelistedAdmins(nonAdmin.address)).to.be.false;
    });

    it("Should revert on zero MultiVault address", async function () {
      const [admin] = await ethers.getSigners();
      const IntuitionFeeProxyFactory = await ethers.getContractFactory("IntuitionFeeProxy");

      await expect(
        IntuitionFeeProxyFactory.deploy(
          ethers.ZeroAddress,
          FEE_RECIPIENT,
          DEPOSIT_FEE,
          DEPOSIT_PERCENTAGE,
          [admin.address]
        )
      ).to.be.revertedWithCustomError(IntuitionFeeProxyFactory, "IntuitionFeeProxy_InvalidMultiVaultAddress");
    });

    it("Should revert on zero fee recipient address", async function () {
      const { mockMultiVault } = await loadFixture(deployFixture);
      const [admin] = await ethers.getSigners();
      const IntuitionFeeProxyFactory = await ethers.getContractFactory("IntuitionFeeProxy");

      await expect(
        IntuitionFeeProxyFactory.deploy(
          await mockMultiVault.getAddress(),
          ethers.ZeroAddress,
          DEPOSIT_FEE,
          DEPOSIT_PERCENTAGE,
          [admin.address]
        )
      ).to.be.revertedWithCustomError(IntuitionFeeProxyFactory, "IntuitionFeeProxy_InvalidMultisigAddress");
    });
  });

  describe("Fee Calculations", function () {
    it("Should calculate deposit fee correctly (single deposit)", async function () {
      const { proxy } = await loadFixture(deployFixture);
      const depositAmount = ethers.parseEther("10");

      // Fee = 0.1 + (10 * 5%) = 0.1 + 0.5 = 0.6 TRUST
      const expectedFee = DEPOSIT_FEE + (depositAmount * DEPOSIT_PERCENTAGE / FEE_DENOMINATOR);
      expect(await proxy.calculateDepositFee(1n, depositAmount)).to.equal(expectedFee);
      expect(expectedFee).to.equal(ethers.parseEther("0.6"));
    });

    it("Should calculate deposit fee correctly (multiple deposits)", async function () {
      const { proxy } = await loadFixture(deployFixture);
      const depositCount = 3n;
      const totalDeposit = ethers.parseEther("30");

      // Fee = (0.1 * 3) + (30 * 5%) = 0.3 + 1.5 = 1.8 TRUST
      const expectedFee = (DEPOSIT_FEE * depositCount) + (totalDeposit * DEPOSIT_PERCENTAGE / FEE_DENOMINATOR);
      expect(await proxy.calculateDepositFee(depositCount, totalDeposit)).to.equal(expectedFee);
      expect(expectedFee).to.equal(ethers.parseEther("1.8"));
    });

    it("Should calculate total deposit cost correctly", async function () {
      const { proxy } = await loadFixture(deployFixture);
      const depositAmount = ethers.parseEther("10");

      const fee = await proxy.calculateDepositFee(1n, depositAmount);
      const totalCost = await proxy.getTotalDepositCost(depositAmount);
      expect(totalCost).to.equal(depositAmount + fee);
    });

    it("Should calculate total creation cost correctly", async function () {
      const { proxy } = await loadFixture(deployFixture);
      const depositCount = 3n;
      const totalDeposit = ethers.parseEther("0.03");
      const multiVaultCost = ethers.parseEther("1");

      const fee = await proxy.calculateDepositFee(depositCount, totalDeposit);
      const totalCost = await proxy.getTotalCreationCost(depositCount, totalDeposit, multiVaultCost);
      expect(totalCost).to.equal(multiVaultCost + fee);
    });
  });

  describe("Admin Functions", function () {
    it("Should allow admin to set deposit fixed fee", async function () {
      const { proxy, admin1 } = await loadFixture(deployFixture);
      const newFee = ethers.parseEther("0.2");

      await expect(proxy.connect(admin1).setDepositFixedFee(newFee))
        .to.emit(proxy, "DepositFixedFeeUpdated")
        .withArgs(DEPOSIT_FEE, newFee);

      expect(await proxy.depositFixedFee()).to.equal(newFee);
    });

    it("Should allow admin to set deposit percentage", async function () {
      const { proxy, admin2 } = await loadFixture(deployFixture);
      const newPercentage = 1000n; // 10%

      await expect(proxy.connect(admin2).setDepositPercentageFee(newPercentage))
        .to.emit(proxy, "DepositPercentageFeeUpdated")
        .withArgs(DEPOSIT_PERCENTAGE, newPercentage);

      expect(await proxy.depositPercentageFee()).to.equal(newPercentage);
    });

    it("Should allow admin to set fee recipient", async function () {
      const { proxy, admin1, user } = await loadFixture(deployFixture);

      await expect(proxy.connect(admin1).setFeeRecipient(user.address))
        .to.emit(proxy, "FeeRecipientUpdated")
        .withArgs(FEE_RECIPIENT, user.address);

      expect(await proxy.feeRecipient()).to.equal(user.address);
    });

    it("Should allow admin to whitelist new admin", async function () {
      const { proxy, admin1, nonAdmin } = await loadFixture(deployFixture);

      await expect(proxy.connect(admin1).setWhitelistedAdmin(nonAdmin.address, true))
        .to.emit(proxy, "AdminWhitelistUpdated")
        .withArgs(nonAdmin.address, true);

      expect(await proxy.whitelistedAdmins(nonAdmin.address)).to.be.true;
    });

    it("Should allow admin to remove admin", async function () {
      const { proxy, admin1, admin2 } = await loadFixture(deployFixture);

      await proxy.connect(admin1).setWhitelistedAdmin(admin2.address, false);
      expect(await proxy.whitelistedAdmins(admin2.address)).to.be.false;
    });

    it("Should revert when non-admin tries to set fees", async function () {
      const { proxy, nonAdmin } = await loadFixture(deployFixture);

      await expect(proxy.connect(nonAdmin).setDepositFixedFee(ethers.parseEther("0.5")))
        .to.be.revertedWithCustomError(proxy, "IntuitionFeeProxy_NotWhitelistedAdmin");
    });

    it("Should revert when setting fee recipient to zero address", async function () {
      const { proxy, admin1 } = await loadFixture(deployFixture);

      await expect(proxy.connect(admin1).setFeeRecipient(ethers.ZeroAddress))
        .to.be.revertedWithCustomError(proxy, "IntuitionFeeProxy_ZeroAddress");
    });

    it("Should revert when percentage fee is too high", async function () {
      const { proxy, admin1 } = await loadFixture(deployFixture);

      await expect(proxy.connect(admin1).setDepositPercentageFee(10001n))
        .to.be.revertedWithCustomError(proxy, "IntuitionFeeProxy_FeePercentageTooHigh");
    });
  });

  describe("Proxy Functions - createAtoms", function () {
    it("Should collect fees on createAtoms (fees based on deposits)", async function () {
      const { proxy, mockMultiVault, user } = await loadFixture(deployFixture);

      const data = [ethers.toUtf8Bytes("ipfs://atom1"), ethers.toUtf8Bytes("ipfs://atom2")];
      const assets = [ethers.parseEther("0.01"), ethers.parseEther("0.01")];
      const curveId = 1n;

      const atomCost = await mockMultiVault.getAtomCost();
      const totalDeposit = ethers.parseEther("0.02");
      const depositCount = 2n; // Both have non-zero deposits
      const fee = await proxy.calculateDepositFee(depositCount, totalDeposit);
      const multiVaultCost = (atomCost * 2n) + totalDeposit;
      const totalRequired = fee + multiVaultCost;

      const initialBalance = await ethers.provider.getBalance(FEE_RECIPIENT);

      await expect(proxy.connect(user).createAtoms(user.address, data, assets, curveId, { value: totalRequired }))
        .to.emit(proxy, "FeesCollected")
        .withArgs(user.address, fee, "createAtoms");

      const finalBalance = await ethers.provider.getBalance(FEE_RECIPIENT);
      expect(finalBalance - initialBalance).to.equal(fee);
    });

    it("Should not charge fees for zero deposits in createAtoms", async function () {
      const { proxy, mockMultiVault, user } = await loadFixture(deployFixture);

      const data = [ethers.toUtf8Bytes("ipfs://atom1"), ethers.toUtf8Bytes("ipfs://atom2")];
      const assets = [0n, 0n]; // No deposits
      const curveId = 1n;

      const atomCost = await mockMultiVault.getAtomCost();
      const fee = 0n; // No deposits = no fee
      const multiVaultCost = atomCost * 2n;
      const totalRequired = fee + multiVaultCost;

      const initialBalance = await ethers.provider.getBalance(FEE_RECIPIENT);

      await proxy.connect(user).createAtoms(user.address, data, assets, curveId, { value: totalRequired });

      const finalBalance = await ethers.provider.getBalance(FEE_RECIPIENT);
      expect(finalBalance - initialBalance).to.equal(0n);
    });

    it("Should revert on insufficient value for createAtoms", async function () {
      const { proxy, user } = await loadFixture(deployFixture);

      const data = [ethers.toUtf8Bytes("ipfs://atom1")];
      const assets = [ethers.parseEther("0.01")];
      const curveId = 1n;

      await expect(
        proxy.connect(user).createAtoms(user.address, data, assets, curveId, { value: ethers.parseEther("0.01") })
      ).to.be.revertedWithCustomError(proxy, "IntuitionFeeProxy_InsufficientValue");
    });

    it("Should reject createAtoms when receiver is not the sender", async function () {
      const { proxy, user, nonAdmin } = await loadFixture(deployFixture);

      const data = [ethers.toUtf8Bytes("ipfs://atom1")];
      const assets = [0n];
      const curveId = 1n;

      await expect(
        proxy.connect(user).createAtoms(nonAdmin.address, data, assets, curveId)
      ).to.be.revertedWithCustomError(proxy, "IntuitionFeeProxy_ReceiverMustBeSender");
    });
  });

  describe("Proxy Functions - createTriples", function () {
    it("Should collect fees on createTriples (fees based on deposits)", async function () {
      const { proxy, mockMultiVault, user } = await loadFixture(deployFixture);

      const subjectIds = [ethers.zeroPadValue("0x01", 32)];
      const predicateIds = [ethers.zeroPadValue("0x02", 32)];
      const objectIds = [ethers.zeroPadValue("0x03", 32)];
      const assets = [ethers.parseEther("0.01")];
      const curveId = 1n;

      const tripleCost = await mockMultiVault.getTripleCost();
      const totalDeposit = ethers.parseEther("0.01");
      const depositCount = 1n;
      const fee = await proxy.calculateDepositFee(depositCount, totalDeposit);
      const multiVaultCost = tripleCost + totalDeposit;
      const totalRequired = fee + multiVaultCost;

      const initialBalance = await ethers.provider.getBalance(FEE_RECIPIENT);

      await expect(proxy.connect(user).createTriples(user.address, subjectIds, predicateIds, objectIds, assets, curveId, { value: totalRequired }))
        .to.emit(proxy, "FeesCollected")
        .withArgs(user.address, fee, "createTriples");

      const finalBalance = await ethers.provider.getBalance(FEE_RECIPIENT);
      expect(finalBalance - initialBalance).to.equal(fee);
    });

    it("Should revert on wrong array lengths", async function () {
      const { proxy, user } = await loadFixture(deployFixture);

      const subjectIds = [ethers.zeroPadValue("0x01", 32), ethers.zeroPadValue("0x04", 32)];
      const predicateIds = [ethers.zeroPadValue("0x02", 32)]; // Wrong length
      const objectIds = [ethers.zeroPadValue("0x03", 32), ethers.zeroPadValue("0x05", 32)];
      const assets = [ethers.parseEther("0.01"), ethers.parseEther("0.01")];
      const curveId = 1n;

      await expect(
        proxy.connect(user).createTriples(user.address, subjectIds, predicateIds, objectIds, assets, curveId, { value: ethers.parseEther("10") })
      ).to.be.revertedWithCustomError(proxy, "IntuitionFeeProxy_WrongArrayLengths");
    });

    it("Should reject createTriples when receiver is not the sender", async function () {
      const { proxy, user, nonAdmin } = await loadFixture(deployFixture);

      const subjectIds = [ethers.zeroPadValue("0x01", 32)];
      const predicateIds = [ethers.zeroPadValue("0x02", 32)];
      const objectIds = [ethers.zeroPadValue("0x03", 32)];
      const assets = [0n];
      const curveId = 1n;

      await expect(
        proxy.connect(user).createTriples(nonAdmin.address, subjectIds, predicateIds, objectIds, assets, curveId)
      ).to.be.revertedWithCustomError(proxy, "IntuitionFeeProxy_ReceiverMustBeSender");
    });
  });

  describe("Proxy Functions - deposit", function () {
    it("Should collect fees on deposit (inverse calculation)", async function () {
      const { proxy, user } = await loadFixture(deployFixture);

      const desiredDepositAmount = ethers.parseEther("10");
      const totalToSend = await proxy.getTotalDepositCost(desiredDepositAmount);

      const initialBalance = await ethers.provider.getBalance(FEE_RECIPIENT);

      const termId = ethers.zeroPadValue("0x01", 32);

      await expect(proxy.connect(user).deposit(user.address, termId, 1n, 0n, { value: totalToSend }))
        .to.emit(proxy, "FeesCollected");

      const finalBalance = await ethers.provider.getBalance(FEE_RECIPIENT);
      const collectedFee = finalBalance - initialBalance;
      const expectedFee = await proxy.calculateDepositFee(1n, desiredDepositAmount);
      expect(collectedFee).to.be.closeTo(expectedFee, 1);
    });

    it("Should calculate multiVaultAmount correctly", async function () {
      const { proxy } = await loadFixture(deployFixture);

      const totalSent = ethers.parseEther("10.6"); // 10 + 0.1 fixed + 0.5 (5% of 10)
      const multiVaultAmount = await proxy.getMultiVaultAmountFromValue(totalSent);

      expect(multiVaultAmount).to.be.closeTo(ethers.parseEther("10"), ethers.parseEther("0.001"));
    });

    it("Should revert when sending only fixed fee or less", async function () {
      const { proxy, user } = await loadFixture(deployFixture);

      const termId = ethers.zeroPadValue("0x01", 32);

      await expect(
        proxy.connect(user).deposit(user.address, termId, 1n, 0n, { value: DEPOSIT_FEE })
      ).to.be.revertedWithCustomError(proxy, "IntuitionFeeProxy_InsufficientValue");

      await expect(
        proxy.connect(user).deposit(user.address, termId, 1n, 0n, { value: ethers.parseEther("0.05") })
      ).to.be.revertedWithCustomError(proxy, "IntuitionFeeProxy_InsufficientValue");
    });

    it("Should return 0 from getMultiVaultAmountFromValue for insufficient value", async function () {
      const { proxy } = await loadFixture(deployFixture);

      expect(await proxy.getMultiVaultAmountFromValue(DEPOSIT_FEE)).to.equal(0n);
      expect(await proxy.getMultiVaultAmountFromValue(ethers.parseEther("0.05"))).to.equal(0n);
    });

    it("Should reject deposit when receiver is not the sender", async function () {
      const { proxy, user, nonAdmin } = await loadFixture(deployFixture);

      const termId = ethers.zeroPadValue("0x01", 32);
      const totalToSend = await proxy.getTotalDepositCost(ethers.parseEther("1"));

      await expect(
        proxy.connect(user).deposit(nonAdmin.address, termId, 1n, 0n, { value: totalToSend })
      ).to.be.revertedWithCustomError(proxy, "IntuitionFeeProxy_ReceiverMustBeSender");
    });
  });

  describe("Proxy Functions - depositBatch", function () {
    it("Should collect fees on depositBatch", async function () {
      const { proxy, user } = await loadFixture(deployFixture);

      const termIds = [ethers.zeroPadValue("0x01", 32), ethers.zeroPadValue("0x02", 32)];
      const curveIds = [1n, 1n];
      const assets = [ethers.parseEther("5"), ethers.parseEther("5")];
      const minShares = [0n, 0n];

      const totalDeposit = ethers.parseEther("10");
      const fee = await proxy.calculateDepositFee(2n, totalDeposit);
      const totalRequired = totalDeposit + fee;

      const initialBalance = await ethers.provider.getBalance(FEE_RECIPIENT);

      await expect(proxy.connect(user).depositBatch(user.address, termIds, curveIds, assets, minShares, { value: totalRequired }))
        .to.emit(proxy, "FeesCollected")
        .withArgs(user.address, fee, "depositBatch");

      const finalBalance = await ethers.provider.getBalance(FEE_RECIPIENT);
      expect(finalBalance - initialBalance).to.equal(fee);
    });

    it("Should revert on wrong array lengths in depositBatch", async function () {
      const { proxy, user } = await loadFixture(deployFixture);

      const termIds = [ethers.zeroPadValue("0x01", 32), ethers.zeroPadValue("0x02", 32)];
      const curveIds = [1n]; // Wrong length
      const assets = [ethers.parseEther("5"), ethers.parseEther("5")];
      const minShares = [0n, 0n];

      await expect(
        proxy.connect(user).depositBatch(user.address, termIds, curveIds, assets, minShares, { value: ethers.parseEther("20") })
      ).to.be.revertedWithCustomError(proxy, "IntuitionFeeProxy_WrongArrayLengths");
    });

    it("Should reject depositBatch when receiver is not the sender", async function () {
      const { proxy, user, nonAdmin } = await loadFixture(deployFixture);

      const termIds = [ethers.zeroPadValue("0x01", 32)];
      const curveIds = [1n];
      const assets = [ethers.parseEther("1")];
      const minShares = [0n];
      const totalRequired = ethers.parseEther("1") + await proxy.calculateDepositFee(1n, ethers.parseEther("1"));

      await expect(
        proxy.connect(user).depositBatch(nonAdmin.address, termIds, curveIds, assets, minShares, { value: totalRequired })
      ).to.be.revertedWithCustomError(proxy, "IntuitionFeeProxy_ReceiverMustBeSender");
    });
  });

  describe("View Functions (Passthrough)", function () {
    it("Should return atom cost from MultiVault", async function () {
      const { proxy, mockMultiVault } = await loadFixture(deployFixture);
      expect(await proxy.getAtomCost()).to.equal(await mockMultiVault.getAtomCost());
    });

    it("Should return triple cost from MultiVault", async function () {
      const { proxy, mockMultiVault } = await loadFixture(deployFixture);
      expect(await proxy.getTripleCost()).to.equal(await mockMultiVault.getTripleCost());
    });

    it("Should return isTermCreated from MultiVault", async function () {
      const { proxy, mockMultiVault } = await loadFixture(deployFixture);
      const termId = ethers.zeroPadValue("0x01", 32);
      await mockMultiVault.setTermCreated(termId, true);
      expect(await proxy.isTermCreated(termId)).to.be.true;
    });

    it("Should return shares from MultiVault", async function () {
      const { proxy, mockMultiVault, user } = await loadFixture(deployFixture);
      const termId = ethers.zeroPadValue("0x01", 32);
      await mockMultiVault.setShares(user.address, termId, 1n, 1000n);
      expect(await proxy.getShares(user.address, termId, 1n)).to.equal(1000n);
    });
  });
});
