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

  const connectWallet = async () => {
    if (typeof window.ethereum === "undefined") return;

    const browserProvider = new ethers.BrowserProvider(window.ethereum);
    const signer = await browserProvider.getSigner();
    const address = await signer.getAddress();
    const network = await browserProvider.getNetwork();

    setProvider(browserProvider);
    setSigner(signer);
    setAccount(address);
    setChainId(Number(network.chainId));

    const chainName = CHAIN_ID_TO_NAME[Number(network.chainId)];
    if (!chainName) throw new Error("Unsupported network");

    const abiModule = await import(`../abis/${chainName}/MultitokenLoan.json`);
    const contract = new ethers.Contract(
      abiModule.address,
      abiModule.abi,
      signer
    );

    setMultitokenLoan(contract);
  };

  const disconnectWallet = () => {
    setProvider(null);
    setSigner(null);
    setAccount(null);
    setChainId(null);
    setMultitokenLoan(null);
  };

  useEffect(() => {
    if (window.ethereum) {
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
      }}
    >
      {children}
    </Web3Context.Provider>
  );
};

export const useWeb3 = () => useContext(Web3Context);