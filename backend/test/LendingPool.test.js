const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("LendingPool", function () {
  let usdc, market, pool, owner, allocator, alice, bob, borrower, outsider;

  const P  = (n) => ethers.parseUnits(String(n), 6);   // USDC units (6 decimals)

  const PRINCIPAL    = P(100);   // $100 loan
  const INTEREST_BPS = 1200;     // 12% APR
  const DURATION     = 12;

  beforeEach(async () => {
    [owner, allocator, alice, bob, borrower, outsider] = await ethers.getSigners();

    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    usdc = await MockUSDC.deploy();

    const LoanMarket = await ethers.getContractFactory("LoanMarket");
    market = await LoanMarket.deploy(await usdc.getAddress());

    const LendingPool = await ethers.getContractFactory("LendingPool");
    pool = await LendingPool.deploy(await usdc.getAddress(), await market.getAddress());

    // Pool must register as investor on LoanMarket so it can fundLoan
    await pool.registerWithLoanMarket();

    // Backend hot wallet is `allocator`
    await pool.setAllocator(allocator.address);

    // Default test pool: id 0
    await pool.createPool("AgriPool", "agriculture", 60);

    // Borrower setup
    await market.connect(borrower).registerAsBorrower();
    await market.connect(borrower).requestLoan(PRINCIPAL, INTEREST_BPS, DURATION, "ipfs://test");

    // Fund participants
    await usdc.mint(alice.address,    P(10_000));
    await usdc.mint(bob.address,      P(10_000));
    await usdc.mint(borrower.address, P(10_000));   // for repayments
  });

  // ── Admin / setup ────────────────────────────────────────────────────────────

  it("creates pools with metadata", async () => {
    const p = await pool.getPool(0);
    expect(p.name).to.equal("AgriPool");
    expect(p.category).to.equal("agriculture");
    expect(p.minKarma).to.equal(60);
    expect(p.active).to.equal(true);
  });

  it("only owner can create pools", async () => {
    await expect(
      pool.connect(alice).createPool("X", "y", 50)
    ).to.be.revertedWithCustomError(pool, "OwnableUnauthorizedAccount");
  });

  it("rejects minKarma > 100", async () => {
    await expect(pool.createPool("X", "y", 101)).to.be.revertedWith("minKarma 0-100");
  });

  it("only owner can change allocator", async () => {
    await expect(
      pool.connect(alice).setAllocator(alice.address)
    ).to.be.revertedWithCustomError(pool, "OwnableUnauthorizedAccount");
  });

  // ── Deposit ─────────────────────────────────────────────────────────────────

  it("first depositor receives shares 1:1 with USDC", async () => {
    await usdc.connect(alice).approve(await pool.getAddress(), P(100));
    await pool.connect(alice).deposit(0, P(100));

    expect(await pool.sharesOf(0, alice.address)).to.equal(P(100));
    const p = await pool.getPool(0);
    expect(p.idle).to.equal(P(100));
    expect(p.totalShares).to.equal(P(100));
  });

  it("rejects deposit below MIN_DEPOSIT ($1)", async () => {
    await usdc.connect(alice).approve(await pool.getAddress(), P(0.5));
    await expect(
      pool.connect(alice).deposit(0, P(0.5))
    ).to.be.revertedWith("Below minimum");
  });

  it("rejects deposit into invalid pool", async () => {
    await usdc.connect(alice).approve(await pool.getAddress(), P(100));
    await expect(
      pool.connect(alice).deposit(999, P(100))
    ).to.be.revertedWith("Invalid pool");
  });

  it("rejects deposit into inactive pool", async () => {
    await pool.setPoolActive(0, false);
    await usdc.connect(alice).approve(await pool.getAddress(), P(100));
    await expect(
      pool.connect(alice).deposit(0, P(100))
    ).to.be.revertedWith("Pool inactive");
  });

  it("two depositors get proportional shares", async () => {
    await usdc.connect(alice).approve(await pool.getAddress(), P(100));
    await pool.connect(alice).deposit(0, P(100));

    await usdc.connect(bob).approve(await pool.getAddress(), P(300));
    await pool.connect(bob).deposit(0, P(300));

    expect(await pool.sharesOf(0, alice.address)).to.equal(P(100));
    expect(await pool.sharesOf(0, bob.address)).to.equal(P(300));

    const p = await pool.getPool(0);
    expect(p.totalShares).to.equal(P(400));
  });

  // ── Withdraw ────────────────────────────────────────────────────────────────

  it("withdraw returns USDC and burns shares", async () => {
    await usdc.connect(alice).approve(await pool.getAddress(), P(100));
    await pool.connect(alice).deposit(0, P(100));

    const balBefore = await usdc.balanceOf(alice.address);
    await pool.connect(alice).withdraw(0, P(100));

    expect(await usdc.balanceOf(alice.address)).to.equal(balBefore + P(100));
    expect(await pool.sharesOf(0, alice.address)).to.equal(0);
  });

  it("cannot withdraw more shares than owned", async () => {
    await usdc.connect(alice).approve(await pool.getAddress(), P(100));
    await pool.connect(alice).deposit(0, P(100));

    await expect(pool.connect(alice).withdraw(0, P(200))).to.be.revertedWith("Bad shares");
  });

  it("withdraw blocked when pool is illiquid (all capital allocated)", async () => {
    await usdc.connect(alice).approve(await pool.getAddress(), P(100));
    await pool.connect(alice).deposit(0, P(100));

    await pool.connect(allocator).allocateToLoan(0, 0, P(100));

    await expect(
      pool.connect(alice).withdraw(0, P(100))
    ).to.be.revertedWith("Insufficient liquidity");
  });

  // ── Allocate to loan ────────────────────────────────────────────────────────

  it("allocator funds a LoanMarket loan from pool capital", async () => {
    await usdc.connect(alice).approve(await pool.getAddress(), P(100));
    await pool.connect(alice).deposit(0, P(100));

    const borrowerBalBefore = await usdc.balanceOf(borrower.address);
    await pool.connect(allocator).allocateToLoan(0, 0, P(100));

    // P2P: USDC went from pool → borrower
    expect(await usdc.balanceOf(borrower.address)).to.equal(borrowerBalBefore + P(100));

    // Pool is now the lender on-chain
    expect(await market.getContribution(0, await pool.getAddress())).to.equal(P(100));

    const p = await pool.getPool(0);
    expect(p.idle).to.equal(0);
    expect(p.outstanding).to.equal(P(100));
    expect(await pool.allocations(0, 0)).to.equal(P(100));
  });

  it("non-allocator cannot allocate", async () => {
    await usdc.connect(alice).approve(await pool.getAddress(), P(100));
    await pool.connect(alice).deposit(0, P(100));

    await expect(
      pool.connect(outsider).allocateToLoan(0, 0, P(100))
    ).to.be.revertedWith("Not allocator");
  });

  it("cannot allocate more than idle", async () => {
    await usdc.connect(alice).approve(await pool.getAddress(), P(50));
    await pool.connect(alice).deposit(0, P(50));

    await expect(
      pool.connect(allocator).allocateToLoan(0, 0, P(100))
    ).to.be.revertedWith("Insufficient idle");
  });

  // ── Repayment crediting ─────────────────────────────────────────────────────

  it("creditRepayment moves outstanding back to idle and accrues interest", async () => {
    await usdc.connect(alice).approve(await pool.getAddress(), P(100));
    await pool.connect(alice).deposit(0, P(100));

    await pool.connect(allocator).allocateToLoan(0, 0, P(100));

    // Simulate borrower repayment to pool (via LoanMarket)
    // For test isolation, mint USDC directly to pool to simulate the transfer
    const owed = await market.getRemainingBalance(0);   // principal + interest
    await usdc.connect(borrower).approve(await market.getAddress(), owed);
    await market.connect(borrower).makePayment(0, owed);

    // Pool received owed USDC from LoanMarket. Now backend credits it.
    await pool.connect(allocator).creditRepayment(0, 0, owed);

    const p = await pool.getPool(0);
    expect(p.outstanding).to.equal(0);
    expect(p.idle).to.equal(owed);                  // principal + interest sitting idle
    expect(await pool.allocations(0, 0)).to.equal(0);

    // Alice's share value grew: was 100 USDC, now equals total owed
    const aliceValue = await pool.userValue(0, alice.address);
    expect(aliceValue).to.equal(owed);
  });

  it("share price grows after interest is credited", async () => {
    await usdc.connect(alice).approve(await pool.getAddress(), P(100));
    await pool.connect(alice).deposit(0, P(100));

    const priceBefore = await pool.sharePrice(0);    // 1e18
    expect(priceBefore).to.equal(ethers.parseUnits("1", 18));

    await pool.connect(allocator).allocateToLoan(0, 0, P(100));

    // Simulate $12 interest credited (no actual loan flow — just direct credit)
    await usdc.mint(await pool.getAddress(), P(112));
    await pool.connect(allocator).creditRepayment(0, 0, P(112));

    const priceAfter = await pool.sharePrice(0);
    // 112/100 = 1.12 → 1.12e18
    expect(priceAfter).to.equal(ethers.parseUnits("1.12", 18));
  });

  it("late depositor gets fewer shares per USDC after appreciation", async () => {
    // Alice deposits $100; share price = 1.0
    await usdc.connect(alice).approve(await pool.getAddress(), P(100));
    await pool.connect(alice).deposit(0, P(100));

    // Allocate to loan, simulate $50 interest profit via creditRepayment
    await pool.connect(allocator).allocateToLoan(0, 0, P(100));
    await usdc.mint(await pool.getAddress(), P(150));   // simulate borrower repaying $150
    await pool.connect(allocator).creditRepayment(0, 0, P(150));

    // Now totalAssets = 150, totalShares = 100 → share price = 1.5
    expect(await pool.sharePrice(0)).to.equal(ethers.parseUnits("1.5", 18));

    // Bob deposits $150 → should receive 100 shares (not 150)
    await usdc.connect(bob).approve(await pool.getAddress(), P(150));
    await pool.connect(bob).deposit(0, P(150));
    expect(await pool.sharesOf(0, bob.address)).to.equal(P(100));
  });

  // ── Loss handling ───────────────────────────────────────────────────────────

  it("recordLoss reduces outstanding (share price drops)", async () => {
    await usdc.connect(alice).approve(await pool.getAddress(), P(100));
    await pool.connect(alice).deposit(0, P(100));

    await pool.connect(allocator).allocateToLoan(0, 0, P(100));

    // Borrower defaults — record full $100 loss
    await pool.connect(allocator).recordLoss(0, 0, P(100));

    const p = await pool.getPool(0);
    expect(p.outstanding).to.equal(0);
    expect(p.idle).to.equal(0);
    expect(await pool.userValue(0, alice.address)).to.equal(0);   // alice lost it all
  });

  it("cannot record loss greater than allocation", async () => {
    await usdc.connect(alice).approve(await pool.getAddress(), P(100));
    await pool.connect(alice).deposit(0, P(100));
    await pool.connect(allocator).allocateToLoan(0, 0, P(100));

    await expect(
      pool.connect(allocator).recordLoss(0, 0, P(200))
    ).to.be.revertedWith("Bad loss amount");
  });

  // ── E2E ─────────────────────────────────────────────────────────────────────

  it("E2E: deposit → allocate → repay → withdraw with profit", async () => {
    // Alice deposits $100, Bob deposits $300 → total $400 idle
    await usdc.connect(alice).approve(await pool.getAddress(), P(100));
    await pool.connect(alice).deposit(0, P(100));
    await usdc.connect(bob).approve(await pool.getAddress(), P(300));
    await pool.connect(bob).deposit(0, P(300));

    // Allocator funds entire $100 loan from pool
    await pool.connect(allocator).allocateToLoan(0, 0, P(100));

    // Borrower repays full owed amount
    const owed = await market.getRemainingBalance(0);
    await usdc.connect(borrower).approve(await market.getAddress(), owed);
    await market.connect(borrower).makePayment(0, owed);

    // Backend credits repayment
    await pool.connect(allocator).creditRepayment(0, 0, owed);

    // Total pool assets = $300 (idle never-allocated) + owed ($100 + interest)
    const p = await pool.getPool(0);
    const expectedAssets = P(300) + owed;
    expect(p.idle + p.outstanding).to.equal(expectedAssets);

    // Alice withdraws all her shares — should get her pro-rata share
    const aliceShares = await pool.sharesOf(0, alice.address);
    const aliceBalBefore = await usdc.balanceOf(alice.address);
    await pool.connect(alice).withdraw(0, aliceShares);

    const aliceReceived = (await usdc.balanceOf(alice.address)) - aliceBalBefore;
    // Alice had 100/400 = 25% of shares, should get 25% of pool value
    const expectedAlice = expectedAssets / 4n;
    expect(aliceReceived).to.equal(expectedAlice);
    // She should have profited (>$100)
    expect(aliceReceived).to.be.gt(P(100));
  });
});
