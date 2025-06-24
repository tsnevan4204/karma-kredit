const { ethers } = require("hardhat");

async function main() {
  const Mint = await ethers.getContractFactory("Mint");
  const mint = await Mint.deploy();
  await mint.waitForDeployment();

  console.log(`Mock PYUSD deployed to: ${await mint.getAddress()}`);

  const recipient = "0x1A584C917680153a1145B7C53d2954Dc0E5c4c73";
  const amount = ethers.parseUnits("1000", 18); // 1000 PYUSD

  await mint.mint(recipient, amount);
  console.log(`Minted 1000 PYUSD to ${recipient}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
