import { useState, useEffect, useMemo } from 'react'
import api from '../../utils/api'
import normalizeNombre from './normalizeNombre'

/**
 * Hook principal del mapa de calor.
 *
 * Niveles: 'departamento' | 'provincia' | 'distrito'
 *
 * Join: normaliza los nombres del backend (descripcion) y los nombres de
 * los features GeoJSON para hacer match por nombre normalizado.
 *
 * @param {object} opts
 * @param {string} opts.nivel - Nivel geografico actual
 * @param {string|null} opts.parentName - Nombre normalizado del padre (null = pais)
 * @param {string} opts.metricMode - 'porcentaje' | 'absoluto'
 * @returns {object} { items, loading, error, min, max, parentName }
 */
export default function useHeatmapData({ nivel, parentName, metricMode = 'porcentaje' }) {
  const [rawData, setRawData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)

    async function fetchData() {
      try {
        const params = { nivel }
        if (parentName) params.parent_name = parentName
        const { data } = await api.get('/api/admin/heatmap', { params })
        if (active) setRawData(data.items || [])
      } catch (e) {
        console.error('Heatmap API error:', e)
        if (active) setError(e.response?.data?.detail || 'Error cargando datos')
      } finally {
        if (active) setLoading(false)
      }
    }

    fetchData()
    return () => { active = false }
  }, [nivel, parentName])

  const dataMap = useMemo(() => {
    const m = {}
    rawData.forEach(d => {
      const normKey = normalizeNombre(d.descripcion)
      m[normKey] = d
    })
    return m
  }, [rawData])

  const joinByName = useMemo(() => {
    return (features, nameKey, parentKey) => {
      return features.map(f => {
        const props = f.properties || {}
        const normName = normalizeNombre(props[nameKey])
        const raw = dataMap[normName]
        const total = raw?.totalClientes || 0
        const sinMT = raw?.clientesSinMovistarTotal || 0
        const pct = total > 0 ? Math.round((sinMT / total) * 1000) / 10 : 0

        return {
          id: normName,
          nombre: props[nameKey] || normName,
          totalClientes: total,
          clientesSinMovistarTotal: sinMT,
          porcentaje: pct,
          value: metricMode === 'porcentaje' ? pct : sinMT,
          hasData: !!raw,
        }
      })
    }
  }, [dataMap, metricMode])

  return { joinByName, loading, error, dataMap }
}
