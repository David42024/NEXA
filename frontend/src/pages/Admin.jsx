import React, { useEffect, useState } from 'react'
import api from '../utils/api'
import IncidentsPanel from '../components/IncidentsPanel.jsx'

const ALL_PERMISSIONS = [
  'view_dashboard', 'search_client', 'view_client_profile', 'view_recommendation',
  'view_speech', 'register_acceptance', 'register_rejection', 'copy_speech',
  'view_funnel', 'view_trends', 'view_all_clients', 'view_team_performance',
  'export_reports', 'manage_users', 'manage_roles', 'view_system_logs', 'configure_thresholds',
]

export default function Admin() {
  const [permissions, setPermissions] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(null)
  const [dirty, setDirty] = useState({})

  const [metas, setMetas] = useState(null)
  const [metasSaving, setMetasSaving] = useState(false)

  useEffect(() => {
    api.get('/api/admin/permissions').then(({ data }) => setPermissions(data)).finally(() => setLoading(false))
    api.get('/api/admin/metas').then(({ data }) => setMetas({
      meta_diaria: data.META_VENTAS_DIARIA,
      meta_semanal: data.META_VENTAS_SEMANAL,
      meta_mensual: data.META_VENTAS_MENSUAL,
    })).catch(() => setMetas({ meta_diaria: 3, meta_semanal: 15, meta_mensual: 60 }))
  }, [])

  async function saveMetas() {
    setMetasSaving(true)
    try {
      const { data } = await api.put('/api/admin/metas', {
        meta_diaria: Number(metas.meta_diaria) || 3,
        meta_semanal: Number(metas.meta_semanal) || 15,
        meta_mensual: Number(metas.meta_mensual) || 60,
      })
      setMetas({
        meta_diaria: data.META_VENTAS_DIARIA,
        meta_semanal: data.META_VENTAS_SEMANAL,
        meta_mensual: data.META_VENTAS_MENSUAL,
      })
    } finally {
      setMetasSaving(false)
    }
  }

  function togglePerm(role, perm) {
    setDirty((prev) => {
      const current = prev[role] || permissions[role].permissions
      const has = current.includes(perm)
      const updated = has ? current.filter((p) => p !== perm) : [...current, perm]
      return { ...prev, [role]: updated }
    })
  }

  async function save(role) {
    setSaving(role)
    try {
      const list = dirty[role] || permissions[role].permissions
      await api.put(`/api/admin/permissions/${role}`, { permissions: list })
      setPermissions((prev) => ({ ...prev, [role]: { ...prev[role], permissions: list } }))
      setDirty((prev) => {
        const { [role]: _, ...rest } = prev
        return rest
      })
    } finally {
      setSaving(null)
    }
  }

  if (loading) return <p className="text-sm text-slate-400">Cargando…</p>

  return (
    <div>
      <p className="label-eyebrow">Administración</p>
      <h1 className="font-display font-bold text-2xl text-navy-900 mb-1">Roles y permisos</h1>
      <p className="text-sm text-slate-500 mb-6">Configurable en tiempo real, sin reiniciar el sistema.</p>

      {/* Incidencias operativas */}
      <IncidentsPanel />

      {/* Metas comerciales */}
      <div className="card p-6 mb-6 max-w-xl">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-display font-semibold text-lg text-navy-900">Metas comerciales</h3>
          {metasSaving && <span className="text-xs text-slate-400">Guardando…</span>}
        </div>
        <p className="text-xs text-slate-400 mb-4">
          El asesor ve en su dashboard su avance del día comparado con estas metas.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">Meta diaria</span>
            <input
              type="number"
              min="1"
              value={metas?.meta_diaria ?? 3}
              onChange={(e) => setMetas((m) => ({ ...m, meta_diaria: e.target.value }))}
              className="input"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">Meta semanal</span>
            <input
              type="number"
              min="1"
              value={metas?.meta_semanal ?? 15}
              onChange={(e) => setMetas((m) => ({ ...m, meta_semanal: e.target.value }))}
              className="input"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">Meta mensual</span>
            <input
              type="number"
              min="1"
              value={metas?.meta_mensual ?? 60}
              onChange={(e) => setMetas((m) => ({ ...m, meta_mensual: e.target.value }))}
              className="input"
            />
          </label>
        </div>
        <button onClick={saveMetas} disabled={metasSaving} className="btn-primary text-sm mt-4">
          Guardar metas
        </button>
      </div>

      <div className="space-y-5">
        {Object.entries(permissions).map(([role, data]) => {
          const current = dirty[role] || data.permissions
          const hasChanges = !!dirty[role]
          const isAdmin = current.includes('all_permissions')
          return (
            <div key={role} className="card p-6">
              <div className="flex items-center justify-between mb-1">
                <h3 className="font-display font-semibold text-lg capitalize text-navy-900">{role}</h3>
                {hasChanges && (
                  <button onClick={() => save(role)} disabled={saving === role} className="btn-primary text-xs">
                    {saving === role ? 'Guardando…' : 'Guardar cambios'}
                  </button>
                )}
              </div>
              <p className="text-xs text-slate-400 mb-4">{data.description}</p>

              {isAdmin ? (
                <p className="text-sm text-cyan-600 bg-cyan-50 rounded-lg px-3 py-2 inline-block">
                  ✓ Este rol tiene todos los permisos (all_permissions)
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {ALL_PERMISSIONS.map((perm) => (
                    <button
                      key={perm}
                      onClick={() => togglePerm(role, perm)}
                      className={`text-xs px-3 py-1.5 rounded-full border transition-colors font-mono ${
                        current.includes(perm)
                          ? 'bg-cyan-50 border-cyan-200 text-cyan-700'
                          : 'bg-white border-slate-200 text-slate-400'
                      }`}
                    >
                      {perm}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
