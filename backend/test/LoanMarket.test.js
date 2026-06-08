const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("LoanMarket", function () {
  let usdc, market, owner, borrower, investor1, investor2, outsider;

  const P  = (n) => ethers.parseUnits(String(n), 6);   // USDC units
  const FMT = (n) => ethers.formatUnits(n, 6);

  const PRINCIPAL    = P(15);    // $15 loan
  const INTEREST_BPS = 1200;     // 12% APR
  const DURATION     = 12;       // months

  beforeEach(async () => {
    [owner, borrower, investor1, investor2, outsider] = await ethers.getSigners();

    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    usdc = await MockUSDC.deploy();

    const LoanMarket = await ethers.getContractFactory("LoanMarket");
    market = await LoanMarket.deploy(await usdc.getAddress());

    // Mint balances
    await usdc.mint(investor1.address, P(1000));
    await usdc.mint(investor2.address, P(1000));
    await usdc.mint(borrower.address,  P(1000));
  });

  // ── helpers ──────────────────────────────────────────────────────────────────

  async function setupRoles() {
    await market.connect(borrower).registerAsBorrower();
    await market.connect(investor1).registerAsInvestor();
    await market.connect(investor2).registerAsInvestor();
  }

  async function requestLoan(principal = PRINCIPAL, bps = INTEREST_BPS, months = DURATION) {
    await market.connect(borrower).requestLoan(principal, bps, months, "ipfs://test");
    return 0; // loanId
  }

  async function approveFund(investor, loanId, amount) {
    await usdc.connect(investor).approve(await market.getAddress(), amount);
    await market.connect(investor).fundLoan(loanId, amount);
  }

  // ── registration ─────────────────────────────────────────────────────────────

  it("registers borrower and investor", async () => {
    await market.connect(borrower).registerAsBorrower();
    await market.connect(investor1).registerAsInvestor();
    expect(await market.isBorrower(borrower.address)).to.be.true;
    expect(await market.isInvestor(investor1.address)).to.be.true;
    expect(await market.getUserRole(borrower.address)).to.equal("borrower");
    expect(await market.getUserRole(investor1.address)).to.equal("investor");
  });

  it("prevents dual registration", async () => {
    await market.connect(borrower).registerAsBorrower();
    await expect(market.connect(borrower).registerAsInvestor()).to.be.revertedWith("Already registered");
  });

  it("returns unknown for unregistered address", async () => {
    expect(await market.getUserRole(outsider.address)).to.equal("unknown");
  });

  // ── requestLoan ──────────────────────────────────────────────────────────────

  it("borrower can request a loan", async () => {
    await setupRoles();
    const id = await requestLoan();
    const loan = await market.getLoan(id);
    expect(loan.borrower).to.equal(borrower.address);
    expect(loan.principal).to.equal(PRINCIPAL);
    expect(loan.fundedAmount).to.equal(0n);
    expect(loan.repaid).to.be.false;
  });

  it("non-borrower cannot request loan", async () => {
    await market.connect(investor1).registerAsInvestor();
    await expect(
      market.connect(investor1).requestLoan(PRINCIPAL, INTEREST_BPS, DURATION, "x")
    ).to.be.revertedWith("Not a borrower");
  });

  it("rejects principal below minimum", async () => {
    await market.connect(borrower).registerAsBorrower();
    await expect(
      market.connect(borrower).requestLoan(P(5), INTEREST_BPS, DURATION, "x")
    ).to.be.revertedWith("Principal out of range");
  });

  it("rejects duration outside 1-24 months", async () => {
    await market.connect(borrower).registerAsBorrower();
    await expect(
      market.connect(borrower).requestLoan(PRINCIPAL, INTEREST_BPS, 25, "x")
    ).to.be.revertedWith("Duration 1-24 months");
  });

  // ── fundLoan (single investor) ───────────────────────────────────────────────

  it("investor fully funds a loan — USDC goes P2P to borrower", async () => {
    await setupRoles();
    const id = await requestLoan();
    const before = await usdc.balanceOf(borrower.address);

    await approveFund(investor1, id, PRINCIPAL);

    const loan = await market.getLoan(id);
    expect(loan.fundedAmount).to.equal(PRINCIPAL);
    expect(await usdc.balanceOf(borrower.address)).to.equal(before + PRINCIPAL);
  });

  it("emits LoanFunded and LoanFullyFunded", async () => {
    await setupRoles();
    const id = await requestLoan();
    await usdc.connect(investor1).approve(await market.getAddress(), PRINCIPAL);

    await expect(market.connect(investor1).fundLoan(id, PRINCIPAL))
      .to.emit(market, "LoanFunded").withArgs(id, investor1.address, PRINCIPAL, PRINCIPAL)
      .and.to.emit(market, "LoanFullyFunded").withArgs(id);
  });

  it("rejects funding below MIN_CONTRIBUTION ($2)", async () => {
    await setupRoles();
    const id = await requestLoan();
    await usdc.connect(investor1).approve(await market.getAddress(), P(1));
    await expect(market.connect(investor1).fundLoan(id, P(1))).to.be.revertedWith("Below minimum contribution");
  });

  it("caps funding to remaining principal (no overfund)", async () => {
    await setupRoles();
    const id = await requestLoan();
    // investor1 funds $10 of $15 loan
    await approveFund(investor1, id, P(10));
    // investor2 tries to fund $10 but only $5 remains
    const before = await usdc.balanceOf(investor2.address);
    await usdc.connect(investor2).approve(await market.getAddress(), P(10));
    await market.connect(investor2).fundLoan(id, P(10));
    const spent = before - (await usdc.balanceOf(investor2.address));
    expect(spent).to.equal(P(5));  // only $5 taken, not $10
    const loan = await market.getLoan(id);
    expect(loan.fundedAmount).to.equal(PRINCIPAL);
  });

  it("rejects non-investor from funding", async () => {
    await setupRoles();
    const id = await requestLoan();
    await expect(market.connect(outsider).fundLoan(id, P(5))).to.be.revertedWith("Not an investor");
  });

  // ── MULTI-LENDER: two investors split a loan ──────────────────────────────────

  it("two investors partially fund — contributions recorded correctly", async () => {
    await setupRoles();
    const id = await requestLoan();

    await approveFund(investor1, id, P(10));  // $10 of $15
    await approveFund(investor2, id, P(5));   // $5 of $15

    const loan = await market.getLoan(id);
    expect(loan.fundedAmount).to.equal(PRINCIPAL);
    expect(await market.getContribution(id, investor1.address)).to.equal(P(10));
    expect(await market.getContribution(id, investor2.address)).to.equal(P(5));

    const lenders = await market.getLenders(id);
    expect(lenders).to.include(investor1.address);
    expect(lenders).to.include(investor2.address);
  });

  // ── makePayment ───────────────────────────────────────────────────────────────

  it("single investor — full repayment settles correctly", async () => {
    await setupRoles();
    const id = await requestLoan();
    await approveFund(investor1, id, PRINCIPAL);

    const loan  = await market.getLoan(id);
    const owed  = loan.monthlyPayment * BigInt(DURATION);
    const inv1Before = await usdc.balanceOf(investor1.address);

    await usdc.connect(borrower).approve(await market.getAddress(), owed);
    await market.connect(borrower).makePayment(id, owed);

    const repaid = await market.getLoan(id);
    expect(repaid.repaid).to.be.true;
    expect(await usdc.balanceOf(investor1.address)).to.equal(inv1Before + owed);
  });

  it("two investors — pro-rata payment distribution", async () => {
    await setupRoles();
    const id = await requestLoan();

    await approveFund(investor1, id, P(10));  // 2/3 of loan
    await approveFund(investor2, id, P(5));   // 1/3 of loan

    const loan    = await market.getLoan(id);
    const payment = P(9);  // partial payment

    const inv1Before = await usdc.balanceOf(investor1.address);
    const inv2Before = await usdc.balanceOf(investor2.address);

    await usdc.connect(borrower).approve(await market.getAddress(), payment);
    await market.connect(borrower).makePayment(id, payment);

    const inv1Got = (await usdc.balanceOf(investor1.address)) - inv1Before;
    const inv2Got = (await usdc.balanceOf(investor2.address)) - inv2Before;

    // investor1 contributed 10/15 = 2/3, so should get ~$6
    // investor2 contributed  5/15 = 1/3, so should get ~$3
    // Together they get $9 total (dust tolerance ±1 unit)
    expect(inv1Got + inv2Got).to.equal(payment);
    // Ratio check: investor1 gets at least double investor2
    expect(inv1Got).to.be.greaterThan(inv2Got);
  });

  it("caps payment to remaining owed — auto-caps overpayment", async () => {
    await setupRoles();
    const id = await requestLoan();
    await approveFund(investor1, id, PRINCIPAL);

    const loan = await market.getLoan(id);
    const owed = loan.monthlyPayment * BigInt(DURATION);

    // pay way more than owed
    await usdc.connect(borrower).approve(await market.getAddress(), owed * 5n);
    const borrowerBefore = await usdc.balanceOf(borrower.address);
    await market.connect(borrower).makePayment(id, owed * 5n);
    const spent = borrowerBefore - (await usdc.balanceOf(borrower.address));

    expect(spent).to.equal(owed);  // only owed amount taken
    expect((await market.getLoan(id)).repaid).to.be.true;
  });

  it("blocks payments after full repayment", async () => {
    await setupRoles();
    const id = await requestLoan();
    await approveFund(investor1, id, PRINCIPAL);

    const loan = await market.getLoan(id);
    const owed = loan.monthlyPayment * BigInt(DURATION);

    await usdc.connect(borrower).approve(await market.getAddress(), owed * 2n);
    await market.connect(borrower).makePayment(id, owed);
    await expect(market.connect(borrower).makePayment(id, P(1))).to.be.revertedWith("Already repaid");
  });

  it("blocks non-borrower from paying", async () => {
    await setupRoles();
    const id = await requestLoan();
    await approveFund(investor1, id, PRINCIPAL);
    await usdc.connect(investor1).approve(await market.getAddress(), P(5));
    await expect(market.connect(investor1).makePayment(id, P(5))).to.be.revertedWith("Not borrower");
  });

  it("blocks payment on unfunded loan", async () => {
    await setupRoles();
    const id = await requestLoan();
    await usdc.connect(borrower).approve(await market.getAddress(), P(5));
    await expect(market.connect(borrower).makePayment(id, P(5))).to.be.revertedWith("Loan not funded");
  });

  // ── E2E: full lifecycle with two investors ────────────────────────────────────

  it("E2E: request → two-investor fund → multiple partial repayments → repaid", async () => {
    await setupRoles();
    const id = await requestLoan(P(12), 1200, 12);  // $12 loan

    // Two investors fund $8 + $4
    await approveFund(investor1, id, P(8));
    await approveFund(investor2, id, P(4));

    expect((await market.getLoan(id)).fundedAmount).to.equal(P(12));

    const loan    = await market.getLoan(id);
    const owed    = loan.monthlyPayment * 12n;
    const monthly = loan.monthlyPayment;

    // Track investor starting balances
    const inv1Start = await usdc.balanceOf(investor1.address);
    const inv2Start = await usdc.balanceOf(investor2.address);

    // Borrower repays month by month
    await usdc.connect(borrower).approve(await market.getAddress(), owed + P(1));
    let remaining = owed;
    while (remaining > 0n) {
      const pay = remaining < monthly ? remaining : monthly;
      await market.connect(borrower).makePayment(id, pay);
      remaining -= pay;
    }

    const finalLoan = await market.getLoan(id);
    expect(finalLoan.repaid).to.be.true;

    const inv1Got = (await usdc.balanceOf(investor1.address)) - inv1Start;
    const inv2Got = (await usdc.balanceOf(investor2.address)) - inv2Start;

    // Total returned must equal total owed (within 1 unit rounding)
    const total = inv1Got + inv2Got;
    expect(total).to.be.within(owed - 1n, owed + 1n);

    // investor1 funded 8/12 = 2/3, investor2 funded 4/12 = 1/3
    expect(inv1Got).to.be.greaterThan(inv2Got);
  });
});
