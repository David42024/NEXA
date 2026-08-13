import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../utils/api', () => ({
  default: {
    post: vi.fn(),
    get: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  },
}))

import api from '../../utils/api'
import { AuthProvider, useAuth } from '../AuthContext.jsx'

function Consumer() {
  const { user, login, logout, loading, error, hasPermission } = useAuth()
  return (
    <div>
      <button onClick={() => login('a@b.c', 'pw')}>login</button>
      <button onClick={logout}>logout</button>
      <span data-testid="user">{user ? user.email : 'none'}</span>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="error">{error || 'no-error'}</span>
      <span data-testid="perm-dashboard">{hasPermission('view_dashboard') ? 'yes' : 'no'}</span>
      <span data-testid="perm-export">{hasPermission('export_reports') ? 'yes' : 'no'}</span>
    </div>
  )
}

function renderWithAuth() {
  return render(
    <AuthProvider>
      <Consumer />
    </AuthProvider>
  )
}

beforeEach(() => {
  localStorage.clear()
  api.post.mockReset()
})

describe('AuthContext', () => {
  it('guarda token y usuario en localStorage al hacer login exitoso', async () => {
    api.post.mockResolvedValueOnce({
      data: {
        access_token: 'token-abc',
        refresh_token: 'refresh-xyz',
        user: { id: 1, email: 'asesor@nexa.demo', name: 'Ana', role: 'asesor', permissions: ['view_dashboard'] },
      },
    })

    renderWithAuth()
    fireEvent.click(screen.getByText('login'))

    await waitFor(() => expect(localStorage.getItem('nexa_token')).toBe('token-abc'))
    expect(localStorage.getItem('nexa_refresh')).toBe('refresh-xyz')
    const storedUser = JSON.parse(localStorage.getItem('nexa_user'))
    expect(storedUser.email).toBe('asesor@nexa.demo')
    expect(screen.getByTestId('user')).toHaveTextContent('asesor@nexa.demo')
  })

  it('setea error cuando el login falla', async () => {
    api.post.mockRejectedValueOnce({ response: { data: { detail: 'Credenciales invalidas' } } })

    renderWithAuth()
    fireEvent.click(screen.getByText('login'))

    await waitFor(() => expect(screen.getByTestId('error')).toHaveTextContent('Credenciales invalidas'))
    expect(localStorage.getItem('nexa_token')).toBeNull()
    expect(screen.getByTestId('user')).toHaveTextContent('none')
  })

  it('hasPermission respeta all_permissions', () => {
    localStorage.setItem(
      'nexa_user',
      JSON.stringify({ email: 'admin@nexa.demo', role: 'admin', permissions: ['all_permissions'] })
    )
    renderWithAuth()

    // Sin permiso listado, pero all_permissions lo concede todo
    expect(screen.getByTestId('perm-dashboard')).toHaveTextContent('yes')
    expect(screen.getByTestId('perm-export')).toHaveTextContent('yes')
  })

  it('hasPermission es false sin permiso y sin all_permissions', () => {
    localStorage.setItem(
      'nexa_user',
      JSON.stringify({ email: 'asesor@nexa.demo', role: 'asesor', permissions: ['view_dashboard'] })
    )
    renderWithAuth()

    expect(screen.getByTestId('perm-dashboard')).toHaveTextContent('yes')
    expect(screen.getByTestId('perm-export')).toHaveTextContent('no')
  })

  it('logout limpia el estado y localStorage', async () => {
    localStorage.setItem('nexa_token', 'tok')
    localStorage.setItem('nexa_user', JSON.stringify({ email: 'a@b.c', role: 'asesor', permissions: [] }))
    renderWithAuth()

    fireEvent.click(screen.getByText('logout'))
    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('none'))
    expect(localStorage.getItem('nexa_token')).toBeNull()
    expect(localStorage.getItem('nexa_user')).toBeNull()
  })
})
