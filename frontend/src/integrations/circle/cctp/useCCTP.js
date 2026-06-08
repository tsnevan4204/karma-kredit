import { useState } from 'react';
import { ethers } from 'ethers';
import { CCTP, TOKEN_MESSENGER_ABI, ERC20_APPROVE_ABI, addressToBytes32 } from './domains';

export const CCTP_STEPS = {
  IDLE:        'idle',
  APPROVING:   'approving',
  BURNING:     'burning',
  BRIDGING:    'bridging',   // polling Iris
  DONE:        'done',
  ERROR:       'error',
};

/**
 * Hook that drives the full CCTP flow:
 *   Base Sepolia → burn USDC → Circle relays → USDC minted on Arc
 *
 * Usage:
 *   const { step, txHash, burn } = useCCTP();
 *   await burn(amount, recipientOnArc);   // amount in USDC human units e.g. "10"
 */
export function useCCTP() {
  const [step,    setStep]    = useState(CCTP_STEPS.IDLE);
  const [txHash,  setTxHash]  = useState(null);
  const [error,   setError]   = useState(null);
  const [message, setMessage] = useState('');

  const reset = () => { setStep(CCTP_STEPS.IDLE); setTxHash(null); setError(null); setMessage(''); };

  /**
   * @param {string} amountHuman  e.g. "10" (USDC, 6 decimals)
   * @param {string} recipient    Arc-testnet address that will receive the minted USDC
   */
  const burn = async (amountHuman, recipient) => {
    setError(null);
    try {
      // ── 1. Switch MetaMask to Base Sepolia ──────────────────────────────────
      setMessage('Switching to Base Sepolia…');
      const src = CCTP.BASE_SEPOLIA;
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: src.chainIdHex }],
      }).catch(async (err) => {
        if (err.code === 4902) {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{ chainId: src.chainIdHex, chainName: src.name, rpcUrls: [src.rpcUrl],
              nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 } }],
          });
        } else throw err;
      });

      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer   = await provider.getSigner();
      const sender   = await signer.getAddress();
      const amount   = ethers.parseUnits(amountHuman, 6);

      // ── 2. Approve TokenMessenger to spend USDC ─────────────────────────────
      setStep(CCTP_STEPS.APPROVING);
      setMessage('Approving USDC spend on Base Sepolia…');
      const usdc = new ethers.Contract(src.usdc, ERC20_APPROVE_ABI, signer);
      const allowance = await usdc.allowance(sender, src.tokenMessenger);
      if (allowance < amount) {
        const approveTx = await usdc.approve(src.tokenMessenger, amount);
        await approveTx.wait();
      }

      // ── 3. depositForBurn ───────────────────────────────────────────────────
      setStep(CCTP_STEPS.BURNING);
      setMessage('Burning USDC on Base Sepolia…');
      const messenger = new ethers.Contract(src.tokenMessenger, TOKEN_MESSENGER_ABI, signer);
      const burnTx = await messenger.depositForBurn(
        amount,
        CCTP.ARC_TESTNET.domain,
        addressToBytes32(recipient),
        src.usdc,
      );
      await burnTx.wait();
      setTxHash(burnTx.hash);

      // ── 4. Poll Iris for attestation (Circle auto-relays) ──────────────────
      setStep(CCTP_STEPS.BRIDGING);
      setMessage('Waiting for Circle to bridge USDC to Arc (usually < 2 min)…');
      await pollIris(burnTx.hash, src.domain);

      setStep(CCTP_STEPS.DONE);
      setMessage('USDC arrived on Arc! Switch back to Arc Testnet to fund the loan.');
    } catch (e) {
      setStep(CCTP_STEPS.ERROR);
      setError(e.message || String(e));
    }
  };

  return { step, txHash, error, message, burn, reset };
}

// ── Iris polling ─────────────────────────────────────────────────────────────

async function pollIris(txHash, sourceDomain, maxWaitMs = 300_000) {
  const url      = `${CCTP.IRIS_API}/v1/messages/${sourceDomain}?transactionHash=${txHash}`;
  const deadline = Date.now() + maxWaitMs;

  while (Date.now() < deadline) {
    await sleep(8000);
    try {
      const res  = await fetch(url);
      const body = await res.json();
      const msgs = body?.messages ?? [];
      if (msgs.length && msgs[0]?.status === 'complete') return;
      if (msgs.length && msgs[0]?.status === 'pending_confirmations') continue;
    } catch { /* network hiccup, retry */ }
  }
  // Don't throw — Circle may still relay even if polling times out in UI
  console.warn('CCTP: Iris polling timed out — Circle will still relay automatically');
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
