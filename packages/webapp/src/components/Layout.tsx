import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { ConnectButton } from '@rainbow-me/rainbowkit'

const NAV_ITEMS = [
  { to: '/', label: 'Home', end: true },
  { to: '/deploy', label: 'Deploy' },
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
        <div className="mx-auto max-w-6xl px-6 h-14 flex items-center justify-between gap-6">
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
            <ConnectButton
              accountStatus="address"
              chainStatus="icon"
              showBalance={false}
            />
          </div>
        </div>
      </header>

      <main className="flex-1">
        <div className="mx-auto max-w-6xl px-6 py-14 animate-fade-in">
          <Outlet />
        </div>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto max-w-6xl px-6 py-6 flex items-center justify-between text-xs text-subtle">
          <span>Fee layer for the Intuition MultiVault.</span>
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
              href="https://github.com/0xIntuition"
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
    <Link to="/" className="flex items-center gap-2.5 shrink-0 group">
      <LogoMark />
      <div className="flex items-baseline gap-1.5">
        <span className="font-semibold text-[15px] tracking-tight text-ink">
          Intuition
        </span>
        <span className="font-normal text-[15px] text-muted tracking-tight">
          Proxy Factory
        </span>
        <span className="ml-0.5 rounded-sm border border-line px-1 py-px text-[9px] font-mono font-medium text-subtle leading-none translate-y-[-1px]">
          v2
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
        className={`absolute left-0 right-0 -bottom-[17px] h-px bg-ink transition-opacity ${
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

function LogoMark() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="1.25"
        className="text-ink opacity-90"
      />
      <circle cx="12" cy="12" r="3.25" className="fill-brand" />
    </svg>
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
