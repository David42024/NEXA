import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext.jsx'
import Layout from './components/Layout.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'

import Login from './pages/Login.jsx'
import Dashboard from './pages/Dashboard.jsx'
import ClientSearch from './pages/ClientSearch.jsx'
import ClientProfile from './pages/ClientProfile.jsx'
import ClientCall from './pages/ClientCall.jsx'
import Funnel from './pages/Funnel.jsx'
import Admin from './pages/Admin.jsx'

export default function App() {
  const { user } = useAuth()

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />

      <Route
        path="/"
        element={
          <ProtectedRoute permission="view_dashboard">
            <Layout><Dashboard /></Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/clientes"
        element={
          <ProtectedRoute permission="search_client">
            <Layout><ClientSearch /></Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/clientes/:id"
        element={
          <ProtectedRoute permission="view_client_profile">
            <Layout><ClientProfile /></Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/funnel"
        element={
          <ProtectedRoute permission="view_funnel">
            <Layout><Funnel /></Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <ProtectedRoute permission="manage_roles">
            <Layout><Admin /></Layout>
          </ProtectedRoute>
        }
      />

      {/* Página pública de la llamada entrante del "cliente" (WebRTC) */}
      <Route path="/llamada/:callId" element={<ClientCall />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
