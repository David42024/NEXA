import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../utils/api'
import { useAuth } from '../context/AuthContext.jsx'
import KpiCard from '../components/KpiCard.jsx'
import { Phone, Target, Users, ArrowRight } from 'lucide-react'

const FUNNEL_COLORS = [
  'from-cyan-400 to-sky-500',
  'from-sky-400 to-blue-500',
  'from-blue-400 to-blue-600',
  'from-cyan-500 to-cyan-600',
  'from-sky-500 to-blue-700',
]

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const isAsesor = user?.role === 'asesor'
  const [kpis, setKpis] = useState(null)
  const [funnel, setFunnel] = useState(null)
  const [asesores, setAsesores] = useState(null)
  const [asesoresMeta, setAsesoresMeta] = useState(4)
  const [progreso, setProgreso] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const kpiRes = api.get('/api/admin/kpis').catch(() => ({ data: null }))
        const funnelRes = isAsesor
          ? Promise.resolve({ data: null })
          : api.get('/api/funnel/daily').catch(() => ({ data: null }))
        const asesoresRes = isAsesor
          ? Promise.resolve({ data: null })
          : api.get('/api/admin/asesores').catch(() => null)
        const progresoRes = isAsesor
          ? api.get('/api/asesor/progreso').catch(() => null)
          : Promise.resolve({ data: null })
        const [k, f, a, p] = await Promise.all([kpiRes, funnelRes, asesoresRes, progresoRes])
        setKpis(k.data)
        setFunnel(f.data)
        setAsesores(a?.data?.asesores || null)
        setAsesoresMeta(a?.data?.meta_ventas ?? 60)
        setProgreso(p?.data || null)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [isAsesor])

  const card = 'rounded-2xl border border-black/60 bg-white p-6 transition-colors duration-200 dark:border-white/60 dark:bg-navy-800/60'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="label-eyebrow">Dashboard</p>
          <h1 className="mt-1 font-display text-2xl font-bold text-navy-900 dark:text-white">
            Hola, {user?.name?.split(' ')[0] || 'Usuario'}
          </h1>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            {isAsesor ? 'Resumen de tu cartera y progreso' : 'Estos son los numeros del equipo'}
          </p>
        </div>
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
          icon="📈" label="Conversion" accent="emerald"
          value={loading ? '…' : `${kpis?.conversion_pct ?? 0}%`}
          sublabel="aceptadas / contactadas"
          loading={loading}
        />
        <KpiCard
          icon="💰" label="Valor potencial" accent="navy"
          value={loading ? '…' : `S/ ${kpis?.valor_potencial_soles?.toLocaleString('es-PE') ?? 0}`}
          sublabel={kpis?.elegibles_mt != null ? `${kpis.elegibles_mt} elegibles x S/ 22.3/mes` : 'mensual'}
          loading={loading}
        />
      </div>

      {isAsesor ? (
        <>
          {/* CTA para el asesor */}
          <section className={`animate-nexa-rise ${card}`}>
            <div className="flex flex-col items-center gap-6 py-4 sm:flex-row sm:items-start">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-500 text-white shadow-lg shadow-cyan-500/20">
                <Phone className="h-8 w-8" />
              </div>
              <div className="flex-1 text-center sm:text-left">
                <h2 className="font-display text-lg font-bold text-navy-900 dark:text-white">
                  {progreso?.ventas_dia > 0
                    ? `Llevas ${progreso.ventas_dia} venta${progreso.ventas_dia === 1 ? '' : 's'} hoy`
                    : 'Empieza tu jornada de ventas'}
                </h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {progreso?.ventas_dia > 0
                    ? 'Excelente ritmo. Revisa tu cartera priorizada para seguir cerrando.'
                    : 'Tienes clientes elegibles esperando. Revisa tu cartera priorizada y contacta a los que estan llamables ahora.'}
                </p>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-3 sm:justify-start">
                  <button
                    onClick={() => navigate('/clientes')}
                    className="btn-primary flex items-center gap-2 text-sm"
                  >
                    <Users className="h-4 w-4" />
                    Ver mi cartera
                    <ArrowRight className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => navigate('/metas')}
                    className="btn-secondary flex items-center gap-2 text-sm"
                  >
                    <Target className="h-4 w-4" />
                    Ver mis metas
                  </button>
                </div>
              </div>
              {progreso && (
                <div className="hidden shrink-0 rounded-xl border border-slate-200 bg-slate-50 px-5 py-4 text-center dark:border-white/10 dark:bg-white/5 sm:block">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">Meta del dia</p>
                  <p className="mt-1 font-display text-3xl font-bold text-navy-900 dark:text-white">
                    {progreso.ventas_dia}<span className="text-lg text-slate-400">/{progreso.meta_diaria}</span>
                  </p>
                  <div className="mt-2 h-2 w-24 overflow-hidden rounded-full bg-slate-200 dark:bg-navy-700">
                    <div
                      className={`h-full rounded-full bg-gradient-to-r ${
                        progreso.ventas_dia >= progreso.meta_diaria ? 'from-emerald-400 to-green-500' : 'from-cyan-400 to-sky-500'
                      }`}
                      style={{ width: `${Math.min(progreso.progreso_dia_pct, 100)}%`, transition: 'width 0.6s ease' }}
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-slate-400">{Math.round(progreso.progreso_dia_pct)}% completado</p>
                </div>
              )}
            </div>
          </section>
        </>
      ) : (
        <>
          {/* Desempeño de asesores (vista supervisor/admin) */}
          <section className={`animate-nexa-rise ${card}`}>
            <div className="mb-4 flex items-center justify-between">
              <p className="label-eyebrow">Desempeno de asesores - este mes</p>
              <span className="text-xs text-slate-400">Meta: {asesoresMeta} ventas/mes</span>
            </div>

            {loading || !asesores ? (
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

          {/* Funnel */}
          <section className={`animate-nexa-rise ${card} [animation-delay:60ms]`}>
            <div className="mb-4 flex items-center justify-between">
              <p className="label-eyebrow">Funnel - ultimos 7 dias</p>
              <button
                onClick={() => navigate('/funnel')}
                className="text-sm font-medium text-cyan-600 transition-colors hover:text-cyan-500 dark:text-cyan-400"
              >
                Ver funnel →
              </button>
            </div>
            {loading || !funnel ? (
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
                  <span className="text-xs text-slate-500 dark:text-slate-400">Tasa de conversion</span>
                  <span className="font-display text-lg font-bold text-cyan-600 dark:text-cyan-400">
                    {funnel.conversion_rate}%
                  </span>
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}