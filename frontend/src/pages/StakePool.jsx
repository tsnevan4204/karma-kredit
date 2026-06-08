import { useState } from 'react';
import { useWallet } from '../contexts/WalletContext';
import { useLendingPool } from '../hooks/useLendingPool';
import {
  TrendingUp,
  Shield,
  Users,
  ArrowRight,
  PieChart,
  Target,
  Clock,
  DollarSign,
  RefreshCw,
  Sprout,
  Heart,
  Sparkles,
  X,
} from 'lucide-react';

// Visual presets keyed by pool name. Description / icon / colour only — all
// numeric data comes from chain.
const PRESETS = {
  AgriPool: {
    description: 'Sustainable agriculture and farming initiatives',
    icon: Sprout,
    accent: 'from-emerald-500 to-emerald-600',
    pill:   'bg-emerald-100 text-emerald-800',
    risk:   'low',
  },
  WomenFoundersPool: {
    description: 'Supporting women-led businesses and startups',
    icon: Heart,
    accent: 'from-rose-500 to-rose-600',
    pill:   'bg-rose-100 text-rose-800',
    risk:   'medium',
  },
  KarmaMax: {
    description: 'High-Karma borrowers with excellent track records',
    icon: Sparkles,
    accent: 'from-violet-500 to-violet-600',
    pill:   'bg-violet-100 text-violet-800',
    risk:   'high',
  },
};

const presetFor = (name) => PRESETS[name] || {
  description: 'Diversified loan pool',
  icon: PieChart,
  accent: 'from-primary-500 to-primary-600',
  pill: 'bg-neutral-100 text-neutral-800',
  risk: 'medium',
};

