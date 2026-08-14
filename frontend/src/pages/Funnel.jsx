import React, { useEffect, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, BarChart, Bar } from 'recharts'
import api from '../utils/api'

const PERIODS = [
  { key: 'daily', label: '📊 Diario', endpoint: '/api/funnel/daily', days: 7 },
  { key: 'weekly', label: '📈 Semanal', endpoint: '/api/funnel/weekly', days: 28 },
  { key: 'monthly', label: '📉 Mensual', endpoint: '/api/funnel/monthly', days: 180 },
]

const STAGE_TIPS_CLASSIC = {
  'Clientes analizados': 'Clientes evaluados por el motor NBO para detectar elegibilidad y oportunidad comercial.',
  'Priorizados (elegibles)': 'Clientes con oferta recomendada, ordenados por score de prioridad.',
  'Contactados': 'Clientes a los que el asesor contactó. Abrir su perfil tras una búsqueda cuenta como contacto (una vez por cliente por día).',
  'Ofrecimientos': 'Ofertas presentadas al cliente (alcanzaron la etapa de objeciones del seguimiento E2E).',
  'Aceptaciones': 'Ofertas aceptadas = ventas cerradas en el periodo.',
}
const STAGE_TIPS_E2E = {
  classified: 'Cliente clasificado y con oferta recomendada: aquí inicia el seguimiento de la oferta.',
  planned: 'Se definió el canal de contacto (WhatsApp, Llamada o App) y el mensaje/speech a enviar.',
  contacted: 'Contactabilidad real: el cliente contestó, solo leyó o no respondió.',
  objection: 'El cliente planteó objeciones y el asesor las manejó (con o sin rebate).',
  result: 'Cierre de venta: oferta aceptada o rechazada.',
}
const PCT_TIP = 'Porcentaje que representa este valor respecto a la etapa anterior. Menor a 100% = se pierden ofrecimientos entre etapas.'
const DROP_TIP = 'Ofrecimientos que llegaron a la etapa anterior pero no continuaron a esta (pérdida entre etapas).'
const TOTAL_TIP = 'Ofrecimientos rastreados en la ventana del periodo. Un cliente analizado = un ofrecimiento, así coincide con el funnel clásico.'
const BREAKDOWN_TIPS = {
  'Canales de contacto': 'Distribución de ofrecimientos por canal usado (WhatsApp, Llamada, App).',
  'Contactabilidad real': 'Resultado del contacto: cuántos contestaron, solo leyeron o no respondieron.',
  'Medios probatorios': 'Evidencia registrada del ofrecimiento: audio de llamada o registro en plataforma.',
  'Resultado de venta': 'Cierre del ofrecimiento: aceptadas vs rechazadas.',
  'Objeciones': 'Cuántos ofrecimientos alcanzaron la etapa de objeciones y cuántos se manejaron con rebate.',
  'Motivos de rechazo': 'Razones reportadas por el cliente al rechazar la oferta.',
  'Ofertas más aceptadas': 'Ofertas con más ventas cerradas en el periodo.',
  'Canales más efectivos': 'Canales con más ofertas aceptadas.',
}
function Tip({ text, side = 'top' }) {
  return (
    <span
      className={`pointer-events-none absolute z-30 hidden w-56 rounded-lg bg-navy-900 px-3 py-2 text-[11px] font-normal leading-snug text-white shadow-xl group-hover:block dark:bg-navy-700 dark:ring-1 dark:ring-white/10 ${
        side === 'top' ? 'bottom-full left-1/2 mb-2 -translate-x-1/2' : 'top-full left-1/2 mt-2 -translate-x-1/2'
      }`}
    >
      {text}
    </span>
  )
}

