import React, { useMemo, useCallback } from 'react'
import { colorScale, isDark } from './colorScale'

const CELL = 56
const GAP = 4
const TOTAL = CELL + GAP

/**
 * Renderiza el mapa de calor como un tile-grid de celdas SVG.
 *
 * Cada celda representa una unidad geografica (departamento, provincia o distrito)
 * posicionada en una grilla segun sus coordenadas (row, col).
 */
export default function GeoLayer({
  items,
  min,
  max,
  metricMode = 'porcentaje',
  onSelect,
  hoveredId,
  onHover,
  onHoverEnd,
}) {
  const intensity = useCallback((value) => {
    if (max === min) return 0.5
    return (value - min) / (max - min)
  }, [min, max])

  // Calcular dimensiones del SVG
  const { rows, cols, viewBox } = useMemo(() => {
    if (items.length === 0) return { rows: 1, cols: 1, viewBox: '0 0 100 100' }
    const maxRow = Math.max(...items.map(i => i.row ?? 0))
    const maxCol = Math.max(...items.map(i => i.col ?? 0))
    const r = maxRow + 1
    const c = maxCol + 1
    return {
      rows: r,
      cols: c,
      viewBox: `0 0 ${c * TOTAL + GAP} ${r * TOTAL + GAP}`,
    }
  }, [items])

  return (
    <svg
      viewBox={viewBox}
      className="w-full h-auto"
      role="img"
      aria-label="Mapa de calor geografico de clientes sin Movistar Total"
    >
      {items.map(item => {
        const row = item.row ?? 0
        const col = item.col ?? 0
        const x = col * TOTAL + GAP
        const y = row * TOTAL + GAP
        const t = intensity(item.value)
        const fill = colorScale(t)
        const dark = isDark(fill)
        const hovered = hoveredId === item.id
        const label = item.abbr || item.nombre?.slice(0, 4).toUpperCase() || item.id

        return (
          <g
            key={item.id}
            role="img"
            aria-label={`${item.nombre}: ${item.porcentaje ?? 0}% sin Movistar Total (${item.totalClientes ?? 0} clientes)`}
            tabIndex={0}
            className="cursor-pointer outline-none"
            onClick={() => onSelect?.(item)}
            onMouseEnter={() => onHover?.(item)}
            onMouseLeave={() => onHoverEnd?.()}
            onFocus={() => onHover?.(item)}
            onBlur={() => onHoverEnd?.()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onSelect?.(item)
              }
            }}
          >
            <rect
              x={x}
              y={y}
              width={CELL}
              height={CELL}
              rx={6}
              fill={fill}
              stroke={hovered ? '#0e7490' : 'rgba(255,255,255,0.3)'}
              strokeWidth={hovered ? 2.5 : 1}
              style={{
                filter: hovered ? 'brightness(1.1) drop-shadow(0 2px 4px rgba(0,0,0,0.2))' : 'none',
                transition: 'filter 0.15s ease, stroke 0.15s ease',
              }}
            />
            <text
              x={x + CELL / 2}
              y={y + CELL / 2 - 4}
              textAnchor="middle"
              dominantBaseline="central"
              fill={dark ? '#fff' : '#1e293b'}
              fontSize={11}
              fontWeight={700}
              fontFamily="system-ui, sans-serif"
              style={{ pointerEvents: 'none', userSelect: 'none' }}
            >
              {label}
            </text>
            <text
              x={x + CELL / 2}
              y={y + CELL / 2 + 10}
              textAnchor="middle"
              dominantBaseline="central"
              fill={dark ? 'rgba(255,255,255,0.8)' : 'rgba(30,41,59,0.7)'}
              fontSize={9}
              fontFamily="system-ui, sans-serif"
              style={{ pointerEvents: 'none', userSelect: 'none' }}
            >
              {metricMode === 'porcentaje' ? `${item.value}%` : (item.value ?? 0).toLocaleString('es-PE')}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
