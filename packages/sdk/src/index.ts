export * from './addresses'
export * from './chains'

import IntuitionFeeProxyV2Abi from './abis/IntuitionFeeProxyV2.json'
import IntuitionFeeProxyV2SponsoredAbi from './abis/IntuitionFeeProxyV2Sponsored.json'
import IntuitionFeeProxyFactoryAbi from './abis/IntuitionFeeProxyFactory.json'
import IntuitionVersionedFeeProxyAbi from './abis/IntuitionVersionedFeeProxy.json'
import IntuitionFeeProxyV1Abi from './abis/IntuitionFeeProxy.json'

export const IntuitionFeeProxyV2ABI = IntuitionFeeProxyV2Abi
/** V2Sponsored ABI — superset of V2 adding credit pool / depositFor / claim limits. */
export const IntuitionFeeProxyV2SponsoredABI = IntuitionFeeProxyV2SponsoredAbi
export const IntuitionFeeProxyFactoryABI = IntuitionFeeProxyFactoryAbi
/** ERC-7936 versioned proxy ABI — the contract deployed by the Factory. */
export const IntuitionVersionedFeeProxyABI = IntuitionVersionedFeeProxyAbi
/** V1 legacy ABI (for reading historical deployments in dashboards). */
export const IntuitionFeeProxyV1ABI = IntuitionFeeProxyV1Abi
