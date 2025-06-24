import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWallet } from '../contexts/WalletContext';
import { 
  TrendingUp, 
  DollarSign, 
  Users, 
  Target, 
  ArrowUpRight, 
  Clock,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Activity,
  Calendar,
  CreditCard,
  Percent,
  BarChart3,
  Eye
} from 'lucide-react';

const InvestorDashboard = () => {
  const { account, userRole, walletAnalytics, isLoadingAnalytics, getWalletAnalytics, getAllLoans, getFicoScore } = useWallet();
  const navigate = useNavigate();
  const [portfolioValue, setPortfolioValue] = useState(0);
  const [totalYield, setTotalYield] = useState(0);
  const [myInvestments, setMyInvestments] = useState([]);
  const [isLoadingInvestments, setIsLoadingInvestments] = useState(false);
  const [ficoScore, setFicoScore] = useState(null);
  const [isLoadingFico, setIsLoadingFico] = useState(false);

     // Calculate real investment returns based on actual contract data
   const calculateRealReturns = (loan) => {
     // Safely parse all values with fallbacks
     const principal = isNaN(parseFloat(loan.amount)) ? 0 : parseFloat(loan.amount);
     const monthlyPayment = isNaN(parseFloat(loan.monthlyPayment)) ? 0 : parseFloat(loan.monthlyPayment);
     const totalPaid = isNaN(parseFloat(loan.totalPaid)) ? 0 : parseFloat(loan.totalPaid);
     const duration = isNaN(parseInt(loan.duration)) ? 1 : parseInt(loan.duration);
     const interestRate = isNaN(parseFloat(loan.interest)) ? 0 : parseFloat(loan.interest);
    
         // Calculate total expected amount (principal + interest)
     const totalExpectedAmount = monthlyPayment * duration;
     const totalInterest = totalExpectedAmount - principal;
     
     // Validation check - if numbers seem wrong, log a warning
     if (totalInterest < 0) {
       console.warn('⚠️ Negative interest calculated - possible data issue:', {
         principal, monthlyPayment, duration, totalExpectedAmount, totalInterest
       });
     }
    
         // Calculate how much interest has been earned from payments received
     const paymentProgress = totalExpectedAmount > 0 ? totalPaid / totalExpectedAmount : 0;
     const interestEarned = totalInterest * paymentProgress;
    
    // Calculate remaining expected earnings
    const remainingInterest = totalInterest - interestEarned;
    
         console.log(`💰 Investment calculation for loan ${loan.id}:`, {
       principal,
       monthlyPayment,
       totalPaid,
       duration,
       totalExpectedAmount: totalExpectedAmount.toFixed(4),
       totalInterest: totalInterest.toFixed(4),
       paymentProgress: (paymentProgress * 100).toFixed(1) + '%',
       interestEarned: interestEarned.toFixed(4),
       remainingInterest: remainingInterest.toFixed(4),
       calculationCheck: {
         expectedTotal: (monthlyPayment * duration).toFixed(4),
         interestFromPrincipal: (totalExpectedAmount - principal).toFixed(4),
         paymentsMade: monthlyPayment > 0 ? Math.floor(totalPaid / monthlyPayment) : 0
       }
     });
    
    return {
      principal,
      totalExpectedAmount,
      totalInterest,
      interestEarned,
      remainingInterest,
      paymentProgress,
             paymentsReceived: monthlyPayment > 0 ? Math.floor(totalPaid / monthlyPayment) : 0,
      totalPayments: duration,
      monthlyReturn: (totalInterest / duration),
      isComplete: totalPaid >= totalExpectedAmount * 0.98 // Allow for small rounding
    };
  };

  // Get real investment data from smart contract
  const loadMyInvestments = async () => {
    if (!account) return;
    
    setIsLoadingInvestments(true);
    try {
      console.log('📊 Loading investments for investor:', account);
      
      // Get all loans from the contract
      const allLoans = await getAllLoans();
      console.log('🔍 All loans found:', allLoans.length);
      
      // Filter to funded loans only (these are the investments)
      const fundedLoans = allLoans.filter(loan => loan.funded);
      console.log('💰 Funded loans (investments):', fundedLoans.length);
      
      if (fundedLoans.length === 0) {
        setMyInvestments([]);
        setPortfolioValue(0);
        setTotalYield(0);
        return;
      }
      
             // Process each investment with real contract data
       const investments = fundedLoans.map(loan => {
         console.log('🔍 Processing loan for investment:', {
           id: loan.id,
           dueDate: loan.dueDate,
           dueDateType: typeof loan.dueDate,
           amount: loan.amount,
           monthlyPayment: loan.monthlyPayment,
           totalPaid: loan.totalPaid
         });
         
         const returns = calculateRealReturns(loan);
        
        return {
          id: loan.id,
          borrower: `${loan.borrower.slice(0, 6)}...${loan.borrower.slice(-4)}`,
          borrowerAddress: loan.borrower,
          
          // Investment amounts
          invested: returns.principal,
          totalExpected: returns.totalExpectedAmount,
          
          // Earnings data
          interestEarned: returns.interestEarned,
          remainingInterest: returns.remainingInterest,
          totalInterest: returns.totalInterest,
          
          // Progress tracking
          paymentProgress: returns.paymentProgress,
          paymentsReceived: returns.paymentsReceived,
          totalPayments: returns.totalPayments,
          
          // Loan details
          interestRate: parseFloat(loan.interest),
          monthlyPayment: parseFloat(loan.monthlyPayment),
          totalPaid: parseFloat(loan.totalPaid),
          
          // Status
          status: returns.isComplete ? 'completed' : (loan.repaid ? 'completed' : 'active'),
          category: loan.category || 'General',
          description: loan.description || 'Business loan',
          
                     // Dates with safe parsing
           startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Estimate
           endDate: (() => {
             try {
               if (!loan.dueDate) return null;
               
               // Handle different timestamp formats
               let timestamp;
               if (typeof loan.dueDate === 'string') {
                 timestamp = parseInt(loan.dueDate);
               } else {
                 timestamp = Number(loan.dueDate);
               }
               
               console.log('🔍 Processing dueDate:', { 
                 raw: loan.dueDate, 
                 parsed: timestamp, 
                 type: typeof loan.dueDate,
                 timestampTimes1000: new Date(timestamp * 1000).toLocaleDateString(),
                 timestampDirect: new Date(timestamp).toLocaleDateString()
               });
               
               if (isNaN(timestamp) || timestamp <= 0) {
                 console.warn('Invalid timestamp:', timestamp);
                 return null;
               }
               
               // Create date - check if it's already reasonable
               let date = new Date(timestamp * 1000);
               const year = date.getFullYear();
               
               // If year is crazy (like 58925), try without multiplying by 1000
               if (year > 2100 || year < 2020) {
                 date = new Date(timestamp);
               }
               
               // If still crazy, try as string
               if (date.getFullYear() > 2100 || date.getFullYear() < 2020) {
                 console.warn('Could not create valid date from:', timestamp, 'Generated year:', date.getFullYear());
                 return null;
               }
               
               return date.toLocaleDateString();
             } catch (error) {
               console.error('Date parsing error for loan', loan.id, ':', error);
               return null;
             }
           })(),
          
                     // Risk assessment
           karma: 75, // TODO: Get real karma score for borrower
           lastPayment: returns.paymentsReceived > 0 ? new Date().toLocaleDateString() : null
        };
      });
      
      console.log('✅ Processed investments with real data:', investments);
      setMyInvestments(investments);
      
      // Calculate real portfolio metrics
      const totalInvested = investments.reduce((sum, inv) => sum + inv.invested, 0);
      const totalEarned = investments.reduce((sum, inv) => sum + inv.interestEarned, 0);
      
      setPortfolioValue(totalInvested);
      setTotalYield(totalEarned);
      
      console.log('📈 Portfolio Summary:', {
        totalInvested: totalInvested.toFixed(4),
        totalEarned: totalEarned.toFixed(4),
        yieldPercentage: totalInvested > 0 ? ((totalEarned / totalInvested) * 100).toFixed(2) + '%' : '0%'
      });
      
    } catch (error) {
      console.error('❌ Error loading investments:', error);
      setMyInvestments([]);
      setPortfolioValue(0);
      setTotalYield(0);
    } finally {
      setIsLoadingInvestments(false);
    }
  };

  // Get real FICO score for investor
  const loadFicoScore = async () => {
    if (!account) return;
    
    setIsLoadingFico(true);
    try {
      console.log('📊 Loading FICO score for investor:', account);
      const ficoData = await getFicoScore(account);
      console.log('✅ FICO data:', ficoData);
      setFicoScore(ficoData);
    } catch (error) {
      console.error('❌ Error loading FICO score:', error);
      setFicoScore(null);
    } finally {
      setIsLoadingFico(false);
    }
  };

  const refreshAnalytics = async () => {
    if (account) {
      try {
        await getWalletAnalytics(account);
        await loadFicoScore();
        await loadMyInvestments();
      } catch (error) {
        console.error('Failed to refresh analytics:', error);
      }
    }
  };

  // Load data when component mounts or account changes
  useEffect(() => {
    if (account && userRole === 'investor') {
      refreshAnalytics();
    }
  }, [account, userRole]);

  const getStatusColor = (status) => {
    switch (status) {
      case 'active': return 'bg-green-500';
      case 'completed': return 'bg-blue-500';
      case 'defaulted': return 'bg-red-500';
      default: return 'bg-neutral-500';
    }
  };

  const getStatusBg = (status) => {
    switch (status) {
      case 'active': return 'bg-green-50 border-green-200';
      case 'completed': return 'bg-blue-50 border-blue-200';
      case 'defaulted': return 'bg-red-50 border-red-200';
      default: return 'bg-neutral-50 border-neutral-200';
    }
  };

  const formatDate = (dateString) => {
    if (!dateString || dateString === null) return 'TBD';
    if (typeof dateString === 'string' && dateString.includes('/')) {
      return dateString; // Already formatted
    }
    try {
      return new Date(dateString).toLocaleDateString();
    } catch (error) {
      return 'TBD';
    }
  };

  if (!account) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary-50 to-karma-50 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-6">
          <div className="w-20 h-20 bg-gradient-to-r from-primary-500 to-karma-500 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Users className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-neutral-900 mb-4">
            Connect Your Wallet
          </h1>
          <p className="text-neutral-600 mb-6">
            Access your investment portfolio and track your earnings
          </p>
          <button className="btn-primary">
            Connect Wallet
          </button>
        </div>
      </div>
    );
  }

  if (userRole !== 'investor') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary-50 to-karma-50 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-6">
          <div className="w-20 h-20 bg-neutral-200 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Users className="w-10 h-10 text-neutral-400" />
          </div>
          <h1 className="text-2xl font-bold text-neutral-900 mb-4">
            Investor Access Required
          </h1>
          <p className="text-neutral-600 mb-6">
            This dashboard is only available for investor users. You are currently registered as a {userRole || 'unregistered'} user.
          </p>
          <p className="text-sm text-neutral-500">
            Disconnect and reconnect your wallet, then select "Investor / Lender" during registration.
          </p>
        </div>
      </div>
    );
  }

  const totalROI = portfolioValue > 0 ? ((totalYield / portfolioValue) * 100) : 0;
  const activeInvestments = myInvestments.filter(inv => inv.status === 'active');

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-karma-50">
      {/* Hero Header */}
      <div className="bg-white shadow-sm border-b border-neutral-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-neutral-900 mb-2">
                Investment Portfolio
              </h1>
              <p className="text-lg text-neutral-600">
                Track your loans and earnings in real-time
              </p>
            </div>
            
            <div className="flex items-center space-x-4">
              <button
                onClick={refreshAnalytics}
                disabled={isLoadingAnalytics}
                className="p-3 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded-xl transition-colors"
              >
                <RefreshCw className={`w-5 h-5 ${isLoadingAnalytics ? 'animate-spin' : ''}`} />
              </button>
              
              <button
                onClick={() => navigate('/marketplace')}
                className="btn-primary flex items-center space-x-2"
              >
                <Target className="w-5 h-5" />
                <span>Browse Loans</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Portfolio Overview Cards */}
        <div className="grid md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-2xl shadow-lg p-6 border border-neutral-200">
            <div className="flex items-center justify-between mb-4">
              <DollarSign className="w-8 h-8 text-primary-600" />
              <span className="text-sm font-medium text-neutral-600">Total Invested</span>
            </div>
            <div className="text-2xl font-bold text-neutral-900 mb-1">
              {isLoadingInvestments ? (
                <span className="animate-pulse">Loading...</span>
              ) : (
                `${portfolioValue.toFixed(2)} PyUSD`
              )}
            </div>
            <div className="text-sm text-neutral-600">Principal amount</div>
          </div>
          
          <div className="bg-white rounded-2xl shadow-lg p-6 border border-neutral-200">
            <div className="flex items-center justify-between mb-4">
              <TrendingUp className="w-8 h-8 text-green-600" />
              <span className="text-sm font-medium text-neutral-600">Interest Earned</span>
            </div>
            <div className="text-2xl font-bold text-green-600 mb-1">
              {isLoadingInvestments ? (
                <span className="animate-pulse">Loading...</span>
              ) : (
                `${totalYield.toFixed(4)} PyUSD`
              )}
            </div>
            <div className="text-sm text-neutral-600">
              {totalROI.toFixed(2)}% ROI
            </div>
          </div>
          
          <div className="bg-white rounded-2xl shadow-lg p-6 border border-neutral-200">
            <div className="flex items-center justify-between mb-4">
              <Activity className="w-8 h-8 text-blue-600" />
              <span className="text-sm font-medium text-neutral-600">Active Loans</span>
            </div>
            <div className="text-2xl font-bold text-neutral-900 mb-1">
              {isLoadingInvestments ? (
                <span className="animate-pulse">...</span>
              ) : (
                activeInvestments.length
              )}
            </div>
            <div className="text-sm text-neutral-600">Currently earning</div>
          </div>
          
          <div className="bg-white rounded-2xl shadow-lg p-6 border border-neutral-200">
            <div className="flex items-center justify-between mb-4">
              <BarChart3 className="w-8 h-8 text-karma-600" />
              <span className="text-sm font-medium text-neutral-600">Portfolio Value</span>
            </div>
            <div className="text-2xl font-bold text-neutral-900 mb-1">
              {isLoadingInvestments ? (
                <span className="animate-pulse">Loading...</span>
              ) : (
                `${(portfolioValue + totalYield).toFixed(2)} PyUSD`
              )}
            </div>
            <div className="text-sm text-neutral-600">Principal + Interest</div>
          </div>
        </div>

        {/* Investment Details */}
        {myInvestments.length > 0 && (
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-neutral-900 mb-6">Your Active Investments</h2>
            <div className="space-y-6">
              {myInvestments.map((investment) => (
                <div key={investment.id} className={`bg-white rounded-2xl shadow-lg border-2 ${getStatusBg(investment.status)} overflow-hidden`}>
                  {/* Investment Header */}
                  <div className="p-6 border-b border-neutral-200">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <div className="flex items-center space-x-3 mb-2">
                          <h3 className="text-xl font-bold text-neutral-900">
                            {investment.invested.toFixed(2)} PyUSD Investment
                          </h3>
                          <div className={`w-3 h-3 rounded-full ${getStatusColor(investment.status)}`}></div>
                          <span className="text-sm font-medium text-neutral-600 capitalize">
                            {investment.status}
                          </span>
                        </div>
                        <p className="text-neutral-600 font-medium">Borrower: {investment.borrower}</p>
                        <p className="text-sm text-neutral-500 capitalize">{investment.category} • Loan #{investment.id}</p>
                      </div>
                      
                      <div className="text-right">
                        <div className="text-2xl font-bold text-green-600 mb-1">
                          {investment.interestRate}%
                        </div>
                        <div className="text-sm text-neutral-600">Interest Rate</div>
                      </div>
                    </div>
                    
                    {/* Payment Progress Bar */}
                    <div className="mb-4">
                      <div className="flex justify-between text-sm text-neutral-600 mb-2">
                        <span>Payment Progress</span>
                        <span>{(investment.paymentProgress * 100).toFixed(1)}% complete</span>
                      </div>
                      <div className="w-full bg-neutral-200 rounded-full h-3">
                        <div 
                          className="bg-gradient-to-r from-green-500 to-green-400 h-3 rounded-full transition-all duration-500"
                          style={{ width: `${Math.min(investment.paymentProgress * 100, 100)}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>

                  {/* Earnings Dashboard */}
                  <div className="p-6 bg-gradient-to-r from-neutral-50 to-neutral-100">
                    <div className="grid md:grid-cols-4 gap-6 mb-4">
                      <div className="text-center">
                        <div className="text-xl font-bold text-green-600 mb-1">
                          {investment.interestEarned.toFixed(4)} PyUSD
                        </div>
                        <div className="text-sm text-neutral-600">Interest Earned</div>
                      </div>
                      <div className="text-center">
                        <div className="text-xl font-bold text-neutral-900 mb-1">
                          {investment.remainingInterest.toFixed(4)} PyUSD
                        </div>
                        <div className="text-sm text-neutral-600">Remaining Interest</div>
                      </div>
                      <div className="text-center">
                        <div className="text-xl font-bold text-blue-600 mb-1">
                          {investment.paymentsReceived} / {investment.totalPayments}
                        </div>
                        <div className="text-sm text-neutral-600">Payments Received</div>
                      </div>
                      <div className="text-center">
                        <div className="text-xl font-bold text-neutral-900 mb-1">
                          {investment.monthlyPayment.toFixed(2)} PyUSD
                        </div>
                        <div className="text-sm text-neutral-600">Monthly Payment</div>
                      </div>
                    </div>
                    
                    <div className="grid md:grid-cols-2 gap-4 pt-4 border-t border-neutral-300">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-neutral-600">Total Paid So Far:</span>
                        <span className="font-semibold text-neutral-900">{investment.totalPaid.toFixed(4)} PyUSD</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-neutral-600">Expected Total:</span>
                        <span className="font-semibold text-neutral-900">{investment.totalExpected.toFixed(2)} PyUSD</span>
                      </div>
                      {investment.lastPayment && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-neutral-600">Last Payment:</span>
                          <span className="font-semibold text-neutral-900">{formatDate(investment.lastPayment)}</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-neutral-600">Loan End Date:</span>
                        <span className="font-semibold text-neutral-900">{formatDate(investment.endDate)}</span>
                      </div>
                    </div>
                  </div>

                                     {/* Status Info */}
                   {investment.status === 'active' && (
                     <div className="p-4 bg-green-50">
                       <div className="flex items-center space-x-3 text-green-800">
                         <Activity className="w-5 h-5" />
                         <span className="font-medium">
                           This loan is actively being paid and generating returns.
                         </span>
                       </div>
                     </div>
                   )}
                  
                  {investment.status === 'completed' && (
                    <div className="p-4 bg-blue-50">
                      <div className="flex items-center space-x-3 text-blue-800">
                        <CheckCircle className="w-5 h-5" />
                        <span className="font-medium">
                          Loan completed! Final return: {(investment.interestEarned / investment.invested * 100).toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {myInvestments.length === 0 && !isLoadingInvestments && (
          <div className="text-center py-16">
            <div className="w-20 h-20 bg-gradient-to-r from-primary-500 to-karma-500 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <Target className="w-10 h-10 text-white" />
            </div>
            <h3 className="text-2xl font-bold text-neutral-900 mb-4">Ready to start investing?</h3>
            <p className="text-lg text-neutral-600 mb-8">Browse available loans and start earning interest on your PyUSD</p>
            <button
              onClick={() => navigate('/marketplace')}
              className="btn-primary text-lg px-8 py-4"
            >
              Browse Loan Marketplace
            </button>
          </div>
        )}

        {/* Loading State */}
        {isLoadingInvestments && (
          <div className="text-center py-16">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
            <p className="text-neutral-600">Loading your investment portfolio...</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default InvestorDashboard; 