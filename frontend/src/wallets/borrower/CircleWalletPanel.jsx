import { useEffect } from 'react';
import { useCircleWallet } from './useCircleWallet';
import { bindCircleUserId } from '../../hooks/useKarma';

/**
 * Shown in BorrowerDashboard when user picks "Circle Wallet (Phone OTP)".
 * Guides them through initialization and shows their Arc wallet address.
 */
export default function CircleWalletPanel({ onAddressReady }) {
  const { userId, walletAddress, loading, error, step, initWallet, resume, reset } = useCircleWallet();

  // Auto-resume for returning users (ck_userId in localStorage but page refreshed)
  useEffect(() => {
    if (step === 'idle' && localStorage.getItem('ck_userId')) {
      resume();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sybil resistance (C9): bind Circle userId ↔ wallet address as soon as we have both.
  // Karma carries across all addresses linked to the same Circle userId.
  useEffect(() => {
    if (userId && walletAddress) {
      bindCircleUserId(userId, walletAddress)
        .catch(err => console.warn('Karma binding failed (non-fatal):', err.message));
    }
  }, [userId, walletAddress]);

  // Notify parent when address is available
  if (walletAddress && onAddressReady) onAddressReady(walletAddress);

  return (
    <div className="bg-white border border-neutral-200 rounded-2xl p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-lg">C</div>
        <div>
          <p className="font-semibold text-neutral-900">Circle Wallet (PIN secured)</p>
          <p className="text-sm text-neutral-500">No seed phrase · gas sponsored by Circle</p>
        </div>
      </div>

      {step === 'idle' && (
        <button
          onClick={initWallet}
          disabled={loading}
          className="w-full py-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-50"
        >
          Set up Circle Wallet
        </button>
      )}

      {step === 'creating' && (
        <p className="text-sm text-neutral-500 animate-pulse">Setting up your wallet…</p>
      )}

      {step === 'pin' && (
        <p className="text-sm text-blue-600 animate-pulse">
          Circle opened a popup — set your PIN to secure your wallet…
        </p>
      )}

      {step === 'ready' && walletAddress && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-green-600">✓ Wallet ready</p>
          <p className="text-xs text-neutral-500 break-all font-mono">{walletAddress}</p>
          <p className="text-xs text-neutral-400">
            This is your Arc testnet address, secured by your PIN.
            Circle sponsors gas — you don't need USDC for transaction fees.
          </p>
          <button onClick={reset} className="text-xs text-red-500 underline">Reset wallet</button>
        </div>
      )}

      {step === 'fetching' && (
        <p className="text-sm text-neutral-500 animate-pulse">Fetching wallet address…</p>
      )}

      {step === 'error' && (
        <div className="space-y-2">
          <p className="text-sm text-red-500">{error}</p>
          <button onClick={initWallet} className="text-sm text-blue-600 underline">Retry</button>
        </div>
      )}
    </div>
  );
}
