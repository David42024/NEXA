import React from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Wallet } from 'lucide-react'

export default function SavingsCard({ monto, precio, ahorro, ahorroPct, offer }) {
  const hasOffer = offer != null
  const data = [
    { name: 'Gasto actual', pago: monto || 0, ahorro: 0 },
    { name: 'Nueva oferta', pago: hasOffer ? precio : 0, ahorro: hasOffer ? ahorro : 0 },
  ]

  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 dark:bg-navy-800/60 dark:border-white/10">
      <div className="flex items-center justify-between">
        <p className="label-eyebrow">2. Ahorro Real Proyectado</p>
        <Wallet className="h-4 w-4 text-slate-300 dark:text-white/20" />
      </div>
      <p className="mt-0.5 text-xs text-slate-400">Comparación de facturación actual vs nueva oferta</p>

      <div className="mt-4 flex items-end justify-between gap-4">
        <div>
          <p className="label-eyebrow">Gasto actual</p>
          <p className="mt-1 font-display text-3xl font-bold text-slate-500">
            {monto ? `S/ ${monto.toFixed(2)}` : '—'}
          </p>
        </div>
        <div className="text-center">
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-300">
            Ahorro
          </span>
          <p className="mt-1 font-display text-3xl font-bold text-emerald-500">
            {hasOffer ? `S/ ${ahorro.toFixed(2)}` : '—'}
          </p>
          <p className="text-[11px] text-slate-400">al mes{ahorroPct ? ` · ${Math.round(ahorroPct * 100)}%` : ''}</p>
        </div>
        <div className="text-right">
          <p className="label-eyebrow">Nueva oferta</p>
          <p className="mt-1 font-display text-3xl font-bold text-navy-900 dark:text-white">
            {hasOffer ? `S/ ${precio.toFixed(2)}` : '—'}
          </p>
        </div>
      </div>

      <div className="mt-4 h-[120px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 5, right: 8, left: 8, bottom: 0 }} barSize={46}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148, 163, 184, 0.2)" />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <YAxis hide />
            <Tooltip formatter={(v) => [`S/ ${Number(v).toFixed(2)}`, 'monto']} />
            <Bar dataKey="pago" stackId="a" fill="#94a3b8" />
            <Bar dataKey="ahorro" stackId="a" fill="#10b981" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {!hasOffer && <p className="mt-3 text-xs text-slate-400">Genera una recomendación para ver tu ahorro proyectado.</p>}
    </section>
  )
}