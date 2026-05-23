import { createContext, useContext, useState } from 'react';
import { ethers } from 'ethers';
import {
  getLoanDeployment,
  getUsdcConfig,
  ERC20_ABI,
  getNetwork,
  getRpcUrl,
} from '../config/contracts';
import { ensureArcNetwork } from '../config/chains';
import { parseUsdc, formatUsdc } from '../lib/usdc';

const WalletContext = createContext();

export const useWallet = () => {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
};

const loanDeployment = getLoanDeployment();
const usdcConfig = getUsdcConfig();

export const WalletProvider = ({ children }) => {
  const [account, setAccount] = useState(null);
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [isRegistering, setIsRegistering] = useState(false);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [walletAnalytics, setWalletAnalytics] = useState(null);
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(false);

  const CONTRACT_ADDRESS = loanDeployment.address;
  const CONTRACT_ABI = loanDeployment.abi;
  const USDC_ADDRESS = usdcConfig.address;

  const saveRoleToStorage = (address, role) => {
    try {
      localStorage.setItem(`userRole_${address.toLowerCase()}`, role);
    } catch (e) {
      console.error('Failed to save role to localStorage:', e);
    }
  };

  const getRoleFromStorage = (address) => {
    try {
      return localStorage.getItem(`userRole_${address.toLowerCase()}`);
    } catch (e) {
      return null;
    }
  };

  const getReadProvider = () => {
    if (signer) return signer;
    const rpc = getRpcUrl();
    if (!rpc) return null;
    return new ethers.JsonRpcProvider(rpc);
  };

  const getContract = () => {
    const runner = getReadProvider();
    if (!runner) return null;
    return new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, runner);
  };

  const getUsdcContract = () => {
    if (!signer) return null;
    return new ethers.Contract(USDC_ADDRESS, ERC20_ABI, signer);
  };

  const approveUsdcIfNeeded = async (spender, amount) => {
    const usdc = getUsdcContract();
    if (!usdc) throw new Error('USDC contract not available');
    const owner = await signer.getAddress();
    const current = await usdc.allowance(owner, spender);
    if (current >= amount) return;
    const tx = await usdc.approve(spender, amount);
    await tx.wait();
  };

  const checkUserRole = async (address) => {
    const storedRole = getRoleFromStorage(address);
    if (storedRole && storedRole !== 'null') {
      return storedRole;
    }
    try {
      const contract = getContract();
      if (!contract) return storedRole;
      const role = await contract.getUserRole(address);
      if (role && role !== 'unknown') {
        saveRoleToStorage(address, role);
        return role;
      }
      if (role === 'unknown' && storedRole) return storedRole;
      return role;
    } catch (e) {
      console.error('Error checking user role:', e);
      return storedRole;
    }
  };

  const registerUserRole = async (role) => {
    if (!account || !signer) throw new Error('Wallet not connected');
    setIsRegistering(true);
    try {
      const contract = getContract();
      if (!contract) throw new Error('Contract not available');
      const tx =
        role === 'business'
          ? await contract.registerAsBusiness()
          : role === 'investor'
            ? await contract.registerAsInvestor()
            : (() => {
                throw new Error('Invalid role');
              })();
      await tx.wait();
      setUserRole(role);
      saveRoleToStorage(account, role);
      setShowRoleModal(false);
      return true;
    } finally {
      setIsRegistering(false);
    }
  };

  const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:5000';
  const apiChain = getNetwork() === 'arcTestnet' ? 'arc-testnet' : getNetwork();

  const getWalletAnalytics = async (walletAddress) => {
    setIsLoadingAnalytics(true);
    try {
      const response = await fetch(`${apiBase}/api/wallet-analytics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet_address: walletAddress, chain: apiChain }),
      });
      if (!response.ok) throw new Error('Failed to get wallet analytics');
      const data = await response.json();
      setWalletAnalytics(data);
      return data;
    } finally {
      setIsLoadingAnalytics(false);
    }
  };

  const getFicoScore = async (walletAddress) => {
    const response = await fetch(`${apiBase}/api/fico-score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet_address: walletAddress, chain: apiChain }),
    });
    if (!response.ok) throw new Error('Failed to get FICO score');
    return response.json();
  };

  const connectWallet = async () => {
    if (!window.ethereum) {
      setError('MetaMask is not installed.');
      return;
    }
    setIsConnecting(true);
    setError(null);
    try {
      if (getNetwork() === 'arcTestnet') {
        await ensureArcNetwork(window.ethereum);
      }
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      const ethProvider = new ethers.BrowserProvider(window.ethereum);
      const ethSigner = await ethProvider.getSigner();
      setAccount(accounts[0]);
      setProvider(ethProvider);
      setSigner(ethSigner);
      const role = await checkUserRole(accounts[0]);
      setUserRole(role);
      try {
        await getWalletAnalytics(accounts[0]);
      } catch (e) {
        console.warn('Wallet analytics unavailable:', e);
      }
      setShowRoleModal(!role || role === 'unknown');
    } catch (err) {
      setError(`Failed to connect wallet: ${err.message}`);
    } finally {
      setIsConnecting(false);
    }
  };

  const refreshUserRole = async () => {
    if (!account) return;
    const role = await checkUserRole(account);
    setUserRole(role);
    setShowRoleModal(!role || role === 'unknown');
  };

  const submitLoanRequest = async (loanData) => {
    if (!account || !signer) throw new Error('Wallet not connected');
    const contract = getContract();
    if (!contract) throw new Error('Contract not available');

    const principal = parseUsdc(loanData.amount);
    const interestRate = Math.floor(parseFloat(loanData.interestRate || 10) * 100);
    const durationInMonths = parseInt(loanData.durationInMonths || loanData.duration, 10);

    const metadata = {
      description: loanData.description,
      category: loanData.category,
      supportingImage: loanData.supportingImage || null,
    };
    const metadataCID = `json:${JSON.stringify(metadata)}`;

    const tx = await contract.requestLoan(
      principal,
      interestRate,
      durationInMonths,
      metadataCID
    );
    await tx.wait();
    return tx;
  };

  const getAllLoans = async () => {
    try {
      const contract = getContract();
      if (!contract) {
        console.warn('Cannot read loans: no RPC URL or wallet for network', getNetwork());
        return [];
      }
      const loanCount = await contract.loanCounter();
      const count = parseInt(loanCount.toString(), 10);
      const loans = [];
      for (let i = 0; i < count; i++) {
        try {
          const loan = await contract.getLoan(i);
          let metadata = { description: '', category: 'other', supportingImage: null };
          try {
            if (loan.metadataCID.startsWith('json:')) {
              metadata = JSON.parse(loan.metadataCID.substring(5));
            }
          } catch {
            /* ignore */
          }
          loans.push({
            id: i,
            borrower: loan.borrower,
            amount: formatUsdc(loan.principal),
            interest: (parseInt(loan.interest.toString(), 10) / 100).toFixed(1),
            dueDate: new Date(parseInt(loan.dueDate.toString(), 10) * 1000),
            funded: loan.funded,
            repaid: loan.repaid,
            description: metadata.description || `Loan #${i}`,
            category: metadata.category || 'other',
            supportingImage: metadata.supportingImage,
            metadataCID: loan.metadataCID,
            monthlyPayment: loan.monthlyPayment ? formatUsdc(loan.monthlyPayment) : null,
            totalPaid: loan.totalPaid ? formatUsdc(loan.totalPaid) : '0',
            duration: loan.duration ? parseInt(loan.duration.toString(), 10) : null,
            status: loan.repaid ? 'repaid' : loan.funded ? 'active' : 'pending',
          });
        } catch (e) {
          console.error(`Error fetching loan ${i}:`, e);
        }
      }
      return loans;
    } catch (e) {
      console.error('Error fetching loans:', e);
      return [];
    }
  };

  const getUserLoans = async (userAddress) => {
    const allLoans = await getAllLoans();
    return allLoans.filter(
      (loan) => loan.borrower.toLowerCase() === userAddress.toLowerCase()
    );
  };

  const investInLoan = async (loanId, investmentAmount) => {
    if (!account || !signer) throw new Error('Wallet not connected');
    const contract = getContract();
    if (!contract) throw new Error('Contract not available');

    const isInvestorRegistered = await contract.isInvestor(account);
    if (!isInvestorRegistered) {
      throw new Error('Register as an investor before funding loans.');
    }

    const loanDetails = await contract.getLoan(loanId);
    if (loanDetails.funded) throw new Error('Loan already funded');
    if (loanDetails.repaid) throw new Error('Loan already repaid');

    const principal = loanDetails.principal;
    const amount = parseUsdc(investmentAmount);
    if (amount !== principal) {
      console.warn(
        'Contract funds full principal in one tx; using loan principal',
        formatUsdc(principal)
      );
    }
    const fundAmount = principal;

    await approveUsdcIfNeeded(CONTRACT_ADDRESS, fundAmount);
    const tx = await contract.fundLoan(loanId);
    await tx.wait();
    return tx;
  };

  const repayLoan = async (loanId, paymentAmount) => {
    if (!account || !signer) throw new Error('Wallet not connected');
    const contract = getContract();
    if (!contract) throw new Error('Contract not available');

    const loanDetails = await contract.getLoan(loanId);
    if (loanDetails.borrower.toLowerCase() !== account.toLowerCase()) {
      throw new Error('You are not the borrower of this loan');
    }
    if (!loanDetails.funded) throw new Error('Loan not funded yet');
    if (loanDetails.repaid) throw new Error('Loan already repaid');

    const amount = parseUsdc(paymentAmount);
    await approveUsdcIfNeeded(CONTRACT_ADDRESS, amount);
    const tx = await contract.makePayment(loanId, amount);
    await tx.wait();
    return tx;
  };

  const disconnectWallet = () => {
    setAccount(null);
    setProvider(null);
    setSigner(null);
    setError(null);
    setUserRole(null);
    setShowRoleModal(false);
    setWalletAnalytics(null);
  };

  const value = {
    account,
    provider,
    signer,
    isConnecting,
    error,
    userRole,
    isRegistering,
    showRoleModal,
    walletAnalytics,
    isLoadingAnalytics,
    usdcAddress: USDC_ADDRESS,
    loanMarketAddress: CONTRACT_ADDRESS,
    connectWallet,
    disconnectWallet,
    registerUserRole,
    refreshUserRole,
    setShowRoleModal,
    getFicoScore,
    getWalletAnalytics,
    submitLoanRequest,
    getAllLoans,
    getUserLoans,
    investInLoan,
    repayLoan,
    formatUsdc,
    parseUsdc,
  };

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
};
