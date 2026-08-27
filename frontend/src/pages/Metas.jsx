import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../utils/api'
import { useAuth } from '../context/AuthContext.jsx'
import { Target, ArrowLeft, Phone, TrendingUp, Calendar, Clock } from 'lucide-react'

function MetaRow({ label, ventas, meta, pct, falta, icon: Icon }) {
  const cumplida = ventas >= meta
  const pctClamped = Math.min(pct, 100)
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 transition-colors dark:border-white/10 dark:bg-navy-800/60">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          {Icon && <Icon className={`h-5 w-5 ${cumplida ? 'text-emerald-500' : 'text-cyan-500'}`} />}
          <p className="text-sm font-semibold text-navy-900 dark:text-white">{label}</p>
        </div>
        {cumplida && (
          <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Meta cumplida
          </span>
        )}
      </div>
      <p className="font-display text-4xl font-bold text-navy-900 dark:text-white">
        {ventas}
        <span className="ml-2 text-base font-medium text-slate-400">de {meta} ventas</span>
      </p>
      <div className="mt-3 flex items-center gap-3">
        <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-navy-700">
          <div
            className={`h-full rounded-full bg-gradient-to-r ${
              cumplida ? 'from-emerald-400 to-green-500' : 'from-cyan-400 to-sky-500'
            }`}
            style={{ width: `${pctClamped}%`, transition: 'width 0.6s ease' }}
          />
        </div>
        <span className="font-mono text-sm font-bold text-slate-500 dark:text-slate-400">{pctClamped}%</span>
      </div>
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
        Te faltan <span className="font-semibold text-navy-800 dark:text-white">{Math.max(meta - ventas, 0)}</span>{' '}
        ventas para cumplir la meta {falta}.
      </p>
    </div>
  )
}

export default function Metas() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [progreso, setProgreso] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/api/asesor/progreso')
      .then((res) => setProgreso(res.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/')}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-navy-900 dark:hover:bg-white/5 dark:hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <p className="label-eyebrow">Metas</p>
          <h1 className="mt-0.5 font-display text-2xl font-bold text-navy-900 dark:text-white">
            Mis metas de ventas
          </h1>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            Progreso diario, semanal y mensual de {user?.name || 'asesor'}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="animate-pulse rounded-xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-navy-800/60">
              <div className="mb-3 h-5 w-24 rounded bg-slate-200 dark:bg-navy-700" />
              <div className="mb-3 h-10 w-32 rounded bg-slate-200 dark:bg-navy-700" />
              <div className="h-3 w-full rounded-full bg-slate-200 dark:bg-navy-700" />
            </div>
          ))}
        </div>
      ) : !progreso ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center dark:border-white/10 dark:bg-navy-800/60">
          <Target className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-600" />
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
            No se pudo cargar el progreso. Intenta de nuevo mas tarde.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <MetaRow
            label="Hoy"
            icon={Clock}
            ventas={progreso.ventas_dia}
            meta={progreso.meta_diaria}
            pct={progreso.progreso_dia_pct}
            falta="de hoy"
          />
          <MetaRow
            label="Esta semana"
            icon={Calendar}
            ventas={progreso.ventas_semana}
            meta={progreso.meta_semanal}
            pct={progreso.progreso_semana_pct}
            falta="de esta semana"
          />
          <MetaRow
            label="Este mes"
            icon={TrendingUp}
            ventas={progreso.ventas_mes}
            meta={progreso.meta_mensual}
            pct={progreso.progreso_mes_pct}
            falta="de este mes"
          />
        </div>
      )}

      {!loading && progreso && (
        <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-5 dark:border-cyan-400/20 dark:bg-cyan-500/5">
          <div className="flex items-start gap-3">
            <Phone className="mt-0.5 h-5 w-5 shrink-0 text-cyan-600 dark:text-cyan-400" />
            <div>
              <p className="text-sm font-semibold text-navy-900 dark:text-white">
                Consejo del dia
              </p>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                {progreso.ventas_dia >= progreso.meta_diaria
                  ? 'Ya cumpliste tu meta diaria. Excelente trabajo. Puedes seguir buscando oportunidades extras.'
                  : progreso.ventas_dia > 0
                    ? `Llevas ${progreso.ventas_dia} venta${progreso.ventas_dia === 1 ? '' : 's'}. Te faltan ${progreso.meta_diaria - progreso.ventas_dia} para cumplir tu meta de hoy. Revisa tu cartera de clientes llamables.`
                    : 'Empieza revisando tu cartera de clientes elegibles. Los que estan "llamables ahora" son los mas propensos a convertir.'}
              </p>
              <button
                onClick={() => navigate('/clientes')}
                className="mt-3 text-xs font-semibold text-cyan-700 transition-colors hover:text-cyan-600 dark:text-cyan-300 dark:hover:text-cyan-200"
              >
                Ver mi cartera →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
