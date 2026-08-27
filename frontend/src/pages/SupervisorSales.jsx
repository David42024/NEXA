import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../utils/api'
import { useAuth } from '../context/AuthContext.jsx'
import { Phone, Target, Users, ArrowRight, Zap, TrendingUp, DollarSign } from 'lucide-react'

export default function SupervisorSales() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [kpis, setKpis] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/api/admin/kpis')
      .then(({ data }) => setKpis(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const card = 'rounded-2xl border border-black/60 bg-white p-6 transition-colors duration-200 dark:border-white/60 dark:bg-navy-800/60'

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="label-eyebrow">Dashboard</p>
          <h1 className="mt-1 font-display text-2xl font-bold text-navy-900 dark:text-white">
            Hola, {user?.name?.split(' ')[0] || 'Supervisor'}
          </h1>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            Estos son los numeros del equipo
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

      {/* CTA */}
      <section className={`animate-nexa-rise ${card}`}>
        <div className="flex flex-col items-center gap-6 py-4 sm:flex-row sm:items-start">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-500 text-white shadow-lg shadow-cyan-500/20">
            <Phone className="h-8 w-8" />
          </div>
          <div className="flex-1 text-center sm:text-left">
            <h2 className="font-display text-lg font-bold text-navy-900 dark:text-white">
              Vista general del equipo
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Supervisa el desempeno de tus asesores, revisa los KPIs estrategicos y acompana las ventas en tiempo real.
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-3 sm:justify-start">
              <button
                onClick={() => navigate('/supervisor/ventas-detalle')}
                className="btn-primary flex items-center gap-2 text-sm"
              >
                <TrendingUp className="h-4 w-4" />
                Ver analisis de ventas
                <ArrowRight className="h-4 w-4" />
              </button>
              <button
                onClick={() => navigate('/supervisor/mapa-calor')}
                className="btn-secondary flex items-center gap-2 text-sm"
              >
                <Target className="h-4 w-4" />
                Mapa de calor
              </button>
            </div>
          </div>
        </div>
      </section>

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
