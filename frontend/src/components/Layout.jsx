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

  const navLinkClass = ({ isActive }) =>
    `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
      isActive
        ? 'bg-cyan-500/10 text-cyan-600 dark:bg-cyan-500/15 dark:text-cyan-300'
        : 'text-slate-500 hover:bg-slate-100 hover:text-navy-900 dark:text-white/70 dark:hover:bg-white/5 dark:hover:text-white'
    }`

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

      {/* Menú móvil compacto: se despliega bajo la barra superior en vez de ocupar toda la pantalla */}
      {menuOpen && (
        <div className="lg:hidden">
          <div
            className="fixed inset-0 z-40 bg-navy-950/40"
            onClick={() => setMenuOpen(false)}
            aria-hidden
          />
          <div className="fixed inset-x-3 top-[4.25rem] z-50 max-h-[calc(100vh-5rem)] overflow-y-auto rounded-2xl border border-slate-200/80 bg-white p-3 shadow-2xl dark:border-white/10 dark:bg-navy-900 dark:text-white">
            <div className="mb-1 flex items-center justify-between px-2 pb-2">
              <p className="label-eyebrow">Menú</p>
              <button
                aria-label="Cerrar menú"
                onClick={() => setMenuOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 dark:text-white/60 dark:hover:bg-white/10"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-5 w-5">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <nav className="space-y-1">
              {items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  onClick={() => setMenuOpen(false)}
                  className={navLinkClass}
                >
                  <span className="w-5 text-center text-base">{item.icon}</span>
                  {item.label}
                </NavLink>
              ))}
            </nav>
            <div className="mt-2 flex items-center justify-between gap-3 border-t border-slate-200/70 px-2 pt-3 dark:border-white/10">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy-900/5 font-display text-sm font-semibold dark:bg-white/10 dark:text-white">
                  {user?.name?.[0] || '?'}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{user?.name}</p>
                  <p className="text-[11px] capitalize text-slate-400 dark:text-white/40">{user?.role}</p>
                </div>
              </div>
              <button
                onClick={() => { logout(); navigate('/login') }}
                className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-400 transition-colors hover:bg-slate-100 hover:text-navy-900 dark:hover:bg-white/5 dark:hover:text-white"
              >
                Cerrar sesión
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar fija en desktop */}
      <aside className="hidden w-64 shrink-0 flex-col overflow-y-auto border-r border-slate-200/80 bg-white text-navy-900 lg:sticky lg:top-0 lg:flex lg:h-screen dark:border-white/10 dark:bg-navy-900 dark:text-white">
        <div className="flex items-center justify-between border-b border-slate-200/70 px-6 py-6 dark:border-white/10">
          <div className="flex items-center gap-2">
            <img src="/nexa-logo.png" alt="Logo NEXA" className="h-8 w-auto shrink-0 rounded-md object-contain shadow-sm" />
            <div>
              <p className="font-display font-bold leading-none tracking-tight">NEXA</p>
              <p className="text-[10px] tracking-wide text-slate-400 dark:text-white/40">Next Experience & Offer AI</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-5">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={navLinkClass}
            >
              <span className="w-5 text-center text-base">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-slate-200/70 px-4 py-4 dark:border-white/10">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-3 px-2 py-1">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-navy-900/5 font-display text-sm font-semibold dark:bg-white/10 dark:text-white">
                {user?.name?.[0] || '?'}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{user?.name}</p>
                <p className="text-[11px] capitalize text-slate-400 dark:text-white/40">{user?.role}</p>
              </div>
            </div>
            <div className="hidden lg:block"><ThemeToggle /></div>
          </div>
          <button
            onClick={() => { logout(); navigate('/login') }}
            className="mt-2 w-full rounded px-2 py-1.5 text-left text-xs text-slate-400 transition-colors hover:text-navy-900 dark:text-white/50 dark:hover:text-white"
          >
            Cerrar sesión
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-10 lg:py-8">{children}</div>
      </main>
    </div>
  )
}