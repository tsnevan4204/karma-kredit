require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const PRIVATE_KEY = process.env.PRIVATE_KEY || "";

module.exports = {
  solidity: "0.8.24",
  networks: {
    // Ethereum
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || "",
      accounts: [PRIVATE_KEY],
    },
    ethereum: {
      url: process.env.ETHEREUM_RPC_URL || "",
      accounts: [PRIVATE_KEY],
    },

    // BNB Chain
    bscTestnet: {
      url: process.env.BSC_TESTNET_RPC_URL || "",
      accounts: [PRIVATE_KEY],
    },
    bsc: {
      url: process.env.BSC_RPC_URL || "",
      accounts: [PRIVATE_KEY],
    },

    // Flow EVM
    flowEvm: {
      url: process.env.FLOW_EVM_RPC_URL || "",
      accounts: [PRIVATE_KEY],
    },
    flowEvmTestnet: {
      url: process.env.FLOW_EVM_TESTNET_RPC_URL,
      chainId: 545,
      accounts: [process.env.PRIVATE_KEY || ""],
    },
  },
};