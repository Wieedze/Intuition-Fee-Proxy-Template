/**
 * Chain → explorer / portal URL maps used across Deploy + ProxyDetail.
 *
 * Layout.tsx and HistoryTab.tsx still carry their own local copies — left
 * alone on purpose to keep this change self-contained. Migrate them in a
 * cleanup pass if a fifth consumer shows up.
 */

export const TX_EXPLORER_BY_CHAIN: Record<number, string> = {
  1155: 'https://explorer.intuition.systems',
  13579: 'https://testnet.explorer.intuition.systems',
}

// Intuition atom portal. Only mainnet is officially documented; we reuse
// the same host on testnet until a dedicated testnet host is confirmed.
export const ATOM_PORTAL_BY_CHAIN: Record<number, string> = {
  1155: 'https://portal.intuition.systems/explore/atom',
  13579: 'https://portal.intuition.systems/explore/atom',
}
