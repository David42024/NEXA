import React from 'react'

const TONES = {
  green: 'bg-green-500/10 text-green-700 dark:bg-green-400/10 dark:text-green-300',
  lime: 'bg-lime-500/10 text-lime-700 dark:bg-lime-400/10 dark:text-lime-300',
  amber: 'bg-amber-500/10 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300',
  red: 'bg-red-500/10 text-red-700 dark:bg-red-400/10 dark:text-red-300',
}
const DOTS = { green: 'bg-green-500', lime: 'bg-lime-500', amber: 'bg-amber-500', red: 'bg-red-500' }
const TITLES = {
  green: 'prioridad muy alta',
  lime: 'prioridad alta',
  amber: 'prioridad media',
  red: 'prioridad baja',
}

/**
 * Semaforo de prioridad graduado: no solo alto/bajo, sino 4 niveles
 * (verde -> lima -> ámbar -> rojo) para que 97% vs 73% se distingan de un vistazo.
 */
export default function ScoreBadge({ value, scale = 'percent', showLabel = true }) {
  const pct = scale === 'percent' ? Math.round(value) : Math.round(value * 100)
  const tone = pct >= 85 ? 'green' : pct >= 70 ? 'lime' : pct >= 55 ? 'amber' : 'red'
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-xs font-semibold ${TONES[tone]}`}
      title={`${pct}% — ${TITLES[tone]}`}
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${DOTS[tone]}`} />
      {pct}%{showLabel ? ' prob.' : ''}
    </span>
  )
}