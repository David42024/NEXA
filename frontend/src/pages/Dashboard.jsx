import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Flame, AlertTriangle, BatteryWarning, Smartphone, Users } from 'lucide-react'
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

// Segmentos estratégicos del asesor: definición visual + etiqueta corta para el chip del cliente.
const SEGMENT_DEFS = {
  Todos: {
    label: 'Todos',
    icon: Users,
    chipActive: 'bg-navy-900 text-white border-navy-900 dark:bg-white dark:text-navy-900 dark:border-white',
    pill: 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300',
  },
  Oro: {
    label: 'Oro Convergente',
    icon: Flame,
    chipActive: 'bg-emerald-600 text-white border-emerald-600',
    pill: 'bg-emerald-500/10 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-300',
  },
  Alerta: {
    label: 'Alerta Roja',
    icon: AlertTriangle,
    chipActive: 'bg-rose-600 text-white border-rose-600',
    pill: 'bg-rose-500/10 text-rose-600 dark:bg-rose-400/10 dark:text-rose-300',
  },
  Gigas: {
    label: 'Hambrientos de Datos',
    icon: BatteryWarning,
    chipActive: 'bg-amber-500 text-navy-900 border-amber-500 dark:text-white',
    pill: 'bg-amber-500/10 text-amber-600 dark:bg-amber-400/10 dark:text-amber-300',
  },
  Digital: {
    label: 'Nativos Digitales',
    icon: Smartphone,
    chipActive: 'bg-blue-600 text-white border-blue-600',
    pill: 'bg-blue-500/10 text-blue-600 dark:bg-blue-400/10 dark:text-blue-300',
  },
}

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

