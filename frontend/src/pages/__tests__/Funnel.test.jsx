import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../utils/api', () => ({
  default: { get: vi.fn() },
}))

import api from '../../utils/api'
import Funnel from '../Funnel.jsx'

const E2E = {
  total: 21,
  stages: [
    { key: 'classified', label: 'Clasificados', value: 21, pct_of_previous: null },
    { key: 'planned', label: 'Contacto y mensaje', value: 14, pct_of_previous: 66.7 },
    { key: 'contacted', label: 'Contactabilidad', value: 14, pct_of_previous: 100 },
    { key: 'objection', label: 'Objeciones manejadas', value: 7, pct_of_previous: 50 },
    { key: 'result', label: 'Resultado de venta', value: 7, pct_of_previous: 100 },
  ],
  channels: [
    { label: 'WhatsApp', value: 10 },
    { label: 'App', value: 11 },
    { label: 'Llamada', value: 7 },
  ],
  contact_status: [
    { label: 'answered', value: 16 },
    { label: 'read', value: 4 },
    { label: 'unanswered', value: 1 },
  ],
  evidence_types: [
    { label: 'call_audio', value: 8 },
    { label: 'platform_register', value: 6 },
  ],
  results: [{ label: 'accepted', value: 7 }],
  rejection_reasons: [{ label: 'precio', value: 2 }],
  objections: { alcanzaron_objecion: 7, manejadas_con_rebate: 3 },
}

function renderPage() {
  api.get.mockImplementation((url) => {
    if (url === '/api/funnel/daily') {
      return Promise.resolve({
        data: {
          stages: [
            { label: 'Clientes analizados', value: 28 },
            { label: 'Priorizados (elegibles)', value: 28 },
            { label: 'Contactados', value: 21 },
            { label: 'Ofrecimientos', value: 21 },
            { label: 'Aceptaciones', value: 7 },
          ],
          conversion_rate: 25,
        },
      })
    }
    if (url === '/api/funnel/trends') return Promise.resolve({ data: [] })
    if (url === '/api/funnel/breakdown') return Promise.resolve({ data: null })
    if (url.startsWith('/api/e2e/report')) return Promise.resolve({ data: E2E })
    return Promise.reject(new Error(`No mock para ${url}`))
  })
  return render(<Funnel />)
}

describe('Funnel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renderiza el viaje completo de la oferta con embudo y desgloses', async () => {
    renderPage()
    expect(await screen.findByText('El viaje completo de la oferta')).toBeInTheDocument()
    expect(screen.getByText(/Total de ofrecimientos rastreados/)).toBeInTheDocument()
    expect(screen.getAllByText('Canales de contacto').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Contactabilidad real')).toBeInTheDocument()
    expect(screen.getByText('Medios probatorios')).toBeInTheDocument()
    expect(screen.getByText('Resultado de venta')).toBeInTheDocument()
    expect(screen.getByText('Objeciones')).toBeInTheDocument()
    expect(screen.getByText('Motivos de rechazo')).toBeInTheDocument()
  })

  it('resalta la mayor pérdida entre etapas', async () => {
    renderPage()
    expect(await screen.findByText(/Mayor pérdida/)).toBeInTheDocument()
    expect(screen.getByText(/Clasificados.*Contacto y mensaje/)).toBeInTheDocument()
  })
})