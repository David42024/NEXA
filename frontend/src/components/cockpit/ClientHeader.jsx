import React from 'react'
import { Calendar, MapPin, AlertTriangle, Clock, RefreshCw, Sparkles, Database } from 'lucide-react'

const FRICCION_STYLE = {
  'Riesgo alto': 'bg-rose-500/10 text-rose-600 border-rose-200 dark:bg-rose-400/10 dark:text-rose-300 dark:border-rose-400/30',
  'Riesgo medio': 'bg-amber-500/10 text-amber-600 border-amber-200 dark:bg-amber-400/10 dark:text-amber-300 dark:border-amber-400/30',
  Bajo: 'bg-emerald-500/10 text-emerald-600 border-emerald-200 dark:bg-emerald-400/10 dark:text-emerald-300 dark:border-emerald-400/30',
}

function Chip({ icon: Icon, children, tone = 'default' }) {
  const base = `inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors`
  const tones = {
    default: 'bg-white border-slate-200 text-slate-600 dark:bg-white/5 dark:border-white/10 dark:text-white/70',
    danger: 'bg-rose-500/10 border-rose-200 text-rose-600 dark:bg-rose-400/10 dark:border-rose-400/30 dark:text-rose-300',
  }
  return (
    <span className={`${base} ${tones[tone] || tones.default}`}>
      {Icon && <Icon className="h-3 w-3" />}
      {children}
    </span>
  )
}

export default function ClientHeader({ client, k, hasRecs, generating, onGenerate, onRequestData, canGenerate }) {
  const antiguedadMeses = client.profile?.servicio?.antiguedad_meses
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 dark:bg-navy-800/60 dark:border-white/10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-navy-900/5 font-display text-xl font-bold text-navy-800 dark:bg-white/10 dark:text-white">
            {client.name?.[0]}
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-navy-900 dark:text-white">{client.name}</h1>
            <p className="mt-0.5 font-mono text-xs text-slate-400">
              {client.id} · {client.district} · DNI ***{client.document_last4}
            </p>
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <Chip icon={Calendar}>{antiguedadMeses != null ? `${antiguedadMeses} meses` : 'Antigüedad n/d'}</Chip>
              <Chip icon={MapPin}>{client.district}</Chip>
              <Chip icon={AlertTriangle} tone="danger">
                Fricción: {k.friccionLevel} · {k.nReclamos} reclamos
              </Chip>
              <Chip icon={Clock}>Canal: {k.canal || 'n/d'}</Chip>
              <Chip icon={Clock}>Mejor: {k.franja || 'n/d'}</Chip>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canGenerate && (
            <button
              onClick={onGenerate}
              disabled={generating}
              className="btn-secondary text-sm flex items-center gap-2"
            >
              {generating ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : hasRecs ? (
                <RefreshCw className="h-4 w-4" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {generating ? 'Generando…' : hasRecs ? 'Regenerar recomendación' : 'Generar recomendación'}
            </button>
          )}
          <button onClick={onRequestData} className="btn-ghost text-xs flex items-center gap-1.5">
            <Database className="h-3.5 w-3.5" />
            Solicitar datos
          </button>
        </div>
      </div>
    </div>
  )
}
