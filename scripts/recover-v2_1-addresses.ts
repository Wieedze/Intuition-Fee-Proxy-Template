#!/usr/bin/env bun
/**
 * Scans the last N blocks on Intuition Testnet for contract-creation txs
 * sent by the deployer address. Prints the most recent ones, so we can
 * recover the V2.1 impl addresses when the deploy log was truncated.
 *
 * Usage:
 *   bun run scripts/recover-v2_1-addresses.ts
 */
import { createPublicClient, http, type Address } from "viem";

const RPC = "https://testnet.rpc.intuition.systems";
const DEPLOYER: Address = "0xE596096F4176b682E300d73963e7B04B383C1AA1";
const BLOCKS_BACK = 400n; // ~12min of testnet history

async function main() {
  const client = createPublicClient({ transport: http(RPC) });
  const head = await client.getBlockNumber();
  console.log(`Head block: ${head}`);
  console.log(`Scanning the last ${BLOCKS_BACK} blocks for deployer ${DEPLOYER}…\n`);

  const found: {
    block: bigint;
    tx: `0x${string}`;
    contract: Address;
  }[] = [];

  for (let b = head; b > head - BLOCKS_BACK && b > 0n; b--) {
    const block = await client.getBlock({ blockNumber: b, includeTransactions: true });
    for (const tx of block.transactions) {
      if (
        typeof tx === "object" &&
        tx.to === null &&
        tx.from.toLowerCase() === DEPLOYER.toLowerCase()
      ) {
        const receipt = await client.getTransactionReceipt({ hash: tx.hash });
        if (receipt.contractAddress) {
          found.push({
            block: b,
            tx: tx.hash,
            contract: receipt.contractAddress,
          });
        }
      }
    }
    if (found.length >= 4) break;
  }

  if (found.length === 0) {
    console.log("No contract-creation txs found from this deployer in the scanned window.");
    console.log("Increase BLOCKS_BACK or check the deployer address.");
    return;
  }

  console.log(`Found ${found.length} contract-creation tx(s) (newest first):\n`);
  for (const f of found) {
    console.log(`  block ${f.block}   →   ${f.contract}`);
    console.log(`    tx ${f.tx}\n`);
  }

  console.log("The 2 most recent are the V2.1 standard (oldest of the two) + V2.1 sponsored (newest).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
