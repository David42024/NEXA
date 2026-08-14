import React from 'react'
import { RadialBarChart, RadialBar, PolarAngleAxis, ResponsiveContainer } from 'recharts'
import { Target } from 'lucide-react'
import ShapExplainability from '../ShapExplainability.jsx'

const LABEL = {
  good: { text: 'Alta probabilidad de éxito', cls: 'text-emerald-600 dark:text-emerald-400' },
  warn: { text: 'Probabilidad media', cls: 'text-amber-600 dark:text-amber-400' },
  bad: { text: 'Probabilidad baja', cls: 'text-rose-600 dark:text-rose-400' },
}

export default function NboScoreCard({ percent, tone, offer, shapValues }) {
  const color = percent == null ? '#94a3b8' : percent >= 70 ? '#10b981' : percent >= 50 ? '#f59e0b' : '#f43f5e'
  const label = LABEL[tone] || LABEL.good
  const data = [{ name: 'score', value: percent ?? 0 }]

  return (
    <section className="bg-white rounded-xl border border-black/60 shadow-sm p-5 dark:bg-navy-800/60 dark:border-white/60">
      <div className="flex items-center justify-between">
        <p className="label-eyebrow">1. Scoring de Probabilidad NBO</p>
        <Target className="h-4 w-4 text-slate-300 dark:text-white/20" />
      </div>
      <p className="mt-0.5 text-xs text-slate-400">Probabilidad estimada de aceptación de la mejor oferta</p>

      <div className="mt-3 flex items-center gap-5">
        <div className="relative shrink-0" style={{ width: 240, height: 210 }}>
          <ResponsiveContainer width="100%" height="100%">
            <RadialBarChart
              cx="50%"
              cy="50%"
              innerRadius="72%"
              outerRadius="95%"
              data={data}
              startAngle={90}
              endAngle={-270}
            >
              <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
              <RadialBar
                dataKey="value"
                fill={color}
                cornerRadius={12}
                background={{ fill: 'rgba(148, 163, 184, 0.18)' }}
              />
            </RadialBarChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <p className="font-display text-4xl font-bold text-navy-900 dark:text-white">
              {percent == null ? '—' : `${percent}%`}
            </p>
            <p className="text-[11px] text-slate-400">{offer ? offer.oferta : 'Sin recomendación'}</p>
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <p className={`text-sm font-semibold ${percent == null ? 'text-slate-400' : label.cls}`}>
            {percent == null ? 'Genera una recomendación' : label.text}
          </p>
          {percent != null && (
            <p className="mt-1 text-xs text-slate-400">
              Mejor oferta según el motor NBO, calculada sobre el perfil real del cliente.
            </p>
          )}
        </div>
      </div>

      {shapValues && Object.keys(shapValues).length > 0 && (
        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-white/10">
          <p className="label-eyebrow mb-1">Por qué esta oferta</p>
          <p className="mb-2 text-xs text-slate-400">
            Los factores que más aumentan la probabilidad de que acepte, y cuántos puntos suman.
          </p>
          <ShapExplainability shapValues={shapValues} />
        </div>
      )}
    </section>
  )
}
