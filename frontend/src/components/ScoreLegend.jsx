import React from 'react'

const LEVELS = [
  { dot: 'bg-green-500', range: '≥85%', label: 'Prioridad muy alta' },
  { dot: 'bg-lime-500', range: '70–84%', label: 'Prioridad alta' },
  { dot: 'bg-amber-500', range: '55–69%', label: 'Prioridad media' },
  { dot: 'bg-red-500', range: '<55%', label: 'Prioridad baja' },
]

export default function ScoreLegend() {
  return (
    <div className="rounded-xl border border-black/60 bg-white p-4 shadow-sm dark:border-white/60 dark:bg-white/5">
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        Probabilidad de aceptación
      </p>
      <ul className="space-y-2.5">
        {LEVELS.map((l) => (
          <li key={l.range} className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${l.dot}`} />
            <span className="font-mono font-semibold">{l.range}</span>
            <span className="text-slate-300 dark:text-slate-600">·</span>
            <span>{l.label}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}