import { describe, expect, it } from 'vitest'
import { getAddress, isAddress } from 'viem'
import {
  INTUITION_MAINNET,
  NETWORKS,
  buildSafeUiUrl,
  buildTxServiceApiUrl,
  getNetwork,
} from '../src/networks.js'

describe('Intuition mainnet network config', () => {
  it('has the correct chain id', () => {
    expect(INTUITION_MAINNET.chainId).toBe(1155)
  })

  it('uses the int: shortName matching Den / EIP-3770', () => {
    expect(INTUITION_MAINNET.shortName).toBe('int')
  })

  it('points to the Den-hosted Safe Transaction Service', () => {
    expect(INTUITION_MAINNET.txServiceUrl).toBe(
      'https://safe-transaction-intuition.onchainden.com',
    )
  })

  it('exposes valid checksummed Safe contract addresses', () => {
    const { safeContracts } = INTUITION_MAINNET
    for (const [label, addr] of Object.entries(safeContracts)) {
      expect(isAddress(addr), `${label} not a valid address`).toBe(true)
      expect(addr, `${label} not checksummed`).toBe(getAddress(addr))
    }
  })
})

describe('NETWORKS registry', () => {
  it('exposes intuition-mainnet only (no testnet)', () => {
    expect(Object.keys(NETWORKS)).toEqual(['intuition-mainnet'])
  })

  it('getNetwork returns the same object as the constant', () => {
    expect(getNetwork('intuition-mainnet')).toBe(INTUITION_MAINNET)
  })
})

describe('URL helpers', () => {
  const safeAddr = '0xf10D442D0fB934D4037DC30769a6EfCf2f54F7B6' as const

  it('buildSafeUiUrl produces the Den deep-link format', () => {
    expect(buildSafeUiUrl(INTUITION_MAINNET, safeAddr)).toBe(
      `https://safe.onchainden.com/home?safe=int:${safeAddr}`,
    )
  })

  it('buildTxServiceApiUrl returns the STS base URL without trailing slash', () => {
    const url = buildTxServiceApiUrl(INTUITION_MAINNET)
    expect(url).toBe('https://safe-transaction-intuition.onchainden.com')
    expect(url.endsWith('/')).toBe(false)
  })
})
