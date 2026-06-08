import { createContext, useContext, useState, useEffect } from 'react';
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
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used within a WalletProvider');
  return ctx;
};

// Lazy + defensive — if either of these throws at module load, the whole React
// tree never mounts and the user sees a blank white page with nothing logged.
// Wrap so ErrorBoundary can surface the issue inside the page instead.
let loanDeployment;
let usdcConfig;
let _configLoadError = null;
try { loanDeployment = getLoanDeployment(); } catch (e) { _configLoadError = e; }
try { usdcConfig     = getUsdcConfig();     } catch (e) { _configLoadError = _configLoadError || e; }

export const WalletProvider = ({ children }) => {
  if (_configLoadError) {
    // Throw so ErrorBoundary picks it up with details
    throw new Error(`Config load failed: ${_configLoadError.message}`);
  }
  const [account,          setAccount]          = useState(null);
  const [provider,         setProvider]         = useState(null);
  const [signer,           setSigner]           = useState(null);
  const [isConnecting,     setIsConnecting]     = useState(false);
  const [error,            setError]            = useState(null);
  const [userRole,         setUserRole]         = useState(null);
  const [isRegistering,    setIsRegistering]    = useState(false);
  const [showRoleModal,    setShowRoleModal]    = useState(false);
  const [walletAnalytics,  setWalletAnalytics]  = useState(null);
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(false);

  const CONTRACT_ADDRESS = loanDeployment.address;
  const CONTRACT_ABI     = loanDeployment.abi;
  const USDC_ADDRESS     = usdcConfig.address;

  const saveRoleToStorage = (addr, role) => {
    try { localStorage.setItem(`userRole_${addr.toLowerCase()}`, role); } catch {}
  };
  const getRoleFromStorage = (addr) => {
    try { return localStorage.getItem(`userRole_${addr.toLowerCase()}`); } catch { return null; }
  };

  const getReadProvider = () => {
    if (signer) return signer;
    const rpc = getRpcUrl();
    return rpc ? new ethers.JsonRpcProvider(rpc) : null;
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
    const current = await usdc.allowance(await signer.getAddress(), spender);
    if (current >= amount) return;
    await (await usdc.approve(spender, amount)).wait();
  };

  const checkUserRole = async (address) => {
    // Always verify against the chain — cached roles from a previous
    // contract deployment will be stale and cause "Not a borrower" reverts.
    const stored = getRoleFromStorage(address);
    try {
      const contract = getContract();
      if (!contract) return stored;            // offline → fall back to cache
      const onChain = await contract.getUserRole(address);
      if (onChain && onChain !== 'unknown') {
        saveRoleToStorage(address, onChain);
        return onChain;
      }
      // On-chain says unknown → wipe the stale cache so the modal re-appears
      try { localStorage.removeItem(`userRole_${address.toLowerCase()}`); } catch {}
      return 'unknown';
    } catch {
      return stored;
    }
  };

  const registerUserRole = async (role) => {
    if (!account || !signer) throw new Error('Wallet not connected');
    setIsRegistering(true);
    try {
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const tx = role === 'borrower'
        ? await contract.registerAsBorrower()
        : role === 'investor'
          ? await contract.registerAsInvestor()
          : (() => { throw new Error('Invalid role'); })();
      await tx.wait();
      setUserRole(role);
      saveRoleToStorage(account, role);
      setShowRoleModal(false);
      return true;
    } finally { setIsRegistering(false); }
  };

  const apiBase  = import.meta.env.VITE_API_URL || 'http://localhost:5000';
  const apiChain = getNetwork() === 'arcTestnet' ? 'arc-testnet' : getNetwork();

  const getWalletAnalytics = async (walletAddress) => {
    setIsLoadingAnalytics(true);
    try {
      const res = await fetch(`${apiBase}/api/wallet-analytics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet_address: walletAddress, chain: apiChain }),
      });
      if (!res.ok) throw new Error('Failed to get wallet analytics');
      const data = await res.json();
      setWalletAnalytics(data);
      return data;
    } finally { setIsLoadingAnalytics(false); }
  };

  const getFicoScore = async (walletAddress) => {
    const res = await fetch(`${apiBase}/api/fico-score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet_address: walletAddress, chain: apiChain }),
    });
    if (!res.ok) throw new Error('Failed to get FICO score');
    return res.json();
  };

  const connectWallet = async ({ silent = false } = {}) => {
    if (!window.ethereum) { if (!silent) setError('MetaMask is not installed.'); return; }
    setIsConnecting(true);
    setError(null);
    try {
      // `eth_accounts` does NOT prompt — only returns already-authorized accounts.
      // `eth_requestAccounts` triggers the MetaMask popup.
      const method = silent ? 'eth_accounts' : 'eth_requestAccounts';
      const accounts = await window.ethereum.request({ method });
      if (!accounts || accounts.length === 0) {
        if (silent) return;            // not yet connected, nothing to do
        throw new Error('No accounts returned');
      }
      if (!silent && getNetwork() === 'arcTestnet') {
        await ensureArcNetwork(window.ethereum);
      }
      const ethProvider  = new ethers.BrowserProvider(window.ethereum);
      const ethSigner    = await ethProvider.getSigner();
      setAccount(accounts[0]);
      setProvider(ethProvider);
      setSigner(ethSigner);
      try { localStorage.setItem('lastAccount', accounts[0]); } catch {}
      const role = await checkUserRole(accounts[0]);
      setUserRole(role);
      try { await getWalletAnalytics(accounts[0]); } catch {}
      setShowRoleModal(!role || role === 'unknown');
    } catch (err) {
      if (!silent) setError(`Failed to connect: ${err.message}`);
    } finally { setIsConnecting(false); }
  };

  // ─── Session persistence ──────────────────────────────────────────────────
  // On page load, if MetaMask already remembers this site, silently reconnect
  // so the user isn't logged out by a refresh. Also listen for account/chain
  // changes so the UI stays in sync.
  useEffect(() => {
    if (!window.ethereum) return;
    if (localStorage.getItem('lastAccount')) {
      connectWallet({ silent: true });
    }
    const onAccountsChanged = (accs) => {
      if (!accs || accs.length === 0) {
        disconnectWallet();
      } else if (accs[0] !== account) {
        connectWallet({ silent: true });
      }
    };
    const onChainChanged = () => window.location.reload();
    window.ethereum.on?.('accountsChanged', onAccountsChanged);
    window.ethereum.on?.('chainChanged',    onChainChanged);
    return () => {
      window.ethereum.removeListener?.('accountsChanged', onAccountsChanged);
      window.ethereum.removeListener?.('chainChanged',    onChainChanged);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshUserRole = async () => {
    if (!account) return;
    const role = await checkUserRole(account);
    setUserRole(role);
    setShowRoleModal(!role || role === 'unknown');
  };

  const submitLoanRequest = async (loanData) => {
    if (!account || !signer) throw new Error('Wallet not connected');
    const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
    const principal       = parseUsdc(loanData.amount);
    const interestBps     = Math.floor(parseFloat(loanData.interestRate || 10) * 100);
    const durationMonths  = parseInt(loanData.durationInMonths || loanData.duration, 10);

    // Client-side guard so error is readable before hitting the chain
    if (principal < 10_000_000n) throw new Error('Minimum loan amount is $10 USDC');
    if (principal > 2_000_000_000n) throw new Error('Maximum loan amount is $2000 USDC');
    if (!durationMonths || durationMonths < 1 || durationMonths > 24) throw new Error('Duration must be 1–24 months');

    const metadataURI = `json:${JSON.stringify({
      description:    loanData.description,
      category:       loanData.category,
      supportingImage: loanData.supportingImage || null,
    })}`;
    const tx = await contract.requestLoan(principal, interestBps, durationMonths, metadataURI);
    await tx.wait();
    return tx;
  };

  const getAllLoans = async () => {
    try {
      const contract = getContract();
      if (!contract) return [];
      const count = parseInt((await contract.loanCounter()).toString(), 10);
      const loans = [];
      for (let i = 0; i < count; i++) {
        try {
          const [loan, remainingRaw] = await Promise.all([
            contract.getLoan(i),
            contract.getRemainingBalance(i),
          ]);
          let metadata = { description: '', category: 'other', supportingImage: null };
          try {
            if (loan.metadataURI?.startsWith('json:')) {
              metadata = JSON.parse(loan.metadataURI.substring(5));
            }
          } catch {}
          const principal    = loan.principal;
          const fundedAmount = loan.fundedAmount;
          const fullyFunded  = fundedAmount >= principal && principal > 0n;
          loans.push({
            id:               i,
            borrower:         loan.borrower,
            amount:           formatUsdc(principal),
            fundedAmount:     formatUsdc(fundedAmount),
            interest:         (parseInt(loan.interestBps.toString(), 10) / 100).toFixed(1),
            dueDate:          new Date(parseInt(loan.dueDate.toString(), 10) * 1000),
            funded:           fullyFunded,
            repaid:           loan.repaid,
            description:      metadata.description || `Loan #${i}`,
            category:         metadata.category || 'other',
            supportingImage:  metadata.supportingImage,
            metadataURI:      loan.metadataURI,
            monthlyPayment:   loan.monthlyPayment ? formatUsdc(loan.monthlyPayment) : null,
            totalPaid:        loan.totalPaid ? formatUsdc(loan.totalPaid) : '0',
            remainingBalance: formatUsdc(remainingRaw),   // exact on-chain value
            duration:         loan.durationMonths ? parseInt(loan.durationMonths.toString(), 10) : null,
            status:           loan.repaid ? 'repaid' : fullyFunded ? 'active' : 'pending',
          });
        } catch (e) { console.error(`Error fetching loan ${i}:`, e); }
      }
      return loans;
    } catch (e) { console.error('Error fetching loans:', e); return []; }
  };

  const getUserLoans = async (userAddress) => {
    const all = await getAllLoans();
    return all.filter(l => l.borrower.toLowerCase() === userAddress.toLowerCase());
  };

  // investInLoan now takes an explicit amount (partial funding supported)
  const investInLoan = async (loanId, investmentAmount) => {
    if (!account || !signer) throw new Error('Wallet not connected');
    const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

    const registered = await contract.isInvestor(account);
    if (!registered) throw new Error('Register as an investor before funding loans.');

    const loan = await contract.getLoan(loanId);
    if (loan.repaid) throw new Error('Loan already repaid');
    if (loan.fundedAmount >= loan.principal) throw new Error('Loan already fully funded');

    const amount = parseUsdc(investmentAmount);
    await approveUsdcIfNeeded(CONTRACT_ADDRESS, amount);
    const tx = await contract.fundLoan(loanId, amount);
    await tx.wait();
    return tx;
  };

  const repayLoan = async (loanId, paymentAmount) => {
    if (!account || !signer) throw new Error('Wallet not connected');
    const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

    const loan = await contract.getLoan(loanId);
    if (loan.borrower.toLowerCase() !== account.toLowerCase()) throw new Error('Not the borrower');
    if (loan.fundedAmount === 0n) throw new Error('Loan not funded yet');
    if (loan.repaid) throw new Error('Loan already repaid');

    const amount = parseUsdc(paymentAmount);
    await approveUsdcIfNeeded(CONTRACT_ADDRESS, amount);
    const tx = await contract.makePayment(loanId, amount);
    await tx.wait();
    return tx;
  };

  const disconnectWallet = () => {
    setAccount(null); setProvider(null); setSigner(null);
    setError(null); setUserRole(null); setShowRoleModal(false); setWalletAnalytics(null);
    try { localStorage.removeItem('lastAccount'); } catch {}
  };

  const value = {
    account, provider, signer, isConnecting, error,
    userRole, isRegistering, showRoleModal, walletAnalytics, isLoadingAnalytics,
    usdcAddress: USDC_ADDRESS,
    loanMarketAddress: CONTRACT_ADDRESS,
    connectWallet, disconnectWallet,
    registerUserRole, refreshUserRole, setShowRoleModal,
    getFicoScore, getWalletAnalytics,
    submitLoanRequest, getAllLoans, getUserLoans,
    investInLoan, repayLoan,
    formatUsdc, parseUsdc,
  };

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
};
