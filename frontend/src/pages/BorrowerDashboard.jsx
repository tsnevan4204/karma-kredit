import { useState, useEffect } from 'react';
import { useWallet } from '../contexts/WalletContext';
import { 
  TrendingUp, 
  Clock, 
  CheckCircle, 
  AlertCircle, 
  DollarSign, 
  Upload,
  Plus,
  FileText,
  Calendar,
  Percent,
  Building2,
  RefreshCw,
  CreditCard,
  Target,
  Zap,
  ArrowRight,
  ChevronDown,
  X,
  Phone
} from 'lucide-react';

const BorrowerDashboard = () => {
  const { 
    account, 
    userRole, 
    walletAnalytics, 
    isLoadingAnalytics, 
    getWalletAnalytics, 
    getFicoScore,
    submitLoanRequest,
    getUserLoans,
    repayLoan
  } = useWallet();
  const [ficoData, setFicoData] = useState(null);
  const [isSubmittingLoan, setIsSubmittingLoan] = useState(false);
  const [myLoans, setMyLoans] = useState([]);
  const [isLoadingLoans, setIsLoadingLoans] = useState(false);
  const [loanForm, setLoanForm] = useState({
    amount: '',
    duration: '',
    description: '',
    category: '',
    supportingImage: null,
    emergencyContact1: {
      name: '',
      phone: ''
    },
    emergencyContact2: {
      name: '',
      phone: ''
    }
  });
  const [isProcessingPayment, setIsProcessingPayment] = useState({});
  const [showNewLoanForm, setShowNewLoanForm] = useState(false);

  // Load user's loans from contract
  const loadUserLoans = async () => {
    if (account) {
      setIsLoadingLoans(true);
      try {
        const loans = await getUserLoans(account);
        setMyLoans(loans);
      } catch (error) {
        console.error('Failed to load user loans:', error);
      } finally {
        setIsLoadingLoans(false);
      }
    }
  };

  const refreshAnalytics = async () => {
    if (account) {
      try {
        await getWalletAnalytics(account);
        const fico = await getFicoScore(account);
        setFicoData(fico);
      } catch (error) {
        console.error('Failed to refresh analytics:', error);
      }
    }
  };

  useEffect(() => {
    if (account) {
      refreshAnalytics();
      loadUserLoans();
    }
  }, [account]);

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setLoanForm(prev => ({
          ...prev,
          supportingImage: e.target.result
        }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmitLoan = async (e) => {
    e.preventDefault();
    
    if (!ficoData) {
      alert('Please wait for your karma to load before submitting a loan request.');
      return;
    }

    if (!ficoData.interest_rate) {
      alert('Your karma is too low for loan approval. Please improve your Karma first.');
      return;
    }

    // Validate emergency contacts
    if (!loanForm.emergencyContact1.name || !loanForm.emergencyContact1.phone) {
      alert('Please provide the first emergency contact information.');
      return;
    }

    if (!loanForm.emergencyContact2.name || !loanForm.emergencyContact2.phone) {
      alert('Please provide the second emergency contact information.');
      return;
    }

    // Validate phone number format (basic validation)
    const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
    if (!phoneRegex.test(loanForm.emergencyContact1.phone.replace(/[^\d\+]/g, ''))) {
      alert('Please provide a valid phone number for the first emergency contact.');
      return;
    }

    if (!phoneRegex.test(loanForm.emergencyContact2.phone.replace(/[^\d\+]/g, ''))) {
      alert('Please provide a valid phone number for the second emergency contact.');
      return;
    }

    // Check if user has any pending or active loans
    const hasPendingOrActiveLoan = myLoans.some(loan => 
      loan.status === 'pending' || loan.status === 'active'
    );
    
    if (hasPendingOrActiveLoan) {
      alert('You can only have one loan at a time. Please pay off your current loan before requesting a new one.');
      return;
    }

    setIsSubmittingLoan(true);
    
    try {
      // Prepare loan data for smart contract
      const loanData = {
        ...loanForm,
        interestRate: ficoData.interest_rate, // Use calculated interest rate from Karma
        durationInMonths: parseInt(loanForm.duration) // Use months instead of days
      };

      console.log('📝 Submitting loan to smart contract:', loanData);
      
      await submitLoanRequest(loanData);
      
      // Success! Clear the form and reload loans
      setLoanForm({
        amount: '',
        duration: '',
        description: '',
        category: '',
        supportingImage: null,
        emergencyContact1: {
          name: '',
          phone: ''
        },
        emergencyContact2: {
          name: '',
          phone: ''
        }
      });
      
      setShowNewLoanForm(false);
      
      // Reload the user's loans to show the new one
      await loadUserLoans();
      
      alert('🎉 Loan request submitted successfully! Check your loans below.');
      
    } catch (error) {
      console.error('❌ Failed to submit loan:', error);
      
      if (error.message.includes('user rejected')) {
        alert('Transaction was cancelled.');
      } else if (error.message.includes('insufficient funds')) {
        alert('Insufficient funds for gas fees. Please add some PyUSD to your wallet.');
      } else {
        alert(`Failed to submit loan request: ${error.message}`);
      }
    } finally {
      setIsSubmittingLoan(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'active': return 'bg-green-500';
      case 'pending': return 'bg-yellow-500';
      case 'repaid': return 'bg-blue-500';
      case 'defaulted': return 'bg-red-500';
      default: return 'bg-neutral-500';
    }
  };

  const getStatusBg = (status) => {
    switch (status) {
      case 'active': return 'bg-green-50 border-green-200';
      case 'pending': return 'bg-yellow-50 border-yellow-200';
      case 'repaid': return 'bg-blue-50 border-blue-200';
      case 'defaulted': return 'bg-red-50 border-red-200';
      default: return 'bg-neutral-50 border-neutral-200';
    }
  };

  const handleMakePayment = async (loanId, paymentAmount) => {
    setIsProcessingPayment(prev => ({ ...prev, [loanId]: true }));
    
    try {
      console.log(`💰 Making payment of ${paymentAmount} PyUSD for loan ${loanId}`);
      
      await repayLoan(loanId, paymentAmount);
      
      // Reload the user's loans to show updated payment status
      await loadUserLoans();
      
      alert('🎉 Payment successful! Your loan balance has been updated.');
      
    } catch (error) {
      console.error('❌ Failed to make payment:', error);
      
      if (error.message.includes('user rejected')) {
        alert('Payment was cancelled.');
      } else if (error.message.includes('insufficient funds')) {
        alert('Insufficient PyUSD balance for this payment.');
      } else if (error.message.includes('exceeds loan amount')) {
        alert('Payment amount exceeds remaining loan balance.');
      } else {
        alert(`Payment failed: ${error.message}`);
      }
    } finally {
      setIsProcessingPayment(prev => ({ ...prev, [loanId]: false }));
    }
  };

  // Calculate loan metrics using CONTRACT data only - no frontend calculations
  const calculateLoanMetrics = (loan) => {
    // Safety checks for contract data
    const principal = parseFloat(loan.amount) || 0;
    const duration = parseInt(loan.duration) || 1;
    const monthlyPayment = parseFloat(loan.monthlyPayment) || 0;
    const totalPaid = parseFloat(loan.totalPaid) || 0;
    
    // Calculate total amount from contract: monthly payment * duration
    const totalAmount = monthlyPayment * duration;
    const remainingBalance = Math.max(0, totalAmount - totalPaid);
    const paymentsRemaining = monthlyPayment > 0 ? Math.min(duration, Math.ceil(remainingBalance / monthlyPayment)) : 0;
    
    console.log(`💰 CONTRACT-BASED Payment calculation:`, {
      principal,
      duration,
      monthlyPayment: monthlyPayment.toFixed(4),
      totalAmount: totalAmount.toFixed(2),
      totalPaid,
      remainingBalance: remainingBalance.toFixed(2),
      paymentsRemaining,
      rawContractData: {
        amount: loan.amount,
        duration: loan.duration, 
        monthlyPayment: loan.monthlyPayment,
        totalPaid: loan.totalPaid
      }
    });
    
    return {
      totalAmount,
      monthlyPayment,
      totalPaid,
      remainingBalance,
      paymentsRemaining,
      duration
    };
  };

  if (!account) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary-50 to-karma-50 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-6">
          <div className="w-20 h-20 bg-gradient-to-r from-primary-500 to-karma-500 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Building2 className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-neutral-900 mb-4">
            Connect Your Wallet
          </h1>
          <p className="text-neutral-600 mb-6">
            Access your borrower dashboard and manage your loans
          </p>
          <button className="btn-primary">
            Connect Wallet
          </button>
        </div>
      </div>
    );
  }

  if (userRole !== 'business') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary-50 to-karma-50 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-6">
          <div className="w-20 h-20 bg-neutral-200 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Building2 className="w-10 h-10 text-neutral-400" />
          </div>
          <h1 className="text-2xl font-bold text-neutral-900 mb-4">
            Business Access Required
          </h1>
          <p className="text-neutral-600 mb-6">
            This dashboard is only available for business users. You are currently registered as an {userRole || 'unregistered'} user.
          </p>
          <p className="text-sm text-neutral-500">
            Disconnect and reconnect your wallet, then select "Business / Borrower" during registration.
          </p>
        </div>
      </div>
    );
  }

  const hasActiveLoan = myLoans.some(loan => loan.status === 'pending' || loan.status === 'active');

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-karma-50">
      {/* Hero Header */}
      <div className="bg-white shadow-sm border-b border-neutral-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-neutral-900 mb-2">
                Your Business Dashboard
              </h1>
              <p className="text-lg text-neutral-600">
                Manage loans and grow your business
              </p>
            </div>
            
            {/* Quick Actions */}
            <div className="flex items-center space-x-4">
              <button
                onClick={refreshAnalytics}
                disabled={isLoadingAnalytics}
                className="p-3 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded-xl transition-colors"
              >
                <RefreshCw className={`w-5 h-5 ${isLoadingAnalytics ? 'animate-spin' : ''}`} />
              </button>
              
              {!hasActiveLoan && (
                <button
                  onClick={() => setShowNewLoanForm(true)}
                  className="btn-primary flex items-center space-x-2"
                >
                  <Plus className="w-5 h-5" />
                  <span>New Loan</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Karma Score Card */}
        <div className="bg-white rounded-2xl shadow-lg p-8 mb-8 border border-neutral-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-6">
              <div className="relative">
                {(() => {
                  const karmaPoints = Math.round(ficoData?.fico_score || walletAnalytics?.fico_score || 0);
                  const percentage = Math.min((karmaPoints / 850) * 100, 100); // Karma points go up to 850
                  
                  // Determine color based on karma ranges
                  let karmaColor = 'text-red-500';
                  let bgColor = 'from-red-500 to-red-600';
                  let statusColor = 'bg-red-500';
                  
                  if (karmaPoints >= 800) {
                    karmaColor = 'text-green-500';
                    bgColor = 'from-green-500 to-green-600';
                    statusColor = 'bg-green-500';
                  } else if (karmaPoints >= 740) {
                    karmaColor = 'text-blue-500';
                    bgColor = 'from-blue-500 to-blue-600';
                    statusColor = 'bg-blue-500';
                  } else if (karmaPoints >= 670) {
                    karmaColor = 'text-yellow-500';
                    bgColor = 'from-yellow-500 to-yellow-600';
                    statusColor = 'bg-yellow-500';
                  } else if (karmaPoints >= 580) {
                    karmaColor = 'text-orange-500';
                    bgColor = 'from-orange-500 to-orange-600';
                    statusColor = 'bg-orange-500';
                  }
                  
                  return (
                    <>
                      {/* Circular Progress Ring */}
                      <div className="relative w-24 h-24">
                        <svg className="w-24 h-24 transform -rotate-90" viewBox="0 0 100 100">
                          {/* Background circle */}
                          <circle
                            cx="50"
                            cy="50"
                            r="40"
                            stroke="currentColor"
                            strokeWidth="8"
                            fill="transparent"
                            className="text-neutral-200"
                          />
                          {/* Progress circle */}
                          <circle
                            cx="50"
                            cy="50"
                            r="40"
                            stroke="currentColor"
                            strokeWidth="8"
                            fill="transparent"
                            strokeDasharray={`${2 * Math.PI * 40}`}
                            strokeDashoffset={`${2 * Math.PI * 40 * (1 - percentage / 100)}`}
                            className={karmaColor}
                            style={{
                              transition: 'stroke-dashoffset 0.5s ease-in-out'
                            }}
                          />
                        </svg>
                        {/* Karma text in center */}
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className={`text-xl font-bold ${karmaColor}`}>
                            {karmaPoints}
                          </span>
                        </div>
                      </div>
                      
                      {/* Status indicator */}
                                              <div className={`absolute -bottom-2 -right-2 w-8 h-8 ${statusColor} rounded-full flex items-center justify-center`}>
                          {karmaPoints >= 670 ? (
                            <CheckCircle className="w-5 h-5 text-white" />
                          ) : karmaPoints >= 580 ? (
                            <AlertCircle className="w-5 h-5 text-white" />
                          ) : (
                            <X className="w-5 h-5 text-white" />
                          )}
                        </div>
                    </>
                  );
                })()}
              </div>
              
              <div>
                <h2 className="text-2xl font-bold text-neutral-900 mb-1">
                  Karma
                </h2>
                <p className="text-neutral-600 mb-2">
                  {ficoData?.interest_rate ? 
                    `${ficoData.interest_rate}% interest rate available` : 
                    'Karma too low for loans'
                  }
                </p>
                
                {/* Karma Range Indicator */}
                <div className="mb-3">
                  {(() => {
                    const karmaLevel = Math.round(ficoData?.fico_score || walletAnalytics?.fico_score || 0);
                    let rangeText = '';
                    let rangeColor = '';
                    let bgColor = '';
                    
                    if (karmaLevel >= 90) {
                      rangeText = 'Legendary (90-100)';
                      rangeColor = 'text-green-700';
                      bgColor = 'bg-green-100';
                    } else if (karmaLevel >= 75) {
                      rangeText = 'Master (75-89)';
                      rangeColor = 'text-blue-700';
                      bgColor = 'bg-blue-100';
                    } else if (karmaLevel >= 60) {
                      rangeText = 'Elite (60-74)';
                      rangeColor = 'text-yellow-700';
                      bgColor = 'bg-yellow-100';
                    } else if (karmaLevel >= 40) {
                      rangeText = 'Skilled (40-59)';
                      rangeColor = 'text-orange-700';
                      bgColor = 'bg-orange-100';
                    } else {
                      rangeText = 'Rookie (0-39)';
                      rangeColor = 'text-red-700';
                      bgColor = 'bg-red-100';
                    }
                    
                    return (
                      <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${rangeColor} ${bgColor}`}>
                        {rangeText}
                      </span>
                    );
                  })()}
                </div>
                
                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-2">
                    <Target className="w-4 h-4 text-karma-500" />
                    <span className="text-sm font-medium text-neutral-700">
                      Max Loan: {ficoData?.max_loan_amount ? `${ficoData.max_loan_amount.toLocaleString()} PyUSD` : 'N/A'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            
            {isLoadingAnalytics && (
              <div className="flex items-center space-x-3">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
                <span className="text-sm text-neutral-600">Updating...</span>
              </div>
            )}
          </div>
        </div>

        {/* Active Loans */}
        {myLoans.length > 0 && (
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-neutral-900 mb-6">Your Loans</h2>
            <div className="space-y-6">
              {myLoans.map((loan) => {
                const loanMetrics = calculateLoanMetrics(loan);
                const progressPercentage = ((loanMetrics.totalAmount - loanMetrics.remainingBalance) / loanMetrics.totalAmount) * 100;
                
                return (
                  <div key={loan.id} className={`bg-white rounded-2xl shadow-lg border-2 ${getStatusBg(loan.status)} overflow-hidden`}>
                    {/* Loan Header */}
                    <div className="p-6 border-b border-neutral-200">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <div className="flex items-center space-x-3 mb-2">
                            <h3 className="text-xl font-bold text-neutral-900">
                              {parseFloat(loan.amount).toLocaleString()} PyUSD
                            </h3>
                            <div className={`w-3 h-3 rounded-full ${getStatusColor(loan.status)}`}></div>
                            <span className="text-sm font-medium text-neutral-600 capitalize">
                              {loan.status}
                            </span>
                          </div>
                          <p className="text-neutral-600 font-medium">{loan.description}</p>
                          <p className="text-sm text-neutral-500 capitalize">{loan.category} • Loan #{loan.id}</p>
                        </div>
                        
                        <div className="text-right">
                          <div className="text-2xl font-bold text-neutral-900 mb-1">
                            {loan.interest}%
                          </div>
                          <div className="text-sm text-neutral-600">Interest Rate</div>
                        </div>
                      </div>
                      
                      {/* Progress Bar */}
                      {loan.status === 'active' && (
                        <div className="mb-4">
                          <div className="flex justify-between text-sm text-neutral-600 mb-2">
                            <span>Loan Progress</span>
                            <span>{progressPercentage.toFixed(1)}% paid</span>
                          </div>
                          <div className="w-full bg-neutral-200 rounded-full h-2">
                            <div 
                              className="bg-gradient-to-r from-primary-500 to-karma-500 h-2 rounded-full transition-all duration-500"
                              style={{ width: `${Math.min(progressPercentage, 100)}%` }}
                            ></div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Payment Section for Active Loans */}
                    {loan.status === 'active' && loan.funded && (
                      <div className="p-6 bg-gradient-to-r from-neutral-50 to-neutral-100">
                        <div className="grid md:grid-cols-3 gap-6 mb-6">
                          <div className="text-center">
                            <div className="text-2xl font-bold text-neutral-900 mb-1">
                              {loanMetrics.monthlyPayment.toFixed(2)} PyUSD
                            </div>
                            <div className="text-sm text-neutral-600">Monthly Payment</div>
                          </div>
                          <div className="text-center">
                            <div className="text-2xl font-bold text-karma-600 mb-1">
                              {loanMetrics.remainingBalance.toFixed(2)} PyUSD
                            </div>
                            <div className="text-sm text-neutral-600">Remaining Balance</div>
                          </div>
                          <div className="text-center">
                            <div className="text-2xl font-bold text-neutral-900 mb-1">
                              {loanMetrics.paymentsRemaining}
                            </div>
                            <div className="text-sm text-neutral-600">Payments Left</div>
                          </div>
                        </div>
                        
                        {/* Payment Buttons */}
                        <div className="flex flex-col sm:flex-row gap-4">
                          <button
                            onClick={() => handleMakePayment(loan.id, loanMetrics.monthlyPayment.toString())}
                            disabled={isProcessingPayment[loan.id]}
                            className="flex-1 bg-gradient-to-r from-primary-500 to-karma-500 text-white py-4 px-6 rounded-xl font-semibold text-lg hover:shadow-lg transition-all duration-200 flex items-center justify-center space-x-3 disabled:opacity-50"
                          >
                            {isProcessingPayment[loan.id] ? (
                              <>
                                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                                <span>Processing...</span>
                              </>
                            ) : (
                              <>
                                <CreditCard className="w-5 h-5" />
                                <span>Pay Monthly ({loanMetrics.monthlyPayment.toFixed(2)} PyUSD)</span>
                              </>
                            )}
                          </button>
                          
                          <button
                            onClick={() => handleMakePayment(loan.id, loanMetrics.remainingBalance.toString())}
                            disabled={isProcessingPayment[loan.id]}
                            className="flex-1 bg-white border-2 border-neutral-300 text-neutral-700 py-4 px-6 rounded-xl font-semibold text-lg hover:bg-neutral-50 hover:border-neutral-400 transition-all duration-200 flex items-center justify-center space-x-3 disabled:opacity-50"
                          >
                            <Zap className="w-5 h-5" />
                            <span>Pay Full ({loanMetrics.remainingBalance.toFixed(2)} PyUSD)</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Pending/Other Status Info */}
                    {loan.status === 'pending' && (
                      <div className="p-6 bg-yellow-50">
                        <div className="flex items-center space-x-3 text-yellow-800">
                          <Clock className="w-5 h-5" />
                          <span className="font-medium">Waiting for investor funding...</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Empty State */}
        {myLoans.length === 0 && !isLoadingLoans && (
          <div className="text-center py-16">
            <div className="w-20 h-20 bg-gradient-to-r from-primary-500 to-karma-500 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <DollarSign className="w-10 h-10 text-white" />
            </div>
            <h3 className="text-2xl font-bold text-neutral-900 mb-4">Ready to grow your business?</h3>
            <p className="text-lg text-neutral-600 mb-8">Apply for your first loan and get funded by our community</p>
            <button
              onClick={() => setShowNewLoanForm(true)}
              className="btn-primary text-lg px-8 py-4"
            >
              Apply for Loan
            </button>
          </div>
        )}

        {/* Loading State */}
        {isLoadingLoans && (
          <div className="text-center py-16">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
            <p className="text-neutral-600">Loading your loans...</p>
          </div>
        )}
      </div>

      {/* New Loan Modal */}
      {showNewLoanForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-neutral-200">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-neutral-900">Apply for New Loan</h2>
                <button
                  onClick={() => setShowNewLoanForm(false)}
                  className="p-2 hover:bg-neutral-100 rounded-lg transition-colors"
                >
                  <X className="w-6 h-6 text-neutral-500" />
                </button>
              </div>
            </div>
            
            <form onSubmit={handleSubmitLoan} className="p-6 space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-neutral-700 mb-3">
                    Loan Amount (PyUSD)
                  </label>
                  <input
                    type="number"
                    value={loanForm.amount}
                    onChange={(e) => setLoanForm(prev => ({ ...prev, amount: e.target.value }))}
                    placeholder="Enter amount"
                    className="w-full px-4 py-3 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent text-lg"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-neutral-700 mb-3">
                    Duration (months)
                  </label>
                  <select
                    value={loanForm.duration}
                    onChange={(e) => setLoanForm(prev => ({ ...prev, duration: e.target.value }))}
                    className="w-full px-4 py-3 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent text-lg"
                    required
                  >
                    <option value="">Select duration</option>
                    <option value="6">6 months</option>
                    <option value="12">12 months</option>
                    <option value="18">18 months</option>
                    <option value="24">24 months</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-neutral-700 mb-3">
                  Business Category
                </label>
                <select
                  value={loanForm.category}
                  onChange={(e) => setLoanForm(prev => ({ ...prev, category: e.target.value }))}
                  className="w-full px-4 py-3 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent text-lg"
                  required
                >
                  <option value="">Select category</option>
                  <option value="agriculture">Agriculture</option>
                  <option value="technology">Technology</option>
                  <option value="education">Education</option>
                  <option value="retail">Retail</option>
                  <option value="healthcare">Healthcare</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-neutral-700 mb-3">
                  Business Description
                </label>
                <textarea
                  value={loanForm.description}
                  onChange={(e) => setLoanForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Describe your business and how you'll use the funds..."
                  rows={4}
                  className="w-full px-4 py-3 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent text-lg resize-none"
                  required
                />
              </div>

              {/* Emergency Contacts Section */}
              <div className="bg-red-50 p-6 rounded-xl border border-red-200">
                <h3 className="text-lg font-bold text-red-800 mb-4 flex items-center">
                  <AlertCircle className="w-5 h-5 mr-2" />
                  Emergency Contacts
                </h3>
                <p className="text-sm text-red-700 mb-6">
                  Provide two emergency contacts who will be notified in case of payment difficulties. 
                  This helps us work with you to resolve any issues.
                </p>
                
                <div className="space-y-4">
                  {/* First Emergency Contact */}
                  <div className="bg-white p-4 rounded-lg border border-red-200">
                    <h4 className="text-sm font-semibold text-neutral-700 mb-3">Emergency Contact 1</h4>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-neutral-600 mb-2">
                          Full Name
                        </label>
                        <input
                          type="text"
                          value={loanForm.emergencyContact1.name}
                          onChange={(e) => setLoanForm(prev => ({ 
                            ...prev, 
                            emergencyContact1: { ...prev.emergencyContact1, name: e.target.value }
                          }))}
                          placeholder="Enter full name"
                          className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-neutral-600 mb-2 flex items-center">
                          <Phone className="w-4 h-4 mr-2 text-red-600" />
                          Phone Number
                        </label>
                        <input
                          type="tel"
                          value={loanForm.emergencyContact1.phone}
                          onChange={(e) => setLoanForm(prev => ({ 
                            ...prev, 
                            emergencyContact1: { ...prev.emergencyContact1, phone: e.target.value }
                          }))}
                          placeholder="+1 (555) 123-4567"
                          className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                          required
                        />
                      </div>
                    </div>
                  </div>

                  {/* Second Emergency Contact */}
                  <div className="bg-white p-4 rounded-lg border border-red-200">
                    <h4 className="text-sm font-semibold text-neutral-700 mb-3">Emergency Contact 2</h4>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-neutral-600 mb-2">
                          Full Name
                        </label>
                        <input
                          type="text"
                          value={loanForm.emergencyContact2.name}
                          onChange={(e) => setLoanForm(prev => ({ 
                            ...prev, 
                            emergencyContact2: { ...prev.emergencyContact2, name: e.target.value }
                          }))}
                          placeholder="Enter full name"
                          className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-neutral-600 mb-2 flex items-center">
                          <Phone className="w-4 h-4 mr-2 text-red-600" />
                          Phone Number
                        </label>
                        <input
                          type="tel"
                          value={loanForm.emergencyContact2.phone}
                          onChange={(e) => setLoanForm(prev => ({ 
                            ...prev, 
                            emergencyContact2: { ...prev.emergencyContact2, phone: e.target.value }
                          }))}
                          placeholder="+1 (555) 123-4567"
                          className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                          required
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-neutral-700 mb-3">
                  Supporting Image
                </label>
                <div className="border-2 border-dashed border-neutral-300 rounded-xl p-6 text-center hover:border-primary-400 transition-colors">
                  <Upload className="w-12 h-12 text-neutral-400 mx-auto mb-3" />
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                    id="image-upload"
                  />
                  <label htmlFor="image-upload" className="cursor-pointer">
                    <span className="text-primary-600 hover:text-primary-700 font-semibold text-lg">
                      Upload image
                    </span>
                    <span className="text-neutral-600"> or drag and drop</span>
                  </label>
                  <p className="text-sm text-neutral-500 mt-2">
                    Add a photo that represents your business or project
                  </p>
                </div>
                
                {loanForm.supportingImage && (
                  <div className="mt-4">
                    <div className="relative">
                      <img
                        src={loanForm.supportingImage}
                        alt="Supporting"
                        className="w-full h-40 object-cover rounded-xl"
                      />
                      <button
                        type="button"
                        onClick={() => setLoanForm(prev => ({ ...prev, supportingImage: null }))}
                        className="absolute top-3 right-3 bg-red-500 text-white rounded-full w-8 h-8 flex items-center justify-center hover:bg-red-600 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex space-x-4 pt-4">
                <button 
                  type="button"
                  onClick={() => setShowNewLoanForm(false)}
                  className="flex-1 py-4 px-6 border border-neutral-300 text-neutral-700 rounded-xl font-semibold text-lg hover:bg-neutral-50 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={isSubmittingLoan}
                  className="flex-1 bg-gradient-to-r from-primary-500 to-karma-500 text-white py-4 px-6 rounded-xl font-semibold text-lg hover:shadow-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmittingLoan ? (
                    <div className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-3"></div>
                      Submitting...
                    </div>
                  ) : (
                    <div className="flex items-center justify-center">
                      <ArrowRight className="w-5 h-5 mr-2" />
                      Submit Application
                    </div>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default BorrowerDashboard; 