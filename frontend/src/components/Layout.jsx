import React, { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import ThemeToggle from './ThemeToggle.jsx'

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: '◱', permission: 'view_dashboard' },
  { to: '/clientes', label: 'Clientes', icon: '◎', permission: 'search_client' },
  { to: '/funnel', label: 'Funnel', icon: '▤', permission: 'view_funnel' },
  { to: '/admin', label: 'Administración', icon: '⚙', permission: 'manage_roles' },
]

export default function Layout({ children }) {
  const { user, logout, hasPermission } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  const items = NAV_ITEMS.filter((i) => hasPermission(i.permission))

  return (
    <div className="min-h-screen flex bg-surface dark:bg-navy-950">
      {/* Top bar móvil */}
      <header className="sticky top-0 z-30 flex items-center gap-2.5 border-b border-slate-200/80 bg-white px-4 py-2.5 lg:hidden dark:border-white/10 dark:bg-navy-900">
        <button
          aria-label="Abrir menú"
          onClick={() => setMenuOpen(true)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-100 dark:text-white/80 dark:hover:bg-white/10"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-5 w-5">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <img src="/nexa-logo.png" alt="Logo NEXA" className="h-7 w-auto shrink-0 rounded-md object-contain shadow-sm" />
        <span className="font-display font-bold tracking-tight text-navy-900 dark:text-white">NEXA</span>
        <div className="ml-auto"><ThemeToggle /></div>
      </header>

      {/* Backdrop del drawer */}
      {menuOpen && (
        <div
          className="fixed inset-0 z-40 bg-navy-950/50 backdrop-blur-sm lg:hidden"
          onClick={() => setMenuOpen(false)}
        />
      )}

      {/* Sidebar: drawer en móvil, fija en desktop */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 shrink-0 flex-col overflow-y-auto border-r border-slate-200/80 bg-white text-navy-900 transition-transform duration-200 dark:border-white/10 dark:bg-navy-900 dark:text-white lg:static lg:translate-x-0 ${
          menuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-6 py-6 border-b border-slate-200/70 dark:border-white/10">
          <div className="flex items-center gap-2">
            <img src="/nexa-logo.png" alt="Logo NEXA" className="h-8 w-auto shrink-0 rounded-md object-contain shadow-sm" />
            <div>
              <p className="font-display font-bold tracking-tight leading-none">NEXA</p>
              <p className="text-[10px] text-slate-400 tracking-wide dark:text-white/40">Next Experience & Offer AI</p>
            </div>
          </div>
          <button
            aria-label="Cerrar menú"
            onClick={() => setMenuOpen(false)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 lg:hidden dark:text-white/60 dark:hover:bg-white/10"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-5 w-5">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <nav className="flex-1 px-3 py-5 space-y-1">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-cyan-500/10 text-cyan-600 dark:bg-cyan-500/15 dark:text-cyan-300'
                    : 'text-slate-500 hover:bg-slate-100 hover:text-navy-900 dark:text-white/70 dark:hover:bg-white/5 dark:hover:text-white'
                }`
              }
            >
              <span className="text-base w-5 text-center">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="px-4 py-4 border-t border-slate-200/70 dark:border-white/10">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3 px-2 py-1">
              <div className="w-9 h-9 rounded-full bg-navy-900/5 flex items-center justify-center font-display font-semibold text-sm dark:bg-white/10 dark:text-white">
                {user?.name?.[0] || '?'}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{user?.name}</p>
                <p className="text-[11px] text-slate-400 capitalize dark:text-white/40">{user?.role}</p>
              </div>
            </div>
            <div className="hidden lg:block"><ThemeToggle /></div>
          </div>
          <button
            onClick={() => { logout(); navigate('/login') }}
            className="mt-2 w-full text-left text-xs text-slate-400 hover:text-navy-900 px-2 py-1.5 rounded transition-colors dark:text-white/50 dark:hover:text-white"
          >
            Cerrar sesión
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-10 lg:py-8">{children}</div>
      </main>
    </div>
  )
}