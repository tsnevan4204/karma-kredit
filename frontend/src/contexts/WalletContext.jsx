import { createContext, useContext, useState, useEffect } from 'react';
import { ethers } from 'ethers';
import MultitokenLoanAbi from '../abis/sepolia/MultitokenLoan.json';

const WalletContext = createContext();

export const useWallet = () => {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
};

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

  // Helper functions for localStorage
  const saveRoleToStorage = (address, role) => {
    try {
      localStorage.setItem(`userRole_${address.toLowerCase()}`, role);
      console.log(`💾 Saved role '${role}' for address ${address}`);
    } catch (error) {
      console.error('Failed to save role to localStorage:', error);
    }
  };

  const getRoleFromStorage = (address) => {
    try {
      const role = localStorage.getItem(`userRole_${address.toLowerCase()}`);
      console.log(`📖 Retrieved role '${role}' from storage for address ${address}`);
      return role;
    } catch (error) {
      console.error('Failed to get role from localStorage:', error);
      return null;
    }
  };

  // Use the automatically generated contract data
  const CONTRACT_ADDRESS = MultitokenLoanAbi.address;
  const CONTRACT_ABI = MultitokenLoanAbi.abi;

  const getContract = () => {
    if (!signer) return null;
    return new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
  };

  const checkUserRole = async (address) => {
    console.log(`🔍 Checking role for address: ${address}`);
    
    // First, try to get from localStorage - if we have a stored role, use it to avoid excessive contract calls
    const storedRole = getRoleFromStorage(address);
    
    if (storedRole && storedRole !== 'null') {
      console.log(`📦 Using cached role: ${storedRole}`);
      return storedRole;
    }
    
    try {
      const contract = getContract();
      if (!contract) {
        console.log('⚠️ Contract not available, using stored role:', storedRole);
        return storedRole;
      }
      
      console.log('📞 Calling contract.getUserRole()...');
      const role = await contract.getUserRole(address);
      console.log(`✅ Contract returned role: '${role}'`);
      
      // If we got a valid role from contract, update localStorage
      if (role && role !== 'unknown') {
        saveRoleToStorage(address, role);
        return role;
      }
      
      // If contract returns 'unknown' but we have a stored role, use stored role
      if (role === 'unknown' && storedRole) {
        console.log('📦 Contract says unknown, but using stored role:', storedRole);
        return storedRole;
      }
      
      return role;
    } catch (error) {
      console.error('❌ Error checking user role from contract:', error);
      console.log('📦 Falling back to stored role:', storedRole);
      return storedRole;
    }
  };

  const registerUserRole = async (role) => {
    if (!account || !signer) {
      throw new Error('Wallet not connected');
    }

    setIsRegistering(true);
    try {
      const contract = getContract();
      if (!contract) throw new Error('Contract not available');

      let tx;
      if (role === 'business') {
        tx = await contract.registerAsBusiness();
      } else if (role === 'investor') {
        tx = await contract.registerAsInvestor();
      } else {
        throw new Error('Invalid role');
      }

      await tx.wait();
      console.log(`✅ Successfully registered as ${role} on blockchain`);
      
      // Update local state and save to localStorage
      setUserRole(role);
      saveRoleToStorage(account, role);
      setShowRoleModal(false);
      
      return true;
    } catch (error) {
      console.error('Error registering role:', error);
      throw error;
    } finally {
      setIsRegistering(false);
    }
  };

  const getWalletAnalytics = async (walletAddress, chain = 'sepolia') => {
    setIsLoadingAnalytics(true);
    try {
      const response = await fetch('http://localhost:5000/api/wallet-analytics', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          wallet_address: walletAddress,
          chain: chain
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get wallet analytics');
      }

      const data = await response.json();
      setWalletAnalytics(data);
      return data;
    } catch (err) {
      console.error('Error getting wallet analytics:', err);
      throw err;
    } finally {
      setIsLoadingAnalytics(false);
    }
  };

  const getFicoScore = async (walletAddress, chain = 'sepolia') => {
    try {
      const response = await fetch('http://localhost:5000/api/fico-score', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          wallet_address: walletAddress,
          chain: chain
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get FICO score');
      }

      const data = await response.json();
      return data;
    } catch (err) {
      console.error('Error getting FICO score:', err);
      throw err;
    }
  };

  const connectWallet = async () => {
    if (!window.ethereum) {
      setError('MetaMask is not installed. Please install MetaMask to use this app.');
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      // Request account access
      const accounts = await window.ethereum.request({
        method: 'eth_requestAccounts',
      });

      const ethProvider = new ethers.BrowserProvider(window.ethereum);
      const ethSigner = await ethProvider.getSigner();

      setAccount(accounts[0]);
      setProvider(ethProvider);
      setSigner(ethSigner);

      // Check if user has a role assigned
      const role = await checkUserRole(accounts[0]);
      console.log(`🎭 Setting user role to: ${role}`);
      setUserRole(role);

      // Load wallet analytics
      try {
        await getWalletAnalytics(accounts[0]);
      } catch (error) {
        console.error('Failed to load wallet analytics:', error);
      }

      // If no role assigned, show role selection modal
      if (!role || role === 'unknown') {
        console.log('🚨 No valid role found, showing role modal');
        setShowRoleModal(true);
      } else {
        console.log(`✅ Valid role found: ${role}, hiding modal`);
        setShowRoleModal(false);
      }

                // Listen for account changes
      window.ethereum.on('accountsChanged', async (accounts) => {
        if (accounts.length === 0) {
          // MetaMask is locked or user has no accounts
          setAccount(null);
          setProvider(null);
          setSigner(null);
          setUserRole(null);
          setWalletAnalytics(null);
        } else if (accounts[0] !== account) { // Only process if the account actually changed
          setAccount(accounts[0]);
          const newRole = await checkUserRole(accounts[0]);
          console.log(`🔄 Account changed, new role: ${newRole}`);
          setUserRole(newRole);
          
          // Load new wallet analytics
          try {
            await getWalletAnalytics(accounts[0]);
          } catch (error) {
            console.error('Failed to load wallet analytics:', error);
          }
          
          if (!newRole || newRole === 'unknown') {
            console.log('🚨 Account changed - no valid role, showing modal');
            setShowRoleModal(true);
          } else {
            console.log(`✅ Account changed - valid role: ${newRole}, hiding modal`);
            setShowRoleModal(false);
          }
        }
      });

      // Listen for chain changes
      window.ethereum.on('chainChanged', () => {
        window.location.reload();
      });

    } catch (err) {
      setError('Failed to connect wallet: ' + err.message);
    } finally {
      setIsConnecting(false);
    }
  };

  const refreshUserRole = async () => {
    if (account) {
      console.log('🔄 Manually refreshing user role...');
      const role = await checkUserRole(account);
      console.log(`🎭 Manual refresh - setting role to: ${role}`);
      setUserRole(role);
      
      if (!role || role === 'unknown') {
        console.log('🚨 Manual refresh - no valid role, showing modal');
        setShowRoleModal(true);
      } else {
        console.log(`✅ Manual refresh - valid role: ${role}, hiding modal`);
        setShowRoleModal(false);
      }
    }
  };

  // Loan management functions
  const submitLoanRequest = async (loanData) => {
    if (!account || !signer) {
      throw new Error('Wallet not connected');
    }

    console.log('📝 Submitting loan request:', loanData);
    
    try {
      const contract = getContract();
      if (!contract) throw new Error('Contract not available');

      // Convert amount to wei (assuming we're using native token)
      const principal = ethers.parseEther(loanData.amount.toString());
      
      // Calculate interest (e.g., 10% = 1000 basis points)
      const interestRate = Math.floor(parseFloat(loanData.interestRate || 10) * 100);
      
      // Use duration in months (updated for monthly payment system)
      const durationInMonths = parseInt(loanData.durationInMonths || loanData.duration);
      
      // Create metadata JSON
      const metadata = {
        description: loanData.description,
        category: loanData.category,
        supportingImage: loanData.supportingImage || null,
        emergencyContacts: {
          contact1: {
            name: loanData.emergencyContact1?.name || '',
            phone: loanData.emergencyContact1?.phone || ''
          },
          contact2: {
            name: loanData.emergencyContact2?.name || '',
            phone: loanData.emergencyContact2?.phone || ''
          }
        }
      };
      
      // For simplicity, using a placeholder CID - in production you'd upload to IPFS
      const metadataCID = `json:${JSON.stringify(metadata)}`;
      
              // Use zero address for native token (PyUSD)
      const tokenAddress = "0x0000000000000000000000000000000000000000";
      
      console.log('📞 Calling contract.requestLoan with:', {
        tokenAddress,
        principal: principal.toString(),
        interest: interestRate,
        durationInMonths,
        metadataCID: metadataCID.substring(0, 100) + '...' // Truncate for logging
      });
      
      console.log('🖼️ Supporting image included:', !!loanData.supportingImage);
      if (loanData.supportingImage) {
        console.log('📏 Image data length:', loanData.supportingImage.length);
      }

      const tx = await contract.requestLoan(
        tokenAddress,
        principal,
        interestRate,
        durationInMonths,
        metadataCID
      );

      console.log('⏳ Transaction submitted, waiting for confirmation...');
      await tx.wait();
      console.log('✅ Loan request submitted successfully!');
      
      return tx;
    } catch (error) {
      console.error('❌ Error submitting loan request:', error);
      throw error;
    }
  };

  const getAllLoans = async () => {
    try {
      const contract = getContract();
      if (!contract) throw new Error('Contract not available');

      console.log('📊 Fetching all loans from contract...');
      
      // Get the total number of loans
      const loanCount = await contract.loanCounter();
      console.log(`📈 Total loans in contract: ${loanCount.toString()}`);
      
      const loans = [];
      
      // Fetch each loan
      for (let i = 0; i < parseInt(loanCount.toString()); i++) {
        try {
          const loan = await contract.getLoan(i);
          
          console.log(`🔍 Raw loan ${i} from contract:`, {
            principal: loan.principal.toString(),
            interest: loan.interest.toString(),
            dueDate: loan.dueDate.toString(),
            monthlyPayment: loan.monthlyPayment ? loan.monthlyPayment.toString() : 'undefined',
            totalPaid: loan.totalPaid ? loan.totalPaid.toString() : 'undefined',
            duration: loan.duration ? loan.duration.toString() : 'undefined'
          });
          
          // Parse the metadata
          let metadata = { description: '', category: 'other', supportingImage: null };
          try {
            if (loan.metadataCID.startsWith('json:')) {
              metadata = JSON.parse(loan.metadataCID.substring(5));
              console.log(`🔍 Loan ${i} metadata:`, {
                description: metadata.description,
                category: metadata.category,
                hasImage: !!metadata.supportingImage,
                imageLength: metadata.supportingImage?.length || 0
              });
            }
          } catch (e) {
            console.log('Could not parse metadata for loan', i, 'Error:', e);
          }
          
          loans.push({
            id: i,
            borrower: loan.borrower,
            amount: ethers.formatEther(loan.principal),
            interest: (parseInt(loan.interest.toString()) / 100).toFixed(1),
            dueDate: new Date(parseInt(loan.dueDate.toString()) * 1000),
            funded: loan.funded,
            repaid: loan.repaid,
            description: metadata.description || `Loan #${i}`,
            category: metadata.category || 'other',
            supportingImage: metadata.supportingImage,
            emergencyContacts: metadata.emergencyContacts || null,
            metadataCID: loan.metadataCID,
            monthlyPayment: loan.monthlyPayment ? ethers.formatEther(loan.monthlyPayment) : null,
            totalPaid: loan.totalPaid ? ethers.formatEther(loan.totalPaid) : '0',
            duration: loan.duration ? parseInt(loan.duration.toString()) : null,
            status: loan.repaid ? 'repaid' : (loan.funded ? 'active' : 'pending')
          });
        } catch (error) {
          console.error(`Error fetching loan ${i}:`, error);
        }
      }
      
      console.log(`✅ Fetched ${loans.length} loans`);
      return loans;
    } catch (error) {
      console.error('❌ Error fetching loans:', error);
      return [];
    }
  };

  const getUserLoans = async (userAddress) => {
    try {
      const allLoans = await getAllLoans();
      const userLoans = allLoans.filter(loan => 
        loan.borrower.toLowerCase() === userAddress.toLowerCase()
      );
      
      console.log(`👤 Found ${userLoans.length} loans for user ${userAddress}`);
      return userLoans;
    } catch (error) {
      console.error('❌ Error fetching user loans:', error);
      return [];
    }
  };

  const investInLoan = async (loanId, investmentAmount) => {
    if (!account || !signer) {
      throw new Error('Wallet not connected');
    }

            console.log(`💰 Investing ${investmentAmount} PyUSD in loan ${loanId}`);
    
    try {
      const contract = getContract();
      if (!contract) throw new Error('Contract not available');

      // First, let's check if the user is registered as an investor
      console.log('🔍 Checking if user is registered as investor...');
      const isInvestorRegistered = await contract.isInvestor(account);
      console.log(`📋 User is registered as investor: ${isInvestorRegistered}`);
      
      if (!isInvestorRegistered) {
        throw new Error('You must be registered as an investor to fund loans. Please register first.');
      }

      // Get the loan details to check if it's fundable
      console.log(`🔍 Checking loan ${loanId} details...`);
      const loanDetails = await contract.getLoan(loanId);
      console.log('📄 Loan details:', {
        borrower: loanDetails.borrower,
        principal: loanDetails.principal.toString(),
        funded: loanDetails.funded,
        repaid: loanDetails.repaid
      });

      if (loanDetails.funded) {
        throw new Error('This loan is already fully funded');
      }

      if (loanDetails.repaid) {
        throw new Error('This loan has already been repaid');
      }

      // Convert investment amount to wei
      const value = ethers.parseEther(investmentAmount.toString());
      
      console.log('📞 Calling contract.fundLoan with:', {
        loanId,
        value: value.toString()
      });

      // Try to estimate gas first to catch errors early
      console.log('⛽ Estimating gas for transaction...');
      try {
        const gasEstimate = await contract.fundLoan.estimateGas(loanId, { value });
        console.log(`✅ Gas estimate successful: ${gasEstimate.toString()}`);
      } catch (gasError) {
        console.error('❌ Gas estimation failed:', gasError);
        throw new Error(`Transaction would fail: ${gasError.reason || gasError.message}`);
      }

      const tx = await contract.fundLoan(loanId, { value });

      console.log('⏳ Investment transaction submitted, waiting for confirmation...');
      await tx.wait();
      console.log('✅ Investment successful!');
      
      return tx;
    } catch (error) {
      console.error('❌ Error investing in loan:', error);
      
      // Provide more specific error messages
      if (error.message.includes('user rejected')) {
        throw new Error('Transaction was cancelled by user');
      } else if (error.message.includes('insufficient funds')) {
        throw new Error('Insufficient funds for investment plus gas fees');
      } else if (error.message.includes('already funded')) {
        throw new Error('This loan is already fully funded');
      } else if (error.message.includes('registered as an investor')) {
        throw new Error('You must register as an investor first');
      } else if (error.reason) {
        throw new Error(`Smart contract error: ${error.reason}`);
      } else {
        throw error;
      }
    }
  };

  const repayLoan = async (loanId, paymentAmount) => {
    if (!account || !signer) {
      throw new Error('Wallet not connected');
    }

            console.log(`💰 Making payment of ${paymentAmount} PyUSD for loan ${loanId}`);
    
    try {
      const contract = getContract();
      if (!contract) throw new Error('Contract not available');

      // First, let's check if the user is the borrower
      console.log('🔍 Checking loan details...');
      const loanDetails = await contract.getLoan(loanId);
      
      if (loanDetails.borrower.toLowerCase() !== account.toLowerCase()) {
        throw new Error('You are not the borrower of this loan');
      }

      if (!loanDetails.funded) {
        throw new Error('This loan has not been funded yet');
      }

      if (loanDetails.repaid) {
        throw new Error('This loan has already been fully repaid');
      }

      // Convert payment amount to wei
      const value = ethers.parseEther(paymentAmount.toString());
      
      console.log('📞 Calling contract.makePayment with:', {
        loanId,
        value: value.toString()
      });

      // Try to estimate gas first to catch errors early
      console.log('⛽ Estimating gas for payment transaction...');
      try {
        const gasEstimate = await contract.makePayment.estimateGas(loanId, { value });
        console.log(`✅ Gas estimate successful: ${gasEstimate.toString()}`);
      } catch (gasError) {
        console.error('❌ Gas estimation failed:', gasError);
        throw new Error(`Payment would fail: ${gasError.reason || gasError.message}`);
      }

      const tx = await contract.makePayment(loanId, { value });

      console.log('⏳ Payment transaction submitted, waiting for confirmation...');
      await tx.wait();
      console.log('✅ Payment successful!');
      
      return tx;
    } catch (error) {
      console.error('❌ Error making loan payment:', error);
      
      // Provide more specific error messages
      if (error.message.includes('user rejected')) {
        throw new Error('Transaction was cancelled by user');
      } else if (error.message.includes('insufficient funds')) {
        throw new Error('Insufficient funds for payment plus gas fees');
      } else if (error.message.includes('not the borrower')) {
        throw new Error('You are not the borrower of this loan');
      } else if (error.message.includes('not been funded')) {
        throw new Error('This loan has not been funded yet');
      } else if (error.message.includes('already been fully repaid')) {
        throw new Error('This loan has already been fully repaid');
      } else if (error.reason) {
        throw new Error(`Smart contract error: ${error.reason}`);
      } else {
        throw error;
      }
    }
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
  };

  return (
    <WalletContext.Provider value={value}>
      {children}
    </WalletContext.Provider>
  );
};