import React, { useMemo, useCallback, useRef, useEffect, useState } from 'react'
import { geoMercator, geoPath } from 'd3-geo'
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react'
import { colorScale, NO_DATA_COLOR, isDark } from './colorScale'
import normalizeNombre from './normalizeNombre'

const SCALE_BY_NIVEL = {
  departamento: 850,
  provincia: 3500,
  distrito: 16000,
}

const GEO_NAME_KEY = {
  departamento: 'NOMBDEP',
  provincia: 'NOMBPROV',
  distrito: 'NOMBDIST',
}

const ZOOM_MIN = 0.5
const ZOOM_MAX = 4
const ZOOM_STEP = 0.35

function computeBounds(features) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const f of features) {
    const coords = f.geometry?.type === 'MultiPolygon'
      ? f.geometry.coordinates.flat(2)
      : f.geometry?.coordinates?.flat(2)
    if (!coords) continue
    for (let i = 0; i < coords.length; i += 2) {
      const x = coords[i], y = coords[i + 1]
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  if (!isFinite(minX)) return null
  return { minX, minY, maxX, maxY }
}

function fitBounds(bounds, w, h, scale0, padding = 1.4) {
  const cx = (bounds.minX + bounds.maxX) / 2
  const cy = (bounds.minY + bounds.maxY) / 2
  const bw = bounds.maxX - bounds.minX || 1
  const bh = bounds.maxY - bounds.minY || 1
  const proj = geoMercator().scale(scale0).center([cx, cy]).translate([0, 0])
  const tl = proj([bounds.minX, bounds.maxY])
  const br = proj([bounds.maxX, bounds.minY])
  if (!tl || !br) return { center: [cx, cy], scale: scale0 }
  const sw = (br[0] - tl[0]) * padding
  const sh = (br[1] - tl[1]) * padding
  const kx = w / sw
  const ky = h / sh
  return { center: [cx, cy], scale: scale0 * Math.min(kx, ky) }
}

export default function GeoLayer({
  geojson,
  items,
  nivel = 'departamento',
  min,
  max,
  onSelect,
  hoveredId,
  onHover,
  onHoverEnd,
}) {
  const svgRef = useRef(null)
  const [dims, setDims] = useState({ w: 600, h: 500 })
  const [zoom, setZoom] = useState(1)

  useEffect(() => {
    const el = svgRef.current?.parentElement
    if (!el) return
    const ro = new ResizeObserver(entries => {
      const { width } = entries[0].contentRect
      if (width > 0) setDims({ w: width, h: Math.round(width * 0.7) })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    setZoom(1)
  }, [nivel])

  const zoomIn = useCallback(() => {
    setZoom(z => Math.min(ZOOM_MAX, +(z + ZOOM_STEP).toFixed(2)))
  }, [])

  const zoomOut = useCallback(() => {
    setZoom(z => Math.max(ZOOM_MIN, +(z - ZOOM_STEP).toFixed(2)))
  }, [])

  const zoomReset = useCallback(() => {
    setZoom(1)
  }, [])

  const dataMap = useMemo(() => {
    const m = {}
    items.forEach(item => { m[item.id] = item })
    return m
  }, [items])

  const scale0 = SCALE_BY_NIVEL[nivel] || SCALE_BY_NIVEL.departamento
  const nameKey = GEO_NAME_KEY[nivel] || 'NOMBDEP'

  const { paths, projection } = useMemo(() => {
    if (!geojson?.features?.length) return { paths: [], projection: null }

    const bounds = computeBounds(geojson.features)
    const { center, scale } = bounds
      ? fitBounds(bounds, dims.w, dims.h, scale0)
      : { center: [-75.5, -10.2], scale: scale0 }

    const projection = geoMercator()
      .scale(scale)
      .center(center)
      .translate([dims.w / 2, dims.h / 2])

    const pathGen = geoPath().projection(projection)

    const paths = geojson.features.map(feature => {
      const d = pathGen(feature)
      if (!d) return null
      const nombre = feature.properties?.[nameKey]
      const normName = normalizeNombre(nombre)
      return { d, normName, nombre, properties: feature.properties }
    }).filter(Boolean)

    return { paths, projection }
  }, [geojson, scale0, dims.w, dims.h, nameKey])

  const intensity = useCallback((value) => {
    if (value == null) return null
    if (max === min) return 0.5
    return (value - min) / (max - min)
  }, [min, max])

  const viewBox = useMemo(() => {
    if (zoom === 1) return `0 0 ${dims.w} ${dims.h}`
    const vw = dims.w / zoom
    const vh = dims.h / zoom
    const vx = (dims.w - vw) / 2
    const vy = (dims.h - vh) / 2
    return `${vx} ${vy} ${vw} ${vh}`
  }, [dims.w, dims.h, zoom])

  if (!geojson || paths.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-slate-400">
        Cargando mapa...
      </div>
    )
  }

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={viewBox}
        className="w-full h-auto"
        role="img"
        aria-label="Mapa de calor geografico de clientes sin Movistar Total"
      >
        {paths.map(({ d, normName, nombre }) => {
          const item = dataMap[normName]
          const value = item?.value
          const intensityVal = value != null ? intensity(value) : null
          const fill = value != null ? colorScale(intensityVal) : NO_DATA_COLOR
          const dark = isDark(fill)
          const isHovered = hoveredId === normName

          return (
            <path
              key={normName}
              d={d}
              fill={fill}
              stroke={isHovered ? '#0e7490' : 'rgba(255,255,255,0.5)'}
              strokeWidth={isHovered ? 2 : 0.5}
              className="cursor-pointer transition-all duration-150"
              style={{
                filter: isHovered ? 'brightness(1.1) drop-shadow(0 2px 4px rgba(0,0,0,0.2))' : 'none',
              }}
              onClick={() => item && onSelect?.(item)}
              onMouseEnter={() => item && onHover?.(item)}
              onMouseLeave={() => onHoverEnd?.()}
            />
          )
        })}
      </svg>

      <div className="absolute top-2 right-2 flex flex-col gap-1 z-10">
        <button
          onClick={zoomIn}
          disabled={zoom >= ZOOM_MAX}
          title="Acercar"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-cyan-600 disabled:opacity-30 disabled:cursor-not-allowed dark:border-white/10 dark:bg-navy-800 dark:text-slate-300 dark:hover:bg-navy-700 dark:hover:text-cyan-400"
        >
          <ZoomIn size={16} />
        </button>
        <button
          onClick={zoomOut}
          disabled={zoom <= ZOOM_MIN}
          title="Alejar"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-cyan-600 disabled:opacity-30 disabled:cursor-not-allowed dark:border-white/10 dark:bg-navy-800 dark:text-slate-300 dark:hover:bg-navy-700 dark:hover:text-cyan-400"
        >
          <ZoomOut size={16} />
        </button>
        {zoom !== 1 && (
          <button
            onClick={zoomReset}
            title="Restablecer zoom"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-cyan-600 dark:border-white/10 dark:bg-navy-800 dark:text-slate-300 dark:hover:bg-navy-700 dark:hover:text-cyan-400"
          >
            <Maximize2 size={16} />
          </button>
        )}
      </div>

      {zoom !== 1 && (
        <div className="absolute bottom-2 right-2 rounded-md bg-white/80 px-2 py-0.5 text-[11px] font-medium text-slate-500 shadow-sm dark:bg-navy-800/80 dark:text-slate-400">
          {Math.round(zoom * 100)}%
        </div>
      )}
    </div>
  )
}
