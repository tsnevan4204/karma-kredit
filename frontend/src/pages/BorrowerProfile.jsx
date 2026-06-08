import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useKarma } from '../hooks/useKarma';
import { KarmaBadge, FirstTimePill, IdentityVerifiedPill } from '../components/KarmaBadge';
import { addressUrl } from '../lib/explorer';
import {
  ArrowLeft, ExternalLink, Calendar, DollarSign, CheckCircle,
  AlertCircle, XCircle, Clock, TrendingUp, User,
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const fmtUsdc = (n) => (Number(n) / 1_000_000).toFixed(2);
const fmtDate = (ts) => ts ? new Date(ts * 1000).toLocaleDateString() : '—';

const STATUS_STYLES = {
  on_time:      { Icon: CheckCircle, color: 'text-emerald-700', bg: 'bg-emerald-50', label: 'On time' },
  late_1_7:     { Icon: AlertCircle, color: 'text-amber-700',   bg: 'bg-amber-50',   label: 'Late 1-7d' },
  late_8_30:    { Icon: AlertCircle, color: 'text-orange-700',  bg: 'bg-orange-50',  label: 'Late 8-30d' },
  late_30plus:  { Icon: XCircle,     color: 'text-red-700',     bg: 'bg-red-50',     label: 'Very late' },
  extra:        { Icon: TrendingUp,  color: 'text-blue-700',    bg: 'bg-blue-50',    label: 'Extra' },
};

export default function BorrowerProfile() {
  const { address } = useParams();
  const karma = useKarma(address);
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setError(null);
      try {
        const r = await fetch(`${API}/api/borrower/${address}/history`);
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.error || `HTTP ${r.status}`);
        }
        const data = await r.json();
        if (!cancelled) setHistory(data);
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [address]);

  return (
    <div className="min-h-screen bg-neutral-50 py-8">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">

        <Link to="/marketplace" className="inline-flex items-center gap-2 text-sm text-neutral-600 hover:text-neutral-900 mb-6">
          <ArrowLeft className="w-4 h-4" /> Back to Marketplace
        </Link>

        {/* Header card */}
        <div className="card mb-6">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary-500 to-karma-500 flex items-center justify-center">
              <User className="w-7 h-7 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <h1 className="text-2xl font-bold text-neutral-900">Borrower Profile</h1>
                <KarmaBadge karma={karma.karma} size="lg" />
                {karma.firstTimeUser && <FirstTimePill size="lg" />}
                {karma.hasBinding && <IdentityVerifiedPill />}
              </div>
              <a
                href={addressUrl(address)}
                target="_blank" rel="noopener noreferrer"
                className="text-sm text-neutral-600 font-mono hover:text-primary-600 inline-flex items-center gap-1"
              >
                {address} <ExternalLink className="w-3 h-3" />
              </a>
              <p className="text-xs text-neutral-500 mt-1">View on ArcScan ↗</p>
            </div>
          </div>

          {/* Stat tiles */}
          {history && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
              <Tile icon={Calendar} label="Profile age" value={`${history.profile_age_days || 0}d`}
                    sub={history.first_loan_at ? `since ${fmtDate(history.first_loan_at)}` : 'no loans yet'} />
              <Tile icon={DollarSign} label="Total loans" value={String(history.total_loans)} sub={`${history.completed_loans} repaid`} />
              <Tile icon={Clock} label="Active loans" value={String(history.active_loans)}
                    sub={history.defaulted_loans > 0 ? `⚠ ${history.defaulted_loans} defaulted` : 'no defaults'} />
              <Tile icon={TrendingUp} label="Suggested rate" value={`${(history.suggested_interest_bps / 100).toFixed(1)}%`}
                    sub={`for new loans`} />
            </div>
          )}
        </div>

        {/* Loans + payment history */}
        <h2 className="text-xl font-semibold text-neutral-900 mb-4">Loan History</h2>

        {loading && <div className="text-neutral-500">Loading on-chain history…</div>}
        {error && <div className="card bg-red-50 border-red-200 text-red-800 text-sm">Couldn't load history: {error}</div>}

        {history && history.loans.length === 0 && (
          <div className="card text-center py-12 text-neutral-500">
            No loans yet. This wallet hasn't requested any loans on Arc.
          </div>
        )}

        <div className="space-y-4">
          {history && history.loans.map((loan) => {
            const status = loan.repaid ? 'repaid'
                          : loan.defaulted ? 'defaulted'
                          : 'active';
            const statusBg = status === 'repaid'    ? 'bg-emerald-50 border-emerald-200'
                            : status === 'defaulted' ? 'bg-red-50 border-red-200'
                            : 'bg-amber-50 border-amber-200';
            return (
              <div key={loan.loan_id} className={`card border ${statusBg}`}>
                <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-bold text-neutral-900">Loan #{loan.loan_id}</h3>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        status === 'repaid'    ? 'bg-emerald-200 text-emerald-900'
                       : status === 'defaulted' ? 'bg-red-200 text-red-900'
                       : 'bg-amber-200 text-amber-900'
                      }`}>{status}</span>
                    </div>
                    <p className="text-xs text-neutral-600">
                      Started {fmtDate(loan.start_time)} · Due {fmtDate(loan.due_date)} · {loan.duration_months} months
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-neutral-900">${fmtUsdc(loan.principal)}</div>
                    <div className="text-xs text-neutral-500">{(loan.interest_bps / 100).toFixed(2)}% APR</div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 mb-3 text-sm">
                  <div><div className="text-xs text-neutral-500">Funded</div><div className="font-medium">${fmtUsdc(loan.funded_amount)}</div></div>
                  <div><div className="text-xs text-neutral-500">Paid back</div><div className="font-medium">${fmtUsdc(loan.total_paid)}</div></div>
                  <div><div className="text-xs text-neutral-500">Monthly</div><div className="font-medium">${fmtUsdc(loan.monthly_payment)}</div></div>
                </div>

                {/* Payment timeline */}
                {loan.payments.length === 0 ? (
                  <div className="text-xs text-neutral-500 italic mt-2">No payments recorded yet.</div>
                ) : (
                  <div className="space-y-1.5">
                    <div className="text-xs font-semibold text-neutral-700 uppercase tracking-wide">Payments</div>
                    {loan.payments.map((p) => {
                      const s = STATUS_STYLES[p.classification] || STATUS_STYLES.on_time;
                      const SIcon = s.Icon;
                      return (
                        <div key={p.index} className={`flex items-center gap-2 text-xs px-2 py-1.5 rounded ${s.bg}`}>
                          <SIcon className={`w-3.5 h-3.5 ${s.color}`} />
                          <span className="font-medium text-neutral-700">#{p.index}</span>
                          <span className={`font-medium ${s.color}`}>{s.label}</span>
                          <span className="text-neutral-600">${fmtUsdc(p.amount)}</span>
                          <span className="ml-auto text-neutral-500">
                            paid {fmtDate(p.timestamp)} · scheduled {fmtDate(p.scheduled)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const Tile = ({ icon: Icon, label, value, sub }) => (
  <div className="p-3 bg-neutral-50 rounded-xl">
    <div className="flex items-center gap-1 text-xs text-neutral-500 mb-1">
      <Icon className="w-3 h-3" /> {label}
    </div>
    <div className="text-xl font-bold text-neutral-900">{value}</div>
    {sub && <div className="text-xs text-neutral-500 mt-0.5">{sub}</div>}
  </div>
);