const E2E_COLORS = [
  'from-cyan-400 to-sky-500',
  'from-sky-400 to-blue-500',
  'from-blue-400 to-blue-600',
  'from-cyan-500 to-cyan-600',
  'from-sky-500 to-blue-700',
  'from-blue-600 to-navy-800',
]
const CONTACT_LABELS = { answered: 'Contestó', read: 'Leyó', unanswered: 'No respondió' }
const EVIDENCE_LABELS = { call_audio: 'Audio de llamada', platform_register: 'Registro en plataforma' }
const RESULT_LABELS = { accepted: 'Aceptadas', rejected: 'Rechazadas' }

export default function Funnel() {
  const [period, setPeriod] = useState('daily')
  const [funnel, setFunnel] = useState(null)
  const [trends, setTrends] = useState([])
  const [breakdown, setBreakdown] = useState(null)
  const [e2e, setE2e] = useState(null)
  const [e2eLoading, setE2eLoading] = useState(true)
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
      const e2eRes = await api.get(`/api/e2e/report?days=${PERIODS.find((p) => p.key === period).days}`).catch(() => ({ data: null }))
      setE2e(e2eRes.data)
      setE2eLoading(false)
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
              <div className="relative group">
                <Tip text={STAGE_TIPS_CLASSIC[s.label] || ''} />
                <p className="font-display font-bold text-2xl text-navy-900 dark:text-white">{s.value.toLocaleString('es-PE')}</p>
                <p className="text-xs text-slate-400 mt-1">{s.label}</p>
              </div>
              {i > 0 && (
                <span className="relative group inline-block">
                  <p className="text-[11px] text-cyan-600 mt-1">
                    {Math.round((s.value / funnel.stages[i - 1].value) * 100)}% del anterior
                  </p>
                  <Tip text={PCT_TIP} />
                </span>
              )}
            </div>
          ))
        )}
      </div>

      {!loading && funnel && (
        <div className="card relative group p-5 mb-6 flex items-center justify-between">
          <Tip text="Ventas cerradas (aceptadas) divididas entre clientes analizados del periodo." />
          <span className="text-sm text-slate-500">Conversión total del periodo</span>
          <span className="font-display font-bold text-xl text-cyan-600">{funnel.conversion_rate}%</span>
        </div>
      )}

      {!e2eLoading && e2e && (
        <E2ESection e2e={e2e} days={PERIODS.find((p) => p.key === period).days} />
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
          <BreakdownCard title="Ofertas más aceptadas" items={breakdown.top_offers.map(o => ({ label: o.name, value: o.count }))} tip={BREAKDOWN_TIPS['Ofertas más aceptadas']} />
          <BreakdownCard title="Canales más efectivos" items={breakdown.channels.map(c => ({ label: c.channel, value: c.count }))} tip={BREAKDOWN_TIPS['Canales más efectivos']} />
          <BreakdownCard title="Motivos de rechazo" items={breakdown.rejection_reasons.map(r => ({ label: r.reason, value: r.count }))} tip={BREAKDOWN_TIPS['Motivos de rechazo']} />
        </div>
      )}
    </div>
  )
}

