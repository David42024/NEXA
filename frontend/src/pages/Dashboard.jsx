import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../utils/api'
import { useAuth } from '../context/AuthContext.jsx'
import { Phone, Target, Users, ArrowRight, Zap, TrendingUp, DollarSign, Droplets, PhoneCall, Award, Clock, Shield, Banknote } from 'lucide-react'

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const isAsesor = user?.role === 'asesor'
  const [kpis, setKpis] = useState(null)
  const [progreso, setProgreso] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const kpiRes = api.get('/api/admin/kpis').catch(() => ({ data: null }))
        const progresoRes = isAsesor
          ? api.get('/api/asesor/progreso').catch(() => null)
          : Promise.resolve({ data: null })
        const [k, p] = await Promise.all([kpiRes, progresoRes])
        setKpis(k.data)
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
        {[
          { Icon: Users, label: 'Clientes', value: loading ? '…' : kpis?.total_clientes ?? '—', sub: 'cartera total', gradient: 'from-sky-500 to-blue-600', shadow: 'shadow-blue-500/20' },
          { Icon: Zap, label: 'Elegibles MT', value: loading ? '…' : kpis?.elegibles_mt ?? '—', sub: 'con Movistar Total', gradient: 'from-cyan-500 to-cyan-600', shadow: 'shadow-cyan-500/20' },
          { Icon: TrendingUp, label: 'Conversion', value: loading ? '…' : `${kpis?.conversion_pct ?? 0}%`, sub: 'aceptadas / contactadas', gradient: 'from-emerald-500 to-teal-500', shadow: 'shadow-emerald-500/20' },
          { Icon: DollarSign, label: 'Valor potencial', value: loading ? '…' : `S/ ${kpis?.valor_potencial_soles?.toLocaleString('es-PE') ?? 0}`, sub: kpis?.elegibles_mt != null ? `${kpis.elegibles_mt} elegibles x S/ 22.3/mes` : 'mensual', gradient: 'from-navy-700 to-navy-800', shadow: 'shadow-navy-500/20' },
        ].map((kpi) => (
          <div key={kpi.label} className="flex items-center gap-5 rounded-2xl border border-black/60 bg-white p-6 transition-colors dark:border-white/60 dark:bg-navy-800/60">
            <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-lg ${kpi.gradient} ${kpi.shadow}`}>
              <kpi.Icon className="h-7 w-7" />
            </div>
            <div className="min-w-0">
              <p className="label-eyebrow">{kpi.label}</p>
              {loading ? (
                <div className="mt-1.5 h-7 w-20 animate-pulse rounded bg-slate-200 dark:bg-navy-700" />
              ) : (
                <p className="mt-0.5 truncate font-display text-3xl font-bold text-navy-900 dark:text-white">
                  {kpi.value}
                </p>
              )}
              {kpi.sub && !loading && <p className="mt-0.5 truncate text-xs text-slate-400">{kpi.sub}</p>}
            </div>
          </div>
        ))}
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
          {/* KPIs Estratégicos — Vista Supervisor */}
          <section className={`animate-nexa-rise ${card}`}>
            <div className="mb-5">
              <p className="label-eyebrow">KPIs Estratégicos</p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Indicadores clave para la toma de decisiones</p>
            </div>

            {/* Predictivos */}
            <div className="mb-6">
              <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-cyan-600 dark:text-cyan-400">
                <Droplets className="h-3.5 w-3.5" /> Predictivos
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex items-center gap-5 rounded-2xl border border-cyan-200 bg-gradient-to-br from-cyan-50 to-white p-6 transition-colors dark:border-cyan-400/20 dark:from-cyan-500/5 dark:to-transparent">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-cyan-600 text-white shadow-lg shadow-cyan-500/20">
                    <Droplets className="h-7 w-7" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-cyan-600 dark:text-cyan-400">Incidencia de Hambre de Datos</p>
                    <p className="mt-0.5 font-display text-3xl font-bold text-navy-900 dark:text-white">53.8%</p>
                    <p className="mt-0.5 truncate text-xs text-slate-400">clientes con consumo al 100% antes de fin de mes</p>
                  </div>
                </div>
                <div className="flex items-center gap-5 rounded-2xl border border-cyan-200 bg-gradient-to-br from-cyan-50 to-white p-6 transition-colors dark:border-cyan-400/20 dark:from-cyan-500/5 dark:to-transparent">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-sky-500 text-white shadow-lg shadow-sky-500/20">
                    <PhoneCall className="h-7 w-7" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-cyan-600 dark:text-cyan-400">Contactabilidad Efectiva</p>
                    <p className="mt-0.5 font-display text-3xl font-bold text-navy-900 dark:text-white">30%</p>
                    <p className="mt-0.5 truncate text-xs text-slate-400">llamadas contestadas en franja horaria recomendada</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Operativos */}
            <div className="mb-6">
              <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                <Award className="h-3.5 w-3.5" /> Operativos
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex items-center gap-5 rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-6 transition-colors dark:border-emerald-400/20 dark:from-emerald-500/5 dark:to-transparent">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/20">
                    <Award className="h-7 w-7" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Tasa de Conversión NBO</p>
                    <p className="mt-0.5 font-display text-3xl font-bold text-navy-900 dark:text-white">10.3%</p>
                    <p className="mt-0.5 truncate text-xs text-slate-400">migraciones a Movistar Total / contactados</p>
                  </div>
                </div>
                <div className="flex items-center gap-5 rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-6 transition-colors dark:border-emerald-400/20 dark:from-emerald-500/5 dark:to-transparent">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-green-500 text-white shadow-lg shadow-green-500/20">
                    <Clock className="h-7 w-7" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">TMO (Tiempo Medio de Operación)</p>
                    <p className="mt-0.5 font-display text-3xl font-bold text-navy-900 dark:text-white">—</p>
                    <p className="mt-0.5 truncate text-xs text-slate-400">tiempo promedio por gestión de venta</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Financieros */}
            <div>
              <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                <Banknote className="h-3.5 w-3.5" /> Financieros
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="flex items-center gap-5 rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-6 transition-colors dark:border-amber-400/20 dark:from-amber-500/5 dark:to-transparent">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-500/20">
                    <TrendingUp className="h-7 w-7" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-amber-600 dark:text-amber-400">Crecimiento del ARPU</p>
                    <p className="mt-0.5 font-display text-3xl font-bold text-navy-900 dark:text-white">+ S/ 57</p>
                    <p className="mt-0.5 truncate text-xs text-slate-400">incremento mensual por usuario</p>
                  </div>
                </div>
                <div className="flex items-center gap-5 rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-6 transition-colors dark:border-amber-400/20 dark:from-amber-500/5 dark:to-transparent">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-yellow-500 text-white shadow-lg shadow-yellow-500/20">
                    <Shield className="h-7 w-7" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-amber-600 dark:text-amber-400">Salvataje de Churn</p>
                    <p className="mt-0.5 font-display text-3xl font-bold text-navy-900 dark:text-white">1.4%</p>
                    <p className="mt-0.5 truncate text-xs text-slate-400">clientes en riesgo retenidos</p>
                  </div>
                </div>
                <div className="flex items-center gap-5 rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-6 transition-colors dark:border-amber-400/20 dark:from-amber-500/5 dark:to-transparent">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-600 to-orange-600 text-white shadow-lg shadow-orange-500/20">
                    <DollarSign className="h-7 w-7" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-amber-600 dark:text-amber-400">Expansión de MRR</p>
                    <p className="mt-0.5 font-display text-3xl font-bold text-navy-900 dark:text-white">S/ 1.7M</p>
                    <p className="mt-0.5 truncate text-xs text-slate-400">nuevos ingresos mensuales recurrentes</p>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </>
      )}

      {/* Footer */}
      <div className="mt-8 flex flex-col items-center gap-4 rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white px-6 py-8 text-center dark:border-white/60 dark:from-navy-800/60 dark:to-navy-900/60 sm:flex-row sm:justify-center sm:gap-6">
        <img src="/nexa-logo2.png" alt="NEXA" className="h-10 w-auto object-contain" />
        <div className="hidden h-8 w-px bg-slate-200 dark:bg-white/10 sm:block" />
        <img src="/movistar.png" alt="Movistar" className="h-8 w-auto object-contain" />
      </div>
      <p className="mt-4 text-center text-xs text-slate-400 dark:text-slate-500">
        Potenciado por <span className="font-semibold text-navy-800 dark:text-white">NEXA</span> · Impulsado por la inteligencia de{' '}
        <span className="font-semibold text-cyan-600 dark:text-cyan-400">Movistar</span>
      </p>
      <p className="mt-1 text-center text-[11px] text-slate-300 dark:text-slate-600">
        Transformando la experiencia de ventas con datos, IA y pasion por conectar.
      </p>
    </div>
  )
}