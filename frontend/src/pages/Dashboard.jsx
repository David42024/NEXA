import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../utils/api'
import { useAuth } from '../context/AuthContext.jsx'
import KpiCard from '../components/KpiCard.jsx'
import ScoreBadge from '../components/ScoreBadge.jsx'

function SearchIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  )
}

function ArrowRightIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  )
}

const FUNNEL_COLORS = [
  'from-cyan-400 to-sky-500',
  'from-sky-400 to-blue-500',
  'from-blue-400 to-blue-600',
  'from-cyan-500 to-cyan-600',
  'from-sky-500 to-blue-700',
]

function ClientListSkeleton() {
  return (
    <div className="space-y-3">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="flex animate-pulse items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-slate-200 dark:bg-navy-700" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3.5 w-1/3 rounded bg-slate-200 dark:bg-navy-700" />
            <div className="h-3 w-1/4 rounded bg-slate-200 dark:bg-navy-700" />
          </div>
          <div className="h-4 w-16 rounded bg-slate-200 dark:bg-navy-700" />
        </div>
      ))}
    </div>
  )
}

function FunnelSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="space-y-1.5">
          <div className="flex justify-between">
            <div className="h-3 w-24 rounded bg-slate-200 dark:bg-navy-700" />
            <div className="h-3 w-12 rounded bg-slate-200 dark:bg-navy-700" />
          </div>
          <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-navy-700" />
        </div>
      ))}
    </div>
  )
}

function AsesoresSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-slate-200 dark:bg-navy-700" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-1/3 rounded bg-slate-200 dark:bg-navy-700" />
            <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-navy-700" />
          </div>
          <div className="h-4 w-16 rounded bg-slate-200 dark:bg-navy-700" />
        </div>
      ))}
    </div>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const isAsesor = user?.role === 'asesor'
  const [kpis, setKpis] = useState(null)
  const [funnel, setFunnel] = useState(null)
  const [clients, setClients] = useState([])
  const [asesores, setAsesores] = useState(null)
  const [asesoresMeta, setAsesoresMeta] = useState(4)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [clientsError, setClientsError] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const kpiRes = api.get('/api/admin/kpis').catch(() => ({ data: null }))
        // El funnel y el desempeño de asesores son métricas de supervisión: el asesor no los consume.
        const funnelRes = isAsesor
          ? Promise.resolve({ data: null })
          : api.get('/api/funnel/daily').catch(() => ({ data: null }))
        const asesoresRes = isAsesor
          ? Promise.resolve({ data: null })
          : api.get('/api/admin/asesores').catch(() => null)
        const clientsRes = api.get('/api/clients/search?q=C0').catch(() => null)
        const [k, f, a, c] = await Promise.all([kpiRes, funnelRes, asesoresRes, clientsRes])
        setKpis(k.data)
        setFunnel(f.data)
        setAsesores(a?.data?.asesores || null)
        setAsesoresMeta(a?.data?.meta_ventas ?? 4)
        setClients(c?.data?.results?.slice(0, 6) || [])
        setClientsError(!c)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [isAsesor])

  function handleSearch(e) {
    e.preventDefault()
    if (query.trim()) navigate(`/clientes?q=${encodeURIComponent(query.trim())}`)
  }

  const card = 'rounded-2xl border border-slate-200/80 bg-white p-6 transition-colors duration-200 dark:border-white/5 dark:bg-navy-800/60'

  return (
    <div className="space-y-6">
      {/* Header + buscador */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="label-eyebrow">Dashboard</p>
          <h1 className="mt-1 font-display text-2xl font-bold text-navy-900 dark:text-white">
            Hola, {user?.name?.split(' ')[0] || 'Usuario'}
          </h1>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            Estos son tus números y clientes priorizados
          </p>
        </div>
        <form onSubmit={handleSearch} className="flex w-full gap-2 md:w-auto">
          <div className="relative flex-1 md:w-72">
            <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar cliente por ID, nombre o DNI…"
              className="input pl-10"
            />
          </div>
          <button
            type="submit"
            className="flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-cyan-500 px-4 py-2 font-medium text-navy-950 transition-colors duration-200 hover:bg-cyan-400"
          >
            Buscar
            <ArrowRightIcon className="h-4 w-4" />
          </button>
        </form>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon="👥" label="Clientes" value={loading ? '…' : kpis?.total_clientes ?? '—'} accent="blue" loading={loading} />
        <KpiCard icon="🎯" label="Elegibles MT" value={loading ? '…' : kpis?.elegibles_mt ?? '—'} accent="cyan" loading={loading} />
        <KpiCard icon="📈" label="Conversión" value={loading ? '…' : `${kpis?.conversion_pct ?? 0}%`} accent="cyan" loading={loading} />
        <KpiCard icon="💰" label="Valor potencial" value={loading ? '…' : `S/ ${kpis?.valor_potencial_soles?.toLocaleString('es-PE') ?? 0}`} accent="navy" loading={loading} />
      </div>

      {/* Clientes / Asesores + Funnel */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {isAsesor ? (
        /* Clientes priorizados (vista asesor) */
        <section className={`animate-nexa-rise ${card} lg:col-span-3`}>
          <div className="mb-4 flex items-center justify-between">
            <p className="label-eyebrow">Clientes priorizados</p>
            <button
              onClick={() => navigate('/clientes')}
              className="text-sm font-medium text-cyan-600 transition-colors hover:text-cyan-500 dark:text-cyan-400"
            >
              Ver todos →
            </button>
          </div>

          {loading ? (
            <ClientListSkeleton />
          ) : clientsError ? (
            <p className="text-sm text-slate-400">
              No se pudieron cargar los clientes priorizados.
            </p>
          ) : clients.length === 0 ? (
            <p className="text-sm text-slate-400">No hay clientes priorizados por ahora.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-white/5">
              {clients.map((c) => (
                <button
                  key={c.id}
                  onClick={() => navigate(`/clientes/${c.id}`)}
                  className="group -mx-2 flex w-full items-center justify-between rounded-lg px-2 py-3 text-left transition-colors duration-200 hover:bg-slate-50 dark:hover:bg-white/5"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy-900/5 font-display text-sm font-semibold text-navy-800 dark:bg-white/10 dark:text-white">
                      {c.name?.[0] || '?'}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-navy-900 dark:text-white">{c.name}</p>
                      <p className="truncate font-mono text-xs text-slate-400">
                        {c.id} · {c.district || 'Sin distrito'}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {c.elegible && (
                      <span className="badge bg-cyan-500/10 text-cyan-600 dark:bg-cyan-400/10 dark:text-cyan-300">
                        Elegible
                      </span>
                    )}
                    <ScoreBadge value={c.score} />
                    <span className="hidden text-sm font-medium text-cyan-600 transition-colors group-hover:text-cyan-500 sm:block dark:text-cyan-400">
                      Ver perfil →
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
        ) : (
        /* Desempeño de asesores (vista supervisor/admin) */
        <section className={`animate-nexa-rise ${card} lg:col-span-2`}>
          <div className="mb-4 flex items-center justify-between">
            <p className="label-eyebrow">Desempeño de asesores · este mes</p>
            <span className="text-xs text-slate-400">Meta: {asesoresMeta} ventas/mes</span>
          </div>

          {loading || !asesores ? (
            <AsesoresSkeleton />
          ) : asesores.length === 0 ? (
            <p className="text-sm text-slate-400">No hay asesores registrados.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-white/5">
              {asesores.map((a) => (
                <div key={a.id} className="flex items-center gap-3 py-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy-900/5 font-display text-sm font-semibold text-navy-800 dark:bg-white/10 dark:text-white">
                    {a.name?.[0] || '?'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-navy-900 dark:text-white">{a.name}</p>
                      {a.cumplido ? (
                        <span className="badge bg-emerald-500/10 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-300">
                          Cumplido
                        </span>
                      ) : (
                        <span className="badge bg-amber-500/10 text-amber-600 dark:bg-amber-400/10 dark:text-amber-300">
                          En curso
                        </span>
                      )}
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-navy-700">
                        <div
                          className={`h-full rounded-full bg-gradient-to-r ${
                            a.cumplido ? 'from-emerald-400 to-green-500' : 'from-cyan-400 to-sky-500'
                          }`}
                          style={{ width: `${Math.min(a.progreso, 100)}%`, transition: 'width 0.6s ease' }}
                        />
                      </div>
                      <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                        {a.ventas}/{a.meta_ventas} ventas
                      </span>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-display text-lg font-bold text-navy-900 dark:text-white">{a.ventas}</p>
                    <p className="text-xs text-slate-400">{a.ofrecimientos} ofrec.</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
        )}

        {/* Funnel (solo supervisión) */}
        {!isAsesor && (
        <section className={`animate-nexa-rise ${card} [animation-delay:60ms]`}>
          <div className="mb-4 flex items-center justify-between">
            <p className="label-eyebrow">Funnel · últimos 7 días</p>
            <button
              onClick={() => navigate('/funnel')}
              className="text-sm font-medium text-cyan-600 transition-colors hover:text-cyan-500 dark:text-cyan-400"
            >
              Ver funnel →
            </button>
          </div>
          {loading || !funnel ? (
            <FunnelSkeleton />
          ) : (
            <div className="space-y-4">
              {funnel.stages.map((s, i) => {
                const max = funnel.stages[0]?.value || 1
                const pct = max > 0 ? Math.round((s.value / max) * 100) : 0
                const width = Math.max(pct, 4)
                return (
                  <div key={s.label}>
                    <div className="mb-1 flex items-baseline justify-between text-xs">
                      <span className="text-slate-500 dark:text-slate-400">{s.label}</span>
                      <span className="font-mono font-medium text-navy-800 dark:text-white">
                        {s.value.toLocaleString('es-PE')}
                        <span className="ml-1 text-slate-400">({pct}%)</span>
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-navy-700">
                      <div
                        className={`h-full rounded-full bg-gradient-to-r ${FUNNEL_COLORS[i % FUNNEL_COLORS.length]}`}
                        style={{ width: `${width}%`, transition: 'width 0.6s ease' }}
                      />
                    </div>
                  </div>
                )
              })}
              <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-white/5">
                <span className="text-xs text-slate-500 dark:text-slate-400">Tasa de conversión</span>
                <span className="font-display text-lg font-bold text-cyan-600 dark:text-cyan-400">
                  {funnel.conversion_rate}%
                </span>
              </div>
            </div>
          )}
        </section>
        )}
      </div>
    </div>
  )
}