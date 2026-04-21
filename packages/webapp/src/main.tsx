import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  RainbowKitProvider,
  darkTheme,
  lightTheme,
} from '@rainbow-me/rainbowkit'

import App from './App'
import { wagmiConfig } from './lib/wagmi'
import './styles.css'
import '@rainbow-me/rainbowkit/styles.css'

const queryClient = new QueryClient()

function Root() {
  const [isDark, setIsDark] = useState<boolean>(
    () =>
      typeof document !== 'undefined' &&
      document.documentElement.classList.contains('dark'),
  )

  useEffect(() => {
    const el = document.documentElement
    const observer = new MutationObserver(() => {
      setIsDark(el.classList.contains('dark'))
    })
    observer.observe(el, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  const theme = isDark
    ? darkTheme({
        accentColor: '#F07A3F',
        accentColorForeground: '#14110e',
        borderRadius: 'medium',
        overlayBlur: 'small',
        fontStack: 'system',
      })
    : lightTheme({
        accentColor: '#D9572F',
        accentColorForeground: '#ffffff',
        borderRadius: 'medium',
        overlayBlur: 'small',
        fontStack: 'system',
      })

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider locale="en-US" theme={theme}>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
)
