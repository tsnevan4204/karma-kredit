import { useCallback, useEffect, useState } from 'react';
import { ethers } from 'ethers';
import { useWallet } from '../contexts/WalletContext';
import { getLoanDeployment, ERC20_ABI, getUsdcConfig } from '../config/contracts';
import { parseUsdc, formatUsdc } from '../lib/usdc';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

/**
 * useOrderbook — interact with the off-chain RFQ orderbook service.
 *
 *   const {
 *     myBids, openBids, matches, loading, error,
 *     submitBid, cancelBid, findMatches, executeMatch, refresh
 *   } = useOrderbook();
 *
 * Bids live in the Flask SQLite store. Asks (open loans) are pulled from
 * the chain via WalletContext.getAllLoans() and posted to the matcher.
 */
export function useOrderbook() {
  const { account, signer, getAllLoans, getFicoScore } = useWallet();
  const [myBids,   setMyBids]   = useState([]);
  const [openBids, setOpenBids] = useState([]);
  const [matches,  setMatches]  = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);

  // ── Bids ────────────────────────────────────────────────────────────────────

  const fetchBids = useCallback(async () => {
    try {
      const [allRes, mineRes] = await Promise.all([
        fetch(`${API}/api/orderbook/bids`),
        account
          ? fetch(`${API}/api/orderbook/bids?investor=${account.toLowerCase()}`)
          : Promise.resolve(null),
      ]);
      setOpenBids(await allRes.json());
      if (mineRes) setMyBids(await mineRes.json());
    } catch (e) {
      setError(e.message || String(e));
    }
  }, [account]);

  useEffect(() => { fetchBids(); }, [fetchBids]);

  /** Post a new bid. amount is human USDC (e.g. "100"). */
  const submitBid = useCallback(async ({ maxRateBps, minKarma, maxExposure, categories }) => {
    if (!account) throw new Error('Connect wallet first');
    setLoading(true); setError(null);
    try {
      const res = await fetch(`${API}/api/orderbook/bids`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          investor:          account.toLowerCase(),
          max_rate_bps:      Number(maxRateBps),
          min_karma:         Number(minKarma),
          max_exposure_usdc: Number(parseUsdc(maxExposure)),    // BigInt → number
          categories:        categories || [],
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      await fetchBids();
      return await res.json();
    } finally {
      setLoading(false);
    }
  }, [account, fetchBids]);

  const cancelBid = useCallback(async (bidId) => {
    const res = await fetch(`${API}/api/orderbook/bids/${bidId}`, { method: 'DELETE' });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    await fetchBids();
  }, [fetchBids]);

  // ── Matching ────────────────────────────────────────────────────────────────

  /**
   * Pull open loans from chain, augment with karma + category, post to matcher.
   * Currently uses defaults for category/karma since these aren't on-chain.
   */
  const findMatches = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const loans = await getAllLoans();
      const open  = loans.filter(l =>
        !l.repaid && !l.fullyFunded && Number(l.principal) > 0
      );

      // Enrich each ask with karma from FICO API
      const asks = await Promise.all(open.map(async (l) => {
        let karma = 60;            // sensible default
        try {
          const fico = await getFicoScore(l.borrower);
          karma = Math.round(fico.fico_score ?? 60);
        } catch { /* keep default */ }

        // Category extraction: try parsing metadataURI for a JSON-ish category
        // hint; fall back to a hashed default. For MVP we just use 'general'.
        const category = _categoryFromMetadata(l.metadataURI) || 'general';

        return {
          loan_id:         Number(l.id),
          borrower:        l.borrower,
          principal:       Number(parseUsdc(l.principal)),
          funded:          Number(parseUsdc(l.fundedAmount || '0')),
          interest_bps:    Number(l.interestBps),
          duration_months: Number(l.durationMonths),
          category,
          karma,
        };
      }));

      const res = await fetch(`${API}/api/orderbook/match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asks }),
      });
      if (!res.ok) throw new Error(`Match HTTP ${res.status}`);
      const { matches: ms } = await res.json();

      // Only show matches relevant to the connected investor
      const mine = ms.filter(m => m.investor.toLowerCase() === account?.toLowerCase());
      setMatches(mine);
      return mine;
    } catch (e) {
      setError(e.message || String(e));
      throw e;
    } finally {
      setLoading(false);
    }
  }, [account, getAllLoans, getFicoScore]);

  /**
   * Execute a match: approve USDC, call LoanMarket.fundLoan, then record the fill.
   */
  const executeMatch = useCallback(async (match) => {
    if (!signer) throw new Error('Connect wallet first');
    const loanDep = getLoanDeployment();
    const usdcCfg = getUsdcConfig();
    const amount  = BigInt(match.amount);

    // 1. Approve USDC → LoanMarket (skip if already sufficient)
    const usdc = new ethers.Contract(usdcCfg.address, ERC20_ABI, signer);
    const allowance = await usdc.allowance(account, loanDep.address);
    if (allowance < amount) {
      await (await usdc.approve(loanDep.address, amount)).wait();
    }

    // 2. fundLoan
    const market = new ethers.Contract(loanDep.address, loanDep.abi, signer);
    const tx = await market.fundLoan(match.loan_id, amount);
    await tx.wait();

    // 3. Record the fill in the orderbook store
    await fetch(`${API}/api/orderbook/fill`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bid_id: match.bid_id, amount: Number(amount) }),
    });

    await fetchBids();
    return tx.hash;
  }, [signer, account, fetchBids]);

  const refresh = useCallback(async () => {
    await fetchBids();
    if (account) {
      try { await findMatches(); } catch { /* swallow */ }
    }
  }, [fetchBids, findMatches, account]);

  return {
    myBids, openBids, matches, loading, error,
    submitBid, cancelBid, findMatches, executeMatch, refresh,
  };
}

// Cheap category extractor: look for `?category=foo` in the URI or a known prefix.
function _categoryFromMetadata(uri) {
  if (!uri || typeof uri !== 'string') return null;
  const m = uri.match(/category=([a-z]+)/i);
  if (m) return m[1].toLowerCase();
  const KEYS = ['agriculture', 'diversity', 'premium', 'technology', 'education',
                'healthcare', 'retail', 'energy', 'food', 'general'];
  for (const k of KEYS) if (uri.toLowerCase().includes(k)) return k;
  return null;
}
