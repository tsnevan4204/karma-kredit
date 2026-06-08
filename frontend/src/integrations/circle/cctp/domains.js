// CCTP V1 contract addresses & domain IDs
// Source: https://developers.circle.com/cctp/references/contract-addresses

export const CCTP = {
  // Base Sepolia (where investor burns USDC)
  BASE_SEPOLIA: {
    chainId:          84532,
    chainIdHex:       '0x14a34',
    domain:           6,
    tokenMessenger:   '0x9f3B8679c73C2Fef8b59B4f3444d4e156fb70AA5',
    messageTransmitter: '0x7865fAfC2db2093669d92c0197e5d6f4D14b5E8d',
    usdc:             '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    rpcUrl:           'https://sepolia.base.org',
    name:             'Base Sepolia',
  },

  // Arc Testnet (where USDC is minted)
  ARC_TESTNET: {
    chainId:  5042002,
    domain:   Number(import.meta.env.VITE_ARC_CCTP_DOMAIN ?? 9), // set in .env once confirmed
    usdc:     '0x3600000000000000000000000000000000000000',
    name:     'Arc Testnet',
  },

  IRIS_API: 'https://iris-api-sandbox.circle.com',
};

export const TOKEN_MESSENGER_ABI = [
  'function depositForBurn(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken) returns (uint64 nonce)',
];

export const ERC20_APPROVE_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
];

/** Convert an EVM address to bytes32 for mintRecipient param */
export function addressToBytes32(address) {
  return '0x' + address.replace('0x', '').padStart(64, '0');
}
