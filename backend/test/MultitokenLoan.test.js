const { expect } = require("chai");
const { ethers } = require("hardhat");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

describe("MultitokenLoan - USDC Only Marketplace (Ultra-Verbose Tests)", function () {
  let usdc, loan, owner, business, investor, outsider;

  const principal = ethers.parseUnits("1000", 6); // 1000 USDC
  const annualInterest = 1200; // 12% APR (bps)
  const duration = 12; // months
  const metadataCID = "ipfs://loan123";

  async function printLoan(id) {
    const l = await loan.getLoan(id);
    console.log(`
================ LOAN ${id} =================
Borrower:     ${l.borrower}
Funder:       ${l.funder}
Principal:    ${l.principal.toString()}
Interest:     ${l.interest} bps
Duration:     ${l.duration} months
Due Date:     ${l.dueDate}
Monthly Pay:  ${l.monthlyPayment.toString()}
Total Paid:   ${l.totalPaid.toString()}
Funded:       ${l.funded}
Repaid:       ${l.repaid}
=============================================
`);
  }

  beforeEach(async () => {
    [owner, business, investor, outsider] = await ethers.getSigners();

    console.log("\n===== Deploying MockUSDC =====");
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    usdc = await MockUSDC.deploy();
    console.log("MockUSDC deployed at:", await usdc.getAddress());

    console.log("===== Deploying MultitokenLoan =====");
    const Loan = await ethers.getContractFactory("MultitokenLoan");
    loan = await Loan.deploy(await usdc.getAddress());
    console.log("MultitokenLoan deployed at:", await loan.getAddress());

    console.log("Minting USDC balances...");
    await usdc.mint(business.address, ethers.parseUnits("100000", 6));
    await usdc.mint(investor.address, ethers.parseUnits("100000", 6));
  });

  it("should allow users to register as business or investor", async () => {
    console.log("\n===== Test: Role Registration =====");

    await loan.connect(business).registerAsBusiness();
    console.log("Registered business:", business.address);

    await loan.connect(investor).registerAsInvestor();
    console.log("Registered investor:", investor.address);

    expect(await loan.isBusiness(business.address)).to.be.true;
    expect(await loan.isInvestor(investor.address)).to.be.true;
  });

  it("should allow a registered business to request a loan", async () => {
    console.log("\n===== Test: Loan Creation =====");

    await loan.connect(business).registerAsBusiness();

    console.log("Requesting loan...");
    await loan
      .connect(business)
      .requestLoan(principal, annualInterest, duration, metadataCID);

    await printLoan(0);

    const l = await loan.getLoan(0);
    expect(l.borrower).to.equal(business.address);
  });

  it("should allow investor to fund a loan", async () => {
    console.log("\n===== Test: Loan Funding =====");

    await loan.connect(business).registerAsBusiness();
    await loan.connect(investor).registerAsInvestor();

    console.log("Business requests loan...");
    await loan
      .connect(business)
      .requestLoan(principal, annualInterest, duration, metadataCID);

    console.log("Investor approves USDC...");
    await usdc.connect(investor).approve(loan.getAddress(), principal);

    console.log("Funding loan...");
    await loan.connect(investor).fundLoan(0);

    await printLoan(0);

    expect((await loan.getLoan(0)).funded).to.be.true;
  });

  it("should process full repayment, including overpayments", async () => {
    console.log("\n===== Test: Full Repayment With Overpayments =====");

    await loan.connect(business).registerAsBusiness();
    await loan.connect(investor).registerAsInvestor();

    console.log("Creating loan request...");
    await loan
      .connect(business)
      .requestLoan(principal, annualInterest, duration, metadataCID);

    console.log("Funding loan...");
    await usdc.connect(investor).approve(loan.getAddress(), principal);
    await loan.connect(investor).fundLoan(0);

    await printLoan(0);

    let l = await loan.getLoan(0);
    const monthlyPayment = Number(l.monthlyPayment);
    const totalOwed = monthlyPayment * Number(l.duration);

    console.log("Calculated monthly payment:", monthlyPayment);
    console.log("Flat-interest total owed:", totalOwed);

    // Approve huge amount so business can overpay freely
    await usdc
      .connect(business)
      .approve(loan.getAddress(), ethers.parseUnits("999999", 6));

    console.log("\n===== Repayment Loop =====");
    const massiveOverpay = monthlyPayment * 7; // intentionally high

    let iteration = 1;

    while (true) {
      l = await loan.getLoan(0);
      const remaining = totalOwed - Number(l.totalPaid);

      console.log(
        `\nPayment ${iteration}: 
Current Total Paid: ${l.totalPaid}
Remaining Balance:   ${remaining}
Sending Payment:     ${massiveOverpay} (will cap automatically)`
      );

      if (remaining <= 0) {
        console.log("Loan fully repaid! Exiting loop.");
        break;
      }

      await loan.connect(business).makePayment(0, massiveOverpay);
      iteration++;

      await printLoan(0);
    }

    let final = await loan.getLoan(0);
    expect(final.repaid).to.be.true;
  });

  it("should block non-borrowers from paying", async () => {
    console.log("\n===== Test: Unauthorized Payment Attempt =====");

    await loan.connect(business).registerAsBusiness();
    await loan.connect(investor).registerAsInvestor();

    await loan
      .connect(business)
      .requestLoan(principal, annualInterest, duration, metadataCID);

    await usdc.connect(investor).approve(loan.getAddress(), principal);
    await loan.connect(investor).fundLoan(0);

    console.log("Investor attempts to pay (should fail)...");

    await expect(
      loan.connect(investor).makePayment(0, 1000)
    ).to.be.revertedWith("Not a registered business");
  });

  it("should block additional payments after full repayment", async () => {
    console.log("\n===== Test: Block Overpayment After Completion =====");

    await loan.connect(business).registerAsBusiness();
    await loan.connect(investor).registerAsInvestor();

    await loan
      .connect(business)
      .requestLoan(principal, annualInterest, duration, metadataCID);

    await usdc.connect(investor).approve(loan.getAddress(), principal);
    await loan.connect(investor).fundLoan(0);

    let l = await loan.getLoan(0);
    const monthlyPayment = Number(l.monthlyPayment);
    const totalOwed = monthlyPayment * Number(l.duration);

    console.log("Paying entire balance at once...");
    await usdc
      .connect(business)
      .approve(loan.getAddress(), ethers.parseUnits("999999", 6));

    await loan.connect(business).makePayment(0, totalOwed);

    console.log("Trying an additional payment (should revert)...");

    await expect(loan.connect(business).makePayment(0, 1)).to.be.revertedWith(
      "Already repaid"
    );
  });
});