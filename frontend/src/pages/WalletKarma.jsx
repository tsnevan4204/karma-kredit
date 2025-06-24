import { useState, useEffect } from 'react';
import { useWallet } from '../contexts/WalletContext';
import { 
  Copy, 
  Check, 
  TrendingUp, 
  Clock, 
  DollarSign, 
  Activity,
  Target,
  ArrowUpRight,
  Shield,
  Users,
  Calendar,
  AlertCircle,
  RefreshCw
} from 'lucide-react';

const WalletKarma = () => {
  const { 
    account, 
    walletAnalytics, 
    isLoadingAnalytics, 
    getWalletAnalytics 
  } = useWallet();
  const [copied, setCopied] = useState(false);

  const copyAddress = async () => {
    if (account) {
      await navigator.clipboard.writeText(account);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const refreshAnalytics = async () => {
    if (account) {
      try {
        await getWalletAnalytics(account);
      } catch (error) {
        console.error('Failed to refresh analytics:', error);
      }
    }
  };

  const getScoreColor = (score) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getScoreBg = (score) => {
    if (score >= 80) return 'bg-green-100';
    if (score >= 60) return 'bg-yellow-100';
    return 'bg-red-100';
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString();
  };

    const formatFlowValue = (value) => {
    if (value === 0) return '0 PyUSD';
    if (value < 0.01) return '< 0.01 PyUSD';
    return `${value.toFixed(2)} PyUSD`;
  };

  if (!account) {
    return (
      <div className="min-h-screen bg-neutral-50 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-2xl font-bold text-neutral-900 mb-4">
            Connect your wallet to view your Karma
          </h1>
          <p className="text-neutral-600">
            You need to connect your MetaMask wallet to see your Karma score and wallet information.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-neutral-900 mb-2">
            Wallet & Karma
          </h1>
          <p className="text-lg text-neutral-600">
            Your on-chain reputation and karma
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-8">
            {/* Wallet Address */}
            <div className="card">
              <h2 className="text-xl font-semibold text-neutral-900 mb-4">
                Your Wallet
              </h2>
              <div className="flex items-center justify-between p-4 bg-neutral-50 rounded-xl">
                <div className="flex-1">
                  <p className="text-sm text-neutral-600 mb-1">MetaMask Address</p>
                  <p className="font-mono text-neutral-900 break-all">
                    {account}
                  </p>
                </div>
                <button
                  onClick={copyAddress}
                  className="ml-4 p-2 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors"
                >
                  {copied ? (
                    <Check className="w-5 h-5 text-green-600" />
                  ) : (
                    <Copy className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>

            {/* Karma Score */}
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-neutral-900">
                  Your Karma
                </h2>
                <button
                  onClick={refreshAnalytics}
                  disabled={isLoadingAnalytics}
                  className="p-2 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors"
                >
                  <RefreshCw className={`w-5 h-5 ${isLoadingAnalytics ? 'animate-spin' : ''}`} />
                </button>
              </div>
              
              {isLoadingAnalytics ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
                  <p className="mt-2 text-neutral-600">Loading your Karma...</p>
                </div>
              ) : walletAnalytics ? (
                <div className="space-y-6">
                  <div className="text-center">
                    <div className="karma-gauge mx-auto mb-4" style={{ width: '120px', height: '120px' }}>
                      <span className="text-2xl font-bold">
                        {Math.round(walletAnalytics.fico_score)}
                      </span>
                    </div>
                    <h3 className="text-lg font-semibold text-neutral-900 mb-2">
                      Karma: {Math.round(walletAnalytics.fico_score)}/100
                    </h3>
                    <p className="text-neutral-600">
                      {walletAnalytics.interest_rate ? 
                        `You qualify for ${walletAnalytics.interest_rate}% interest rate loans up to ${walletAnalytics.max_loan_amount.toLocaleString()} PyUSD` :
                        'Continue building your transaction history to improve your score.'
                      }
                    </p>
                  </div>

                  {/* Score Range */}
                  <div className="relative">
                    <div className="w-full bg-neutral-200 rounded-full h-3">
                      <div
                        className="bg-gradient-to-r from-red-500 via-yellow-500 to-green-500 h-3 rounded-full"
                        style={{ width: `${walletAnalytics.fico_score}%` }}
                      ></div>
                    </div>
                    <div className="flex justify-between text-xs text-neutral-600 mt-2">
                      <span>Poor (0-59)</span>
                      <span>Fair (60-79)</span>
                      <span>Good (80-89)</span>
                      <span>Excellent (90-100)</span>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-neutral-600">Unable to load Karma</p>
              )}
            </div>

            {/* Karma Breakdown */}
            {walletAnalytics && walletAnalytics.karma_breakdown && (
              <div className="card">
                <h2 className="text-xl font-semibold text-neutral-900 mb-6">
                  Karma Breakdown
                </h2>
                <div className="space-y-6">
                  {Object.entries(walletAnalytics.karma_breakdown.breakdown).map(([key, item]) => (
                    <div key={key} className="border border-neutral-200 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center space-x-3">
                          <div className={`w-10 h-10 ${getScoreBg(item.score)} rounded-xl flex items-center justify-center`}>
                            {key === 'wallet_age' && <Clock className={`w-5 h-5 ${getScoreColor(item.score)}`} />}
                            {key === 'transaction_volume' && <DollarSign className={`w-5 h-5 ${getScoreColor(item.score)}`} />}
                            {key === 'activity_consistency' && <Activity className={`w-5 h-5 ${getScoreColor(item.score)}`} />}
                            {key === 'recent_activity' && <TrendingUp className={`w-5 h-5 ${getScoreColor(item.score)}`} />}
                          </div>
                          <div>
                            <h3 className="font-semibold text-neutral-900 capitalize">
                              {key.replace('_', ' ')}
                            </h3>
                            <p className="text-sm text-neutral-600">{item.description}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={`w-12 h-12 rounded-full flex items-center justify-center ${getScoreBg(item.score)}`}>
                            <span className={`text-sm font-bold ${getScoreColor(item.score)}`}>
                              {item.score}
                            </span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <div className="flex items-center space-x-2 text-sm">
                          <ArrowUpRight className="w-4 h-4 text-primary-600" />
                          <span className="text-primary-600 font-medium">
                            {item.score}/{item.max_score} points
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Risk Assessment */}
            {walletAnalytics && walletAnalytics.risk_assessment && (
              <div className="card">
                <h2 className="text-xl font-semibold text-neutral-900 mb-4">
                  Risk Assessment
                </h2>
                <div className="space-y-4">
                  <div className={`p-4 rounded-xl ${
                    walletAnalytics.risk_assessment.risk_level === 'low' ? 'bg-green-50 border border-green-200' :
                    walletAnalytics.risk_assessment.risk_level === 'medium' ? 'bg-yellow-50 border border-yellow-200' :
                    'bg-red-50 border border-red-200'
                  }`}>
                    <div className="flex items-center space-x-2 mb-2">
                      <Shield className={`w-5 h-5 ${
                        walletAnalytics.risk_assessment.risk_level === 'low' ? 'text-green-600' :
                        walletAnalytics.risk_assessment.risk_level === 'medium' ? 'text-yellow-600' :
                        'text-red-600'
                      }`} />
                      <span className={`font-semibold capitalize ${
                        walletAnalytics.risk_assessment.risk_level === 'low' ? 'text-green-800' :
                        walletAnalytics.risk_assessment.risk_level === 'medium' ? 'text-yellow-800' :
                        'text-red-800'
                      }`}>
                        {walletAnalytics.risk_assessment.risk_level} Risk
                      </span>
                    </div>
                    <p className={`text-sm ${
                      walletAnalytics.risk_assessment.risk_level === 'low' ? 'text-green-700' :
                      walletAnalytics.risk_assessment.risk_level === 'medium' ? 'text-yellow-700' :
                      'text-red-700'
                    }`}>
                      Risk Level: {walletAnalytics.risk_assessment.risk_score}/100
                    </p>
                  </div>

                  {walletAnalytics.risk_assessment.risk_factors.length > 0 && (
                    <div>
                      <h3 className="font-semibold text-neutral-900 mb-2">Risk Factors:</h3>
                      <ul className="space-y-1">
                        {walletAnalytics.risk_assessment.risk_factors.map((factor, index) => (
                          <li key={index} className="flex items-center space-x-2 text-sm text-neutral-700">
                            <AlertCircle className="w-4 h-4 text-yellow-600" />
                            <span>{factor}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div>
                    <h3 className="font-semibold text-neutral-900 mb-2">Recommendations:</h3>
                    <ul className="space-y-1">
                      {walletAnalytics.risk_assessment.recommendations.map((rec, index) => (
                        <li key={index} className="flex items-center space-x-2 text-sm text-neutral-700">
                          <ArrowUpRight className="w-4 h-4 text-primary-600" />
                          <span>{rec}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Quick Stats */}
            {walletAnalytics && (
              <div className="card">
                <h3 className="text-lg font-semibold text-neutral-900 mb-4">
                  Quick Stats
                </h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 bg-neutral-50 rounded-xl">
                    <div className="flex items-center space-x-2">
                      <Calendar className="w-4 h-4 text-neutral-400" />
                      <span className="text-sm text-neutral-600">Wallet Age</span>
                    </div>
                    <span className="text-sm font-medium text-neutral-900">
                      {walletAnalytics.wallet_stats.wallet_age_days} days
                    </span>
                  </div>
                  
                  <div className="flex items-center justify-between p-3 bg-neutral-50 rounded-xl">
                    <div className="flex items-center space-x-2">
                      <Activity className="w-4 h-4 text-neutral-400" />
                      <span className="text-sm text-neutral-600">Total Transactions</span>
                    </div>
                    <span className="text-sm font-medium text-neutral-900">
                      {walletAnalytics.transaction_analytics.total_transactions}
                    </span>
                  </div>
                  
                  <div className="flex items-center justify-between p-3 bg-neutral-50 rounded-xl">
                    <div className="flex items-center space-x-2">
                      <DollarSign className="w-4 h-4 text-neutral-400" />
                      <span className="text-sm text-neutral-600">Total Volume</span>
                    </div>
                    <span className="text-sm font-medium text-neutral-900">
                      {formatFlowValue(walletAnalytics.transaction_analytics.total_volume_eth)}
                    </span>
                  </div>
                  
                  <div className="flex items-center justify-between p-3 bg-neutral-50 rounded-xl">
                    <div className="flex items-center space-x-2">
                      <Users className="w-4 h-4 text-neutral-400" />
                      <span className="text-sm text-neutral-600">Active Days</span>
                    </div>
                    <span className="text-sm font-medium text-neutral-900">
                      {walletAnalytics.transaction_analytics.active_days}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Transaction History */}
            {walletAnalytics && (
              <div className="card">
                <h3 className="text-lg font-semibold text-neutral-900 mb-4">
                  Transaction History
                </h3>
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-neutral-600">First Transaction</span>
                    <span className="font-medium text-neutral-900">
                      {formatDate(walletAnalytics.transaction_analytics.first_transaction_date)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-neutral-600">Last Transaction</span>
                    <span className="font-medium text-neutral-900">
                      {formatDate(walletAnalytics.transaction_analytics.last_transaction_date)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-neutral-600">Recent (30d)</span>
                    <span className="font-medium text-neutral-900">
                      {walletAnalytics.transaction_analytics.recent_transactions_30d} txs
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-neutral-600">Incoming</span>
                    <span className="font-medium text-green-600">
                      {walletAnalytics.transaction_analytics.incoming_transactions}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-neutral-600">Outgoing</span>
                    <span className="font-medium text-red-600">
                      {walletAnalytics.transaction_analytics.outgoing_transactions}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Karma Benefits */}
            <div className="card">
              <h3 className="text-lg font-semibold text-neutral-900 mb-4">
                Karma Benefits
              </h3>
              <div className="space-y-3">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                    <Check className="w-4 h-4 text-green-600" />
                  </div>
                  <span className="text-sm text-neutral-700">Lower interest rates</span>
                </div>
                
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                    <Check className="w-4 h-4 text-green-600" />
                  </div>
                  <span className="text-sm text-neutral-700">Higher loan limits</span>
                </div>
                
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                    <Check className="w-4 h-4 text-green-600" />
                  </div>
                  <span className="text-sm text-neutral-700">Access to premium pools</span>
                </div>
                
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                    <Check className="w-4 h-4 text-green-600" />
                  </div>
                  <span className="text-sm text-neutral-700">Faster loan approval</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WalletKarma; 