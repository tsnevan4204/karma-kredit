import { useState } from 'react';
import { useWallet } from '../contexts/WalletContext';
import { 
  TrendingUp, 
  Shield, 
  Users, 
  ArrowRight,
  PieChart,
  Target,
  Clock,
  DollarSign
} from 'lucide-react';

const StakePool = () => {
  const { account } = useWallet();
  const [selectedPool, setSelectedPool] = useState(null);
  const [stakeAmount, setStakeAmount] = useState('');

  const pools = [
    {
      id: 'agripool',
      name: 'AgriPool',
      description: 'Sustainable agriculture and farming initiatives',
      apy: 8.5,
      risk: 'low',
      totalStaked: 1250000,
      totalBorrowers: 45,
      avgRepaymentRate: 98.2,
      minStake: 100,
      maxStake: 50000,
      category: 'agriculture',
      color: 'primary'
    },
    {
      id: 'womenfounders',
      name: 'WomenFoundersPool',
      description: 'Supporting women-led businesses and startups',
      apy: 12.2,
      risk: 'medium',
      totalStaked: 890000,
      totalBorrowers: 28,
      avgRepaymentRate: 96.8,
      minStake: 250,
      maxStake: 25000,
      category: 'diversity',
      color: 'karma'
    },
    {
      id: 'karmamax',
      name: 'KarmaMax',
      description: 'High-Karma borrowers with excellent track records',
      apy: 15.8,
      risk: 'high',
      totalStaked: 650000,
      totalBorrowers: 15,
      avgRepaymentRate: 99.1,
      minStake: 500,
      maxStake: 10000,
      category: 'premium',
      color: 'neutral'
    }
  ];

  const getColorClasses = (color) => {
    switch (color) {
      case 'primary': return 'from-primary-500 to-primary-600';
      case 'karma': return 'from-karma-500 to-karma-600';
      case 'neutral': return 'from-neutral-600 to-neutral-700';
      default: return 'from-primary-500 to-primary-600';
    }
  };

  const getRiskColor = (risk) => {
    switch (risk) {
      case 'low': return 'bg-green-100 text-green-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'high': return 'bg-red-100 text-red-800';
      default: return 'bg-neutral-100 text-neutral-800';
    }
  };

  const handleStake = (e) => {
    e.preventDefault();
    if (!account) {
      alert('Please connect your wallet first');
      return;
    }
    if (!stakeAmount || stakeAmount < selectedPool.minStake || stakeAmount > selectedPool.maxStake) {
      alert(`Please enter a valid amount between ${selectedPool.minStake} and ${selectedPool.maxStake} PyUSD`);
      return;
    }
    // Here you would integrate with the smart contract
    console.log('Staking:', stakeAmount, 'in', selectedPool.name);
          alert(`Successfully staked ${stakeAmount} PyUSD in ${selectedPool.name}!`);
    setStakeAmount('');
    setSelectedPool(null);
  };

  if (!account) {
    return (
      <div className="min-h-screen bg-neutral-50 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-2xl font-bold text-neutral-900 mb-4">
            Connect your wallet to access staking pools
          </h1>
          <p className="text-neutral-600">
            You need to connect your MetaMask wallet to stake in our investment pools.
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
            Investment Pools
          </h1>
          <p className="text-lg text-neutral-600">
            Stake in curated pools and earn competitive yields while supporting specific causes
          </p>
        </div>

        {/* Pool Cards */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
          {pools.map((pool) => (
            <div key={pool.id} className="card hover:shadow-medium transition-shadow">
              {/* Pool Header */}
              <div className={`bg-gradient-to-r ${getColorClasses(pool.color)} text-white p-4 rounded-xl mb-4`}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xl font-bold">{pool.name}</h3>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium bg-white bg-opacity-20`}>
                    {pool.risk} risk
                  </span>
                </div>
                <p className="text-white text-opacity-90 text-sm">
                  {pool.description}
                </p>
              </div>

              {/* Pool Stats */}
              <div className="space-y-4 mb-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <TrendingUp className="w-4 h-4 text-neutral-400" />
                    <span className="text-sm text-neutral-600">APY</span>
                  </div>
                  <span className="text-lg font-bold text-primary-600">
                    {pool.apy}%
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <DollarSign className="w-4 h-4 text-neutral-400" />
                    <span className="text-sm text-neutral-600">Total Staked</span>
                  </div>
                  <span className="text-sm font-medium text-neutral-900">
                    {(pool.totalStaked / 1000).toFixed(0)}K PyUSD
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Users className="w-4 h-4 text-neutral-400" />
                    <span className="text-sm text-neutral-600">Borrowers</span>
                  </div>
                  <span className="text-sm font-medium text-neutral-900">
                    {pool.totalBorrowers}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Shield className="w-4 h-4 text-neutral-400" />
                    <span className="text-sm text-neutral-600">Repayment Rate</span>
                  </div>
                  <span className="text-sm font-medium text-green-600">
                    {pool.avgRepaymentRate}%
                  </span>
                </div>
              </div>

              {/* Stake Range */}
              <div className="mb-6 p-3 bg-neutral-50 rounded-xl">
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-neutral-600">Min Stake</span>
                  <span className="text-neutral-600">Max Stake</span>
                </div>
                <div className="flex justify-between text-sm font-medium">
                                  <span className="text-neutral-900">{pool.minStake.toLocaleString()} PyUSD</span>
                <span className="text-neutral-900">{pool.maxStake.toLocaleString()} PyUSD</span>
                </div>
              </div>

              {/* CTA */}
              <button
                onClick={() => setSelectedPool(pool)}
                className="w-full btn-primary"
              >
                Stake Now
                <ArrowRight className="w-4 h-4 ml-2" />
              </button>
            </div>
          ))}
        </div>

        {/* Portfolio Summary */}
        <div className="card">
          <h2 className="text-xl font-semibold text-neutral-900 mb-6">
            Your Portfolio Summary
          </h2>
          <div className="grid md:grid-cols-4 gap-6">
            <div className="text-center p-4 bg-neutral-50 rounded-xl">
              <PieChart className="w-8 h-8 text-primary-600 mx-auto mb-2" />
              <p className="text-sm text-neutral-600">Total Staked</p>
              <p className="text-xl font-bold text-neutral-900">3,500 PyUSD</p>
            </div>
            <div className="text-center p-4 bg-neutral-50 rounded-xl">
              <TrendingUp className="w-8 h-8 text-green-600 mx-auto mb-2" />
              <p className="text-sm text-neutral-600">Total Earned</p>
              <p className="text-xl font-bold text-green-600">420 PyUSD</p>
            </div>
            <div className="text-center p-4 bg-neutral-50 rounded-xl">
              <Target className="w-8 h-8 text-karma-600 mx-auto mb-2" />
              <p className="text-sm text-neutral-600">Avg. APY</p>
              <p className="text-xl font-bold text-karma-600">11.2%</p>
            </div>
            <div className="text-center p-4 bg-neutral-50 rounded-xl">
              <Clock className="w-8 h-8 text-neutral-600 mx-auto mb-2" />
              <p className="text-sm text-neutral-600">Active Pools</p>
              <p className="text-xl font-bold text-neutral-900">2</p>
            </div>
          </div>
        </div>

        {/* Stake Modal */}
        {selectedPool && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl p-6 max-w-md w-full">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-neutral-900">
                  Stake in {selectedPool.name}
                </h3>
                <button
                  onClick={() => setSelectedPool(null)}
                  className="text-neutral-400 hover:text-neutral-600"
                >
                  ×
                </button>
              </div>

              <form onSubmit={handleStake} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-2">
                    Amount to Stake (PyUSD)
                  </label>
                  <input
                    type="number"
                    value={stakeAmount}
                    onChange={(e) => setStakeAmount(e.target.value)}
                    placeholder={`Enter amount (${selectedPool.minStake}-${selectedPool.maxStake})`}
                    className="input-field"
                    min={selectedPool.minStake}
                    max={selectedPool.maxStake}
                    required
                  />
                  <p className="text-xs text-neutral-500 mt-1">
                    Min: {selectedPool.minStake.toLocaleString()} PyUSD | Max: {selectedPool.maxStake.toLocaleString()} PyUSD
                  </p>
                </div>

                <div className="p-3 bg-neutral-50 rounded-xl">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-neutral-600">Expected APY</span>
                    <span className="font-medium text-primary-600">{selectedPool.apy}%</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-neutral-600">Risk Level</span>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getRiskColor(selectedPool.risk)}`}>
                      {selectedPool.risk}
                    </span>
                  </div>
                </div>

                <div className="flex space-x-3">
                  <button
                    type="button"
                    onClick={() => setSelectedPool(null)}
                    className="flex-1 btn-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 btn-primary"
                  >
                    Confirm Stake
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default StakePool; 