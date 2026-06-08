import { useCallback, useEffect, useState } from 'react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

/**
 * useFundingSources(loanId) — for a given on-chain loan, returns the three
 * ways it could get funded right now: pools, open investor bids, and direct
 * lenders already in. Plus a one-click action that has the backend allocator
 * wallet push pool capital into the loan.
 */
export function useFundingSources(loanId) {
  const [sources, setSources] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const refresh = useCallback(async () => {
    if (loanId == null) return;
    setLoading(true); setError(null);
    try {
      const r = await fetch(`${API}/api/matcher/sources/${loanId}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setSources(await r.json());
    } catch (e) {
      setError(e.message || String(e));
    } finally { setLoading(false); }
  }, [loanId]);

  useEffect(() => { refresh(); }, [refresh]);

  const autoFundFromPools = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch(`${API}/api/matcher/auto-fund/${loanId}`, { method: 'POST' });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${r.status}`);
      }
      const result = await r.json();
      await refresh();
      return result;
    } catch (e) {
      setError(e.message || String(e));
      throw e;
    } finally { setLoading(false); }
  }, [loanId, refresh]);

  return { sources, loading, error, refresh, autoFundFromPools };
}
