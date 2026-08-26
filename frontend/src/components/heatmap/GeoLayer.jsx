import React, { useMemo, useCallback } from 'react'
import {
  ComposableMap,
  Geographies,
  Geography,
} from 'react-simple-maps'
import { colorScale, NO_DATA_COLOR, isDark } from './colorScale'
import normalizeNombre from './normalizeNombre'

const PROJECTION_CONFIG = {
  departamento: {
    scale: 700,
    center: [-75, -10],
  },
  provincia: {
    scale: 3200,
    center: [-75, -10],
  },
  distrito: {
    scale: 16000,
    center: [-75, -10],
  },
}

const GEO_PROPS_KEY = {
  departamento: 'NOMBDEP',
  provincia: 'NOMBPROV',
  distrito: 'NOMBDIST',
}

const PARENT_PROPS_KEY = {
  departamento: null,
  provincia: 'FIRST_NOMB',
  distrito: 'NOMBDEP',
}

export default function GeoLayer({
  geojson,
  items,
  nivel = 'departamento',
  min,
  max,
  metricMode = 'porcentaje',
  onSelect,
  hoveredId,
  onHover,
  onHoverEnd,
}) {
  const dataMap = useMemo(() => {
    const m = {}
    items.forEach(item => { m[item.id] = item })
    return m
  }, [items])

  const intensity = useCallback((value) => {
    if (value == null) return null
    if (max === min) return 0.5
    return (value - min) / (max - min)
  }, [min, max])

  const projConfig = PROJECTION_CONFIG[nivel] || PROJECTION_CONFIG.departamento
  const geoNameKey = GEO_PROPS_KEY[nivel] || 'NOMBDEP'

  const handleMouseEnter = useCallback((geo, item) => {
    if (item) onHover?.(item)
  }, [onHover])

  const handleMouseLeave = useCallback(() => {
    onHoverEnd?.()
  }, [onHoverEnd])

  const handleClick = useCallback((item) => {
    if (item) onSelect?.(item)
  }, [onSelect])

  if (!geojson) return null

  return (
    <ComposableMap
      projection="mercator"
      projectionConfig={{
        scale: projConfig.scale,
        center: projConfig.center,
      }}
      style={{ width: '100%', height: 'auto' }}
    >
      <Geographies geography={geojson}>
        {({ geographies }) =>
          geographies.map(geo => {
            const props = geo.properties || {}
            const nombre = props[geoNameKey]
            const normName = normalizeNombre(nombre)
            const item = dataMap[normName]
            const value = item?.value
            const intensityVal = value != null ? intensity(value) : null
            const fill = value != null ? colorScale(intensityVal) : NO_DATA_COLOR
            const dark = isDark(fill)
            const isHovered = hoveredId === normName

            return (
              <Geography
                key={geo.rsmKey}
                geography={geo}
                onClick={() => handleClick(item)}
                onMouseEnter={() => handleMouseEnter(geo, item)}
                onMouseLeave={handleMouseLeave}
                style={{
                  default: {
                    fill,
                    outline: 'none',
                    stroke: 'rgba(255,255,255,0.5)',
                    strokeWidth: 0.5,
                  },
                  hover: {
                    fill,
                    outline: 'none',
                    stroke: '#0e7490',
                    strokeWidth: 2,
                    filter: 'brightness(1.1) drop-shadow(0 2px 4px rgba(0,0,0,0.2))',
                  },
                  pressed: {
                    fill,
                    outline: 'none',
                  },
                }}
              />
            )
          })
        }
      </Geographies>
    </ComposableMap>
  )
}
