import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { ConnectButton } from '@rainbow-me/rainbowkit'

import { useFactoryIdentity } from '../hooks/useFactory'
import Address from './Address'

const NAV_ITEMS = [
  { to: '/', label: 'Home', end: true },
  { to: '/deploy', label: 'Deploy' },
  { to: '/explore', label: 'Explore' },
  { to: '/my-proxies', label: 'My proxies' },
  { to: '/docs', label: 'Docs' },
]

export default function Layout() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div className="app-bg min-h-screen flex flex-col">
      <header
        className={`sticky top-0 z-20 bg-canvas/70 backdrop-blur-md transition-colors ${
          scrolled ? 'border-b border-line' : 'border-b border-transparent'
        }`}
      >
        <div className="px-6 h-[72px] flex items-center justify-between gap-6">
          <Wordmark />

          <nav className="flex items-center gap-6">
            {NAV_ITEMS.map((item) => (
              <NavItem key={item.to} to={item.to} end={item.end}>
                {item.label}
              </NavItem>
            ))}
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <ThemeToggle />
            <WalletButton />
          </div>
        </div>
      </header>

      <main className="flex-1">
        <div className="mx-auto max-w-6xl px-6 pt-14 pb-8 animate-fade-in">
          <Outlet />
        </div>
      </main>

      <footer className="border-t border-line">
        <div className="px-6 py-4 flex items-center justify-between text-xs text-subtle">
          <FactoryStamp />
          <div className="flex items-center gap-5">
            <a
              href="https://intuition.systems"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-ink transition-colors"
            >
              Intuition ↗
            </a>
            <a
              href="https://github.com/intuition-box"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-ink transition-colors"
            >
              GitHub ↗
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}

function Wordmark() {
  return (
    <Link to="/" className="flex items-center gap-3 shrink-0 group">
      <LogoMark />
      <div className="flex items-baseline gap-1.5">
        <span className="font-semibold text-[17px] tracking-tight text-ink">
          Intuition.box
        </span>
        <span className="font-normal text-[17px] text-muted tracking-tight">
          Proxy Factory
        </span>
      </div>
    </Link>
  )
}

function NavItem({
  to,
  end,
  children,
}: {
  to: string
  end?: boolean
  children: React.ReactNode
}) {
  const location = useLocation()
  const isActive = end
    ? location.pathname === to
    : location.pathname.startsWith(to)

  return (
    <NavLink
      to={to}
      end={end}
      className={`relative text-sm transition-colors ${
        isActive ? 'text-ink' : 'text-muted hover:text-ink'
      }`}
    >
      {children}
      <span
        className={`absolute left-0 right-0 -bottom-[25px] h-px bg-ink transition-opacity ${
          isActive ? 'opacity-100' : 'opacity-0'
        }`}
      />
    </NavLink>
  )
}

function ThemeToggle() {
  const [isDark, setIsDark] = useState<boolean>(() =>
    typeof document !== 'undefined'
      ? document.documentElement.classList.contains('dark')
      : true,
  )

  useEffect(() => {
    const root = document.documentElement
    if (isDark) {
      root.classList.add('dark')
      localStorage.setItem('theme', 'dark')
    } else {
      root.classList.remove('dark')
      localStorage.setItem('theme', 'light')
    }
  }, [isDark])

  return (
    <button
      type="button"
      onClick={() => setIsDark((v) => !v)}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted hover:text-ink hover:bg-surface-hover transition-colors"
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </button>
  )
}

function FactoryStamp() {
  const { factory, version } = useFactoryIdentity()
  if (!factory) {
    return (
      <span className="inline-flex items-center gap-2 font-mono text-[11px] text-subtle">
        Factory not configured
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-2 font-mono text-[11px] text-subtle">
      <span>Factory</span>
      {version ? <span className="text-muted">v{version}</span> : null}
      <Address value={factory} variant="short" />
    </span>
  )
}

function WalletButton() {
  return (
    <ConnectButton.Custom>
      {({
        account,
        chain,
        openAccountModal,
        openChainModal,
        openConnectModal,
        authenticationStatus,
        mounted,
      }) => {
        const ready = mounted && authenticationStatus !== 'loading'
        const connected =
          ready &&
          account &&
          chain &&
          (!authenticationStatus || authenticationStatus === 'authenticated')

        const wrapperProps = !ready
          ? {
              'aria-hidden': true,
              style: { opacity: 0, pointerEvents: 'none', userSelect: 'none' },
            }
          : {}

        return (
          <div
            {...(wrapperProps as React.HTMLAttributes<HTMLDivElement>)}
            className="flex items-center gap-2"
          >
            {(() => {
              if (!connected) {
                return (
                  <button
                    type="button"
                    onClick={openConnectModal}
                    className="btn-primary h-9 px-4 text-sm"
                  >
                    Connect wallet
                  </button>
                )
              }

              if (chain.unsupported) {
                return (
                  <button
                    type="button"
                    onClick={openChainModal}
                    className="h-9 px-3 inline-flex items-center gap-2 rounded-md border border-rose-500/40 bg-rose-500/5 text-sm font-medium text-rose-400 hover:bg-rose-500/10 transition-colors"
                  >
                    <span aria-hidden>⚠</span>
                    Wrong network
                  </button>
                )
              }

              return (
                <>
                  <button
                    type="button"
                    onClick={openChainModal}
                    className="h-9 px-3 inline-flex items-center gap-2 rounded-md border border-line bg-surface text-sm text-ink hover:bg-surface-hover hover:border-line-strong transition-colors"
                  >
                    {chain.hasIcon && chain.iconUrl && (
                      <span
                        className="inline-flex h-4 w-4 overflow-hidden rounded-full shrink-0"
                        style={{ background: chain.iconBackground }}
                      >
                        <img
                          alt={chain.name ?? 'chain'}
                          src={chain.iconUrl}
                          className="h-4 w-4"
                        />
                      </span>
                    )}
                    <span className="hidden sm:inline">{chain.name}</span>
                    <ChevronIcon />
                  </button>

                  <button
                    type="button"
                    onClick={openAccountModal}
                    className="h-9 px-3 inline-flex items-center gap-2 rounded-md border border-line bg-surface text-sm text-ink hover:bg-surface-hover hover:border-line-strong transition-colors"
                  >
                    <span className="font-mono text-xs">
                      {account.displayName}
                    </span>
                    <ChevronIcon />
                  </button>
                </>
              )
            })()}
          </div>
        )
      }}
    </ConnectButton.Custom>
  )
}

function ChevronIcon() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-subtle shrink-0"
      aria-hidden="true"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

function LogoMark() {
  return (
    <>
      <img
        src="/icon-dark.svg"
        alt=""
        width={26}
        height={26}
        className="block dark:hidden rounded-[5px]"
        aria-hidden="true"
      />
      <img
        src="/icon-light.svg"
        alt=""
        width={26}
        height={26}
        className="hidden dark:block rounded-[5px]"
        aria-hidden="true"
      />
    </>
  )
}

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}
