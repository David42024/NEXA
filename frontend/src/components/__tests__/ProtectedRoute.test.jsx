import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

vi.mock('../../utils/api', () => ({
  default: { post: vi.fn(), get: vi.fn() },
}))

import { AuthProvider } from '../../context/AuthContext.jsx'
import ProtectedRoute from '../ProtectedRoute.jsx'

function renderRoute(user) {
  if (user) localStorage.setItem('nexa_user', JSON.stringify(user))
  return render(
    <MemoryRouter initialEntries={['/protected']}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<div>Login page</div>} />
          <Route
            path="/protected"
            element={
              <ProtectedRoute permission="view_funnel">
                <div>Contenido protegido</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  )
}

describe('ProtectedRoute', () => {
  it('redirige a /login cuando no hay usuario', () => {
    renderRoute(null)
    expect(screen.getByText('Login page')).toBeInTheDocument()
    expect(screen.queryByText('Contenido protegido')).not.toBeInTheDocument()
  })

  it('muestra mensaje de sin permiso cuando falta el permiso requerido', () => {
    renderRoute({ email: 'a@b.c', role: 'asesor', permissions: ['view_dashboard'] })
    expect(screen.getByText('No tienes permiso para ver esta sección')).toBeInTheDocument()
    expect(screen.queryByText('Contenido protegido')).not.toBeInTheDocument()
  })

  it('renderiza el contenido cuando el usuario tiene el permiso', () => {
    renderRoute({ email: 's@b.c', role: 'supervisor', permissions: ['view_funnel'] })
    expect(screen.getByText('Contenido protegido')).toBeInTheDocument()
  })

  it('permite el acceso con all_permissions', () => {
    renderRoute({ email: 'admin@b.c', role: 'admin', permissions: ['all_permissions'] })
    expect(screen.getByText('Contenido protegido')).toBeInTheDocument()
  })
})
