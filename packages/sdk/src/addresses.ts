export const MULTIVAULT_ADDRESSES = {
  mainnet: '0x6E35cF57A41fA15eA0EaE9C33e751b01A784Fe7e',
  testnet: '0x2Ece8D4dEdcB9918A398528f3fa4688b1d2CAB91',
} as const

/**
 * V2 IntuitionFeeProxy addresses (upgradeable pattern).
 * Populated after V2 deployment.
 */
export const V2_ADDRESSES = {
  mainnet: {
    implementation: '0x0000000000000000000000000000000000000000',
    factory: '0x0000000000000000000000000000000000000000',
  },
  testnet: {
    implementation: '0x0000000000000000000000000000000000000000',
    factory: '0x0000000000000000000000000000000000000000',
  },
} as const
