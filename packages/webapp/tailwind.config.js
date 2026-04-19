/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Geist', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['Geist Mono', 'JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      colors: {
        canvas: 'rgb(var(--canvas) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        'surface-hover': 'rgb(var(--surface-hover) / <alpha-value>)',
        'surface-elevated': 'rgb(var(--surface-elevated) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        'line-strong': 'rgb(var(--line-strong) / <alpha-value>)',
        ink: 'rgb(var(--ink) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
        subtle: 'rgb(var(--subtle) / <alpha-value>)',
        brand: {
          DEFAULT: 'rgb(var(--brand) / <alpha-value>)',
          hover: 'rgb(var(--brand-hover) / <alpha-value>)',
        },
      },
      boxShadow: {
        xs: 'var(--shadow-xs)',
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
      },
      animation: {
        'fade-in': 'fade-in 0.4s ease-out',
        'proxy-wheel': 'proxy-wheel 10s cubic-bezier(0.3, 0, 0.15, 1) infinite',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'proxy-wheel': {
          '0%, 44%': {
            transform: 'translate3d(0, 0%, 0)',
            filter: 'blur(0)',
          },
          '46%': { filter: 'blur(5px)' },
          '48%': { transform: 'translate3d(0, -34.2%, 0)' },
          '50%, 94%': {
            transform: 'translate3d(0, -33.3333%, 0)',
            filter: 'blur(0)',
          },
          '96%': { filter: 'blur(5px)' },
          '98%': { transform: 'translate3d(0, -67.56%, 0)' },
          '100%': {
            transform: 'translate3d(0, -66.6667%, 0)',
            filter: 'blur(0)',
          },
        },
      },
    },
  },
  plugins: [],
}
