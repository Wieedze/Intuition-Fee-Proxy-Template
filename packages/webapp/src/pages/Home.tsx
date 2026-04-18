import { Link } from 'react-router-dom'

export default function HomePage() {
  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <h1 className="text-4xl font-bold tracking-tight">
          Deploy your fee proxy in one click
        </h1>
        <p className="text-lg text-gray-600 max-w-2xl">
          Spin up an upgradeable{' '}
          <span className="font-medium">IntuitionFeeProxyV2</span> on top of the
          Intuition MultiVault. Configure fees, manage admins, withdraw when you
          want — no forwarding, no foot-gun.
        </p>
        <div className="flex gap-3 pt-2">
          <Link
            to="/deploy"
            className="inline-flex items-center rounded-md bg-black px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-800"
          >
            Deploy a proxy
          </Link>
          <Link
            to="/my-proxies"
            className="inline-flex items-center rounded-md border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-900 hover:bg-gray-50"
          >
            My proxies
          </Link>
        </div>
      </section>

      <section className="grid gap-6 sm:grid-cols-3">
        {[
          {
            title: 'Upgradeable',
            body: 'UUPS (ERC-1967). Each instance keeps its own upgrade path, no beacon coupling.',
          },
          {
            title: 'Pull-based fees',
            body: 'Fees accumulate in-contract and are withdrawn on-demand by admins — no forwarding.',
          },
          {
            title: 'Permissionless',
            body: 'Anyone can spin up a new instance from the factory. Free, no deployment fee.',
          },
        ].map((f) => (
          <div key={f.title} className="rounded-lg border bg-white p-5">
            <div className="text-sm font-semibold">{f.title}</div>
            <p className="mt-1.5 text-sm text-gray-600">{f.body}</p>
          </div>
        ))}
      </section>
    </div>
  )
}
