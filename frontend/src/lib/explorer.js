/**
 * Block-explorer URL helpers for Arc testnet.
 * Falls back to a no-op (#) for unknown networks so the link is harmless.
 */
const NETWORK = import.meta.env.VITE_NETWORK || 'hardhat';

const EXPLORERS = {
  arcTestnet: 'https://testnet.arcscan.app',
  // Optionally add mainnet later
};

export function explorerBase() {
  return EXPLORERS[NETWORK] || null;
}

export function addressUrl(address) {
  const base = explorerBase();
  if (!base || !address) return '#';
  return `${base}/address/${address}`;
}

export function txUrl(hash) {
  const base = explorerBase();
  if (!base || !hash) return '#';
  return `${base}/tx/${hash}`;
}

export function tokenUrl(tokenAddress, holder) {
  const base = explorerBase();
  if (!base) return '#';
  return holder
    ? `${base}/token/${tokenAddress}?a=${holder}`
    : `${base}/token/${tokenAddress}`;
}
