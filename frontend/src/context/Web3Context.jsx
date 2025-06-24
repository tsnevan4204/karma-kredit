import { createContext, useContext, useEffect, useState } from "react";
import { ethers } from "ethers";
import { CHAIN_ID_TO_NAME } from "../constants/chains";

const Web3Context = createContext({});

export const Web3Provider = ({ children }) => {
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [account, setAccount] = useState("");
  const [chainId, setChainId] = useState(null);
  const [multitokenLoan, setMultitokenLoan] = useState(null);

  useEffect(() => {
    if (provider && signer) {
      // Always use flowEvmTestnet ABI/address
      const loadContract = async () => {
        const abiModule = await import(`../abis/flowEvmTestnet/MultitokenLoan.json`);
        const contract = new ethers.Contract(
          abiModule.address,
          abiModule.abi,
          signer
        );
        setMultitokenLoan(contract);
      };
      loadContract();
    }
  }, [provider, signer]);

  const connectWallet = async () => {
    if (typeof window.ethereum === "undefined") {
      alert("MetaMask not detected");
      return;
    }
    try {
      await window.ethereum.request({ method: "eth_requestAccounts" });
      const browserProvider = new ethers.BrowserProvider(window.ethereum);
      const signer = await browserProvider.getSigner();
      const address = await signer.getAddress();
      const network = await browserProvider.getNetwork();
      setProvider(browserProvider);
      setSigner(signer);
      setAccount(address);
      setChainId(Number(network.chainId));
      // Always use flowEvmTestnet ABI/address
      const abiModule = await import(`../abis/flowEvmTestnet/MultitokenLoan.json`);
      const contract = new ethers.Contract(
        abiModule.address,
        abiModule.abi,
        signer
      );
      setMultitokenLoan(contract);
    } catch (err) {
      console.error("Wallet connection error:", err);
      alert("Failed to connect wallet. Check console for details.");
    }
  };

  return (
    <Web3Context.Provider
      value={{
        provider,
        signer,
        account,
        chainId,
        multitokenLoan,
        connectWallet,
      }}
    >
      {children}
    </Web3Context.Provider>
  );
};

export const useWeb3 = () => {
  return useContext(Web3Context);
};