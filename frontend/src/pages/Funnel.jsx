import React, { useEffect, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, BarChart, Bar } from 'recharts'
import api from '../utils/api'

const PERIODS = [
  { key: 'daily', label: '📊 Diario', endpoint: '/api/funnel/daily' },
  { key: 'weekly', label: '📈 Semanal', endpoint: '/api/funnel/weekly' },
  { key: 'monthly', label: '📉 Mensual', endpoint: '/api/funnel/monthly' },
]

export default function Funnel() {
  const [period, setPeriod] = useState('daily')
  const [funnel, setFunnel] = useState(null)
  const [trends, setTrends] = useState([])
  const [breakdown, setBreakdown] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const endpoint = PERIODS.find((p) => p.key === period).endpoint
        const [funnelRes, trendsRes, breakdownRes] = await Promise.all([
          api.get(endpoint),
          api.get('/api/funnel/trends').catch(() => ({ data: [] })),
          api.get('/api/funnel/breakdown').catch(() => ({ data: null })),
        ])
        setFunnel(funnelRes.data)
        setTrends(trendsRes.data)
        setBreakdown(breakdownRes.data)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [period])

  return (
    <div>
      <p className="label-eyebrow">Supervisión</p>
      <h1 className="font-display font-bold text-2xl text-navy-900 mb-6">Funnel de conversión</h1>

      <div className="flex gap-2 mb-6">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              period === p.key ? 'bg-navy-900 text-white' : 'bg-white border border-slate-200 text-slate-600'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-6">
        {loading || !funnel ? (
          <p className="text-sm text-slate-400 col-span-5">Cargando…</p>
        ) : (
          funnel.stages.map((s, i) => (
            <div key={s.label} className="card p-5 text-center">
              <p className="font-display font-bold text-2xl text-navy-900">{s.value.toLocaleString('es-PE')}</p>
              <p className="text-xs text-slate-400 mt-1">{s.label}</p>
              {i > 0 && (
                <p className="text-[11px] text-cyan-600 mt-1">
                  {Math.round((s.value / funnel.stages[i - 1].value) * 100)}% del anterior
                </p>
              )}
            </div>
          ))
        )}
      </div>

      {!loading && funnel && (
        <div className="card p-5 mb-6 flex items-center justify-between">
          <span className="text-sm text-slate-500">Conversión total del periodo</span>
          <span className="font-display font-bold text-xl text-cyan-600">{funnel.conversion_rate}%</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
        <div className="card p-6">
          <p className="label-eyebrow mb-4">Tendencia · últimos 30 días</p>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={trends}>
              <CartesianGrid strokeDasharray="3 3" stroke="#EEF1F5" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d) => d.slice(5)} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Line type="monotone" dataKey="conversion_rate" stroke="#00AEEF" strokeWidth={2} dot={false} name="Conversión %" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="card p-6">
          <p className="label-eyebrow mb-4">Ofertas y aceptaciones diarias</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={trends}>
              <CartesianGrid strokeDasharray="3 3" stroke="#EEF1F5" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d) => d.slice(5)} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Bar dataKey="offered" fill="#CBD5E1" name="Ofrecimientos" radius={[4, 4, 0, 0]} />
              <Bar dataKey="accepted" fill="#00AEEF" name="Aceptaciones" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {breakdown && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <BreakdownCard title="Ofertas más aceptadas" items={breakdown.top_offers.map(o => ({ label: o.name, value: o.count }))} />
          <BreakdownCard title="Canales más efectivos" items={breakdown.channels.map(c => ({ label: c.channel, value: c.count }))} />
          <BreakdownCard title="Motivos de rechazo" items={breakdown.rejection_reasons.map(r => ({ label: r.reason, value: r.count }))} />
        </div>
      )}
    </div>
  )
}

function BreakdownCard({ title, items }) {
  const max = Math.max(...items.map((i) => i.value), 1)
  return (
    <div className="card p-5">
      <p className="label-eyebrow mb-3">{title}</p>
      {items.length === 0 ? (
        <p className="text-xs text-slate-400">Sin datos aún</p>
      ) : (
        <div className="space-y-2.5">
          {items.map((it) => (
            <div key={it.label}>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-500 truncate">{it.label}</span>
                <span className="font-mono text-navy-800">{it.value}</span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full bg-cyan-500 rounded-full" style={{ width: `${(it.value / max) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
