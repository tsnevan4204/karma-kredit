import hardhatLoan from '../abis/hardhat/MultitokenLoan.json';
import arcLoan from '../abis/arcTestnet/MultitokenLoan.json';
import sepoliaLoan from '../abis/sepolia/MultitokenLoan.json';
import hardhatUsdc from '../abis/hardhat/MockUSDC.json';

const NETWORK = import.meta.env.VITE_NETWORK || 'hardhat';

const LOAN_BY_NETWORK = {
  hardhat: hardhatLoan,
  localhost: hardhatLoan,
  arcTestnet: arcLoan,
  sepolia: sepoliaLoan,
};

const USDC_BY_NETWORK = {
  hardhat: { address: hardhatLoan.usdc || hardhatUsdc.address, abi: hardhatUsdc.abi },
  localhost: { address: hardhatLoan.usdc || hardhatUsdc.address, abi: hardhatUsdc.abi },
  arcTestnet: { address: arcLoan.usdc, abi: null },
  sepolia: { address: sepoliaLoan.usdc, abi: null },
};

export const ERC20_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)',
];

export function getNetwork() {
  return NETWORK;
}

/** Public RPC for read-only contract calls (no wallet required). */
export function getRpcUrl() {
  switch (NETWORK) {
    case 'arcTestnet':
      return import.meta.env.VITE_ARC_RPC_URL || 'https://rpc.testnet.arc.network';
    case 'hardhat':
    case 'localhost':
      return import.meta.env.VITE_LOCAL_RPC_URL || 'http://127.0.0.1:8545';
    case 'sepolia':
      return import.meta.env.VITE_SEPOLIA_RPC_URL || '';
    default:
      return '';
  }
}

export function getLoanDeployment() {
  const deployment = LOAN_BY_NETWORK[NETWORK];
  if (!deployment?.address || deployment.abi?.length === 0) {
    throw new Error(
      `No MultitokenLoan deployment for VITE_NETWORK=${NETWORK}. Run: cd backend && npx hardhat run scripts/deploy.js --network <network>`
    );
  }
  return deployment;
}

export function getUsdcConfig() {
  const cfg = USDC_BY_NETWORK[NETWORK];
  if (!cfg?.address) {
    throw new Error(`No USDC address for VITE_NETWORK=${NETWORK}`);
  }
  return { address: cfg.address, abi: cfg.abi || ERC20_ABI };
}

export const USE_DEMO_LOANS = import.meta.env.VITE_USE_DEMO_LOANS === 'true';
