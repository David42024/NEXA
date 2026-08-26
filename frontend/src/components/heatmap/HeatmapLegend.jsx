import React from 'react'

/**
 * Leyenda con gradiente de color "Baja actividad -> Alta actividad".
 */
export default function HeatmapLegend({ metricMode = 'porcentaje' }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
        Baja actividad
      </span>
      <div
        className="h-3 w-40 rounded-full"
        style={{
          background: 'linear-gradient(to right, #3B82F6, #22C55E 33%, #EAB308 66%, #EF4444)',
        }}
      />
      <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
        Alta actividad
      </span>
    </div>
  )
}
