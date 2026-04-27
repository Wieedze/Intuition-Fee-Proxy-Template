import { getAddress, stringToHex, type Address, type Hex } from 'viem'
import * as factory from '../ops/factory.js'
import * as uups from '../ops/uups-upgrade.js'
import * as v2 from '../ops/v2-admin.js'
import type { AdminOp } from '../types.js'

/**
 * Declarative registry of every admin op exposed by the CLI. Adding an
 * op is a single entry — the CLI subcommand, flag parsing, and dispatch
 * are derived from this table.
 */

export type OpFlagType = 'address' | 'bigint' | 'bool' | 'hex' | 'version-string'

export type OpFlag = {
  name: string
  type: OpFlagType
  description: string
  required: boolean
}

export type OpRegistration = {
  name: string
  category: 'v2-admin' | 'factory' | 'uups'
  description: string
  flags: OpFlag[]
  build: (args: Record<string, unknown>) => AdminOp
}

export const OP_REGISTRY: OpRegistration[] = [
  // ----- v2-admin -----
  {
    name: 'set-deposit-fixed-fee',
    category: 'v2-admin',
    description: 'Set the fixed deposit fee on a V2 fee proxy',
    flags: [
      { name: 'proxy', type: 'address', description: 'V2 proxy address', required: true },
      { name: 'value', type: 'bigint', description: 'New fee in wei', required: true },
    ],
    build: ({ proxy, value }) =>
      v2.setDepositFixedFee(proxy as Address, value as bigint),
  },
  {
    name: 'set-deposit-percentage-fee',
    category: 'v2-admin',
    description: 'Set the percentage deposit fee on a V2 fee proxy (basis points)',
    flags: [
      { name: 'proxy', type: 'address', description: 'V2 proxy address', required: true },
      { name: 'value', type: 'bigint', description: 'New fee in basis points (100 = 1%)', required: true },
    ],
    build: ({ proxy, value }) =>
      v2.setDepositPercentageFee(proxy as Address, value as bigint),
  },
  {
    name: 'set-whitelisted-admin',
    category: 'v2-admin',
    description: 'Add or remove an admin from the V2 proxy whitelist',
    flags: [
      { name: 'proxy', type: 'address', description: 'V2 proxy address', required: true },
      { name: 'admin', type: 'address', description: 'Admin address to toggle', required: true },
      { name: 'status', type: 'bool', description: 'true = grant, false = revoke', required: true },
    ],
    build: ({ proxy, admin, status }) =>
      v2.setWhitelistedAdmin(proxy as Address, admin as Address, status as boolean),
  },
  {
    name: 'withdraw',
    category: 'v2-admin',
    description: 'Withdraw a specific amount from a V2 proxy',
    flags: [
      { name: 'proxy', type: 'address', description: 'V2 proxy address', required: true },
      { name: 'recipient', type: 'address', description: 'Recipient address', required: true },
      { name: 'amount', type: 'bigint', description: 'Amount in wei', required: true },
    ],
    build: ({ proxy, recipient, amount }) =>
      v2.withdraw(proxy as Address, recipient as Address, amount as bigint),
  },
  {
    name: 'withdraw-all',
    category: 'v2-admin',
    description: 'Withdraw the full balance of a V2 proxy',
    flags: [
      { name: 'proxy', type: 'address', description: 'V2 proxy address', required: true },
      { name: 'recipient', type: 'address', description: 'Recipient address', required: true },
    ],
    build: ({ proxy, recipient }) =>
      v2.withdrawAll(proxy as Address, recipient as Address),
  },

  // ----- factory -----
  {
    name: 'factory-set-implementation',
    category: 'factory',
    description: 'Register a new V2 implementation in the factory',
    flags: [
      { name: 'factory', type: 'address', description: 'Factory address', required: true },
      { name: 'new-impl', type: 'address', description: 'New implementation address', required: true },
      { name: 'new-version', type: 'version-string', description: 'Version string (encoded as bytes32)', required: true },
    ],
    build: ({ factory: f, 'new-impl': impl, 'new-version': v }) =>
      factory.setImplementation(f as Address, impl as Address, v as Hex),
  },
  {
    name: 'factory-set-sponsored-implementation',
    category: 'factory',
    description: 'Register a new V2Sponsored implementation in the factory',
    flags: [
      { name: 'factory', type: 'address', description: 'Factory address', required: true },
      { name: 'new-impl', type: 'address', description: 'New sponsored implementation address', required: true },
      { name: 'new-version', type: 'version-string', description: 'Version string (encoded as bytes32)', required: true },
    ],
    build: ({ factory: f, 'new-impl': impl, 'new-version': v }) =>
      factory.setSponsoredImplementation(f as Address, impl as Address, v as Hex),
  },
  {
    name: 'factory-transfer-ownership',
    category: 'factory',
    description: 'Initiate transfer of factory ownership (Ownable2Step)',
    flags: [
      { name: 'factory', type: 'address', description: 'Factory address', required: true },
      { name: 'new-owner', type: 'address', description: 'New pending owner', required: true },
    ],
    build: ({ factory: f, 'new-owner': o }) =>
      factory.transferOwnership(f as Address, o as Address),
  },
  {
    name: 'factory-accept-ownership',
    category: 'factory',
    description: 'Accept pending ownership of the factory (called by new owner Safe)',
    flags: [
      { name: 'factory', type: 'address', description: 'Factory address', required: true },
    ],
    build: ({ factory: f }) => factory.acceptOwnership(f as Address),
  },

  // ----- uups -----
  {
    name: 'upgrade-to-and-call',
    category: 'uups',
    description: 'Upgrade an ERC1967 proxy to a new implementation, optionally with init data',
    flags: [
      { name: 'proxy', type: 'address', description: 'Proxy address to upgrade', required: true },
      { name: 'new-impl', type: 'address', description: 'New implementation address', required: true },
      { name: 'init-data', type: 'hex', description: 'Init calldata (default 0x = no init)', required: false },
    ],
    build: ({ proxy, 'new-impl': impl, 'init-data': data }) =>
      uups.upgradeToAndCall(proxy as Address, impl as Address, (data ?? '0x') as Hex),
  },
]

export function getOpRegistration(name: string): OpRegistration {
  const def = OP_REGISTRY.find((o) => o.name === name)
  if (!def) {
    throw new Error(
      `safe-tx: unknown op "${name}". Available: ${OP_REGISTRY.map((o) => o.name).join(', ')}`,
    )
  }
  return def
}

export function parseOpFlag(value: string, type: OpFlagType): unknown {
  switch (type) {
    case 'address':
      return getAddress(value)
    case 'bigint':
      return BigInt(value)
    case 'bool':
      if (value === 'true' || value === '1') return true
      if (value === 'false' || value === '0') return false
      throw new Error(`safe-tx: bool flag must be 'true' or 'false', got ${value}`)
    case 'hex':
      if (!/^0x[0-9a-fA-F]*$/.test(value)) {
        throw new Error(`safe-tx: hex flag must be 0x-prefixed hex, got ${value}`)
      }
      return value as Hex
    case 'version-string':
      return stringToHex(value, { size: 32 })
  }
}

export function parseOpFlags(
  def: OpRegistration,
  rawFlags: Record<string, string | undefined>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const flag of def.flags) {
    const raw = rawFlags[flag.name]
    if (raw === undefined) {
      if (flag.required) {
        throw new Error(`safe-tx: missing required flag --${flag.name} for op ${def.name}`)
      }
      continue
    }
    out[flag.name] = parseOpFlag(raw, flag.type)
  }
  return out
}
