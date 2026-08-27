import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, XCircle, AlertTriangle, Shield } from 'lucide-react'
import api from '../utils/api'

function StatCard({ label, value, icon: Icon, color = 'cyan' }) {
  const colors = {
    emerald: 'from-emerald-500 to-teal-500 shadow-emerald-500/20',
    rose: 'from-rose-500 to-rose-600 shadow-rose-500/20',
    blue: 'from-blue-500 to-blue-600 shadow-blue-500/20',
    amber: 'from-amber-500 to-orange-500 shadow-amber-500/20',
  }
  return (
    <div className="flex items-center gap-5 rounded-2xl border border-black/60 bg-white p-6 dark:border-white/60 dark:bg-navy-800/60">
      <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-lg ${colors[color]}`}>
        <Icon className="h-7 w-7" />
      </div>
      <div className="min-w-0">
        <p className="label-eyebrow">{label}</p>
        <p className="mt-0.5 truncate font-display text-3xl font-bold text-navy-900 dark:text-white">{value}</p>
      </div>
    </div>
  )
}

function BarChart({ data, color = 'from-cyan-400 to-sky-500', labelKey = 'name', valueKey = 'count' }) {
  const max = Math.max(...data.map((d) => d[valueKey]), 1)
  return (
    <div className="space-y-3">
      {data.map((d) => {
        const pct = max > 0 ? Math.round((d[valueKey] / max) * 100) : 0
        return (
          <div key={d[labelKey]}>
            <div className="mb-1 flex items-baseline justify-between text-xs">
              <span className="text-slate-500 dark:text-slate-400">{d[labelKey]}</span>
              <span className="font-mono font-medium text-navy-800 dark:text-white">{d[valueKey]}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-navy-700">
              <div
                className={`h-full rounded-full bg-gradient-to-r ${color}`}
                style={{ width: `${Math.max(pct, 2)}%`, transition: 'width 0.6s ease' }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function SupervisorSalesDetail() {
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/api/supervisor/sales-results')
      .then(({ data }) => setData(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const s = data?.summary

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/supervisor/ventas')}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-navy-900 dark:hover:bg-white/5 dark:hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <p className="label-eyebrow">Analisis de ventas</p>
          <h1 className="mt-0.5 font-display text-2xl font-bold text-navy-900 dark:text-white">
            Resultado de venta
          </h1>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loading ? (
          [...Array(4)].map((_, i) => (
            <div key={i} className="animate-pulse rounded-2xl border border-black/60 bg-white p-6 dark:border-white/60 dark:bg-navy-800/60">
              <div className="mb-3 h-14 w-14 rounded-2xl bg-slate-200 dark:bg-navy-700" />
              <div className="h-5 w-20 rounded bg-slate-200 dark:bg-navy-700" />
              <div className="mt-1.5 h-8 w-12 rounded bg-slate-200 dark:bg-navy-700" />
            </div>
          ))
        ) : (
          <>
            <StatCard label="Aceptadas" value={s?.accepted ?? 0} icon={CheckCircle2} color="emerald" />
            <StatCard label="Rechazadas" value={s?.rejected ?? 0} icon={XCircle} color="rose" />
            <StatCard label="Alcanzaron etapa" value={s?.stages_reached ?? 0} icon={AlertTriangle} color="blue" />
            <StatCard label="Manejadas con rebate" value={s?.rebates ?? 0} icon={Shield} color="amber" />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <section className="rounded-2xl border border-black/60 bg-white p-6 dark:border-white/60 dark:bg-navy-800/60">
          <p className="label-eyebrow mb-4">Ofertas mas aceptadas</p>
          {data?.top_offers?.length > 0 ? (
            <BarChart data={data.top_offers} color="from-emerald-400 to-teal-500" />
          ) : (
            <p className="text-sm text-slate-400">Sin datos</p>
          )}
        </section>

        <section className="rounded-2xl border border-black/60 bg-white p-6 dark:border-white/60 dark:bg-navy-800/60">
          <p className="label-eyebrow mb-4">Canales mas efectivos</p>
          {data?.channels?.length > 0 ? (
            <BarChart data={data.channels} color="from-cyan-400 to-sky-500" />
          ) : (
            <p className="text-sm text-slate-400">Sin datos</p>
          )}
        </section>
      </div>

      <section className="rounded-2xl border border-black/60 bg-white p-6 dark:border-white/60 dark:bg-navy-800/60">
        <p className="label-eyebrow mb-4">Motivos de rechazo</p>
        {data?.rejection_reasons?.length > 0 ? (
          <BarChart data={data.rejection_reasons.map((r) => ({ name: r.reason, count: r.count }))} color="from-rose-400 to-rose-500" />
        ) : (
          <p className="text-sm text-slate-400">Sin datos de rechazo</p>
        )}
      </section>
    </div>
  )
}
