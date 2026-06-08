import { useCallback, useEffect, useState } from 'react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

/**
 * useKarma — fetch on-chain karma for an address from the C9 scorer.
 *
 *   const { karma, firstTimeUser, loading, refresh } = useKarma(address);
 *
 *   karma:           0-100 integer
 *   firstTimeUser:   true if no completed loans
 *   hasBinding:      true if address ↔ Circle userId is bound
 *   suggestedBps:    interest rate the formula recommends
 *   loanCap:         BigInt USDC cap if probation, else null
 *   breakdown:       per-loan deltas (defaulted, on_time, late_1_7, ...)
 */
export function useKarma(address) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const refresh = useCallback(async () => {
    if (!address) { setData(null); return; }
    setLoading(true); setError(null);
    try {
      const res = await fetch(`${API}/api/karma/${address}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      setData({
        karma:         body.karma,
        firstTimeUser: body.first_time_user,
        hasBinding:    body.has_identity_binding,
        completedLoans: body.completed_loans,
        defaultedLoans: body.defaulted_loans,
        suggestedBps:  body.suggested_interest_bps,
        loanCap:       body.loan_cap_usdc_6dec,
        breakdown:     body.breakdown || [],
        base:          body.base,
      });
    } catch (e) {
      setError(e.message || String(e));
    } finally { setLoading(false); }
  }, [address]);

  useEffect(() => { refresh(); }, [refresh]);

  return {
    karma:           data?.karma ?? null,
    firstTimeUser:   data?.firstTimeUser ?? null,
    hasBinding:      data?.hasBinding ?? false,
    completedLoans:  data?.completedLoans ?? 0,
    defaultedLoans:  data?.defaultedLoans ?? 0,
    suggestedBps:    data?.suggestedBps ?? 1400,
    loanCap:         data?.loanCap ?? null,
    breakdown:       data?.breakdown ?? [],
    loading,
    error,
    refresh,
  };
}

/** Post a Circle userId ↔ wallet binding to the backend (sybil resistance). */
export async function bindCircleUserId(circleUserId, address) {
  const res = await fetch(`${API}/api/karma/bind`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ circle_user_id: circleUserId, address }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `bind HTTP ${res.status}`);
  }
  return res.json();
}
