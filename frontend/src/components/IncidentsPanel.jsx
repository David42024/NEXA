import React, { useCallback, useEffect, useState } from 'react'
import api from '../utils/api'
import Badge from './Badge.jsx'
import { AlertTriangle, CheckCircle2, Plus, RotateCcw, ShieldAlert, X } from 'lucide-react'

const CATEGORIES = ['sistema', 'llamada', 'datos', 'cliente', 'otro']
const SEVERITIES = ['baja', 'media', 'alta', 'critica']

const SEVERITY_TONE = { critica: 'danger', alta: 'warning', media: 'info', baja: 'neutral' }
const SEVERITY_LABEL = { critica: 'Crítica', alta: 'Alta', media: 'Media', baja: 'Baja' }
const CATEGORY_LABEL = {
  sistema: 'Sistema', llamada: 'Llamada', datos: 'Datos', cliente: 'Cliente', otro: 'Otro',
}

function fmtDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' }) +
    ' · ' + d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })
}

export default function IncidentsPanel() {
  const [items, setItems] = useState([])
  const [stats, setStats] = useState(null)
  const [filters, setFilters] = useState({ status: 'todas', severity: 'todas', category: 'todas' })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', category: 'sistema', severity: 'media', client_id: '' })
  const [saving, setSaving] = useState(false)

  const [resolvingId, setResolvingId] = useState(null)
  const [resolutionNote, setResolutionNote] = useState('')

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ n: '100' })
      if (filters.status !== 'todas') params.set('status', filters.status)
      if (filters.severity !== 'todas') params.set('severity', filters.severity)
      if (filters.category !== 'todas') params.set('category', filters.category)
      const { data } = await api.get(`/api/admin/incidents?${params.toString()}`)
      setItems(data.items)
      setStats(data.stats)
      setError(null)
    } catch (e) {
      if (e?.response?.status === 403) setError('Tu rol no tiene el permiso "view_system_logs" para ver este panel.')
      else setError('No se pudieron cargar las incidencias.')
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => { load() }, [load])

  async function submit(e) {
    e.preventDefault()
    if (!form.title.trim()) return
    setSaving(true)
    try {
      await api.post('/api/incidents', {
        title: form.title,
        description: form.description || null,
        category: form.category,
        severity: form.severity,
        client_id: form.client_id.trim() ? form.client_id.trim().toUpperCase() : null,
      })
      setForm({ title: '', description: '', category: 'sistema', severity: 'media', client_id: '' })
      setShowForm(false)
      await load()
    } finally {
      setSaving(false)
    }
  }

  async function resolve(id) {
    try {
      await api.patch(`/api/admin/incidents/${id}`, { status: 'resuelta', resolution_note: resolutionNote })
      setResolvingId(null)
      setResolutionNote('')
      await load()
    } catch { /* noop */ }
  }

  async function reopen(id) {
    try {
      await api.patch(`/api/admin/incidents/${id}`, { status: 'abierta' })
      await load()
    } catch { /* noop */ }
  }

  return (
    <div className="card p-6 mb-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-display font-semibold text-lg text-navy-900">Incidencias</h3>
          <p className="text-xs text-slate-400">
            Problemas reportados por los usuarios y su seguimiento.
          </p>
        </div>
        <button onClick={() => setShowForm((v) => !v)} className="btn-secondary text-xs flex items-center gap-1">
          {showForm ? <><X size={14} /> Cancelar</> : <><Plus size={14} /> Reportar incidencia</>}
        </button>
      </div>

      {/* Contadores */}
      {stats && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-slate-200 p-3 text-center">
            <p className="text-xl font-bold text-navy-900">{stats.total}</p>
            <p className="text-xs text-slate-400">Total</p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-center">
            <p className="text-xl font-bold text-amber-700">{stats.abiertas}</p>
            <p className="text-xs text-amber-600">Abiertas</p>
          </div>
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-center">
            <p className="text-xl font-bold text-rose-700">{stats.criticas_abiertas}</p>
            <p className="text-xs text-rose-500">Críticas abiertas</p>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-center">
            <p className="text-xl font-bold text-emerald-700">{stats.resueltas}</p>
            <p className="text-xs text-emerald-600">Resueltas</p>
          </div>
        </div>
      )}

      {/* Formulario de reporte */}
      {showForm && (
        <form onSubmit={submit} className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <input
              className="input sm:col-span-3"
              placeholder="Título de la incidencia *"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              maxLength={150}
              required
            />
            <select
              className="input"
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            >
              {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
            </select>
            <select
              className="input"
              value={form.severity}
              onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value }))}
            >
              {SEVERITIES.map((s) => <option key={s} value={s}>{SEVERITY_LABEL[s]}</option>)}
            </select>
            <input
              className="input"
              placeholder="Cliente (ej. C00001, opcional)"
              value={form.client_id}
              onChange={(e) => setForm((f) => ({ ...f, client_id: e.target.value }))}
              maxLength={10}
            />
          </div>
          <textarea
            className="input min-h-[70px]"
            placeholder="Describe qué pasó…"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
          <button type="submit" disabled={saving || !form.title.trim()} className="btn-primary text-sm">
            {saving ? 'Enviando…' : 'Registrar incidencia'}
          </button>
        </form>
      )}

      {/* Filtros */}
      <div className="mb-4 flex flex-wrap gap-2">
        {[
          { key: 'status', label: 'Estado', options: [['todas', 'Todos los estados'], ['abierta', 'Abiertas'], ['resuelta', 'Resueltas']] },
          { key: 'severity', label: 'Severidad', options: [['todas', 'Toda severidad'], ...SEVERITIES.map((s) => [s, SEVERITY_LABEL[s]])] },
          { key: 'category', label: 'Categoría', options: [['todas', 'Toda categoría'], ...CATEGORIES.map((c) => [c, CATEGORY_LABEL[c]])] },
        ].map(({ key, options }) => (
          <select
            key={key}
            value={filters[key]}
            onChange={(e) => setFilters((f) => ({ ...f, [key]: e.target.value }))}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600 focus:border-cyan-500 focus:outline-none"
          >
            {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        ))}
      </div>

      {loading && <p className="text-sm text-slate-400">Cargando incidencias…</p>}
      {!loading && error && (
        <p className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
          <ShieldAlert size={16} /> {error}
        </p>
      )}
      {!loading && !error && items.length === 0 && (
        <p className="flex items-center gap-2 text-sm text-slate-400">
          <CheckCircle2 size={16} className="text-emerald-500" /> Sin incidencias que coincidan con el filtro.
        </p>
      )}

      {/* Listado */}
      {!loading && !error && (
        <ul className="space-y-3">
          {items.map((inc) => (
            <li key={inc.id} className={`rounded-xl border p-4 ${inc.status === 'abierta' && inc.severity === 'critica'
              ? 'border-rose-300 bg-rose-50/60' : 'border-slate-200'}`}>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={SEVERITY_TONE[inc.severity]}>{SEVERITY_LABEL[inc.severity]}</Badge>
                <Badge tone="neutral">{CATEGORY_LABEL[inc.category]}</Badge>
                {inc.status === 'abierta'
                  ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600"><AlertTriangle size={13} /> Abierta</span>
                  : <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600"><CheckCircle2 size={13} /> Resuelta</span>}
                {inc.client_id && <span className="ml-auto font-mono text-xs text-slate-400">{inc.client_id}</span>}
                <span className="text-xs text-slate-400">{fmtDate(inc.created_at)}</span>
              </div>

              <p className="mt-2 text-sm font-semibold text-navy-900">{inc.title}</p>
              {inc.description && <p className="mt-0.5 whitespace-pre-line text-xs text-slate-500">{inc.description}</p>}
              <p className="mt-1 text-xs text-slate-400">
                Reportada por {inc.reporter_name || '—'}
                {inc.resolved_at && <> · Resuelta por {inc.resolver_name || '—'} el {fmtDate(inc.resolved_at)}</>}
              </p>

              {inc.status === 'abierta' ? (
                resolvingId === inc.id ? (
                  <div className="mt-3 space-y-2">
                    <textarea
                      className="input min-h-[60px]"
                      placeholder="¿Cómo se resolvió?"
                      value={resolutionNote}
                      onChange={(e) => setResolutionNote(e.target.value)}
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <button onClick={() => resolve(inc.id)} className="btn-primary text-xs">Confirmar resolución</button>
                      <button onClick={() => { setResolvingId(null); setResolutionNote('') }} className="btn-secondary text-xs">Cancelar</button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => { setResolvingId(inc.id); setResolutionNote('') }}
                    className="btn-secondary mt-3 text-xs flex items-center gap-1"
                  >
                    <CheckCircle2 size={13} /> Resolver
                  </button>
                )
              ) : (
                <div className="mt-2">
                  {inc.resolution_note && (
                    <p className="rounded-lg bg-emerald-50 px-3 py-1.5 text-xs text-emerald-700">
                      Resolución: {inc.resolution_note}
                    </p>
                  )}
                  <button onClick={() => reopen(inc.id)} className="mt-2 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-cyan-600">
                    <RotateCcw size={12} /> Reabrir
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
