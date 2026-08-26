import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext.jsx'
import Layout from './components/Layout.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'

import Login from './pages/Login.jsx'
import Dashboard from './pages/Dashboard.jsx'
import SupervisorDashboard from './pages/SupervisorDashboard.jsx'
import ClientSearch from './pages/ClientSearch.jsx'
import ClientProfile from './pages/ClientProfile.jsx'
// import ClientCall from './pages/ClientCall.jsx'  // deshabilitado: llamadas reales via Twilio
import ClientChat from './pages/ClientChat.jsx'
import Funnel from './pages/Funnel.jsx'
import Admin from './pages/Admin.jsx'

export default function App() {
  const { user } = useAuth()

  // El dashboard gerencial es la vista del supervisor/admin; el asesor usa el suyo.
  const HomeDashboard = user?.role === 'supervisor' || user?.role === 'admin' ? SupervisorDashboard : Dashboard

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />

      <Route
        path="/"
        element={
          <ProtectedRoute permission="view_dashboard">
            <Layout><HomeDashboard /></Layout>
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

      {/* WebRTC P2P deshabilitado: las llamadas son reales via Twilio (PSTN) */}
      {/* <Route path="/llamada/:callId" element={<ClientCall />} /> */}

      {/* Pagina publica del chat de mensajes con el cliente (link del asesor) */}
      <Route path="/mensaje/:chatId" element={<ClientChat />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
