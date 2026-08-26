import React, { useMemo, useCallback, useRef, useEffect, useState } from 'react'
import { geoMercator, geoPath } from 'd3-geo'
import { colorScale, NO_DATA_COLOR, isDark } from './colorScale'
import normalizeNombre from './normalizeNombre'

const PROJECTION_CONFIG = {
  departamento: { scale: 850, center: [-75.5, -10.2] },
  provincia: { scale: 3500, center: [-75.5, -10.2] },
  distrito: { scale: 16000, center: [-75.5, -10.2] },
}

const GEO_NAME_KEY = {
  departamento: 'NOMBDEP',
  provincia: 'NOMBPROV',
  distrito: 'NOMBDIST',
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

  const dataMap = useMemo(() => {
    const m = {}
    items.forEach(item => { m[item.id] = item })
    return m
  }, [items])

  const cfg = PROJECTION_CONFIG[nivel] || PROJECTION_CONFIG.departamento
  const nameKey = GEO_NAME_KEY[nivel] || 'NOMBDEP'

  const { paths, projection } = useMemo(() => {
    if (!geojson?.features?.length) return { paths: [], projection: null }

    const projection = geoMercator()
      .scale(cfg.scale)
      .center(cfg.center)
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
  }, [geojson, cfg.scale, cfg.center, dims.w, dims.h, nameKey])

  const intensity = useCallback((value) => {
    if (value == null) return null
    if (max === min) return 0.5
    return (value - min) / (max - min)
  }, [min, max])

  if (!geojson || paths.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-slate-400">
        Cargando mapa...
      </div>
    )
  }

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${dims.w} ${dims.h}`}
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
  )
}
