import { createContext, useContext, useEffect, useState } from "react";
import { ethers } from "ethers";
import { CHAIN_ID_TO_NAME } from "../constants/chains";

const Web3Context = createContext({});

export const Web3Provider = ({ children }) => {
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [account, setAccount] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [multitokenLoan, setMultitokenLoan] = useState(null);
  const [role, setRoleState] = useState(null);

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

      const chainName = CHAIN_ID_TO_NAME[Number(network.chainId)];
      if (!chainName) {
        alert("Unsupported network");
        return;
      }

      const abiModule = await import(`../abis/${chainName}/MultitokenLoan.json`);
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

  const disconnectWallet = () => {
    setProvider(null);
    setSigner(null);
    setAccount(null);
    setChainId(null);
    setMultitokenLoan(null);
    setRoleState(null);
  };

  // Persist role per wallet address
  useEffect(() => {
    if (account) {
      const savedRole = localStorage.getItem(`role_${account}`);
      if (savedRole) setRoleState(savedRole);
    }
  }, [account]);

  const setRole = (newRole) => {
    setRoleState(newRole);
    if (account && newRole) {
      localStorage.setItem(`role_${account}`, newRole);
    }
  };

  useEffect(() => {
    const checkIfWalletConnected = async () => {
      if (typeof window.ethereum !== "undefined") {
        const accounts = await window.ethereum.request({ method: "eth_accounts" });
        if (accounts.length > 0) {
          await connectWallet(); // auto-connect on refresh
        }
      }
    };

    checkIfWalletConnected();

    if (typeof window !== 'undefined' && window.ethereum) {
      window.ethereum.on("chainChanged", () => window.location.reload());
      window.ethereum.on("accountsChanged", () => window.location.reload());
    }
  }, []);

  return (
    <Web3Context.Provider
      value={{
        provider,
        signer,
        account,
        chainId,
        multitokenLoan,
        connectWallet,
        disconnectWallet,
        role,
        setRole,
      }}
    >
      {children}
    </Web3Context.Provider>
  );
};

export const useWeb3 = () => useContext(Web3Context);