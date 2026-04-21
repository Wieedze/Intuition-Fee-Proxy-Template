/**
 * Shared resolver for the Intuition MultiVault address per chain.
 *
 * `deploy.ts`, `e2e-validate.ts` and `e2e-sponsored.ts` all need this mapping.
 * Keeping it in one place avoids drift if Intuition ever moves the MV.
 *
 * Local (chainId 31337) uses a deterministic MockMultiVault — the one that
 * `deploy.ts` step ① creates on a fresh hardhat node from deployer nonce 0.
 */

/** Mainnet — Intuition (chainId 1155). */
export const MULTIVAULT_INTUITION = "0x6E35cF57A41fA15eA0EaE9C33e751b01A784Fe7e";

/** Testnet — Intuition Testnet (chainId 13579). */
export const MULTIVAULT_TESTNET = "0x2Ece8D4dEdcB9918A398528f3fa4688b1d2CAB91";

/** Local — first contract deployed from deployer nonce 0 on a fresh hardhat node. */
export const MULTIVAULT_LOCAL_MOCK = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

/**
 * Resolves the MultiVault address for a given chainId, or throws on unknown
 * chains. Use `(await ethers.provider.getNetwork()).chainId` to feed this.
 */
export function multiVaultFor(chainId: bigint): string {
  if (chainId === 31337n) return MULTIVAULT_LOCAL_MOCK;
  if (chainId === 13579n) return MULTIVAULT_TESTNET;
  if (chainId === 1155n) return MULTIVAULT_INTUITION;
  throw new Error(
    `Unsupported chainId ${chainId}. Supported: 31337 (local), 13579 (testnet), 1155 (mainnet).`,
  );
}
