const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const ethers = hre.ethers;
  const networkName = hre.network.name;

  console.log("🚀 Deploying MultitokenLoan with:", deployer.address);
  console.log("🌐 Network:", networkName);

  // Deploy contract
  const MultitokenLoan = await ethers.getContractFactory("MultitokenLoan");
  const multitokenLoan = await MultitokenLoan.deploy();
  await multitokenLoan.waitForDeployment();
  const contractAddress = await multitokenLoan.getAddress();

  console.log("🏦 MultitokenLoan deployed at:", contractAddress);

  // Prepare frontend abis/<network>/ directory
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

  // Read artifact and write ABI + address to frontend
  const multitokenLoanArtifact = await hre.artifacts.readArtifact(
    "MultitokenLoan"
  );

  fs.writeFileSync(
    path.join(abisDir, "MultitokenLoan.json"),
    JSON.stringify(
      {
        address: contractAddress,
        abi: multitokenLoanArtifact.abi,
      },
      null,
      2
    )
  );

  // Also write to backend deployments file
  const deployments = {
    [networkName.toUpperCase() + "_MULTITOKEN_LOAN_ADDRESS"]: contractAddress,
  };

  const filePath = path.join(__dirname, "..", "deployedContracts.json");
  fs.writeFileSync(filePath, JSON.stringify(deployments, null, 2));

  console.log(
    `📦 ABI + address exported to frontend/src/abis/${networkName}/MultitokenLoan.json`
  );
  console.log("✅ Deployment metadata saved to deployedContracts.json");
  console.log("🚀 Done.");
}

main().catch((err) => {
  console.error("❌ Deployment failed:", err);
  process.exit(1);
});