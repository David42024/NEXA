import React, { createContext, useContext, useState, useCallback } from 'react'
import api from '../utils/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('nexa_user')
    return stored ? JSON.parse(stored) : null
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const login = useCallback(async (email, password) => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.post('/api/auth/login', { email, password })
      localStorage.setItem('nexa_token', data.access_token)
      if (data.refresh_token) localStorage.setItem('nexa_refresh', data.refresh_token)
      localStorage.setItem('nexa_user', JSON.stringify(data.user))
      setUser(data.user)
      return true
    } catch (e) {
      setError(e.response?.data?.detail || 'No se pudo iniciar sesión')
      return false
    } finally {
      setLoading(false)
    }
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('nexa_token')
    localStorage.removeItem('nexa_refresh')
    localStorage.removeItem('nexa_user')
    setUser(null)
  }, [])

  const hasPermission = useCallback((perm) => {
    if (!user) return false
    return user.permissions?.includes('all_permissions') || user.permissions?.includes(perm)
  }, [user])

  return (
    <AuthContext.Provider value={{ user, login, logout, loading, error, hasPermission }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return ctx
}
