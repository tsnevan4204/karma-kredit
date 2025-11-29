const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const ethers = hre.ethers;
  const networkName = hre.network.name;

  console.log("🚀 Deploying MultitokenLoan with:", deployer.address);
  console.log("🌐 Network:", networkName);

  // === USDC Address Table ===
  const USDC_ADDRESSES = {
    mainnet: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // USDC mainnet
    sepolia: "0x1c7D4B196Cb0C7BFDd1B2A0b79c3F46c5D8fF1B3", // Circle USDC testnet
    hardhat:
      process.env.LOCAL_USDC || "0x0000000000000000000000000000000000000001",
    localhost:
      process.env.LOCAL_USDC || "0x0000000000000000000000000000000000000001",
  };

  // === Determine USDC address ===
  const usdcAddress =
    process.env.USDC_ADDRESS || // optional override
    USDC_ADDRESSES[networkName] ||
    (() => {
      throw new Error(
        `❌ No USDC address configured for network: ${networkName}`
      );
    })();

  console.log("💵 Using USDC address:", usdcAddress);

  // === Deploy contract ===
  const MultitokenLoan = await ethers.getContractFactory("MultitokenLoan");
  const multitokenLoan = await MultitokenLoan.deploy(usdcAddress);
  await multitokenLoan.waitForDeployment();

  const contractAddress = await multitokenLoan.getAddress();

  console.log("🏦 MultitokenLoan deployed at:", contractAddress);

  // === Write ABI to frontend ===
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

  const artifact = await hre.artifacts.readArtifact("MultitokenLoan");

  fs.writeFileSync(
    path.join(abisDir, "MultitokenLoan.json"),
    JSON.stringify(
      {
        address: contractAddress,
        usdc: usdcAddress,
        abi: artifact.abi,
      },
      null,
      2
    )
  );

  // === Backend metadata ===
  const deployments = {
    [networkName.toUpperCase() + "_MULTITOKEN_LOAN_ADDRESS"]: contractAddress,
    [networkName.toUpperCase() + "_USDC_ADDRESS"]: usdcAddress,
  };

  fs.writeFileSync(
    path.join(__dirname, "..", "deployedContracts.json"),
    JSON.stringify(deployments, null, 2)
  );

  console.log(
    `📦 Exported ABI + address to frontend/src/abis/${networkName}/MultitokenLoan.json`
  );
  console.log("💾 Saved deployment metadata to deployedContracts.json");
  console.log("✅ Deployment complete.");
}

main().catch((err) => {
  console.error("❌ Deployment failed:", err);
  process.exit(1);
});