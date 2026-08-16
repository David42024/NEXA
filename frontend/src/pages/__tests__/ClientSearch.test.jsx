import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../../utils/api', () => ({
  default: { get: vi.fn() },
}))

import api from '../../utils/api'
import ClientSearch from '../ClientSearch.jsx'

const LIST_DATA = {
  total: 4,
  page: 1,
  page_size: 10,
  segmentos: [
    { id: 'Todos', label: 'Todos', count: 4 },
    { id: 'Oro', label: 'Oro Convergente', count: 1 },
    { id: 'Alerta', label: 'Alerta Roja', count: 1 },
    { id: 'Gigas', label: 'Hambrientos de Datos', count: 1 },
    { id: 'Digital', label: 'Nativos Digitales', count: 1 },
  ],
  results: [
    {
      id: 'C00001', name: 'Ana Maria Gomez', district: 'Miraflores', segmento: 'Oro',
      elegible: true, score: 97, top_offer: 'Movistar Total Premium', plan_actual: 'Plan 89',
      mejor_hora: '08:00-12:00', llamable_ahora: false,
    },
    {
      id: 'C00009', name: 'Riesgo Perez', district: 'Ate', segmento: 'Alerta',
      elegible: false, score: 40, top_offer: 'Plan Hogar', plan_actual: 'Plan 69',
      mejor_hora: '19:00-23:00', llamable_ahora: true,
    },
    {
      id: 'C00010', name: 'Gabriela Soria', district: 'Lince', segmento: 'Gigas',
      elegible: false, score: 55, top_offer: 'Upgrade Movil', plan_actual: 'Plan 89',
      mejor_hora: '12:00-18:00', llamable_ahora: false,
    },
    {
      id: 'C00006', name: 'Victoria Maria', district: 'Los Olivos', segmento: 'Digital',
      elegible: false, score: 33, top_offer: 'Equipo Nuevo', plan_actual: 'Plan 69',
      mejor_hora: '08:00-12:00', llamable_ahora: false,
    },
  ],
}

function renderPage() {
  localStorage.setItem('nexa_user', JSON.stringify({ email: 'a@nexa.demo', role: 'asesor', name: 'Ana Torres' }))
  return render(
    <MemoryRouter>
      <ClientSearch />
    </MemoryRouter>
  )
}

describe('ClientSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    api.get.mockImplementation((url) => {
      if (url === '/api/asesor/progreso') {
        return Promise.resolve({ data: { meta_diaria: 3, ventas_dia: 1 } })
      }
      if (url.startsWith('/api/clients')) {
        const u = new URL('http://localhost' + url)
        const seg = u.searchParams.get('segmento') || 'Todos'
        const filtered = seg === 'Todos' ? LIST_DATA.results : LIST_DATA.results.filter((c) => c.segmento === seg)
        return Promise.resolve({ data: { ...LIST_DATA, total: filtered.length, results: filtered } })
      }
      return Promise.reject(new Error(`No mock para ${url}`))
    })
  })

  it('muestra los chips de segmentación con conteos en la lista de clientes', async () => {
    renderPage()
    expect(await screen.findByText('Ana Maria Gomez')).toBeInTheDocument()
    expect(screen.getAllByText('Oro Convergente').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Alerta Roja').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Hambrientos de Datos').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Nativos Digitales').length).toBeGreaterThanOrEqual(1)
  })

  it('etiqueta a cada cliente con su segmento', async () => {
    renderPage()
    expect(await screen.findByText('Riesgo Perez')).toBeInTheDocument()
    expect(screen.getAllByText('Alerta Roja').length).toBeGreaterThanOrEqual(2)
  })

  it('filtra por segmento en el servidor al hacer click en el chip', async () => {
    renderPage()
    expect(await screen.findByText('Ana Maria Gomez')).toBeInTheDocument()

    fireEvent.click(screen.getAllByText('Alerta Roja')[0])

    const calls = api.get.mock.calls.map((c) => c[0])
    expect(calls.some((u) => u.includes('segmento=Alerta') && u.includes('page=1'))).toBe(true)
    expect(await screen.findByText('Riesgo Perez')).toBeInTheDocument()
    expect(screen.queryByText('Ana Maria Gomez')).not.toBeInTheDocument()
  })

  it('pide la lista paginada con el segmento activo', async () => {
    renderPage()
    await screen.findByText('Ana Maria Gomez')
    const initial = api.get.mock.calls.map((c) => c[0]).find((u) => u.startsWith('/api/clients'))
    expect(initial).toContain('segmento=Todos')
    expect(initial).toContain('page_size=10')
  })
})