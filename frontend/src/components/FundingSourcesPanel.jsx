import { useState } from 'react';
import { useFundingSources } from '../hooks/useFundingSources';
import { Sprout, Heart, Sparkles, PieChart, Users, BookOpen, Zap, CheckCircle, AlertCircle } from 'lucide-react';

const POOL_ICONS = {
  AgriPool:          { Icon: Sprout,    color: 'text-emerald-600 bg-emerald-50' },
  WomenFoundersPool: { Icon: Heart,     color: 'text-rose-600 bg-rose-50'       },
  KarmaMax:          { Icon: Sparkles,  color: 'text-violet-600 bg-violet-50'   },
};

const fmtUsdc = (n) => (Number(n) / 1_000_000).toFixed(2);

/**
 * Shows all the ways a loan could get funded right now. Used on:
 *  - BorrowerDashboard (each of their open loans)
 *  - LoanMarketplace   (each card)
 */
export default function FundingSourcesPanel({ loanId, allowAutoFund = true, compact = false }) {
  const { sources, loading, error, refresh, autoFundFromPools } = useFundingSources(loanId);
  const [acting, setActing] = useState(false);

  if (loading && !sources) return <div className="text-xs text-neutral-500 py-2">Loading funding sources…</div>;
  if (error) return <div className="text-xs text-red-600 py-2">Funding sources: {error}</div>;
  if (!sources) return null;

  const eligiblePools = sources.pools.filter(p => p.eligible);
  const ineligiblePools = sources.pools.filter(p => !p.eligible);

  const handleAutoFund = async () => {
    setActing(true);
    try {
      const result = await autoFundFromPools();
      const ok   = (result.allocated || []).length;
      const errs = (result.errors    || []).length;
      if (ok > 0) {
        alert(`Funded! ${ok} pool allocation(s) succeeded. Total: $${
          (result.allocated.reduce((a, x) => a + x.amount, 0) / 1_000_000).toFixed(2)} USDC`);
      } else if (errs > 0) {
        alert(`Pool allocation failed:\n${result.errors.map(e => `Pool ${e.pool_id}: ${e.error}`).join('\n')}`);
      } else {
        alert(result.note || 'No eligible pools found.');
      }
    } catch (e) {
      alert(`Auto-fund failed: ${e.message}`);
    } finally { setActing(false); }
  };

  if (compact) {
    // Small inline summary for marketplace cards
    return (
      <div className="flex flex-wrap gap-1.5 text-xs">
        {eligiblePools.length > 0 && (
          <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-medium">
            {eligiblePools.length} pool{eligiblePools.length > 1 ? 's' : ''}
          </span>
        )}
        {sources.bids.length > 0 && (
          <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-medium">
            {sources.bids.length} bid match{sources.bids.length > 1 ? 'es' : ''}
          </span>
        )}
        {sources.direct_lenders.length > 0 && (
          <span className="px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-700 font-medium">
            {sources.direct_lenders.length} direct
          </span>
        )}
        {eligiblePools.length === 0 && sources.bids.length === 0 && sources.direct_lenders.length === 0 && (
          <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-medium">
            No matches yet
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="border border-neutral-200 rounded-xl p-4 bg-neutral-50/50 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PieChart className="w-4 h-4 text-neutral-500" />
          <h4 className="font-semibold text-neutral-900 text-sm">Funding Sources</h4>
          <span className="text-xs text-neutral-500">
            ${fmtUsdc(sources.remaining)} still needed
          </span>
        </div>
        <button
          onClick={refresh}
          className="text-xs text-neutral-500 hover:text-neutral-700 underline"
        >
          refresh
        </button>
      </div>

      {/* Eligible pools */}
      <div className="space-y-2">
        <div className="text-xs font-semibold text-neutral-700 uppercase tracking-wide">
          ETF Pools ({eligiblePools.length} eligible)
        </div>
        {sources.pools.map(p => {
          const preset = POOL_ICONS[p.name] || { Icon: Users, color: 'text-neutral-600 bg-neutral-100' };
          const Icon = preset.Icon;
          return (
            <div key={p.pool_id} className="flex items-center gap-3 p-2 bg-white rounded-lg border border-neutral-200">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${preset.color}`}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm text-neutral-900">{p.name}</div>
                <div className="text-xs text-neutral-500">
                  {p.category} · min karma {p.min_karma} · ${fmtUsdc(p.idle)} idle
                </div>
              </div>
              {p.eligible ? (
                <span className="flex items-center gap-1 text-xs font-medium text-emerald-700">
                  <CheckCircle className="w-3 h-3" /> can cover ${fmtUsdc(p.can_cover)}
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs text-neutral-500" title={p.reason}>
                  <AlertCircle className="w-3 h-3" /> {p.reason}
                </span>
              )}
            </div>
          );
        })}
        {allowAutoFund && eligiblePools.length > 0 && (
          <button
            onClick={handleAutoFund}
            disabled={acting}
            className="w-full mt-2 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg flex items-center justify-center gap-2"
          >
            <Zap className="w-4 h-4" />
            {acting ? 'Allocating…' : `Auto-fund from ${eligiblePools.length} pool${eligiblePools.length > 1 ? 's' : ''}`}
          </button>
        )}
      </div>

      {/* Open bid matches */}
      <div className="space-y-2">
        <div className="text-xs font-semibold text-neutral-700 uppercase tracking-wide flex items-center gap-1">
          <BookOpen className="w-3 h-3" /> Open Investor Bids ({sources.bids.length})
        </div>
        {sources.bids.length === 0 ? (
          <div className="text-xs text-neutral-500 italic">No standing bids match this loan yet.</div>
        ) : sources.bids.map(b => (
          <div key={b.bid_id} className="flex items-center justify-between p-2 bg-white rounded-lg border border-neutral-200 text-xs">
            <span className="font-mono text-neutral-700">{b.investor.slice(0, 6)}…{b.investor.slice(-4)}</span>
            <span className="text-neutral-600">{(b.rate_bps / 100).toFixed(2)}% APR</span>
            <span className="font-medium text-emerald-700">${fmtUsdc(b.amount)}</span>
          </div>
        ))}
      </div>

      {/* Direct lenders already in */}
      {sources.direct_lenders.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs font-semibold text-neutral-700 uppercase tracking-wide">
            Already Funded By ({sources.direct_lenders.length})
          </div>
          {sources.direct_lenders.map((l, i) => (
            <div key={i} className="flex items-center justify-between text-xs p-2 bg-white rounded-lg border border-neutral-200">
              <span className="font-mono text-neutral-700">{l.address.slice(0, 6)}…{l.address.slice(-4)}</span>
              <span className="font-medium text-neutral-900">${fmtUsdc(l.amount)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