function MetaRow({ label, ventas, meta, pct, falta }) {
  const cumplida = ventas >= meta
  const pctClamped = Math.min(pct, 100)
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
        {cumplida && (
          <span className="badge bg-emerald-500/10 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-300">
            ✓ Meta cumplida
          </span>
        )}
      </div>
      <p className="font-display text-2xl font-bold text-navy-900 dark:text-white sm:text-3xl">
        {ventas}
        <span className="ml-2 text-sm font-medium text-slate-400">de {meta} ventas</span>
      </p>
      <div className="mt-2 flex items-center gap-2">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-navy-700">
          <div
            className={`h-full rounded-full bg-gradient-to-r ${
              cumplida ? 'from-emerald-400 to-green-500' : 'from-cyan-400 to-sky-500'
            }`}
            style={{ width: `${pctClamped}%`, transition: 'width 0.6s ease' }}
          />
        </div>
        <span className="font-mono text-xs text-slate-500 dark:text-slate-400">{pctClamped}%</span>
      </div>
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
        Te faltan <span className="font-medium text-navy-800 dark:text-white">{Math.max(meta - ventas, 0)}</span>{' '}
        ventas para cumplir la meta {falta}.
      </p>
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
  const [progreso, setProgreso] = useState(null)
  const [segmentos, setSegmentos] = useState([])
  const [segFiltro, setSegFiltro] = useState('Todos')
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
        const progresoRes = isAsesor
          ? api.get('/api/asesor/progreso').catch(() => null)
          : Promise.resolve({ data: null })
        // El asesor ve SU cartera categorizada en segmentos estratégicos (referencia del panel gerencial).
        const clientsRes = isAsesor
          ? api.get('/api/asesor/priorizados').catch(() => null)
          : Promise.resolve({ data: null })
        const [k, f, a, p, c] = await Promise.all([kpiRes, funnelRes, asesoresRes, progresoRes, clientsRes])
        setKpis(k.data)
        setFunnel(f.data)
        setAsesores(a?.data?.asesores || null)
        setAsesoresMeta(a?.data?.meta_ventas ?? 60)
        setProgreso(p?.data || null)
        setSegmentos(c?.data?.segmentos || [])
        setClients(c?.data?.clientes || [])
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

  const clientesFiltrados = segFiltro === 'Todos' ? clients : clients.filter((cl) => cl.segmento === segFiltro)

  const card = 'rounded-2xl border border-black/60 bg-white p-6 transition-colors duration-200 dark:border-white/60 dark:bg-navy-800/60'

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
          <div className="relative flex-1 md:w-48 lg:w-96">
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
            className="flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-cyan-500 px-4 py-2 font-medium text-navy-950 transition-colors duration-200 hover:bg-cyan-400 dark:text-white"
          >
            Buscar
            <ArrowRightIcon className="h-4 w-4" />
          </button>
        </form>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon="👥" label="Clientes" accent="blue"
          value={loading ? '…' : kpis?.total_clientes ?? '—'}
          sublabel="cartera total"
          loading={loading}
        />
        <KpiCard
          icon="🎯" label="Elegibles MT" accent="cyan"
          value={loading ? '…' : kpis?.elegibles_mt ?? '—'}
          sublabel="con Movistar Total"
          loading={loading}
        />
        <KpiCard
          icon="📈" label="Conversión" accent="emerald"
          value={loading ? '…' : `${kpis?.conversion_pct ?? 0}%`}
          sublabel="aceptadas / contactadas"
          loading={loading}
        />
        <KpiCard
          icon="💰" label="Valor potencial" accent="navy"
          value={loading ? '…' : `S/ ${kpis?.valor_potencial_soles?.toLocaleString('es-PE') ?? 0}`}
          sublabel={kpis?.elegibles_mt != null ? `${kpis.elegibles_mt} elegibles × S/ 22.3/mes` : 'mensual'}
          loading={loading}
        />
      </div>

      {/* Clientes / Asesores + Funnel */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {isAsesor ? (
        <>
        {/* Clientes priorizados (vista asesor) */}
        <section className={`animate-nexa-rise ${card} lg:col-span-2`}>
          <div className="mb-4 flex items-center justify-between">
            <p className="label-eyebrow">Clientes priorizados</p>
            <button
              onClick={() => navigate('/clientes')}
              className="text-sm font-medium text-cyan-600 transition-colors hover:text-cyan-500 dark:text-cyan-400"
            >
              Ver todos →
            </button>
          </div>

          {/* Chips de segmentación estratégica (referencia del panel gerencial) */}
          {segmentos.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-2">
              {segmentos.map((seg) => {
                const def = SEGMENT_DEFS[seg.id]
                if (!def) return null
                const Icon = def.icon
                const active = segFiltro === seg.id
                return (
                  <button
                    key={seg.id}
                    onClick={() => setSegFiltro(seg.id)}
                    className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${
                      active
                        ? def.chipActive
                        : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50 dark:bg-navy-800/60 dark:text-slate-400 dark:border-white/10'
                    }`}
                  >
                    <Icon size={13} />
                    {def.label}
                    <span
                      className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] ${
                        active ? 'bg-white/20' : 'bg-slate-100 dark:bg-navy-700'
                      }`}
                    >
                      {seg.count.toLocaleString('es-PE')}
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          {loading ? (
            <ClientListSkeleton />
          ) : clientsError ? (
            <p className="text-sm text-slate-400">
              No se pudieron cargar los clientes priorizados.
            </p>
          ) : clientesFiltrados.length === 0 ? (
            <p className="text-sm text-slate-400">Sin clientes en este segmento.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-white/5">
              {clientesFiltrados.map((c) => (
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
                        {c.id} · {c.district || 'Sin distrito'} · {c.plan_actual || '—'}
                      </p>
                      {c.mejor_hora && (
                        <p className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">
                          🕒 Mejor hora {c.mejor_hora}
                        </p>
                      )}
                      {c.top_offer && (
                        <p className="mt-0.5 truncate text-[11px] text-cyan-600 dark:text-cyan-400">
                          → {c.top_offer}
                          {c.motivo && !['Elegible MT', 'Elegible upgrade', 'Elegible equipo', 'Elegible Plan Hogar'].includes(c.motivo)
                            ? ` · por ${c.motivo}`
                            : ''}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5 sm:gap-2">
                    {c.segmento && SEGMENT_DEFS[c.segmento] && (
                      <span className={`badge ${SEGMENT_DEFS[c.segmento].pill}`}>{SEGMENT_DEFS[c.segmento].label}</span>
                    )}
                    {c.llamable_ahora && (
                      <span
                        className="badge bg-emerald-500/10 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-300"
                        title="Su mejor hora de atención incluye el horario actual"
                      >
                        Llamable ahora
                      </span>
                    )}
                    {c.elegible && (
                      <span
                        className="badge bg-cyan-500/10 text-cyan-600 dark:bg-cyan-400/10 dark:text-cyan-300"
                        title="Elegible para Movistar Total"
                      >
                        Elegible MT
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

        {/* Mis metas (vista asesor): diaria, semanal y mensual vs config del admin */}
        <section className={`animate-nexa-rise ${card} [animation-delay:60ms]`}>
          <div className="mb-4">
            <p className="label-eyebrow">Mis metas</p>
          </div>

          {loading || !progreso ? (
            <div className="space-y-3 animate-pulse">
              <div className="h-10 w-24 rounded bg-slate-200 dark:bg-navy-700" />
              <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-navy-700" />
              <div className="h-3 w-2/3 rounded bg-slate-200 dark:bg-navy-700" />
            </div>
          ) : (
            <div className="space-y-5">
              <MetaRow
                label="Hoy"
                ventas={progreso.ventas_dia}
                meta={progreso.meta_diaria}
                pct={progreso.progreso_dia_pct}
                falta="de hoy"
              />
              <div className="border-t border-slate-100 dark:border-white/5" />
              <MetaRow
                label="Esta semana"
                ventas={progreso.ventas_semana}
                meta={progreso.meta_semanal}
                pct={progreso.progreso_semana_pct}
                falta="de esta semana"
              />
              <div className="border-t border-slate-100 dark:border-white/5" />
              <MetaRow
                label="Este mes"
                ventas={progreso.ventas_mes}
                meta={progreso.meta_mensual}
                pct={progreso.progreso_mes_pct}
                falta="de este mes"
              />
            </div>
          )}
        </section>
        </>
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