const StakePool = () => {
  const { account, connectWallet } = useWallet();
  const { pools, loading, error, refresh, deposit, withdraw } = useLendingPool();
  const [selectedPool, setSelectedPool] = useState(null);
  const [mode,         setMode]         = useState('deposit');   // 'deposit' | 'withdraw'
  const [amount,       setAmount]       = useState('');
  const [submitting,   setSubmitting]   = useState(false);

  // Projected APY shown on cards: we estimate from share price growth. For an
  // unproven pool (sharePrice == 1), fall back to a static suggested APY based
  // on the category. This is purely a UI hint until C9 indexes real history.
  const estimatedApy = (pool) => {
    const apy = (pool.sharePrice - 1) * 100;
    if (apy >= 1) return apy.toFixed(1);
    // pre-yield defaults
    return ({ AgriPool: 8.5, WomenFoundersPool: 12.2, KarmaMax: 15.8 })[pool.name] ?? 10;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!account) { alert('Connect your wallet first'); return; }
    if (!amount || Number(amount) <= 0) { alert('Enter a positive amount'); return; }

    setSubmitting(true);
    try {
      if (mode === 'deposit') {
        await deposit(selectedPool.id, amount);
        alert(`Deposited ${amount} USDC into ${selectedPool.name}`);
      } else {
        await withdraw(selectedPool.id, amount);
        alert(`Withdrew ${amount} shares from ${selectedPool.name}`);
      }
      setAmount('');
      setSelectedPool(null);
    } catch (err) {
      console.error(err);
      const msg = err.shortMessage || err.message || String(err);
      alert(`Transaction failed: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  };

  // Portfolio aggregate across all pools the user has shares in
  const portfolio = pools.reduce((acc, p) => {
    const value = parseFloat(p.userValue || '0');
    const shares = parseFloat(p.userShares || '0');
    if (shares > 0) {
      acc.totalValue += value;
      acc.activePools += 1;
    }
    return acc;
  }, { totalValue: 0, activePools: 0 });

  if (!account) {
    return (
      <div className="min-h-screen bg-neutral-50 py-20">
        <div className="max-w-md mx-auto px-6 text-center">
          <h1 className="text-2xl font-bold text-neutral-900 mb-4">
            Connect your wallet to access staking pools
          </h1>
          <p className="text-neutral-600 mb-6">
            ETF-style USDC pools: deposit once, capital auto-deploys to vetted borrowers.
          </p>
          <button onClick={connectWallet} className="btn-primary">Connect Wallet</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Header */}
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-neutral-900 mb-2">
              ETF-Style Lending Pools
            </h1>
            <p className="text-lg text-neutral-600">
              Stake USDC into curated pools — capital is auto-allocated to high-Karma borrowers in each category.
            </p>
          </div>
          <button
            onClick={refresh}
            disabled={loading}
            className="p-3 text-neutral-600 hover:text-neutral-900 hover:bg-white rounded-xl transition-colors"
            title="Refresh on-chain data"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">
            {error}
          </div>
        )}

        {/* Pool Cards */}
        {pools.length === 0 && !loading && (
          <div className="text-center py-16 text-neutral-500">
            No pools available yet. Run the deploy script to seed the default pools.
          </div>
        )}

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
          {pools.map((pool) => {
            const preset = presetFor(pool.name);
            const Icon = preset.icon;
            const userVal = parseFloat(pool.userValue);
            return (
              <div key={pool.id} className="card hover:shadow-medium transition-shadow">
                <div className={`bg-gradient-to-r ${preset.accent} text-white p-4 rounded-xl mb-4`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Icon className="w-5 h-5" />
                      <h3 className="text-xl font-bold">{pool.name}</h3>
                    </div>
                    <span className="px-2 py-1 rounded-full text-xs font-medium bg-white bg-opacity-20">
                      {preset.risk} risk
                    </span>
                  </div>
                  <p className="text-white text-opacity-90 text-sm">{preset.description}</p>
                </div>

                <div className="space-y-3 mb-5">
                  <Row icon={TrendingUp} label="Est. APY" value={`${estimatedApy(pool)}%`} highlight />
                  <Row icon={DollarSign} label="Total Assets" value={`${Number(pool.totalAssets).toFixed(2)} USDC`} />
                  <Row icon={PieChart}   label="Deployed"      value={`${Number(pool.outstanding).toFixed(2)} USDC`} />
                  <Row icon={Shield}     label="Min Karma"     value={`${pool.minKarma}`} />
                  <Row icon={Users}      label="Category"      value={pool.category} />
                </div>

                {userVal > 0 && (
                  <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                    <div className="text-xs text-emerald-700 font-medium mb-1">Your position</div>
                    <div className="text-lg font-bold text-emerald-900">
                      {userVal.toFixed(2)} USDC
                    </div>
                    <div className="text-xs text-emerald-600">
                      {Number(pool.userShares).toFixed(2)} shares · share price {pool.sharePrice.toFixed(4)}
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={() => { setSelectedPool(pool); setMode('deposit'); }}
                    className="flex-1 btn-primary"
                    disabled={!pool.active}
                  >
                    Stake <ArrowRight className="w-4 h-4 ml-2 inline" />
                  </button>
                  {userVal > 0 && (
                    <button
                      onClick={() => { setSelectedPool(pool); setMode('withdraw'); }}
                      className="px-4 py-2 border border-neutral-300 text-neutral-700 rounded-xl text-sm font-medium hover:bg-neutral-50"
                    >
                      Withdraw
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Portfolio Summary */}
        <div className="card">
          <h2 className="text-xl font-semibold text-neutral-900 mb-6">Your Portfolio</h2>
          <div className="grid md:grid-cols-3 gap-6">
            <StatTile icon={PieChart}  iconClass="text-primary-600" label="Total Value" value={`${portfolio.totalValue.toFixed(2)} USDC`} />
            <StatTile icon={Target}    iconClass="text-karma-600"   label="Active Pools" value={String(portfolio.activePools)} />
            <StatTile icon={Clock}     iconClass="text-neutral-600" label="Available Pools" value={String(pools.length)} />
          </div>
        </div>

        {/* Stake / Withdraw Modal */}
        {selectedPool && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl p-6 max-w-md w-full">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-neutral-900">
                  {mode === 'deposit' ? 'Stake in' : 'Withdraw from'} {selectedPool.name}
                </h3>
                <button onClick={() => setSelectedPool(null)} className="text-neutral-400 hover:text-neutral-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-2">
                    {mode === 'deposit' ? 'Amount to stake (USDC)' : 'Shares to withdraw'}
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder={mode === 'deposit' ? 'e.g. 100' : `Max ${Number(selectedPool.userShares).toFixed(2)}`}
                    className="input-field"
                    required
                  />
                  {mode === 'withdraw' && (
                    <button
                      type="button"
                      onClick={() => setAmount(selectedPool.userShares)}
                      className="text-xs text-primary-600 mt-1 underline"
                    >
                      Use max ({Number(selectedPool.userShares).toFixed(2)})
                    </button>
                  )}
                </div>

                <div className="p-3 bg-neutral-50 rounded-xl text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-neutral-600">Share price</span>
                    <span className="font-medium">{selectedPool.sharePrice.toFixed(6)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-600">Est. APY</span>
                    <span className="font-medium text-primary-600">{estimatedApy(selectedPool)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-600">Pool category</span>
                    <span className="font-medium">{selectedPool.category}</span>
                  </div>
                </div>

                <div className="flex space-x-3">
                  <button
                    type="button"
                    onClick={() => setSelectedPool(null)}
                    className="flex-1 btn-secondary"
                    disabled={submitting}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 btn-primary"
                    disabled={submitting}
                  >
                    {submitting ? 'Submitting…' : (mode === 'deposit' ? 'Confirm Stake' : 'Confirm Withdraw')}
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

const Row = ({ icon: Icon, label, value, highlight }) => (
  <div className="flex items-center justify-between">
    <div className="flex items-center space-x-2">
      <Icon className="w-4 h-4 text-neutral-400" />
      <span className="text-sm text-neutral-600">{label}</span>
    </div>
    <span className={`text-sm font-medium ${highlight ? 'text-primary-600 text-lg font-bold' : 'text-neutral-900'}`}>
      {value}
    </span>
  </div>
);

const StatTile = ({ icon: Icon, iconClass, label, value }) => (
  <div className="text-center p-4 bg-neutral-50 rounded-xl">
    <Icon className={`w-8 h-8 ${iconClass} mx-auto mb-2`} />
    <p className="text-sm text-neutral-600">{label}</p>
    <p className="text-xl font-bold text-neutral-900">{value}</p>
  </div>
);

export default StakePool;
