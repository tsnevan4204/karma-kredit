/**
 * Add additional ETF pools to an already-deployed LendingPool.
 * Idempotent — checks poolCount and skips pools that already exist.
 *
 * Run: npx hardhat run scripts/seed-pools.js --network arcTestnet
 */
const hre = require("hardhat");
const fs  = require("fs");
const path = require("path");

const POOLS_TO_SEED = [
  // [name,              category,     minKarma]
  ["AgriPool",           "agriculture", 50],
  ["WomenFoundersPool",  "diversity",   60],
  ["KarmaMax",           "premium",     80],
  ["TechPool",           "technology",  55],
  ["EducationPool",      "education",   55],
  ["HealthcarePool",     "healthcare",  55],
  ["RetailPool",         "retail",      50],
  ["GreenEnergyPool",    "energy",      55],
  ["FoodAndBevPool",     "food",        50],
  ["GeneralPool",        "general",     40],   // wildcard — accepts any category
];

async function main() {
  const ethers   = hre.ethers;
  const network  = hre.network.name;
  const abiPath  = path.join(__dirname, "..", "..", "frontend", "src", "abis", network, "LendingPool.json");
  if (!fs.existsSync(abiPath)) throw new Error(`No LendingPool ABI at ${abiPath}. Deploy first.`);

  const data = JSON.parse(fs.readFileSync(abiPath, "utf8"));
  const [signer] = await ethers.getSigners();
  console.log("Using signer:", signer.address);

  const pool = new ethers.Contract(data.address, data.abi, signer);
  const existingCount = Number(await pool.poolCount());
  console.log(`Found ${existingCount} pools currently.`);

  const existingNames = new Set();
  for (let i = 0; i < existingCount; i++) {
    const p = await pool.getPool(i);
    existingNames.add(p.name);
    console.log(`  [${i}] ${p.name} (${p.category}, min karma ${p.minKarma})`);
  }

  for (const [name, category, minKarma] of POOLS_TO_SEED) {
    if (existingNames.has(name)) {
      console.log(`✓ ${name} already exists, skipping`);
      continue;
    }
    process.stdout.write(`+ creating ${name} (${category}, min karma ${minKarma})... `);
    const tx = await pool.createPool(name, category, minKarma);
    await tx.wait();
    console.log("done");
  }

  const newCount = Number(await pool.poolCount());
  console.log(`\nTotal pools now: ${newCount}`);
}

main().catch(err => { console.error("seed-pools failed:", err); process.exit(1); });
