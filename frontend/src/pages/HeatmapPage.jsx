import React from 'react'
import PeruHeatmap from '../components/heatmap/PeruHeatmap'

/**
 * Pagina del mapa de calor: /supervisor/mapa-calor
 * Exclusiva del rol supervisor (y admin).
 */
export default function HeatmapPage() {
  return <PeruHeatmap metricMode="porcentaje" />
}
