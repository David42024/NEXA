import React from 'react'
import { useTheme } from '../hooks/useTheme'

const BASE = 'flex h-9 w-9 items-center justify-center rounded-lg border transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-cyan-400/40 '
const SURFACE = 'border-slate-200 bg-white text-slate-500 shadow-sm hover:border-cyan-400 hover:text-cyan-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-white/60 dark:hover:border-cyan-400/40 dark:hover:text-cyan-300'
const SIDEBAR = 'border-white/10 bg-white/[0.03] text-white/60 hover:border-cyan-400/40 hover:text-cyan-300'

function SunIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  )
}

function MoonIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
    </svg>
  )
}

export default function ThemeToggle({ variant = 'surface', className = '' }) {
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === 'dark'

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      title={isDark ? 'Modo claro' : 'Modo oscuro'}
      className={`${BASE}${variant === 'sidebar' ? SIDEBAR : SURFACE} ${className}`}
    >
      {isDark ? <SunIcon className="h-[18px] w-[18px]" /> : <MoonIcon className="h-[18px] w-[18px]" />}
    </button>
  )
}