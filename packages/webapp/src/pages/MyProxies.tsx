import { useAccount } from 'wagmi'
import { Link } from 'react-router-dom'
import { useMyProxies } from '../hooks/useFactory'

export default function MyProxiesPage() {
  const { isConnected } = useAccount()
  const { proxies, isLoading, factory, error } = useMyProxies()

  if (!isConnected) {
    return (
      <div className="max-w-xl space-y-2">
        <h1 className="text-3xl font-bold">My Proxies</h1>
        <p className="text-gray-600">Connect your wallet to see the proxies you deployed.</p>
      </div>
    )
  }

  if (!factory) {
    return (
      <div className="max-w-xl space-y-2">
        <h1 className="text-3xl font-bold">My Proxies</h1>
        <p className="text-gray-600">
          Factory address not configured — see the Deploy page for details.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-end justify-between">
        <h1 className="text-3xl font-bold">My Proxies</h1>
        <Link to="/deploy" className="text-sm underline">
          + Deploy new
        </Link>
      </div>

      {isLoading && <p className="text-gray-600 text-sm">Loading…</p>}
      {error && (
        <p className="text-sm text-red-700">{error.message.split('\n')[0]}</p>
      )}

      {!isLoading && proxies.length === 0 && (
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-gray-600">
          No proxies yet.{' '}
          <Link to="/deploy" className="underline">
            Deploy your first one.
          </Link>
        </div>
      )}

      {proxies.length > 0 && (
        <ul className="rounded-md border bg-white divide-y">
          {proxies.map((addr) => (
            <li key={addr} className="flex items-center justify-between px-4 py-3">
              <span className="font-mono text-sm break-all">{addr}</span>
              <Link
                to={`/proxy/${addr}`}
                className="text-sm underline shrink-0 ml-4"
              >
                Open →
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