function BreakdownCard({ title, items, tip }) {
  const max = Math.max(...items.map((i) => i.value), 1)
  return (
    <div className="card p-5">
      <span className="relative group inline-block">
        <p className="label-eyebrow mb-3">{title}</p>
        {tip && <Tip text={tip} />}
      </span>
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

function E2ESection({ e2e, days }) {
  const firstValue = e2e.stages[0]?.value || 1
  const worstDrop = e2e.stages.reduce((acc, s, i) => {
    if (i === 0) return acc
    const prev = e2e.stages[i - 1].value
    if (prev > 0) {
      const lost = prev - s.value
      if (lost > acc.lost) return { lost, label: `${e2e.stages[i - 1].label} → ${s.label}` }
    }
    return acc
  }, { lost: 0, label: null })

  return (
    <section className="mb-8">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="label-eyebrow">Seguimiento E2E del ofrecimiento</p>
          <h2 className="font-display font-bold text-xl text-navy-900 mt-0.5">El viaje completo de la oferta</h2>
        </div>
        {worstDrop.lost > 0 && (
          <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200/60 rounded-lg px-3 py-2 dark:text-amber-300 dark:bg-amber-400/5 dark:border-amber-400/20">
            🔍 Mayor pérdida: <span className="font-semibold">{worstDrop.label}</span> ({worstDrop.lost.toLocaleString('es-PE')} ofrecimientos)
          </p>
        )}
      </div>

      <div className="card p-6 mt-4">
        <div className="space-y-3">
          {e2e.stages.map((s, i) => {
            const pct = firstValue > 0 ? Math.round((s.value / firstValue) * 100) : 0
            const width = Math.max(pct, 4)
            const lost = i > 0 ? (e2e.stages[i - 1].value || 0) - s.value : 0
            return (
              <div key={s.key}>
                <div className="mb-1 flex items-baseline justify-between text-xs">
                  <span className="relative group inline-flex">
                    <span className="text-slate-500 dark:text-slate-400">{i + 1}. {s.label}</span>
                    <Tip text={STAGE_TIPS_E2E[s.key] || ''} />
                  </span>
                  <span className="relative group inline-flex font-mono font-medium text-navy-800 dark:text-white">
                    {s.value.toLocaleString('es-PE')}
                    {i > 0 && s.pct_of_previous != null && (
                      <span className="ml-1.5 text-slate-400">{s.pct_of_previous}% del anterior</span>
                    )}
                    <Tip text={PCT_TIP} />
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-navy-700">
                  <div
                    className={`h-full rounded-full bg-gradient-to-r ${E2E_COLORS[i % E2E_COLORS.length]}`}
                    style={{ width: `${width}%`, transition: 'width 0.6s ease' }}
                  />
                </div>
                {lost > 0 && (
                  <span className="relative group inline-block mt-0.5">
                    <p className="text-[11px] text-amber-600 dark:text-amber-400">
                      ▼ {lost.toLocaleString('es-PE')} no avanzaron a esta etapa
                    </p>
                    <Tip text={DROP_TIP} />
                  </span>
                )}
              </div>
            )
          })}
          <span className="relative group inline-block pt-2 border-t border-slate-100 dark:border-white/5">
            <p className="text-xs text-slate-400">
              Total de ofrecimientos rastreados ({days} días): {e2e.total.toLocaleString('es-PE')}
            </p>
            <Tip text={TOTAL_TIP} />
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mt-5">
        <BreakdownCard title="Canales de contacto" items={e2e.channels} tip={BREAKDOWN_TIPS['Canales de contacto']} />
        <BreakdownCard
          title="Contactabilidad real"
          items={e2e.contact_status.map((c) => ({ label: CONTACT_LABELS[c.label] || c.label, value: c.value }))}
          tip={BREAKDOWN_TIPS['Contactabilidad real']}
        />
        <BreakdownCard
          title="Medios probatorios"
          items={e2e.evidence_types.map((c) => ({ label: EVIDENCE_LABELS[c.label] || c.label, value: c.value }))}
          tip={BREAKDOWN_TIPS['Medios probatorios']}
        />
        <BreakdownCard
          title="Resultado de venta"
          items={e2e.results.map((c) => ({ label: RESULT_LABELS[c.label] || c.label, value: c.value }))}
          tip={BREAKDOWN_TIPS['Resultado de venta']}
        />
        <BreakdownCard
          title="Objeciones"
          items={[
            { label: 'Alcanzaron la etapa', value: e2e.objections.alcanzaron_objecion || 0 },
            { label: 'Manejadas con rebate', value: e2e.objections.manejadas_con_rebate || 0 },
          ]}
          tip={BREAKDOWN_TIPS['Objeciones']}
        />
        <BreakdownCard title="Motivos de rechazo" items={e2e.rejection_reasons} tip={BREAKDOWN_TIPS['Motivos de rechazo']} />
      </div>
    </section>
  )
}
