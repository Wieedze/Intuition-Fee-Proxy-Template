import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  // `VITE_BASE` is injected by CI (GitHub Action → "/Intuition-Proxy-Factory/").
  // Dev / local build default to "/" so nothing changes day-to-day.
  base: process.env.VITE_BASE ?? '/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
  },
})
