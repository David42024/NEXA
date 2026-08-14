import React from 'react'

const TONES = {
  green: 'bg-green-500/10 text-green-700 dark:bg-green-400/10 dark:text-green-300',
  amber: 'bg-amber-500/10 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300',
  red: 'bg-red-500/10 text-red-700 dark:bg-red-400/10 dark:text-red-300',
}
const DOTS = { green: 'bg-green-500', amber: 'bg-amber-500', red: 'bg-red-500' }

export default function ScoreBadge({ value, scale = 'percent', showLabel = true }) {
  const pct = scale === 'percent' ? Math.round(value) : Math.round(value * 100)
  const tone = pct >= 70 ? 'green' : pct >= 50 ? 'amber' : 'red'
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-xs font-semibold ${TONES[tone]}`}
      title={`${pct}% — ${tone === 'green' ? 'prioridad alta' : tone === 'amber' ? 'prioridad media' : 'prioridad baja'}`}
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${DOTS[tone]}`} />
      {pct}%{showLabel ? ' prob.' : ''}
    </span>
  )
}
