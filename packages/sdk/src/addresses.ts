export type NetworkName = 'mainnet' | 'testnet'

export const MULTIVAULT_ADDRESSES = {
  mainnet: '0x6E35cF57A41fA15eA0EaE9C33e751b01A784Fe7e',
  testnet: '0x2Ece8D4dEdcB9918A398528f3fa4688b1d2CAB91',
} as const satisfies Record<NetworkName, `0x${string}`>

/**
 * V2 IntuitionFeeProxy Factory addresses per network.
 *
 * Only the Factory is pinned. Standard and sponsored implementation
 * addresses are NOT snapshotted here — both are mutable via
 * `Factory.setImplementation` / `Factory.setSponsoredImplementation`
 * and must be read live from the Factory contract:
 *
 *   const std  = await factory.read.currentImplementation()
 *   const spns = await factory.read.sponsoredImplementation()
 *
 * Treats the Factory as the single on-chain registry of truth — no
 * SDK-level drift possible.
 *
 * Populated after V2 deployment.
 */
export const V2_ADDRESSES = {
  mainnet: {
    // Not yet deployed — webapp treats the zero address as "not configured".
    factory: '0x0000000000000000000000000000000000000000',
  },
  testnet: {
    factory: '0x7D2a0C97324876F327281BBffFfE076Eaf3af84a',
  },
} as const satisfies Record<NetworkName, { factory: `0x${string}` }>
