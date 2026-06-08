import hardhatLoan from '../abis/hardhat/LoanMarket.json';
import arcLoan     from '../abis/arcTestnet/LoanMarket.json';
import hardhatPool from '../abis/hardhat/LendingPool.json';
import arcPool     from '../abis/arcTestnet/LendingPool.json';
import hardhatUsdc from '../abis/hardhat/MockUSDC.json';

const NETWORK = import.meta.env.VITE_NETWORK || 'hardhat';

const LOAN_BY_NETWORK = {
  hardhat:    hardhatLoan,
  localhost:  hardhatLoan,
  arcTestnet: arcLoan,
};

const POOL_BY_NETWORK = {
  hardhat:    hardhatPool,
  localhost:  hardhatPool,
  arcTestnet: arcPool,
};

const USDC_BY_NETWORK = {
  hardhat:    { address: hardhatLoan.usdc || hardhatUsdc.address, abi: hardhatUsdc.abi },
  localhost:  { address: hardhatLoan.usdc || hardhatUsdc.address, abi: hardhatUsdc.abi },
  arcTestnet: { address: arcLoan.usdc, abi: null },
};

export const ERC20_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)',
];

export function getNetwork()  { return NETWORK; }

export function getRpcUrl() {
  switch (NETWORK) {
    case 'arcTestnet': return import.meta.env.VITE_ARC_RPC_URL || 'https://rpc.testnet.arc.network';
    case 'hardhat':
    case 'localhost':  return import.meta.env.VITE_LOCAL_RPC_URL || 'http://127.0.0.1:8545';
    default:           return '';
  }
}

export function getLoanDeployment() {
  const d = LOAN_BY_NETWORK[NETWORK];
  if (!d?.address || !d.abi?.length) {
    throw new Error(`No LoanMarket deployment for VITE_NETWORK=${NETWORK}. Run: cd backend && npx hardhat run scripts/deploy.js --network <network>`);
  }
  return d;
}

export function getPoolDeployment() {
  const d = POOL_BY_NETWORK[NETWORK];
  if (!d?.address || !d.abi?.length) {
    throw new Error(`No LendingPool deployment for VITE_NETWORK=${NETWORK}.`);
  }
  return d;
}

export function getUsdcConfig() {
  const cfg = USDC_BY_NETWORK[NETWORK];
  if (!cfg?.address) throw new Error(`No USDC address for VITE_NETWORK=${NETWORK}`);
  return { address: cfg.address, abi: cfg.abi || ERC20_ABI };
}

export const USE_DEMO_LOANS = import.meta.env.VITE_USE_DEMO_LOANS === 'true';
