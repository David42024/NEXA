import React from 'react'
import { Wallet, Info, ArrowRight } from 'lucide-react'

function fmtSoles(v) {
  return `S/ ${Number(v).toFixed(2)}`
}

function validezHasta() {
  const d = new Date()
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  return last.toLocaleDateString('es-PE', { day: '2-digit', month: 'long', year: 'numeric' })
}

function InfoTip({ text }) {
  return (
    <span className="group relative inline-flex">
      <Info className="h-4 w-4 cursor-help text-slate-400" />
      <span className="pointer-events-none absolute left-1/2 top-full z-30 mt-2 hidden w-64 -translate-x-1/2 rounded-lg border border-slate-200 bg-white p-3 text-sm leading-relaxed text-slate-600 shadow-lg group-hover:block dark:border-white/10 dark:bg-navy-800 dark:text-slate-300">
        {text}
      </span>
    </span>
  )
}

export default function SavingsCard({ monto, precio, ahorro, ahorroPct, offer, onViewDetails, loading = false }) {
  const hasOffer = Boolean(offer) && ahorro != null && ahorro > 0
  const pct = Math.round((ahorroPct || 0) * 100)
  const ahorroAnual = hasOffer ? ahorro * 12 : null
  const max = Math.max(monto || 0, hasOffer ? precio : 0, 1)
  const actualW = Math.max(((monto || 0) / max) * 100, 6)
  const nuevaW = hasOffer ? Math.max((precio / max) * 100, 6) : 0
  const numKey = `${monto}-${precio}-${ahorro}`

  if (loading) {
    return (
      <section className="bg-white rounded-2xl border border-black/60 shadow-sm p-6 dark:bg-navy-800/60 dark:border-white/60">
        <div className="h-4 w-40 animate-pulse rounded bg-slate-100 dark:bg-white/10" />
        <div className="mt-6 h-12 w-44 animate-pulse rounded bg-slate-100 dark:bg-white/10" />
        <div className="mt-6 space-y-4">
          <div className="h-9 w-full animate-pulse rounded bg-slate-100 dark:bg-white/10" />
          <div className="h-9 w-full animate-pulse rounded bg-slate-100 dark:bg-white/10" />
        </div>
      </section>
    )
  }

  return (
    <section className="animate-nexa-rise bg-white rounded-2xl border border-black/60 shadow-sm p-6 dark:bg-navy-800/60 dark:border-white/60">
      <div className="flex items-center justify-between">
        <p className="label-eyebrow">2. Ahorro Real Proyectado</p>
        <Wallet className="h-4 w-4 text-slate-300 dark:text-white/20" />
      </div>

      {/* Zona superior: ahorro destacado */}
      <div className="mt-5">
        <div className="flex items-center gap-1.5">
          <p className="text-base font-medium text-slate-700 dark:text-slate-200">Ahorro proyectado</p>
          <InfoTip text="Diferencia entre tu factura actual y el precio base de la nueva oferta (sin IGV), según tu consumo de los últimos 3 meses." />
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-3">
          <p key={numKey} className="animate-nexa-fade font-display text-5xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
            {hasOffer ? fmtSoles(ahorro) : '—'}
          </p>
          {hasOffer && (
            <span className="rounded-full bg-emerald-500/10 px-3 py-1 font-mono text-sm font-bold text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300">
              {pct}% de ahorro
            </span>
          )}
        </div>
        {hasOffer && (
          <p key={`m-${numKey}`} className="animate-nexa-fade mt-3 text-base text-slate-600 dark:text-slate-300">
            Podrías ahorrar <strong className="text-emerald-700 dark:text-emerald-300">{fmtSoles(ahorro)}</strong> cada mes,
            ¡más de <strong className="text-emerald-700 dark:text-emerald-300">{fmtSoles(ahorroAnual)} al año</strong>!
          </p>
        )}
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Comparación basada en tu consumo de los últimos 3 meses.
          {hasOffer ? ` Válido hasta el ${validezHasta()}.` : ''}
        </p>
      </div>

      {/* Zona media: barras comparativas */}
      <div className="mt-6 border-t border-slate-100 pt-6 dark:border-white/10">
        <p className="mb-4 text-base font-medium text-slate-700 dark:text-slate-200">Comparación de montos</p>
        <div className="space-y-5">
          <div>
            <div className="mb-1.5 flex items-center justify-between text-base">
              <span className="font-medium text-slate-700 dark:text-slate-200">Gasto actual</span>
              <span className="font-mono font-semibold text-slate-800 dark:text-white">
                {monto ? fmtSoles(monto) : '—'}
              </span>
            </div>
            <div className="h-3 w-full rounded-full bg-slate-100 dark:bg-white/10">
              <div className="h-full rounded-full bg-rose-400" style={{ width: `${actualW}%` }} />
            </div>
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between text-base">
              <span className="font-medium text-slate-700 dark:text-slate-200">Nueva oferta</span>
              <span className="font-mono font-semibold text-slate-800 dark:text-white">
                {hasOffer ? fmtSoles(precio) : '—'}
              </span>
            </div>
            <div className="h-3 w-full rounded-full bg-slate-100 dark:bg-white/10">
              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${nuevaW}%` }} />
            </div>
          </div>
        </div>
      </div>

      {/* Zona inferior: microcopy + CTA */}
      <div className="mt-6 border-t border-slate-100 pt-6 dark:border-white/10">
        {hasOffer ? (
          <button
            onClick={onViewDetails}
            className="btn-primary inline-flex w-full items-center justify-center gap-2 text-base"
          >
            Ver detalles de esta oferta
            <ArrowRight className="h-4 w-4" />
          </button>
        ) : (
          <p className="text-base text-slate-500 dark:text-slate-400">
            Genera una recomendación para ver tu ahorro proyectado.
          </p>
        )}
      </div>
    </section>
  )
}