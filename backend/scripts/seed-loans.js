/**
 * Seed demo loans on deployed MultitokenLoan (local or Arc testnet).
 *
 * Usage:
 *   npx hardhat run scripts/seed-loans.js --network localhost
 *   npx hardhat run scripts/seed-loans.js --network arcTestnet
 */
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

async function main() {
  const networkName = hre.network.name;
  const [deployer, borrower, investor] = await hre.ethers.getSigners();
  const signers = await hre.ethers.getSigners();

  const abiPath = path.join(
    __dirname,
    "..",
    "..",
    "frontend",
    "src",
    "abis",
    networkName,
    "MultitokenLoan.json"
  );
  if (!fs.existsSync(abiPath)) {
    throw new Error(`Missing ${abiPath}. Deploy contracts first.`);
  }
  const { address: loanAddress, usdc: usdcAddress } = JSON.parse(
    fs.readFileSync(abiPath, "utf8")
  );

  const loan = await hre.ethers.getContractAt("MultitokenLoan", loanAddress);

  const business =
    signers.length > 1 ? signers[1] : deployer;
  const lender =
    signers.length > 2 ? signers[2] : deployer;

  const mockNetworks = new Set(["hardhat", "localhost"]);
  if (mockNetworks.has(networkName)) {
    const usdc = await hre.ethers.getContractAt("MockUSDC", usdcAddress);
    await (await usdc.mint(business.address, hre.ethers.parseUnits("10000", 6))).wait();
    await (await usdc.mint(lender.address, hre.ethers.parseUnits("10000", 6))).wait();
  } else {
    console.log(
      "ℹ️  Skipping USDC mint (use Arc/Base faucet for investor funding)."
    );
  }

  const loanContractAsBusiness = loan.connect(business);
  const loanContractAsInvestor = loan.connect(lender);

  const businessRole = await loan.getUserRole(business.address);
  if (businessRole === "unknown") {
    await (await loanContractAsBusiness.registerAsBusiness()).wait();
  }

  if (lender.address !== business.address) {
    const investorRole = await loan.getUserRole(lender.address);
    if (investorRole === "unknown") {
      await (await loanContractAsInvestor.registerAsInvestor()).wait();
    }
  }

  const samples = [
    {
      principal: "500",
      interestBps: 800,
      months: 12,
      meta: {
        description: "Pottery workshop expansion — demo loan",
        category: "crafts",
      },
    },
    {
      principal: "1200",
      interestBps: 720,
      months: 18,
      meta: {
        description: "Family farm herd expansion — demo loan",
        category: "agriculture",
      },
    },
  ];

  for (const s of samples) {
    const principal = hre.ethers.parseUnits(s.principal, 6);
    const tx = await loanContractAsBusiness.requestLoan(
      principal,
      s.interestBps,
      s.months,
      `json:${JSON.stringify(s.meta)}`
    );
    await tx.wait();
    console.log(`✅ Requested loan: ${s.principal} USDC — ${s.meta.description}`);
  }

  console.log("🎉 Seed complete. Borrower:", business.address);
  console.log("   Register investor wallet:", lender.address);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
