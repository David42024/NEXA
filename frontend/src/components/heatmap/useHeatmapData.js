import { useState, useEffect, useMemo } from 'react'
import api from '../../utils/api'
import {
  DEPARTAMENTOS,
  PROVINCIAS,
  DISTRITOS,
  DEPTO_PROVINCIAS,
  PROV_DISTRITOS,
} from '../../data/peru-geography'

/**
 * Hook principal del mapa de calor.
 *
 * Niveles: 'departamento' | 'provincia' | 'distrito'
 *
 * @param {object} opts
 * @param {string} opts.nivel - Nivel geografico actual
 * @param {number|null} opts.parentId - ID del padre (null = pais entero)
 * @param {string} opts.metricMode - 'porcentaje' | 'absoluto'
 * @returns {object} { items, loading, error, min, max, parentName }
 */
export default function useHeatmapData({ nivel, parentId, metricMode = 'porcentaje' }) {
  const [rawData, setRawData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)

    async function fetch() {
      try {
        const params = { nivel }
        if (parentId != null) params.id_padre = parentId
        const { data } = await api.get('/api/admin/heatmap', { params })
        if (active) setRawData(data.items || [])
      } catch (e) {
        console.error('Heatmap API error:', e)
        if (active) setError(e.response?.data?.detail || 'Error cargando datos')
      } finally {
        if (active) setLoading(false)
      }
    }

    fetch()
    return () => { active = false }
  }, [nivel, parentId])

  // Geo items para el nivel actual
  const geoItems = useMemo(() => {
    if (nivel === 'departamento') return DEPARTAMENTOS
    if (nivel === 'provincia') return DEPTO_PROVINCIAS[parentId] || []
    if (nivel === 'distrito') return PROV_DISTRITOS[parentId] || []
    return []
  }, [nivel, parentId])

  // Join: geo + metricas
  const items = useMemo(() => {
    const dataMap = {}
    rawData.forEach(d => { dataMap[d.id] = d })

    return geoItems.map(geo => {
      const m = dataMap[geo.id] || { totalClientes: 0, clientesSinMovistarTotal: 0 }
      const total = m.totalClientes || 0
      const sinMT = m.clientesSinMovistarTotal || 0
      const pct = total > 0 ? Math.round((sinMT / total) * 1000) / 10 : 0

      return {
        ...geo,
        totalClientes: total,
        clientesSinMovistarTotal: sinMT,
        porcentaje: pct,
        value: metricMode === 'porcentaje' ? pct : sinMT,
      }
    })
  }, [geoItems, rawData, metricMode])

  // Min/max para normalizar colores
  const { min, max } = useMemo(() => {
    if (items.length === 0) return { min: 0, max: 1 }
    const values = items.map(i => i.value)
    return { min: Math.min(...values), max: Math.max(...values) }
  }, [items])

  // Nombre del padre
  const parentName = useMemo(() => {
    if (nivel === 'departamento') return 'Peru'
    if (nivel === 'provincia') {
      const d = DEPARTAMENTOS.find(d => d.id === parentId)
      return d?.nombre || ''
    }
    if (nivel === 'distrito') {
      const p = PROVINCIAS.find(p => p.id === parentId)
      return p?.nombre || ''
    }
    return ''
  }, [nivel, parentId])

  return { items, loading, error, min, max, parentName }
}
