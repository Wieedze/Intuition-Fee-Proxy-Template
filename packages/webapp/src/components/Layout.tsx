import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useDisconnect } from 'wagmi'

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

      <footer className="sticky bottom-0 z-20 bg-canvas/70 backdrop-blur-md border-t border-line">
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
            {!connected && (
              <button
                type="button"
                onClick={openConnectModal}
                className="btn-primary h-9 px-4 text-sm"
              >
                Connect wallet
              </button>
            )}
            {connected && chain.unsupported && (
              <button
                type="button"
                onClick={openChainModal}
                className="h-9 px-3 inline-flex items-center gap-2 rounded-md border border-rose-500/40 bg-rose-500/5 text-sm font-medium text-rose-400 hover:bg-rose-500/10 transition-colors"
              >
                <span aria-hidden>⚠</span>
                Wrong network
              </button>
            )}
            {connected && !chain.unsupported && (
              <WalletDropdown account={account} chain={chain} />
            )}
          </div>
        )
      }}
    </ConnectButton.Custom>
  )
}

interface RKAccount {
  address: string
  displayName: string
  displayBalance?: string
  ensAvatar?: string
}

interface RKChain {
  id: number
  name?: string
  iconUrl?: string
  iconBackground?: string
  hasIcon?: boolean
}

/**
 * Portal-style wallet menu: single round avatar in the navbar; click
 * reveals an inline dropdown with wallet address + balance, network,
 * and quick actions (Profile / Explorer / Disconnect).
 *
 * Replaces the 2-button "chain | address" pair that opened the
 * RainbowKit account modal — gives us the same information density
 * without leaving the page.
 */
function WalletDropdown({ account, chain }: { account: RKAccount; chain: RKChain }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const { disconnect } = useDisconnect()

  // Close on outside click + Escape.
  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Derive a deterministic pastel gradient from the address for the
  // avatar fallback (when no ENS avatar). Reads 6 hex chars → 2 HSL
  // hues → CSS background.
  const gradient = (() => {
    if (account.ensAvatar) return undefined
    const raw = account.address.toLowerCase().replace(/^0x/, '')
    const h1 = parseInt(raw.slice(2, 5), 16) % 360
    const h2 = parseInt(raw.slice(5, 8), 16) % 360
    return `linear-gradient(135deg, hsl(${h1} 70% 55%), hsl(${h2} 70% 45%))`
  })()

  const explorerUrl = EXPLORER_BY_CHAIN[chain.id]
  const explorerAddressUrl = explorerUrl
    ? `${explorerUrl}/address/${account.address}`
    : undefined

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Wallet menu"
        aria-expanded={open}
        className="h-7 w-7 rounded-full border border-line overflow-hidden ring-1 ring-transparent hover:ring-line-strong transition-all"
        style={{ background: gradient }}
      >
        {account.ensAvatar && (
          <img
            src={account.ensAvatar}
            alt=""
            className="h-full w-full object-cover"
            aria-hidden
          />
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-72 rounded-xl border border-line bg-surface shadow-xl shadow-black/20 overflow-hidden z-30"
        >
          <div className="px-4 py-3 space-y-3">
            <div>
              <div className="text-[10px] font-medium uppercase tracking-widest text-subtle mb-1.5">
                Wallet
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
                <span className="font-mono text-ink">{account.displayName}</span>
                {account.displayBalance && (
                  <span className="ml-auto text-muted text-xs">
                    {account.displayBalance}
                  </span>
                )}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-medium uppercase tracking-widest text-subtle mb-1.5">
                Network
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
                <div className="min-w-0">
                  <div className="text-ink">{chain.name ?? '—'}</div>
                  <div className="text-[11px] text-subtle">
                    Chain ID: {chain.id}
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="border-t border-line py-1">
            <MenuItem
              icon={<CopyIcon />}
              label="Copy address"
              onClick={() => {
                navigator.clipboard.writeText(account.address).catch(() => {})
                setOpen(false)
              }}
            />
            {explorerAddressUrl && (
              <MenuItem
                icon={<ExternalIcon />}
                label="View on Explorer"
                href={explorerAddressUrl}
                onClick={() => setOpen(false)}
              />
            )}
            <MenuItem
              icon={<LogoutIcon />}
              label="Disconnect"
              onClick={() => {
                disconnect()
                setOpen(false)
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

/** Block-explorer roots per supported chainId. Keep in sync with the
 *  wagmi/SDK chain config. Unknown chains simply hide the "View on
 *  Explorer" row instead of linking to a 404. */
const EXPLORER_BY_CHAIN: Record<number, string> = {
  1155: 'https://explorer.intuition.systems',
  13579: 'https://testnet.explorer.intuition.systems',
}

function MenuItem({
  icon,
  label,
  href,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  href?: string
  onClick?: () => void
}) {
  const cls =
    'flex items-center gap-3 w-full text-left px-4 py-2.5 text-sm text-ink hover:bg-canvas transition-colors'
  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onClick}
        className={cls}
        role="menuitem"
      >
        <span className="text-muted">{icon}</span>
        <span>{label}</span>
      </a>
    )
  }
  return (
    <button type="button" onClick={onClick} className={cls} role="menuitem">
      <span className="text-muted">{icon}</span>
      <span>{label}</span>
    </button>
  )
}

function CopyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

function ExternalIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  )
}

function LogoutIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  )
}


function LogoMark() {
  return (
    <>
      <img
        src={`${import.meta.env.BASE_URL}icon-dark.svg`}
        alt=""
        width={26}
        height={26}
        className="block dark:hidden rounded-[5px]"
        aria-hidden="true"
      />
      <img
        src={`${import.meta.env.BASE_URL}icon-light.svg`}
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
