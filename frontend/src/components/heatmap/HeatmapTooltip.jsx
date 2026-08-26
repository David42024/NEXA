import React from 'react'

/**
 * Tooltip flotante con nombre + valor exacto del area hovered.
 */
export default function HeatmapTooltip({ item, position, metricMode }) {
  if (!item || !position) return null

  return (
    <div
      className="pointer-events-none fixed z-50 max-w-[220px] rounded-xl border border-slate-200 bg-white/95 px-3.5 py-2.5 shadow-xl backdrop-blur-sm dark:border-white/10 dark:bg-navy-900/95"
      style={{ left: position.x + 12, top: position.y - 10 }}
    >
      <p className="text-sm font-bold text-navy-900 dark:text-white">
        {item.nombre || item.id}
      </p>
      <div className="mt-1.5 space-y-0.5">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Total clientes:{' '}
          <span className="font-semibold text-navy-800 dark:text-white">
            {(item.totalClientes ?? 0).toLocaleString('es-PE')}
          </span>
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Sin Movistar Total:{' '}
          <span className="font-semibold text-rose-600 dark:text-rose-400">
            {(item.clientesSinMovistarTotal ?? 0).toLocaleString('es-PE')}
          </span>
        </p>
        <p className="text-xs font-bold text-navy-900 dark:text-white">
          {metricMode === 'porcentaje' ? `${item.porcentaje ?? 0}%` : (item.value ?? 0).toLocaleString('es-PE')}{' '}
          <span className="font-normal text-slate-400">
            {metricMode === 'porcentaje' ? 'sin MT' : 'clientes sin MT'}
          </span>
        </p>
      </div>
    </div>
  )
}
