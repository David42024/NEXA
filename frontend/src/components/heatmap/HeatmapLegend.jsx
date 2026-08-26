import React from 'react'
import { NO_DATA_COLOR } from './colorScale'

/**
 * Leyenda con gradiente de color "Baja actividad -> Alta actividad" + "Sin datos".
 */
export default function HeatmapLegend({ metricMode = 'porcentaje' }) {
  return (
    <div className="flex items-center gap-3 flex-wrap justify-center">
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
      <div className="flex items-center gap-1.5 ml-2">
        <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: NO_DATA_COLOR }} />
        <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
          Sin datos
        </span>
      </div>
    </div>
  )
}
