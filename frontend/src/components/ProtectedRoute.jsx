import React from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

export default function ProtectedRoute({ children, permission }) {
  const { user, hasPermission } = useAuth()

  if (!user) return <Navigate to="/login" replace />
  if (permission && !hasPermission(permission)) {
    return (
      <div className="flex items-center justify-center h-full py-24">
        <div className="text-center">
          <p className="text-4xl mb-3">🔒</p>
          <p className="font-display font-semibold text-lg">No tienes permiso para ver esta sección</p>
          <p className="text-slate-500 text-sm mt-1">Contacta a un administrador si crees que esto es un error.</p>
        </div>
      </div>
    )
  }
  return children
}
