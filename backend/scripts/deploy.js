const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const ethers = hre.ethers;
  const networkName = hre.network.name;

  console.log("🚀 Deploying LoanMarket with:", deployer.address);
  console.log("🌐 Network:", networkName);

  const USDC_ADDRESSES = {
    mainnet:    "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    sepolia:    "0x1c7D4B196Cb0C7BFDd1B2A0b79c3F46c5D8fF1B3",
    arcTestnet: "0x3600000000000000000000000000000000000000",
    hardhat:    process.env.LOCAL_USDC || "0x0000000000000000000000000000000000000001",
    localhost:  process.env.LOCAL_USDC || "0x0000000000000000000000000000000000000001",
  };

  const usdcAddress =
    process.env.USDC_ADDRESS ||
    USDC_ADDRESSES[networkName] ||
    (() => { throw new Error(`No USDC address for network: ${networkName}`); })();

  console.log("💵 Using USDC:", usdcAddress);

  // ── LoanMarket ────────────────────────────────────────────────────────────
  const LoanMarket = await ethers.getContractFactory("LoanMarket");
  const market = await LoanMarket.deploy(usdcAddress);
  await market.waitForDeployment();
  const marketAddress = await market.getAddress();
  console.log("🏦 LoanMarket deployed at:", marketAddress);

  // ── LendingPool ───────────────────────────────────────────────────────────
  const LendingPool = await ethers.getContractFactory("LendingPool");
  const pool = await LendingPool.deploy(usdcAddress, marketAddress);
  await pool.waitForDeployment();
  const poolAddress = await pool.getAddress();
  console.log("🥗 LendingPool deployed at:", poolAddress);

  // Register pool as investor on LoanMarket so it can fundLoan
  console.log("📝 Registering LendingPool as investor on LoanMarket...");
  await (await pool.registerWithLoanMarket()).wait();

  // Seed three pools matching the README vision
  console.log("🌱 Seeding default pools (AgriPool, WomenFoundersPool, KarmaMax)...");
  await (await pool.createPool("AgriPool",         "agriculture", 50)).wait();
  await (await pool.createPool("WomenFoundersPool", "diversity",  60)).wait();
  await (await pool.createPool("KarmaMax",         "premium",     80)).wait();

  // Write ABIs to frontend
  const abisDir = path.join(__dirname, "..", "..", "frontend", "src", "abis", networkName);
  if (!fs.existsSync(abisDir)) fs.mkdirSync(abisDir, { recursive: true });

  const marketArtifact = await hre.artifacts.readArtifact("LoanMarket");
  fs.writeFileSync(
    path.join(abisDir, "LoanMarket.json"),
    JSON.stringify({ address: marketAddress, usdc: usdcAddress, abi: marketArtifact.abi }, null, 2)
  );

  const poolArtifact = await hre.artifacts.readArtifact("LendingPool");
  fs.writeFileSync(
    path.join(abisDir, "LendingPool.json"),
    JSON.stringify({
      address: poolAddress,
      usdc:    usdcAddress,
      market:  marketAddress,
      abi:     poolArtifact.abi
    }, null, 2)
  );

  // Backend metadata
  fs.writeFileSync(
    path.join(__dirname, "..", "deployedContracts.json"),
    JSON.stringify({
      [`${networkName.toUpperCase()}_LOAN_MARKET_ADDRESS`]:  marketAddress,
      [`${networkName.toUpperCase()}_LENDING_POOL_ADDRESS`]: poolAddress,
      [`${networkName.toUpperCase()}_USDC_ADDRESS`]:         usdcAddress,
    }, null, 2)
  );

  console.log(`📦 ABIs → frontend/src/abis/${networkName}/{LoanMarket,LendingPool}.json`);
  console.log("✅ Done.");
}

main().catch((err) => { console.error("❌", err); process.exit(1); });
