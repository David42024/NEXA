import React, { useEffect, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, BarChart, Bar,
  FunnelChart, Funnel as FunnelShape, LabelList, PieChart, Pie, Cell, Legend,
} from 'recharts'
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
const PCT_TIP = 'Porcentaje que representa este valor respecto a la etapa anterior. Menor a 100% = se pierden ofrecimientos entre etapas.'
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

const FUNNEL_FILLS = ['#002E70', '#0047A5', '#0066DF', '#1A8CFF', '#4DB8FF']
const PIE_COLORS = ['#00A4FF', '#005CE6', '#00E6B8']
const CONTACT_LABELS = { answered: 'Contestó', read: 'Leyó', unanswered: 'No respondió' }
const EVIDENCE_LABELS = { call_audio: 'Audio de llamada', platform_register: 'Registro en plataforma' }
const RESULT_LABELS = { accepted: 'Aceptadas', rejected: 'Rechazadas' }

// En móvil el LabelList derecho del embudo se corta: se lista bajo el gráfico.
function useIsMobile() {
  const [mobile, setMobile] = useState(false)
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia('(max-width: 640px)')
    const update = (e) => setMobile(e.matches)
    setMobile(mq.matches)
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])
  return mobile
}

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

      <div className="flex flex-wrap gap-2 mb-6">
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

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
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
        <div className="card relative group p-5 mb-6 flex flex-wrap items-center justify-between gap-2">
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
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
  const mobile = useIsMobile()
  const worstDrop = e2e.stages.reduce((acc, s, i) => {
    if (i === 0) return acc
    const prev = e2e.stages[i - 1].value
    if (prev > 0) {
      const lost = prev - s.value
      if (lost > acc.lost) return { lost, label: `${e2e.stages[i - 1].label} → ${s.label}` }
    }
    return acc
  }, { lost: 0, label: null })

  const funnelData = e2e.stages.map((s, i) => ({
    step: `${i + 1}. ${s.label}`,
    value: s.value,
    fill: FUNNEL_FILLS[i % FUNNEL_FILLS.length],
  }))

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

      {/* Embudo del viaje completo de la oferta */}
      <div className="card p-6 mt-4">
        {e2e.total === 0 ? (
          <p className="py-10 text-center text-sm text-slate-400">Sin ofrecimientos rastreados en el periodo.</p>
        ) : (
          <>
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <FunnelChart maxWidth={mobile ? undefined : 540}>
                  <Tooltip cursor={{ fill: 'transparent' }} />
                  <FunnelShape dataKey="value" data={funnelData} isAnimationActive>
                    {!mobile && (
                      <LabelList position="right" fill="#64748B" stroke="none" dataKey="step" className="text-xs font-medium" />
                    )}
                    <LabelList position="center" fill="#FFFFFF" stroke="none" dataKey="value" className="text-sm font-bold" />
                  </FunnelShape>
                </FunnelChart>
              </ResponsiveContainer>
            </div>
            {/* En móvil las etiquetas de etapa se listan bajo el embudo para no cortarse */}
            {mobile && (
              <ul className="mt-3 space-y-1.5 text-xs text-slate-500 dark:text-slate-400">
                {funnelData.map((s) => (
                  <li key={s.step} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.fill }} />
                      {s.step}
                    </span>
                    <span className="font-mono font-semibold text-navy-800 dark:text-white">
                      {s.value.toLocaleString('es-PE')}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-4 text-center text-xs text-slate-400">
              Total de ofrecimientos rastreados ({days} días): {e2e.total.toLocaleString('es-PE')}
            </p>
          </>
        )}
      </div>

      {/* Desgloses: los tres de canal/contacto como tortas, el resto como barras */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mt-5">
        <DoughnutCard
          title="Canales de contacto"
          items={e2e.channels.map((c) => ({ name: c.label, value: c.value }))}
          tip={BREAKDOWN_TIPS['Canales de contacto']}
        />
        <DoughnutCard
          title="Contactabilidad real"
          items={e2e.contact_status.map((c) => ({ name: CONTACT_LABELS[c.label] || c.label, value: c.value }))}
          tip={BREAKDOWN_TIPS['Contactabilidad real']}
        />
        <DoughnutCard
          title="Medios probatorios"
          items={e2e.evidence_types.map((c) => ({ name: EVIDENCE_LABELS[c.label] || c.label, value: c.value }))}
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

function DoughnutCard({ title, items, tip }) {
  const total = items.reduce((acc, it) => acc + (it.value || 0), 0)
  return (
    <div className="card p-5">
      <span className="relative group inline-block w-full">
        <p className="label-eyebrow mb-3 text-center">{title}</p>
        {tip && <Tip text={tip} />}
      </span>
      {items.length === 0 || total === 0 ? (
        <div className="flex h-48 items-center justify-center">
          <p className="text-xs text-slate-400">Sin datos aún</p>
        </div>
      ) : (
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={items} innerRadius={50} outerRadius={70} paddingAngle={5} dataKey="value" nameKey="name">
                {items.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
