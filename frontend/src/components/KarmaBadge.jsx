import { Sparkles, Star, AlertTriangle, ShieldCheck } from 'lucide-react';

/**
 * Karma badge — colour-coded 0-100 score with text label.
 * Used on loan cards, borrower profile, dashboards.
 *
 *   <KarmaBadge karma={72} firstTimeUser={false} />
 */
export function KarmaBadge({ karma, firstTimeUser, hasBinding, size = 'md' }) {
  if (karma == null) {
    return <span className="text-xs text-neutral-400">Karma —</span>;
  }

  const tier = karma >= 85 ? 'excellent'
              : karma >= 70 ? 'good'
              : karma >= 50 ? 'fair'
              : karma >= 30 ? 'poor'
              : 'risky';

  const styles = {
    excellent: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    good:      'bg-blue-100 text-blue-800 border-blue-200',
    fair:      'bg-amber-100 text-amber-800 border-amber-200',
    poor:      'bg-orange-100 text-orange-800 border-orange-200',
    risky:     'bg-red-100 text-red-800 border-red-200',
  };

  const sizing = size === 'lg' ? 'text-base px-3 py-1.5' : 'text-xs px-2 py-1';

  return (
    <div className={`inline-flex items-center gap-1.5 rounded-full border font-medium ${styles[tier]} ${sizing}`}>
      <Sparkles className={size === 'lg' ? 'w-4 h-4' : 'w-3 h-3'} />
      Karma {karma}
      <span className="opacity-60 hidden sm:inline">· {tier}</span>
    </div>
  );
}

/** "First-time borrower" pill — only shown when firstTimeUser=true. */
export function FirstTimePill({ size = 'sm' }) {
  const sizing = size === 'lg' ? 'text-sm px-3 py-1' : 'text-xs px-2 py-0.5';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full bg-violet-100 text-violet-800 font-medium ${sizing}`}>
      <Star className="w-3 h-3" />
      First-time borrower
    </span>
  );
}

/** "Identity verified" pill — shown when address is bound to a Circle userId. */
export function IdentityVerifiedPill() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 text-xs px-2 py-0.5 font-medium border border-emerald-200">
      <ShieldCheck className="w-3 h-3" /> Circle ID
    </span>
  );
}

/** Probation warning shown next to unbound new wallets. */
export function ProbationWarning({ loanCap }) {
  if (!loanCap) return null;
  const cap = (Number(loanCap) / 1_000_000).toFixed(0);
  return (
    <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs">
      <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
      <div>
        <div className="font-semibold">Probation — first loan capped at ${cap} USDC</div>
        <div className="opacity-80">Verify your identity by setting up a Circle wallet to skip this cap.</div>
      </div>
    </div>
  );
}
