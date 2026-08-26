import React, { useState, useCallback, useMemo, useEffect } from 'react'
import useHeatmapData from './useHeatmapData'
import GeoLayer from './GeoLayer'
import HeatmapBreadcrumb from './HeatmapBreadcrumb'
import HeatmapLegend from './HeatmapLegend'
import HeatmapTooltip from './HeatmapTooltip'
import DetailZoomPanel from './DetailZoomPanel'
import normalizeNombre from './normalizeNombre'

const GEOJSON_URLS = {
  departamento: '/geo/peru_departamental_simple.geojson',
  provincia: '/geo/peru_provincial_simple.geojson',
  distrito: '/geo/peru_distrital_simple.geojson',
}

const GEO_NAME_KEY = {
  departamento: 'NOMBDEP',
  provincia: 'NOMBPROV',
  distrito: 'NOMBDIST',
}

const PARENT_NAME_KEY = {
  departamento: null,
  provincia: 'FIRST_NOMB',
  distrito: 'NOMBDEP',
}

function buildBreadcrumb(nivel, parentContext) {
  const crumbs = [{ id: null, label: 'Peru', nivel: 'departamento', parentContext: null }]

  if ((nivel === 'provincia' || nivel === 'distrito') && parentContext?.deptoName) {
    crumbs.push({
      id: parentContext.deptoName,
      label: parentContext.deptoName,
      nivel: 'provincia',
      parentContext: { deptoName: parentContext.deptoName },
    })
  }

  if (nivel === 'distrito' && parentContext?.provName) {
    crumbs.push({
      id: parentContext.provName,
      label: parentContext.provName,
      nivel: 'distrito',
      parentContext,
    })
  }

  return crumbs
}

export default function PeruHeatmap({ metricMode = 'porcentaje' }) {
  const [nivel, setNivel] = useState('departamento')
  const [parentContext, setParentContext] = useState(null)
  const [selectedItem, setSelectedItem] = useState(null)
  const [hoveredItem, setHoveredItem] = useState(null)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const [geojsonCache, setGeojsonCache] = useState({})
  const [geoLoading, setGeoLoading] = useState(false)

  const currentGeojson = geojsonCache[nivel] || null

  useEffect(() => {
    if (!currentGeojson && !geoLoading) {
      setGeoLoading(true)
      fetch(GEOJSON_URLS[nivel])
        .then(res => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          return res.json()
        })
        .then(data => {
          setGeojsonCache(prev => ({ ...prev, [nivel]: data }))
          setGeoLoading(false)
        })
        .catch(err => {
          console.error('GeoJSON load error:', err)
          setGeoLoading(false)
        })
    }
  }, [nivel, currentGeojson, geoLoading])

  const { joinByName, loading, error } = useHeatmapData({ nivel, metricMode })

  const nameKey = GEO_NAME_KEY[nivel]
  const parentKey = PARENT_NAME_KEY[nivel]

  const items = useMemo(() => {
    if (!currentGeojson?.features) return []
    let features = currentGeojson.features

    if (nivel === 'provincia' && parentContext?.deptoName) {
      features = features.filter(f =>
        normalizeNombre(f.properties?.FIRST_NOMB) === parentContext.deptoName
      )
    } else if (nivel === 'distrito' && parentContext?.provName) {
      features = features.filter(f =>
        normalizeNombre(f.properties?.NOMBPROV) === parentContext.provName
      )
    }

    return joinByName(features, nameKey, parentKey)
  }, [currentGeojson, nivel, parentContext, joinByName, nameKey, parentKey])

  const filteredGeojson = useMemo(() => {
    if (!currentGeojson?.features) return null
    let features = currentGeojson.features

    if (nivel === 'provincia' && parentContext?.deptoName) {
      features = features.filter(f =>
        normalizeNombre(f.properties?.FIRST_NOMB) === parentContext.deptoName
      )
    } else if (nivel === 'distrito' && parentContext?.provName) {
      features = features.filter(f =>
        normalizeNombre(f.properties?.NOMBPROV) === parentContext.provName
      )
    }

    return { ...currentGeojson, features }
  }, [currentGeojson, nivel, parentContext])

  const min = useMemo(() => {
    if (items.length === 0) return 0
    const values = items.map(i => i.value).filter(v => v != null)
    return values.length > 0 ? Math.min(...values) : 0
  }, [items])

  const max = useMemo(() => {
    if (items.length === 0) return 1
    const values = items.map(i => i.value).filter(v => v != null)
    return values.length > 0 ? Math.max(...values) : 1
  }, [items])

  const parentName = useMemo(() => {
    if (nivel === 'departamento') return 'Peru'
    return parentContext?.deptoName || parentContext?.provName || ''
  }, [nivel, parentContext])

  const breadcrumb = useMemo(
    () => buildBreadcrumb(nivel, parentContext),
    [nivel, parentContext]
  )

  const handleSelect = useCallback((item) => {
    if (!item) return
    setSelectedItem(item)

    if (nivel === 'departamento') {
      setNivel('provincia')
      setParentContext({ deptoName: item.id })
    } else if (nivel === 'provincia') {
      setNivel('distrito')
      setParentContext(prev => ({ ...prev, provName: item.id }))
    }
  }, [nivel])

  const handleBreadcrumbNavigate = useCallback((crumb) => {
    setNivel(crumb.nivel)
    setParentContext(crumb.parentContext)
    setSelectedItem(null)
  }, [])

  const handleHover = useCallback((item) => {
    setHoveredItem(item)
  }, [])

  const handleMousePos = useCallback((e) => {
    setMousePos({ x: e.clientX, y: e.clientY })
  }, [])

  const nivelLabel = nivel === 'departamento'
    ? 'Departamentos'
    : nivel === 'provincia'
      ? `Provincias de ${parentName}`
      : `Distritos de ${parentName}`

  const isLoading = loading || geoLoading

  return (
    <div className="space-y-5" onMouseMove={handleMousePos}>
      <div>
        <p className="label-eyebrow">Mapa de calor</p>
        <h2 className="mt-1 font-display text-xl font-bold text-navy-900 dark:text-white">
          Clientes sin Movistar Total
        </h2>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          Concentracion por {nivelLabel.toLowerCase()}. Click para hacer drill-down.
        </p>
      </div>

      <HeatmapBreadcrumb path={breadcrumb} onNavigate={handleBreadcrumbNavigate} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-navy-900/60 sm:p-6">
            {isLoading ? (
              <div className="flex h-64 items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-cyan-500 border-t-transparent" />
              </div>
            ) : error ? (
              <div className="flex h-64 items-center justify-center text-sm text-rose-500">
                {error}
              </div>
            ) : (
              <GeoLayer
                geojson={filteredGeojson}
                items={items}
                nivel={nivel}
                min={min}
                max={max}
                metricMode={metricMode}
                onSelect={handleSelect}
                hoveredId={hoveredItem?.id}
                onHover={handleHover}
                onHoverEnd={() => setHoveredItem(null)}
              />
            )}

            <div className="mt-4 flex justify-center">
              <HeatmapLegend metricMode={metricMode} />
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <DetailZoomPanel
            parentItem={selectedItem}
            children={items}
            metricMode={metricMode}
            onSelectChild={handleSelect}
          />

          {!isLoading && items.length > 0 && (
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

          <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/5 dark:text-amber-300">
            <span className="mt-0.5 shrink-0 text-amber-500">i</span>
            <p>Datos ilustrativos generados con el motor de demostracion de NEXA.</p>
          </div>
        </div>
      </div>

      <HeatmapTooltip item={hoveredItem} position={mousePos} metricMode={metricMode} />
    </div>
  )
}
