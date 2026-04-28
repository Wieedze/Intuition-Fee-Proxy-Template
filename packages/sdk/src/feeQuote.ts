/**
 * Fee-quote helpers for `IntuitionFeeProxyV2.deposit(…, maxFeeBps, maxFixedFee)`.
 *
 * The V2 `deposit` entry point takes two caller-supplied caps as front-run
 * protection: if the proxy's live `depositPercentageFee` / `depositFixedFee`
 * exceed those caps at execution time, the tx reverts with `FeeExceedsCap`.
 *
 * These helpers fetch the live values and produce a `FeeCaps` pair the
 * caller can splice into their deposit args. Two strategies:
 *
 * - {@link feeCapsExact} — zero-buffer, strict. Any admin bump in the
 *   same block reverts the tx. Recommended for non-interactive scripts.
 * - {@link feeCapsWithBuffer} — accept a small relative bump in either
 *   knob. Useful when you want to tolerate a benign re-pricing without
 *   forcing the user to re-sign.
 *
 * Don't hard-code `MAX_FEE_PERCENTAGE` / `MAX_FIXED_FEE` as caps unless
 * you explicitly want to opt out of front-run protection — that pattern
 * defeats the point of F5.
 */
import type { Address, PublicClient } from 'viem'
import { IntuitionFeeProxyV2ABI } from './index'

/** Per-tx caps the caller pins onto `deposit()` to bound admin fee bumps. */
export type FeeCaps = {
  /** Max percentage fee (bps, base 10000) accepted at execution time. */
  maxFeeBps: bigint
  /** Max fixed fee (wei) accepted at execution time. */
  maxFixedFee: bigint
}

/** Snapshot of the proxy's live fee config. */
export type LiveFees = {
  depositFixedFee: bigint
  depositPercentageFee: bigint
}

/** Bytecode-immutable upper bounds on the proxy's fee config. */
export const MAX_FEE_PERCENTAGE = 1000n
export const MAX_FIXED_FEE = 10n * 10n ** 18n
const FEE_DENOMINATOR = 10000n

/**
 * Read the proxy's current `depositFixedFee` + `depositPercentageFee`.
 * Pass the result to {@link feeCapsExact} or {@link feeCapsWithBuffer}.
 */
export async function fetchLiveFees(
  client: PublicClient,
  proxy: Address,
): Promise<LiveFees> {
  const [fixed, pct] = await Promise.all([
    client.readContract({
      abi: IntuitionFeeProxyV2ABI as any,
      address: proxy,
      functionName: 'depositFixedFee',
    }),
    client.readContract({
      abi: IntuitionFeeProxyV2ABI as any,
      address: proxy,
      functionName: 'depositPercentageFee',
    }),
  ])
  return {
    depositFixedFee: fixed as bigint,
    depositPercentageFee: pct as bigint,
  }
}

/**
 * Strict caps — equality required. Any admin bump above the snapshot
 * reverts the deposit tx with `FeeExceedsCap`.
 */
export function feeCapsExact(live: LiveFees): FeeCaps {
  return {
    maxFeeBps: live.depositPercentageFee,
    maxFixedFee: live.depositFixedFee,
  }
}

/**
 * Lenient caps — accept a relative bump up to `bufferBps / 10000` of each
 * knob. Example: `bufferBps = 1000n` (10%) on a live 5% fee accepts up to
 * 5.5%. Always clamped to {@link MAX_FEE_PERCENTAGE} / {@link MAX_FIXED_FEE}
 * so the helper never produces caps the bytecode wouldn't accept anyway.
 *
 * Pass `bufferBps = 0n` for strict behaviour (equivalent to
 * {@link feeCapsExact}).
 */
export function feeCapsWithBuffer(
  live: LiveFees,
  bufferBps: bigint,
): FeeCaps {
  const pctCap =
    live.depositPercentageFee +
    (live.depositPercentageFee * bufferBps) / FEE_DENOMINATOR
  const fixedCap =
    live.depositFixedFee + (live.depositFixedFee * bufferBps) / FEE_DENOMINATOR
  return {
    maxFeeBps: pctCap > MAX_FEE_PERCENTAGE ? MAX_FEE_PERCENTAGE : pctCap,
    maxFixedFee: fixedCap > MAX_FIXED_FEE ? MAX_FIXED_FEE : fixedCap,
  }
}

/**
 * Convenience: fetch live fees and return strict caps in one call.
 * Equivalent to `feeCapsExact(await fetchLiveFees(client, proxy))`.
 */
export async function quoteFeeCapsExact(
  client: PublicClient,
  proxy: Address,
): Promise<FeeCaps> {
  return feeCapsExact(await fetchLiveFees(client, proxy))
}
