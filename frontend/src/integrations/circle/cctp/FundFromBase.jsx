import { useState } from 'react';
import { useCCTP, CCTP_STEPS } from './useCCTP';
import { useWallet } from '../../../contexts/WalletContext';

const STEP_LABELS = {
  [CCTP_STEPS.IDLE]:      null,
  [CCTP_STEPS.APPROVING]: '1/3 Approving USDC…',
  [CCTP_STEPS.BURNING]:   '2/3 Burning on Base…',
  [CCTP_STEPS.BRIDGING]:  '3/3 Bridging to Arc…',
  [CCTP_STEPS.DONE]:      '✓ USDC on Arc — now fund the loan below',
  [CCTP_STEPS.ERROR]:     null,
};

/**
 * Drop-in component for any loan card.
 * Shows a "Fund from Base Sepolia" alternative to the normal fundLoan button.
 *
 * Props:
 *   loan  — loan object from getAllLoans()
 */
export default function FundFromBase({ loan }) {
  const { account, investInLoan } = useWallet();
  const { step, txHash, error, message, burn, reset } = useCCTP();
  const [amount,    setAmount]    = useState('');
  const [open,      setOpen]      = useState(false);
  const [funding,   setFunding]   = useState(false);
  const [fundDone,  setFundDone]  = useState(false);

  const remaining = parseFloat(loan.amount) - parseFloat(loan.fundedAmount || 0);

  const handleBurn = async () => {
    if (!amount || parseFloat(amount) < 2) return alert('Minimum $2 USDC');
    if (parseFloat(amount) > remaining)    return alert(`Max $${remaining.toFixed(2)} remaining`);
    await burn(amount, account);
  };

  const handleFundOnArc = async () => {
    setFunding(true);
    try {
      await investInLoan(loan.id, amount);
      setFundDone(true);
    } catch (e) {
      alert(`Fund failed: ${e.message}`);
    } finally { setFunding(false); }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full mt-2 py-2 rounded-xl border border-blue-400 text-blue-600 text-sm font-semibold hover:bg-blue-50"
      >
        Bridge from Base Sepolia (CCTP)
      </button>
    );
  }

  return (
    <div className="mt-3 p-4 border border-blue-200 rounded-2xl bg-blue-50 space-y-3">
      <div className="flex justify-between items-center">
        <p className="font-semibold text-blue-800 text-sm">Fund via CCTP · Base → Arc</p>
        <button onClick={() => { reset(); setOpen(false); }} className="text-neutral-400 text-xs">✕ close</button>
      </div>

      <p className="text-xs text-neutral-500">
        Burn USDC on Base Sepolia → Circle bridges it to Arc → then fund the loan. Two MetaMask confirmations.
      </p>

      {step === CCTP_STEPS.IDLE && (
        <>
          <input
            type="number"
            placeholder={`Amount (max $${remaining.toFixed(2)})`}
            value={amount}
            onChange={e => setAmount(e.target.value)}
            className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm"
          />
          <button
            onClick={handleBurn}
            className="w-full py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700"
          >
            Step 1 — Burn on Base Sepolia
          </button>
        </>
      )}

      {step !== CCTP_STEPS.IDLE && step !== CCTP_STEPS.ERROR && (
        <div className="space-y-1">
          <p className="text-sm text-blue-700 animate-pulse">{message}</p>
          {STEP_LABELS[step] && <p className="text-xs font-semibold text-blue-600">{STEP_LABELS[step]}</p>}
          {txHash && (
            <a
              href={`https://sepolia.basescan.org/tx/${txHash}`}
              target="_blank" rel="noreferrer"
              className="text-xs text-blue-500 underline"
            >View burn tx</a>
          )}
        </div>
      )}

      {step === CCTP_STEPS.DONE && !fundDone && (
        <button
          onClick={handleFundOnArc}
          disabled={funding}
          className="w-full py-2 rounded-xl bg-green-600 text-white text-sm font-semibold hover:bg-green-700 disabled:opacity-50"
        >
          {funding ? 'Funding…' : `Step 2 — Fund loan on Arc ($${amount} USDC)`}
        </button>
      )}

      {fundDone && <p className="text-sm font-semibold text-green-600">✓ Loan funded!</p>}

      {step === CCTP_STEPS.ERROR && (
        <div className="space-y-1">
          <p className="text-sm text-red-500">{error}</p>
          <button onClick={reset} className="text-xs text-blue-600 underline">Try again</button>
        </div>
      )}
    </div>
  );
}
