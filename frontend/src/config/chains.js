/** Arc Testnet — https://docs.arc.network/arc/references/connect-to-arc */
export const ARC_TESTNET = {
  chainId: 5042002,
  chainIdHex: '0x4cef52',
  chainName: 'Arc Testnet',
  nativeCurrency: {
    name: 'USDC',
    symbol: 'USDC',
    decimals: 18,
  },
  rpcUrls: ['https://rpc.testnet.arc.network'],
  blockExplorerUrls: ['https://testnet.arcscan.app'],
};

export function getTargetChain() {
  return ARC_TESTNET;
}

export async function ensureArcNetwork(ethereum) {
  const target = getTargetChain();
  const chainId = await ethereum.request({ method: 'eth_chainId' });
  if (chainId.toLowerCase() === target.chainIdHex.toLowerCase()) {
    return;
  }
  try {
    await ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: target.chainIdHex }],
    });
  } catch (err) {
    if (err.code === 4902) {
      await ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: target.chainIdHex,
            chainName: target.chainName,
            nativeCurrency: target.nativeCurrency,
            rpcUrls: target.rpcUrls,
            blockExplorerUrls: target.blockExplorerUrls,
          },
        ],
      });
      return;
    }
    throw err;
  }
}
