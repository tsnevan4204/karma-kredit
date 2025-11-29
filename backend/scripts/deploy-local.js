const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const ethers = hre.ethers;
  const networkName = hre.network.name;

  if (networkName !== "hardhat" && networkName !== "localhost") {
    throw new Error(
      "❌ deploy-local.js is only for local Hardhat testing. Use deploy.js for mainnet/Sepolia."
    );
  }

  const [deployer] = await ethers.getSigners();
  console.log("🚀 Deploying locally with:", deployer.address);
  console.log("🌐 Network:", networkName);

  // -------------------------
  // 1. Deploy MockUSDC
  // -------------------------
  const MockUSDC = await ethers.getContractFactory("MockUSDC");
  const usdc = await MockUSDC.deploy();
  await usdc.waitForDeployment();
  const usdcAddress = await usdc.getAddress();
  console.log("💵 MockUSDC deployed at:", usdcAddress);

  // -------------------------
  // 2. Deploy MultitokenLoan with MockUSDC
  // -------------------------
  const Loan = await ethers.getContractFactory("MultitokenLoan");
  const loan = await Loan.deploy(usdcAddress);
  await loan.waitForDeployment();
  const loanAddress = await loan.getAddress();
  console.log("🏦 MultitokenLoan deployed at:", loanAddress);

  // -------------------------
  // 3. Write ABIs to frontend
  // -------------------------
  const abisDir = path.join(
    __dirname,
    "..",
    "..",
    "frontend",
    "src",
    "abis",
    networkName
  );
  if (!fs.existsSync(abisDir)) {
    fs.mkdirSync(abisDir, { recursive: true });
  }

  const loanArtifact = await hre.artifacts.readArtifact("MultitokenLoan");
  const usdcArtifact = await hre.artifacts.readArtifact("MockUSDC");

  fs.writeFileSync(
    path.join(abisDir, "MultitokenLoan.json"),
    JSON.stringify(
      { address: loanAddress, abi: loanArtifact.abi, usdc: usdcAddress },
      null,
      2
    )
  );

  fs.writeFileSync(
    path.join(abisDir, "MockUSDC.json"),
    JSON.stringify({ address: usdcAddress, abi: usdcArtifact.abi }, null, 2)
  );

  // -------------------------
  // 4. Save backend metadata
  // -------------------------
  const deployments = {
    LOCAL_USDC_ADDRESS: usdcAddress,
    LOCAL_MULTITOKEN_LOAN_ADDRESS: loanAddress,
  };

  fs.writeFileSync(
    path.join(__dirname, "..", "deployedContracts.local.json"),
    JSON.stringify(deployments, null, 2)
  );

  console.log(
    `📦 Exported both contracts to frontend/src/abis/${networkName}/`
  );
  console.log("💾 Metadata saved to deployedContracts.local.json");
  console.log("🎉 Local deployment complete.");
}

main().catch((err) => {
  console.error("❌ Deployment error:", err);
  process.exit(1);
});