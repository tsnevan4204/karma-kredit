import { useState, useCallback } from 'react';
import { W3SSdk } from '@circle-fin/w3s-pw-web-sdk';

const API    = import.meta.env.VITE_API_URL  || 'http://localhost:5000';
const APP_ID = import.meta.env.VITE_CIRCLE_APP_ID || '';

let _sdk = null;
function getSDK() {
  if (!_sdk) _sdk = new W3SSdk({ appSettings: { appId: APP_ID } });
  return _sdk;
}

/**
 * Circle user-controlled wallet for borrowers (PIN authentication).
 *
 * step values: idle | creating | pin | fetching | ready | error
 *
 * First-time flow:
 *   initWallet() → backend creates user + challengeId
 *               → SDK opens Circle's hosted PIN-setup UI
 *               → on success → fetchAddress() → walletAddress set
 *
 * Returning user flow (userId in localStorage):
 *   resume() → fresh session tokens → fetchAddress()
 */
export function useCircleWallet() {
  const [userId,        setUserId]        = useState(() => localStorage.getItem('ck_userId')  || null);
  const [walletAddress, setWalletAddress] = useState(() => localStorage.getItem('ck_address') || null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);
  const [step,     setStep]     = useState(() => localStorage.getItem('ck_address') ? 'ready' : 'idle');

  const _fetchAddress = useCallback(async (uid) => {
    setStep('fetching');
    const res  = await fetch(`${API}/api/circle/wallet-address`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: uid }),
    });
    const { address, error: e } = await res.json();
    if (e) throw new Error(e);
    if (address) {
      localStorage.setItem('ck_address', address);
      setWalletAddress(address);
    }
    setStep('ready');
    return address;
  }, []);

  /** First-time: create user, open Circle PIN UI, then fetch wallet address */
  const initWallet = useCallback(async () => {
    if (!APP_ID) { setError('VITE_CIRCLE_APP_ID not set'); return; }
    setLoading(true); setError(null); setStep('creating');
    try {
      // Pass existing userId if we have one (safe retry)
      const existingUid = localStorage.getItem('ck_userId');
      const res  = await fetch(`${API}/api/circle/init`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(existingUid ? { userId: existingUid } : {}),
      });
      const { userId: uid, userToken, encryptionKey, challengeId, error: e } = await res.json();
      if (e) throw new Error(e);

      localStorage.setItem('ck_userId', uid);
      setUserId(uid);

      if (challengeId) {
        // New user — open Circle's hosted PIN-setup UI
        setStep('pin');
        const sdk = getSDK();
        sdk.setAuthentication({ userToken, encryptionKey });

        await new Promise((resolve, reject) => {
          sdk.execute(challengeId, (err, result) => {
            if (err) return reject(new Error(err.message || JSON.stringify(err)));
            resolve(result);
          });
        });
      }
      // If challengeId is null, wallet already exists — skip directly to fetchAddress

      await _fetchAddress(uid);
    } catch (e) {
      setError(e.message || String(e));
      setStep('error');
    } finally { setLoading(false); }
  }, [_fetchAddress]);

  /** Returning user: just refresh session and get address */
  const resume = useCallback(async () => {
    const uid = localStorage.getItem('ck_userId');
    if (!uid) { setStep('idle'); return; }
    setLoading(true); setError(null);
    try {
      await _fetchAddress(uid);
    } catch (e) {
      setError(e.message); setStep('error');
    } finally { setLoading(false); }
  }, [_fetchAddress]);

  const reset = useCallback(() => {
    ['ck_userId', 'ck_address'].forEach(k => localStorage.removeItem(k));
    setUserId(null); setWalletAddress(null); setStep('idle'); setError(null);
  }, []);

  return { userId, walletAddress, loading, error, step, initWallet, resume, reset };
}
