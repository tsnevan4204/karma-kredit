import { useCallback, useEffect, useState } from 'react';
import { ethers } from 'ethers';
import { useWallet } from '../contexts/WalletContext';
import { getPoolDeployment, getUsdcConfig, ERC20_ABI } from '../config/contracts';
import { parseUsdc, formatUsdc } from '../lib/usdc';

/**
 * useLendingPool — read/write to LendingPool.sol from the browser.
 *
 *   const { pools, loading, deposit, withdraw, refresh } = useLendingPool();
 *
 * `pools` is an array of objects (one per on-chain pool) shaped:
 *   {
 *     id, name, category, minKarma,
 *     idle, outstanding, totalAssets,
 *     totalShares, sharePrice,
 *     userShares, userValue,   // for the connected account
 *     active
 *   }
 *
 * All USDC values are returned as decimal strings (e.g. "100.50").
 */
export function useLendingPool() {
  const { account, signer, provider } = useWallet();
  const [pools,   setPools]   = useState([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const _getContract = useCallback((withSigner = false) => {
    const dep = getPoolDeployment();
    const runner = withSigner ? signer : (provider || signer);
    if (!runner) throw new Error('No provider/signer');
    return new ethers.Contract(dep.address, dep.abi, runner);
  }, [signer, provider]);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const c = _getContract(false);
      const count = Number(await c.poolCount());

      const out = [];
      for (let i = 0; i < count; i++) {
        const p = await c.getPool(i);
        const sharePrice = await c.sharePrice(i);
        const userShares = account ? await c.sharesOf(i, account) : 0n;
        const userValue  = account ? await c.userValue(i, account) : 0n;

        const idle        = p.idle;
        const outstanding = p.outstanding;
        const totalAssets = idle + outstanding;

        out.push({
          id: i,
          name:        p.name,
          category:    p.category,
          minKarma:    Number(p.minKarma),
          active:      p.active,
          idle:         formatUsdc(idle),
          outstanding:  formatUsdc(outstanding),
          totalAssets:  formatUsdc(totalAssets),
          totalShares:  ethers.formatUnits(p.totalShares, 6),
          sharePrice:   Number(ethers.formatUnits(sharePrice, 18)),
          userShares:   ethers.formatUnits(userShares, 6),
          userValue:    formatUsdc(userValue),
        });
      }
      setPools(out);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [account, _getContract]);

  useEffect(() => { refresh(); }, [refresh]);

  /**
   * Deposit USDC into a pool. Handles approve → deposit in two transactions
   * (or one if allowance is already sufficient).
   */
  const deposit = useCallback(async (poolId, amountHuman) => {
    if (!signer) throw new Error('Connect wallet first');
    const dep = getPoolDeployment();
    const usdcCfg = getUsdcConfig();
    const amount  = parseUsdc(amountHuman);

    const usdc = new ethers.Contract(usdcCfg.address, ERC20_ABI, signer);
    const allowance = await usdc.allowance(account, dep.address);
    if (allowance < amount) {
      const tx = await usdc.approve(dep.address, amount);
      await tx.wait();
    }

    const pool = _getContract(true);
    const tx = await pool.deposit(poolId, amount);
    await tx.wait();
    await refresh();
  }, [signer, account, _getContract, refresh]);

  /**
   * Withdraw `sharesHuman` shares from a pool.
   * Pass the user's full share balance to withdraw everything.
   */
  const withdraw = useCallback(async (poolId, sharesHuman) => {
    if (!signer) throw new Error('Connect wallet first');
    const pool = _getContract(true);
    const shares = parseUsdc(sharesHuman);   // shares use 6 decimals same as USDC in our impl
    const tx = await pool.withdraw(poolId, shares);
    await tx.wait();
    await refresh();
  }, [signer, _getContract, refresh]);

  return { pools, loading, error, refresh, deposit, withdraw };
}
