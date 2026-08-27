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
import ClientCall from './pages/ClientCall.jsx'
import ClientChat from './pages/ClientChat.jsx'
import Funnel from './pages/Funnel.jsx'
import Admin from './pages/Admin.jsx'
import HeatmapPage from './pages/HeatmapPage.jsx'
import Metas from './pages/Metas.jsx'
import SupervisorSales from './pages/SupervisorSales.jsx'
import SupervisorSalesDetail from './pages/SupervisorSalesDetail.jsx'

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
        path="/metas"
        element={
          <ProtectedRoute permission="view_recommendation">
            <Layout><Metas /></Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/supervisor/ventas"
        element={
          <ProtectedRoute permission="view_funnel">
            <Layout><SupervisorSales /></Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/supervisor/ventas-detalle"
        element={
          <ProtectedRoute permission="view_funnel">
            <Layout><SupervisorSalesDetail /></Layout>
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
      <Route
        path="/supervisor/mapa-calor"
        element={
          <ProtectedRoute permission="view_funnel">
            <Layout><HeatmapPage /></Layout>
          </ProtectedRoute>
        }
      />

      {/* WebRTC P2P: llamada por enlace para el cliente */}
      <Route path="/llamada/:callId" element={<ClientCall />} />

      {/* Pagina publica del chat de mensajes con el cliente (link del asesor) */}
      <Route path="/mensaje/:chatId" element={<ClientChat />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
