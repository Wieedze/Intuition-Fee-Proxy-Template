import { useAccount } from 'wagmi'
import { Link } from 'react-router-dom'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import type { Address as AddrType } from 'viem'
import { useMyProxies } from '../hooks/useFactory'
import { useProxyName } from '../hooks/useVersionedProxy'
import Address from '../components/Address'

export default function MyProxiesPage() {
  const { isConnected } = useAccount()
  const { proxies, isLoading, factory, error } = useMyProxies()

  if (!isConnected) {
    return (
      <div className="max-w-xl mx-auto space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-ink">
            My proxies
          </h1>
          <p className="text-muted">
            Connect your wallet to see the proxies you deployed.
          </p>
        </div>
        <div className="rounded-xl border border-dashed border-line bg-surface p-10 flex flex-col items-center gap-4">
          <div className="text-sm text-subtle">Wallet not connected</div>
          <ConnectButton
            accountStatus="address"
            chainStatus="icon"
            showBalance={false}
          />
        </div>
      </div>
    )
  }

  if (!factory) {
    return (
      <div className="max-w-xl mx-auto space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-ink">
          My proxies
        </h1>
        <p className="text-muted">
          Factory address not configured — see the Deploy page for details.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-8 max-w-3xl mx-auto">
      <div className="flex items-end justify-between">
        <h1 className="text-3xl font-semibold tracking-tight text-ink">
          My proxies
        </h1>
        <Link to="/deploy" className="btn-primary">
          + Deploy new
        </Link>
      </div>

      {isLoading && (
        <div className="space-y-2">
          <div className="skeleton h-14 w-full" />
          <div className="skeleton h-14 w-full" />
          <div className="skeleton h-14 w-full" />
        </div>
      )}
      {error && (
        <p className="text-sm font-mono text-rose-400">
          {error.message.split('\n')[0]}
        </p>
      )}

      {!isLoading && proxies.length === 0 && (
        <div className="rounded-xl border border-dashed border-line bg-surface p-10 text-center text-sm text-subtle">
          No proxies yet.{' '}
          <Link to="/deploy" className="text-brand hover:opacity-80 transition-opacity">
            Deploy your first one →
          </Link>
        </div>
      )}

      {proxies.length > 0 && (
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface overflow-hidden">
          {proxies.map((addr) => (
            <ProxyRow key={addr} addr={addr} />
          ))}
        </ul>
      )}
    </div>
  )
}

function ProxyRow({ addr }: { addr: AddrType }) {
  const { name } = useProxyName(addr)
  return (
    <li className="flex items-center justify-between px-5 py-4 transition-colors hover:bg-surface-hover">
      <div className="min-w-0 flex items-center gap-3 flex-wrap">
        {name ? (
          <>
            <span className="font-medium text-ink">{name}</span>
            <Address value={addr} variant="short" />
          </>
        ) : (
          <Address value={addr} variant="short" />
        )}
      </div>
      <Link
        to={`/proxy/${addr}`}
        className="text-sm text-muted hover:text-ink shrink-0 ml-4 transition-colors"
      >
        Open →
      </Link>
    </li>
  )
}
