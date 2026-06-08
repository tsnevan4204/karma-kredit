import { useState } from 'react';
import { useWallet } from '../contexts/WalletContext';
import { useOrderbook } from '../hooks/useOrderbook';
import { formatUsdc } from '../lib/usdc';
import {
  BookOpen, Plus, X, RefreshCw, Zap, Trash2,
  TrendingDown, Shield, DollarSign, Sparkles,
} from 'lucide-react';

const CATEGORY_OPTIONS = [
  { value: 'agriculture', label: 'Agriculture' },
  { value: 'diversity',   label: 'Diversity-led businesses' },
  { value: 'premium',     label: 'Premium (high karma)' },
  { value: 'technology',  label: 'Technology' },
  { value: 'education',   label: 'Education' },
  { value: 'healthcare',  label: 'Healthcare' },
  { value: 'retail',      label: 'Retail' },
  { value: 'energy',      label: 'Green Energy' },
  { value: 'food',        label: 'Food & Beverage' },
  { value: 'general',     label: 'General — any category' },
];

const fromMicroUsdc = (n) => (Number(n) / 1_000_000).toLocaleString(undefined, {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});

const OrderbookPage = () => {
  const { account, userRole, connectWallet } = useWallet();
  const isInvestor = userRole === 'investor';
  const {
    myBids, openBids, matches, loading, error,
    submitBid, cancelBid, findMatches, executeMatch, refresh,
  } = useOrderbook();

  const [showBidForm, setShowBidForm] = useState(false);
  const [form, setForm] = useState({
    maxRateBps:  '1500',   // 15% APR
    minKarma:    '60',
    maxExposure: '100',    // USDC human
    categories:  [],
  });
  const [submitting, setSubmitting] = useState(false);
  const [executing,  setExecuting]  = useState(null);

  const toggleCategory = (cat) => {
    setForm(f => f.categories.includes(cat)
      ? { ...f, categories: f.categories.filter(c => c !== cat) }
      : { ...f, categories: [...f.categories, cat] }
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!account) { alert('Connect your wallet first'); return; }
    setSubmitting(true);
    try {
      await submitBid({
        maxRateBps:  form.maxRateBps,
        minKarma:    form.minKarma,
        maxExposure: form.maxExposure,
        categories:  form.categories,
      });
      setShowBidForm(false);
      setForm({ maxRateBps: '1500', minKarma: '60', maxExposure: '100', categories: [] });
      alert('Bid posted! Click "Find Matches" to see compatible loans.');
    } catch (err) {
      alert(`Failed to post bid: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleExecute = async (match) => {
    setExecuting(match.match_id);
    try {
      const hash = await executeMatch(match);
      alert(`Funded loan #${match.loan_id} with $${fromMicroUsdc(match.amount)} USDC\nTx: ${hash}`);
    } catch (err) {
      alert(`Execution failed: ${err.shortMessage || err.message}`);
    } finally {
      setExecuting(null);
    }
  };

  if (!account) {
    return (
      <div className="min-h-screen bg-neutral-50 py-20">
        <div className="max-w-md mx-auto px-6 text-center">
          <BookOpen className="w-16 h-16 text-primary-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-neutral-900 mb-4">RFQ Orderbook</h1>
          <p className="text-neutral-600 mb-6">
            Post a standing bid ("I'll lend ≤15% in agriculture, $500 max") — the
            matcher auto-finds compatible borrower loans. Connect your wallet to start.
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
            <h1 className="text-3xl md:text-4xl font-bold text-neutral-900 mb-2 flex items-center gap-3">
              <BookOpen className="w-8 h-8 text-primary-600" /> RFQ Orderbook
            </h1>
            <p className="text-lg text-neutral-600">
              Express your lending intent — the matcher pairs your bid with on-chain loan requests automatically.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={refresh}
              disabled={loading}
              className="p-3 text-neutral-600 hover:text-neutral-900 hover:bg-white rounded-xl transition-colors"
              title="Refresh"
            >
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            {isInvestor && (
              <button
                onClick={() => setShowBidForm(true)}
                className="btn-primary flex items-center gap-2"
              >
                <Plus className="w-4 h-4" /> Post Bid
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">
            {error}
          </div>
        )}

        {/* Matches CTA */}
        <div className="card mb-8 bg-gradient-to-r from-primary-50 to-karma-50 border-primary-200">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-neutral-900 mb-1 flex items-center gap-2">
                <Zap className="w-5 h-5 text-primary-600" /> Find Matches
              </h2>
              <p className="text-sm text-neutral-600">
                Run the matcher against current open loans on Arc. Auto-loads every refresh.
              </p>
            </div>
            <button onClick={findMatches} disabled={loading} className="btn-primary">
              {loading ? 'Matching…' : 'Find Matches'}
            </button>
          </div>
        </div>

        {/* Matches list */}
        {matches.length > 0 && (
          <div className="mb-12">
            <h2 className="text-xl font-semibold text-neutral-900 mb-4">
              Your Proposed Matches ({matches.length})
            </h2>
            <div className="space-y-3">
              {matches.map((m) => (
                <div key={m.match_id} className="card flex items-center justify-between">
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4 flex-1">
                    <Tile label="Loan"      value={`#${m.loan_id}`} />
                    <Tile label="Amount"    value={`$${fromMicroUsdc(m.amount)}`}    highlight />
                    <Tile label="Rate"      value={`${(m.rate_bps/100).toFixed(2)}%`} />
                    <Tile label="Karma"     value={String(m.karma)} />
                    <Tile label="Category"  value={m.category} />
                  </div>
                  <button
                    onClick={() => handleExecute(m)}
                    disabled={executing === m.match_id}
                    className="ml-4 btn-primary whitespace-nowrap"
                  >
                    {executing === m.match_id ? 'Funding…' : 'Execute Fund'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* My bids */}
        <div className="mb-12">
          <h2 className="text-xl font-semibold text-neutral-900 mb-4">
            My Bids ({myBids.length})
          </h2>
          {myBids.length === 0 && (
            <div className="card text-center py-10 text-neutral-500">
              No bids yet. Click "Post Bid" to set your lending preferences.
            </div>
          )}
          <div className="space-y-3">
            {myBids.map((b) => (
              <div key={b.id} className="card flex items-center justify-between">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 flex-1">
                  <Tile icon={TrendingDown} label="Max rate" value={`${(b.max_rate_bps/100).toFixed(2)}%`} />
                  <Tile icon={Shield}       label="Min karma" value={String(b.min_karma)} />
                  <Tile icon={DollarSign}   label="Remaining" value={`$${fromMicroUsdc(b.remaining_exposure)}`} highlight />
                  <Tile icon={Sparkles}     label="Categories" value={(b.categories || []).join(', ') || 'any'} />
                  <Tile label="Status" value={b.status} />
                </div>
                {b.status === 'open' && (
                  <button
                    onClick={() => cancelBid(b.id).catch(e => alert(e.message))}
                    className="ml-4 p-2 text-red-500 hover:bg-red-50 rounded-xl"
                    title="Cancel bid"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Public orderbook */}
        <div>
          <h2 className="text-xl font-semibold text-neutral-900 mb-4">
            All Open Bids ({openBids.length})
          </h2>
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-neutral-200">
                <tr className="text-left text-neutral-600">
                  <th className="pb-3 pr-4">Investor</th>
                  <th className="pb-3 pr-4">Max rate</th>
                  <th className="pb-3 pr-4">Min karma</th>
                  <th className="pb-3 pr-4">Remaining</th>
                  <th className="pb-3 pr-4">Categories</th>
                </tr>
              </thead>
              <tbody>
                {openBids.map((b) => (
                  <tr key={b.id} className="border-b border-neutral-100 last:border-0">
                    <td className="py-3 pr-4 font-mono text-xs">{b.investor.slice(0, 6)}…{b.investor.slice(-4)}</td>
                    <td className="py-3 pr-4">{(b.max_rate_bps/100).toFixed(2)}%</td>
                    <td className="py-3 pr-4">{b.min_karma}</td>
                    <td className="py-3 pr-4 font-medium">${fromMicroUsdc(b.remaining_exposure)}</td>
                    <td className="py-3 pr-4">{(b.categories || []).join(', ') || 'any'}</td>
                  </tr>
                ))}
                {openBids.length === 0 && (
                  <tr><td colSpan="5" className="py-8 text-center text-neutral-500">No open bids</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Bid form modal */}
        {showBidForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl p-6 max-w-md w-full">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-neutral-900">Post a Standing Bid</h3>
                <button onClick={() => setShowBidForm(false)} className="text-neutral-400 hover:text-neutral-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">
                    Max rate (basis points, 100 = 1%)
                  </label>
                  <input
                    type="number"
                    value={form.maxRateBps}
                    onChange={(e) => setForm(f => ({ ...f, maxRateBps: e.target.value }))}
                    className="input-field"
                    min="100" max="10000"
                    required
                  />
                  <p className="text-xs text-neutral-500 mt-1">
                    {form.maxRateBps ? `${(Number(form.maxRateBps)/100).toFixed(2)}% APR ceiling` : ''}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">
                    Min borrower karma (0-100)
                  </label>
                  <input
                    type="number"
                    value={form.minKarma}
                    onChange={(e) => setForm(f => ({ ...f, minKarma: e.target.value }))}
                    className="input-field"
                    min="0" max="100"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">
                    Max exposure (USDC)
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={form.maxExposure}
                    onChange={(e) => setForm(f => ({ ...f, maxExposure: e.target.value }))}
                    className="input-field"
                    min="2"
                    required
                  />
                  <p className="text-xs text-neutral-500 mt-1">
                    Total capital this bid commits across all fills. Min $2.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">
                    Categories (empty = match anything)
                  </label>
                  <div className="space-y-1">
                    {CATEGORY_OPTIONS.map((c) => (
                      <label key={c.value} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={form.categories.includes(c.value)}
                          onChange={() => toggleCategory(c.value)}
                        />
                        {c.label}
                      </label>
                    ))}
                  </div>
                </div>

                <div className="flex space-x-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowBidForm(false)}
                    className="flex-1 btn-secondary"
                    disabled={submitting}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="flex-1 btn-primary" disabled={submitting}>
                    {submitting ? 'Posting…' : 'Post Bid'}
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

const Tile = ({ icon: Icon, label, value, highlight }) => (
  <div>
    <div className="text-xs text-neutral-500 flex items-center gap-1">
      {Icon && <Icon className="w-3 h-3" />} {label}
    </div>
    <div className={`text-sm ${highlight ? 'font-bold text-primary-600' : 'font-medium text-neutral-900'}`}>
      {value}
    </div>
  </div>
);

export default OrderbookPage;
