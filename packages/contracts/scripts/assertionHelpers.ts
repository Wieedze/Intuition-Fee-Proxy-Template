/**
 * Small assertion toolbox for the e2e scripts.
 *
 * The custom errors defined in `libraries/Errors.sol` are triggered from many
 * contracts but the ABI for the library itself isn't always loaded in the
 * context of a revert, so hardhat / ethers sometimes surface them as
 * "unrecognized custom error (return data: 0x…)" instead of a named error.
 *
 * `expectRevertWithName` matches both forms: the decoded name (e.g.
 * `IntuitionFeeProxy_NotWhitelistedAdmin`) and the 4-byte selector derived
 * from `<name>()` (e.g. `0x594ac09d`). Either is treated as a correct match,
 * so the script passes whichever RPC flavour returns.
 */

import { ethers } from "hardhat";

export function assert(cond: boolean, msg: string): asserts cond {
  if (!cond) throw new Error(`✗ ${msg}`);
}

export function assertEq<T>(actual: T, expected: T, msg: string): void {
  if (actual !== expected) {
    throw new Error(`✗ ${msg}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

/**
 * Runs `fn` and asserts it reverts with a custom error whose name is
 * `errorName` (no-args signature assumed — our error lib fits this).
 *
 * Accepts two forms of reverts:
 *  - message contains `errorName` (decoded by ethers / hardhat)
 *  - message contains the 4-byte selector `keccak256("<name>()").slice(0,10)`
 *    (raw-selector form when the ABI isn't loaded)
 */
export async function expectRevertWithName(
  fn: () => Promise<unknown>,
  errorName: string,
  label: string,
): Promise<void> {
  const selector = ethers.id(`${errorName}()`).slice(0, 10); // 0xXXXXXXXX
  try {
    await fn();
  } catch (err: any) {
    const blob: string = `${err?.message ?? ""} ${err?.data ?? ""} ${err?.shortMessage ?? ""}`;
    if (blob.includes(errorName) || blob.toLowerCase().includes(selector.toLowerCase())) {
      return; // ✓ match
    }
    throw new Error(
      `✗ ${label}: expected revert ${errorName} (${selector}), got:\n   ${blob.trim().split("\n")[0]}`,
    );
  }
  throw new Error(`✗ ${label}: expected revert ${errorName}, got success`);
}
