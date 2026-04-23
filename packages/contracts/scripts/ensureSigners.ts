/**
 * Ensures the e2e scripts have at least N signers to work with.
 *
 * On hardhat localhost, `ethers.getSigners()` returns 20 pre-funded accounts,
 * so this is a no-op. On Intuition testnet (and any other network configured
 * with a single key), it returns just the deployer — scripts that destructure
 * multiple signers hit "undefined.address".
 *
 * Strategy: keep the existing signers as-is, then generate random wallets
 * and fund each with `fundEach` TRUST transferred from the deployer. The
 * funding is a one-shot `sendTransaction` per extra signer, so the run has
 * a predictable upfront TRUST cost (≈ `(count - existing.length) * fundEach`
 * + gas).
 */
import { ethers } from "hardhat";

export async function ensureSigners(
  count: number,
  fundEach: bigint = ethers.parseEther("3"),
): Promise<any[]> {
  const existing = await ethers.getSigners();
  if (existing.length >= count) return existing;

  const deployer = existing[0];
  const need = count - existing.length;
  console.log(
    `   (network has ${existing.length} signer(s), generating ${need} ephemeral wallet(s) · funding each with ${ethers.formatEther(fundEach)} TRUST)`,
  );

  const extras: any[] = [];
  for (let i = 0; i < need; i++) {
    const w = ethers.Wallet.createRandom().connect(ethers.provider);
    extras.push(w);
  }
  for (const w of extras) {
    const tx = await deployer.sendTransaction({ to: w.address, value: fundEach });
    await tx.wait();
  }
  return [...existing, ...extras];
}
