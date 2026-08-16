import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../../utils/api', () => ({
  default: { get: vi.fn() },
}))

import api from '../../utils/api'
import { AuthProvider } from '../../context/AuthContext.jsx'
import SupervisorDashboard from '../SupervisorDashboard.jsx'

const KPI_DATA = {
  total_clientes: 100060,
  elegibles_mt: 55000,
  conversion_pct: 14.5,
  valor_potencial_soles: 1226500,
  aceptadas: 5013,
  total_interacciones: 42561,
}

const ASESORES_DATA = {
  asesores: [
    {
      id: 7, name: 'Ana Torres', email: 'asesor001@nexa.demo', ventas: 0,
      clientes_cartera: 972, interacciones: 400, aceptadas: 72, rechazadas: 328,
      conversion_pct: 18.0, friccion_pct: 82.0, meta_ventas: 4, cumplido: false, progreso: 0,
    },
    {
      id: 8, name: 'Carlos Ruiz', email: 'asesor002@nexa.demo', ventas: 0,
      clientes_cartera: 972, interacciones: 250, aceptadas: 3, rechazadas: 247,
      conversion_pct: 1.2, friccion_pct: 98.8, meta_ventas: 4, cumplido: false, progreso: 0,
    },
  ],
  mes: '2026-08',
  meta_ventas: 4,
}

const SEGMENTOS_DATA = {
  base: 100060,
  segmentos: [
    { key: 'movistar_total', label: 'Movistar Total', descripcion: '', count: 55000, pct: 55.0, potencial_soles: 1226500 },
    { key: 'upgrade', label: 'Upgrade', descripcion: '', count: 40000, pct: 40.0, potencial_soles: 892000 },
    { key: 'equipo', label: 'Equipo', descripcion: '', count: 30000, pct: 30.0, potencial_soles: 669000 },
    { key: 'plan_hogar', label: 'Plan Hogar', descripcion: '', count: 25000, pct: 25.0, potencial_soles: 557500 },
  ],
}

const FUNNEL_DATA = {
  stages: [
    { label: 'Clientes analizados', value: 37539 },
    { label: 'Priorizados (elegibles)', value: 37000 },
    { label: 'Contactados', value: 20000 },
    { label: 'Ofrecimientos', value: 12422 },
    { label: 'Aceptaciones', value: 1246 },
  ],
  conversion_rate: 3.3,
}

function renderDashboard() {
  localStorage.setItem('nexa_user', JSON.stringify({ email: 's@nexa.demo', role: 'supervisor', name: 'Luis Ramirez' }))
  return render(
    <MemoryRouter>
      <AuthProvider>
        <SupervisorDashboard />
      </AuthProvider>
    </MemoryRouter>
  )
}

describe('SupervisorDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    api.get.mockImplementation((url) => {
      if (url === '/api/admin/kpis') return Promise.resolve({ data: KPI_DATA })
      if (url === '/api/admin/asesores') return Promise.resolve({ data: ASESORES_DATA })
      if (url === '/api/admin/segmentos') return Promise.resolve({ data: SEGMENTOS_DATA })
      return Promise.resolve({ data: FUNNEL_DATA })
    })
  })

  it('muestra el encabezado gerencial con los KPIs globales', async () => {
    renderDashboard()
    expect(screen.getByText('Hola, Luis')).toBeInTheDocument()
    expect(await screen.findByText('14.5%')).toBeInTheDocument()
    expect(screen.getByText('S/ 1,226,500')).toBeInTheDocument()
    expect(screen.getByText('5,013')).toBeInTheDocument()
  })

  it('muestra la segmentación IA de la base', async () => {
    renderDashboard()
    expect(await screen.findByText('Movistar Total')).toBeInTheDocument()
    expect(screen.getByText('55% de la base')).toBeInTheDocument()
  })

  it('muestra el bloque de control de churn (MoM) con los segmentos clave', () => {
    renderDashboard()
    expect(screen.getByText('Eficiencia de segmentación IA & control de churn (MoM)')).toBeInTheDocument()
    expect(screen.getByText('Oro Convergente')).toBeInTheDocument()
    expect(screen.getByText('Alerta Roja (Riesgo)')).toBeInTheDocument()
    expect(screen.getByText('Hambrientos de Datos')).toBeInTheDocument()
    expect(screen.getByText('Nativos Digitales')).toBeInTheDocument()
    expect(screen.getByText('92.4%')).toBeInTheDocument()
    expect(screen.getByText('Volumen de base: 45%')).toBeInTheDocument()
  })

  it('muestra un aviso cuando la API no responde', async () => {
    api.get.mockImplementation(() => Promise.reject(new Error('Network/CORS')))
    renderDashboard()
    expect(await screen.findByText('No se pudieron cargar los datos del backend.')).toBeInTheDocument()
    // El bloque de churn es estatico y sigue visible.
    expect(screen.getByText('Oro Convergente')).toBeInTheDocument()
  })

  it('rankear embajadores y riesgo por conversión de cartera', async () => {
    renderDashboard()
    expect((await screen.findAllByText('Ana Torres')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Carlos Ruiz').length).toBeGreaterThan(0)
    // El insight se genera con los datos reales del mejor y el peor.
    expect(screen.getByText(/Ana Torres lidera con 18%/)).toBeInTheDocument()
  })
})