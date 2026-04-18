import { Link, NavLink, Outlet } from 'react-router-dom'
import { ConnectButton } from '@rainbow-me/rainbowkit'

const navItemCls = ({ isActive }: { isActive: boolean }) =>
  `text-sm ${isActive ? 'font-semibold text-black' : 'text-gray-600 hover:text-black'}`

export default function Layout() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50 text-gray-900">
      <header className="border-b bg-white">
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-center justify-between">
          <Link to="/" className="font-semibold text-lg">
            Intuition Fee Proxy Factory
          </Link>
          <nav className="flex items-center gap-6">
            <NavLink to="/deploy" className={navItemCls}>
              Deploy
            </NavLink>
            <NavLink to="/my-proxies" className={navItemCls}>
              My Proxies
            </NavLink>
            <ConnectButton
              accountStatus="address"
              chainStatus="icon"
              showBalance={false}
            />
          </nav>
        </div>
      </header>
      <main className="flex-1">
        <div className="mx-auto max-w-5xl px-6 py-10">
          <Outlet />
        </div>
      </main>
      <footer className="border-t bg-white">
        <div className="mx-auto max-w-5xl px-6 py-4 text-xs text-gray-500">
          Upgradeable fee-layer for Intuition MultiVault · V2
        </div>
      </footer>
    </div>
  )
}
