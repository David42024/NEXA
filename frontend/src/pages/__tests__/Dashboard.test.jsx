import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../../utils/api', () => ({
  default: { get: vi.fn() },
}))

import api from '../../utils/api'
import { AuthProvider } from '../../context/AuthContext.jsx'
import Dashboard from '../Dashboard.jsx'

const KPI_DATA = {
  total_clientes: 4,
  elegibles_mt: 1,
  conversion_pct: 10,
  valor_potencial_soles: 1000,
}

const PROGRESO_DATA = {
  ventas_dia: 0,
  meta_diaria: 3,
  progreso_dia_pct: 0,
  ventas_semana: 0,
  meta_semanal: 15,
  progreso_semana_pct: 0,
  ventas_mes: 0,
  meta_mensual: 60,
  progreso_mes_pct: 0,
}

const PRIORIZADOS_DATA = {
  segmentos: [
    { id: 'Todos', label: 'Todos', count: 4 },
    { id: 'Oro', label: 'Oro Convergente', count: 1 },
    { id: 'Alerta', label: 'Alerta Roja', count: 1 },
    { id: 'Gigas', label: 'Hambrientos de Datos', count: 1 },
    { id: 'Digital', label: 'Nativos Digitales', count: 1 },
  ],
  clientes: [
    {
      id: 'C00001', name: 'Ana Maria Gomez', district: 'Miraflores', segmento: 'Oro',
      elegible: true, score: 97, top_offer: 'Movistar Total Premium', motivo: 'Elegible MT',
      plan_actual: 'Plan 89', mejor_hora: '08:00-12:00', llamable_ahora: false,
    },
    {
      id: 'C00009', name: 'Riesgo Perez', district: 'Ate', segmento: 'Alerta',
      elegible: false, score: 40, top_offer: 'Plan Hogar', motivo: 'Elegible Plan Hogar',
      plan_actual: 'Plan 69', mejor_hora: '19:00-23:00', llamable_ahora: true,
    },
    {
      id: 'C00010', name: 'Gabriela Soria', district: 'Lince', segmento: 'Gigas',
      elegible: false, score: 55, top_offer: 'Upgrade Movil', motivo: 'Alto consumo de datos',
      plan_actual: 'Plan 89', mejor_hora: '12:00-18:00', llamable_ahora: false,
    },
    {
      id: 'C00006', name: 'Victoria Maria', district: 'Los Olivos', segmento: 'Digital',
      elegible: false, score: 33, top_offer: 'Equipo Nuevo', motivo: 'Alto uso de app',
      plan_actual: 'Plan 69', mejor_hora: '08:00-12:00', llamable_ahora: false,
    },
  ],
}

function renderAsesorDashboard() {
  localStorage.setItem('nexa_user', JSON.stringify({ email: 'asesor@nexa.demo', role: 'asesor', name: 'Ana Torres' }))
  return render(
    <MemoryRouter>
      <AuthProvider>
        <Dashboard />
      </AuthProvider>
    </MemoryRouter>
  )
}

describe('Dashboard del asesor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    api.get.mockImplementation((url) => {
      if (url === '/api/admin/kpis') return Promise.resolve({ data: KPI_DATA })
      if (url === '/api/asesor/progreso') return Promise.resolve({ data: PROGRESO_DATA })
      if (url === '/api/asesor/priorizados') return Promise.resolve({ data: PRIORIZADOS_DATA })
      return Promise.reject(new Error(`No mock para ${url}`))
    })
  })

  it('muestra los chips de segmentación con los conteos de mi cartera', async () => {
    renderAsesorDashboard()
    expect(screen.getByText('Hola, Ana')).toBeInTheDocument()
    expect(await screen.findByText('Riesgo Perez')).toBeInTheDocument()
    expect(screen.getAllByText('Alerta Roja').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Oro Convergente').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Hambrientos de Datos').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Nativos Digitales').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Ana Maria Gomez').length).toBeGreaterThan(0)
  })

  it('etiqueta a cada cliente con su segmento', async () => {
    renderAsesorDashboard()
    expect(await screen.findByText('Riesgo Perez')).toBeInTheDocument()
    // El chip y el badge del cliente comparten la etiqueta del segmento.
    expect(screen.getAllByText('Alerta Roja').length).toBeGreaterThanOrEqual(2)
  })

  it('filtra la lista por segmento al hacer click en el chip', async () => {
    renderAsesorDashboard()
    expect(await screen.findByText('Ana Maria Gomez')).toBeInTheDocument()

    fireEvent.click(screen.getAllByText('Alerta Roja')[0])

    expect(screen.getByText('Riesgo Perez')).toBeInTheDocument()
    expect(screen.queryByText('Ana Maria Gomez')).not.toBeInTheDocument()
    expect(screen.queryByText('Gabriela Soria')).not.toBeInTheDocument()
  })

  it('usa solo la cartera propia: llama /api/asesor/priorizados', async () => {
    renderAsesorDashboard()
    await screen.findByText('Ana Maria Gomez')
    const urls = api.get.mock.calls.map((c) => c[0])
    expect(urls).toContain('/api/asesor/priorizados')
    expect(urls).not.toContain('/api/clients/search?q=C0')
  })
})