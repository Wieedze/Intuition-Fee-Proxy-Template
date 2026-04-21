export const INTUITION_MAINNET = {
  id: 1155,
  name: 'Intuition Mainnet',
  nativeCurrency: { name: 'TRUST', symbol: 'TRUST', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.intuition.systems'] },
    public: { http: ['https://rpc.intuition.systems'] },
  },
  blockExplorers: {
    default: {
      name: 'Intuition Explorer',
      url: 'https://explorer.intuition.systems',
    },
  },
  contracts: {
    multicall3: {
      address: '0xcA11bde05977b3631167028862bE2a173976CA11' as const,
    },
  },
} as const

export const INTUITION_TESTNET = {
  id: 13579,
  name: 'Intuition Testnet',
  nativeCurrency: { name: 'TRUST', symbol: 'TRUST', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://testnet.rpc.intuition.systems'] },
    public: { http: ['https://testnet.rpc.intuition.systems'] },
  },
  blockExplorers: {
    default: {
      name: 'Intuition Testnet Explorer',
      url: 'https://testnet.explorer.intuition.systems',
    },
  },
  contracts: {
    multicall3: {
      address: '0xcA11bde05977b3631167028862bE2a173976CA11' as const,
    },
  },
  testnet: true,
} as const
