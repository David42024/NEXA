import React, { useState, useCallback, useMemo } from 'react'
import useHeatmapData from './useHeatmapData'
import GeoLayer from './GeoLayer'
import HeatmapBreadcrumb from './HeatmapBreadcrumb'
import HeatmapLegend from './HeatmapLegend'
import HeatmapTooltip from './HeatmapTooltip'
import DetailZoomPanel from './DetailZoomPanel'
import { DEPTO_PROVINCIAS, PROV_DISTRITOS } from '../../data/peru-geography'

/**
 * Mapa de calor coroplexico de Peru: Clientes sin Movistar Total.
 *
 * Navegacion jerarquica: Pais -> Departamento -> Provincia -> Distrito.
 *
 * @param {object} props
 * @param {'porcentaje'|'absoluto'} props.metricMode
 */
export default function PeruHeatmap({ metricMode = 'porcentaje' }) {
  const [nivel, setNivel] = useState('departamento')
  const [parentId, setParentId] = useState(null)
  const [selectedItem, setSelectedItem] = useState(null)
  const [hoveredItem, setHoveredItem] = useState(null)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })

  const { items, loading, error, min, max, parentName } = useHeatmapData({
    nivel,
    parentId,
    metricMode,
  })

  // Breadcrumb path
  const path = useMemo(() => {
    const p = [{ id: null, label: 'Peru' }]
    if (nivel === 'provincia' || nivel === 'distrito') {
      const depto = items.length > 0 ? null : null
      // Find depto from parentId chain
      const deptoItem = parentId != null && nivel === 'provincia'
        ? { id: null, label: parentName }
        : null
      if (nivel === 'provincia') {
        p.push({ id: null, label: parentName })
      }
    }
    if (nivel === 'distrito') {
      // Need depto name too
      const deptoId = Math.floor(parentId / 100)
      const deptoData = DEPTO_PROVINCIAS[deptoId]
      // We don't have the depto name directly, but parentName is the province name
      p.push({ id: null, label: '...' })
      p.push({ id: parentId, label: parentName })
    }
    if (nivel === 'departamento') {
      // At country level, no extra entries
    }
    return p
  }, [nivel, parentId, parentName, items])

  // Simplified breadcrumb
  const breadcrumb = useMemo(() => {
    const result = [{ id: null, label: 'Peru', nivel: 'departamento', parentId: null }]
    if (nivel === 'provincia') {
      result.push({ id: parentId, label: parentName, nivel: 'departamento', parentId: null })
    }
    if (nivel === 'distrito') {
      // We need the department name. parentId here is province id.
      // Province id format: XX0Y where XX is dept id
      const deptoId = Math.floor(parentId / 100)
      const deptoName = items.length > 0 ? parentName : ''
      result.push({ id: deptoId, label: `Depto ${deptoId}`, nivel: 'provincia', parentId: deptoId })
      result.push({ id: parentId, label: parentName, nivel: 'distrito', parentId: parentId })
    }
    return result
  }, [nivel, parentId, parentName, items])

  const handleSelect = useCallback((item) => {
    setSelectedItem(item)
    if (nivel === 'departamento') {
      setNivel('provincia')
      setParentId(item.id)
    } else if (nivel === 'provincia') {
      setNivel('distrito')
      setParentId(item.id)
    }
  }, [nivel])

  const handleBreadcrumbNavigate = useCallback((item) => {
    if (item.id === null) {
      setNivel('departamento')
      setParentId(null)
    } else if (item.nivel === 'departamento') {
      setNivel('provincia')
      setParentId(item.id)
    }
    setSelectedItem(null)
  }, [])

  const handleHover = useCallback((item, e) => {
    setHoveredItem(item)
    if (e) setMousePos({ x: e.clientX, y: e.clientY })
  }, [])

  const handleHoverItem = useCallback((item) => {
    setHoveredItem(item)
  }, [])

  const nivelLabel = nivel === 'departamento'
    ? 'Departamentos'
    : nivel === 'provincia'
      ? `Provincias de ${parentName}`
      : `Distritos de ${parentName}`

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <p className="label-eyebrow">Mapa de calor</p>
        <h2 className="mt-1 font-display text-xl font-bold text-navy-900 dark:text-white">
          Clientes sin Movistar Total
        </h2>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          Concentracion por {nivelLabel.toLowerCase()}. Click para hacer drill-down.
        </p>
      </div>

      {/* Breadcrumb */}
      <HeatmapBreadcrumb path={breadcrumb} onNavigate={handleBreadcrumbNavigate} />

      {/* Main content: map + detail panel */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Map */}
        <div className="lg:col-span-2">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-navy-900/60 sm:p-6">
            {loading ? (
              <div className="flex h-64 items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-cyan-500 border-t-transparent" />
              </div>
            ) : error ? (
              <div className="flex h-64 items-center justify-center text-sm text-rose-500">
                {error}
              </div>
            ) : (
              <GeoLayer
                items={items}
                min={min}
                max={max}
                metricMode={metricMode}
                onSelect={handleSelect}
                hoveredId={hoveredItem?.id}
                onHover={handleHoverItem}
                onHoverEnd={() => setHoveredItem(null)}
              />
            )}

            {/* Legend */}
            <div className="mt-4 flex justify-center">
              <HeatmapLegend metricMode={metricMode} />
            </div>
          </div>
        </div>

        {/* Detail panel */}
        <div className="space-y-4">
          <DetailZoomPanel
            parentItem={selectedItem}
            children={items}
            metricMode={metricMode}
            onSelectChild={handleSelect}
          />

          {/* Summary card */}
          {!loading && items.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-navy-900/60">
              <h3 className="text-sm font-bold text-navy-900 dark:text-white">
                Resumen del nivel
              </h3>
              <div className="mt-3 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500 dark:text-slate-400">Areas mostradas</span>
                  <span className="font-semibold text-navy-800 dark:text-white">{items.length}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500 dark:text-slate-400">Total clientes</span>
                  <span className="font-semibold text-navy-800 dark:text-white">
                    {items.reduce((s, i) => s + (i.totalClientes ?? 0), 0).toLocaleString('es-PE')}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500 dark:text-slate-400">Sin Movistar Total</span>
                  <span className="font-semibold text-rose-600 dark:text-rose-400">
                    {items.reduce((s, i) => s + (i.clientesSinMovistarTotal ?? 0), 0).toLocaleString('es-PE')}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Demo notice */}
          <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/5 dark:text-amber-300">
            <span className="mt-0.5 shrink-0 text-amber-500">i</span>
            <p>Datos ilustrativos generados con el motor de demostracion de NEXA.</p>
          </div>
        </div>
      </div>

      {/* Tooltip */}
      <HeatmapTooltip item={hoveredItem} position={mousePos} metricMode={metricMode} />
    </div>
  )
}
