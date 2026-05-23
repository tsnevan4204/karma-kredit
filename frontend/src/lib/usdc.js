import { ethers } from 'ethers';

export const USDC_DECIMALS = 6;

/** Parse human-readable USDC amount to base units (6 decimals). */
export function parseUsdc(amount) {
  const s = String(amount).trim();
  if (!s || Number.isNaN(Number(s))) {
    throw new Error(`Invalid USDC amount: ${amount}`);
  }
  return ethers.parseUnits(s, USDC_DECIMALS);
}

/** Format base units to human-readable USDC string. */
export function formatUsdc(value) {
  if (value === null || value === undefined) return '0';
  return ethers.formatUnits(value, USDC_DECIMALS);
}

/** Format for display with optional suffix. */
export function formatUsdcLabel(value, { suffix = ' USDC' } = {}) {
  const n = Number(formatUsdc(value));
  if (n === 0) return `0${suffix}`;
  if (n < 0.01) return `< 0.01${suffix}`;
  return `${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}${suffix}`;
}
