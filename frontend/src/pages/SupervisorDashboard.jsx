import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  TrendingUp, Target, DollarSign, ShieldCheck,
  CheckCircle2, AlertCircle, Sparkles, ChevronRight,
  Star, ArrowUpRight, Smartphone, Home, Flame, AlertTriangle, BatteryWarning,
} from 'lucide-react'
import api from '../utils/api'
import { useAuth } from '../context/AuthContext.jsx'

// Control de Churn (MoM): segmentos clave y su tasa de retención estimada.
const CHURN_SEGMENTS = [
  {
    id: 'oro', label: 'Oro Convergente', icon: Flame,
    retencion: '92.4%', delta: '+5.2%', vol: '45%',
    color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-100 dark:bg-emerald-400/10',
  },
  {
    id: 'alerta', label: 'Alerta Roja (Riesgo)', icon: AlertTriangle,
    retencion: '48.5%', delta: '+15.3%', vol: '20%',
    color: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-100 dark:bg-rose-400/10',
  },
  {
    id: 'gigas', label: 'Hambrientos de Datos', icon: BatteryWarning,
    retencion: '76.0%', delta: '+8.1%', vol: '25%',
    color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-100 dark:bg-amber-400/10',
  },
  {
    id: 'digital', label: 'Nativos Digitales', icon: Smartphone,
    retencion: '88.2%', delta: '+2.4%', vol: '10%',
    color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-100 dark:bg-blue-400/10',
  },
]

const FUNNEL_PERIODS = [
  { key: 'daily', label: '7 días', endpoint: '/api/funnel/daily' },
  { key: 'weekly', label: '28 días', endpoint: '/api/funnel/weekly' },
  { key: 'monthly', label: '6 meses', endpoint: '/api/funnel/monthly' },
]

const FUNNEL_COLORS = [
  'from-cyan-400 to-sky-500',
  'from-sky-400 to-blue-500',
  'from-blue-400 to-blue-600',
  'from-cyan-500 to-cyan-600',
  'from-sky-500 to-blue-700',
]

const SEGMENT_ICONS = {
  movistar_total: Star,
  upgrade: TrendingUp,
  equipo: Smartphone,
  plan_hogar: Home,
}
const SEGMENT_ACCENTS = {
  movistar_total: 'text-cyan-600 bg-cyan-100 dark:bg-cyan-400/10 dark:text-cyan-300',
  upgrade: 'text-blue-600 bg-blue-100 dark:bg-blue-400/10 dark:text-blue-300',
  equipo: 'text-emerald-600 bg-emerald-100 dark:bg-emerald-400/10 dark:text-emerald-300',
  plan_hogar: 'text-amber-600 bg-amber-100 dark:bg-amber-400/10 dark:text-amber-300',
}

function fmt(n) {
  return (n ?? 0).toLocaleString('es-PE')
}

function SkeletonBlock({ className = 'h-3 rounded bg-slate-200 dark:bg-navy-700' }) {
  return <div className={`animate-pulse ${className}`} />
}

function RankRow({ a, color, barColor }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex w-2/5 min-w-0 items-center gap-3">
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-display text-xs font-bold ${color}`}
        >
          {a.name?.[0] || '?'}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-navy-900 dark:text-white">{a.name}</p>
          <p className="truncate text-[11px] text-slate-400">{a.clientes_cartera ?? 0} clientes en cartera</p>
        </div>
      </div>
      <div className="flex w-3/5 items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-navy-700">
          <div
            className={`h-full rounded-full ${barColor}`}
            style={{ width: `${Math.min(a.conversion_pct ?? 0, 100)}%`, transition: 'width 0.6s ease' }}
          />
        </div>
        <span className={`w-12 shrink-0 text-right font-mono text-xs font-bold ${barColor.includes('emerald') ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
          {a.conversion_pct != null ? `${a.conversion_pct}%` : '—'}
        </span>
      </div>
      <span className="hidden w-32 shrink-0 truncate text-right text-xs text-slate-500 md:block dark:text-slate-400">
        {a.friccion_pct != null ? `${a.friccion_pct}% fricción` : 'sin fricción registrada'}
      </span>
    </div>
  )
}

export default function SupervisorDashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [kpis, setKpis] = useState(null)
  const [asesores, setAsesores] = useState([])
  const [segmentos, setSegmentos] = useState(null)
  const [funnel, setFunnel] = useState(null)
  const [period, setPeriod] = useState('monthly')
  const [limit, setLimit] = useState(3)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      const [k, a, s, f] = await Promise.all([
        api.get('/api/admin/kpis').catch(() => ({ data: null })),
        api.get('/api/admin/asesores').catch(() => ({ data: null })),
        api.get('/api/admin/segmentos').catch(() => ({ data: null })),
        api.get(FUNNEL_PERIODS.find((p) => p.key === period).endpoint).catch(() => ({ data: null })),
      ])
      if (!active) return
      setKpis(k.data)
      setAsesores(a?.data?.asesores || [])
      setSegmentos(s.data)
      setFunnel(f.data)
      setLoading(false)
    }
    load()
    return () => {
      active = false
    }
  }, [period])

  const mixMT = useMemo(() => {
    if (!kpis?.total_clientes) return 0
    return Math.round((kpis.elegibles_mt / kpis.total_clientes) * 1000) / 10
  }, [kpis])

  // Ranking real: solo asesores con interacciones, ordenados por conversion.
  const ranking = useMemo(() => {
    const conDatos = asesores.filter((a) => (a.interacciones ?? 0) > 0)
    const top = [...conDatos].sort((a, b) => (b.conversion_pct ?? -1) - (a.conversion_pct ?? -1))
    const bottom = [...conDatos].sort((a, b) => (a.conversion_pct ?? 1e9) - (b.conversion_pct ?? 1e9))
    return { top, bottom }
  }, [asesores])

  const insight = useMemo(() => {
    const best = ranking.top[0]
    const worst = ranking.bottom[0]
    return {
      best: best
        ? `${best.name} lidera con ${best.conversion_pct}% de conversión y ${best.friccion_pct}% de fricción.`
        : 'Aún no hay interacciones registradas para calcular el patrón de éxito.',
      worst: worst
        ? `${worst.name} concentra ${worst.friccion_pct}% de rechazos en su cartera. Conviene auditar su manejo de objeciones.`
        : 'Sin foco de riesgo detectado todavía.',
    }
  }, [ranking])

  const funnelStages = funnel?.stages || []
  const funnelMax = funnelStages[0]?.value || 1

  return (
    <div className="space-y-6">
      {/* Header gerencial */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="label-eyebrow">Dashboard gerencial</p>
          <h1 className="mt-1 font-display text-2xl font-bold text-navy-900 dark:text-white">
            Hola, {user?.name?.split(' ')[0] || 'Supervisor'}
          </h1>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            Impacto operativo y financiero de la IA sobre la base asignada.
          </p>
        </div>
        <span className="inline-flex w-fit items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 dark:border-white/10 dark:bg-navy-800/60 dark:text-slate-300">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
          IA activa · {asesores.length} asesores · {kpis ? fmt(kpis.total_clientes) : '…'} clientes
        </span>
      </div>

      {/* Top 4 KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card p-5">
          <div className="mb-2 flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-300">
              <TrendingUp size={18} strokeWidth={2.5} />
            </span>
            <p className="label-eyebrow">Conversión E2E</p>
          </div>
          {loading ? <SkeletonBlock className="h-8 w-16" /> : (
            <>
              <p className="font-display text-3xl font-black text-navy-900 dark:text-white">
                {kpis?.conversion_pct != null ? `${kpis.conversion_pct}%` : '—'}
              </p>
              <p className="mt-1 text-xs text-slate-400">aceptadas / interacciones del periodo</p>
            </>
          )}
        </div>

        <div className="card p-5">
          <div className="mb-2 flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-400/10 dark:text-blue-300">
              <Target size={18} strokeWidth={2.5} />
            </span>
            <p className="label-eyebrow">Mix Movistar Total</p>
          </div>
          {loading ? <SkeletonBlock className="h-8 w-16" /> : (
            <>
              <p className="font-display text-3xl font-black text-navy-900 dark:text-white">{mixMT}%</p>
              <p className="mt-1 text-xs text-slate-400">
                {kpis?.elegibles_mt != null ? `${fmt(kpis.elegibles_mt)} elegibles / ${fmt(kpis.total_clientes)} base` : 'penetración sobre la base'}
              </p>
            </>
          )}
        </div>

        <div className="card p-5">
          <div className="mb-2 flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 text-amber-600 dark:bg-amber-400/10 dark:text-amber-300">
              <DollarSign size={18} strokeWidth={2.5} />
            </span>
            <p className="label-eyebrow">Uplift financiero</p>
          </div>
          {loading ? <SkeletonBlock className="h-8 w-16" /> : (
            <>
              <p className="font-display text-3xl font-black text-navy-900 dark:text-white">
                S/ {kpis?.valor_potencial_soles != null ? kpis.valor_potencial_soles.toLocaleString('es-PE') : '—'}
              </p>
              <p className="mt-1 text-xs text-slate-400">ingreso recurrente potencial / mes</p>
            </>
          )}
        </div>

        <div className="card p-5">
          <div className="mb-2 flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-rose-100 text-rose-600 dark:bg-rose-400/10 dark:text-rose-300">
              <ShieldCheck size={18} strokeWidth={2.5} />
            </span>
            <p className="label-eyebrow">Ventas cerradas</p>
          </div>
          {loading ? <SkeletonBlock className="h-8 w-16" /> : (
            <>
              <p className="font-display text-3xl font-black text-navy-900 dark:text-white">
                {kpis?.aceptadas != null ? fmt(kpis.aceptadas) : '—'}
              </p>
              <p className="mt-1 text-xs text-slate-400">aceptaciones registradas en la plataforma</p>
            </>
          )}
        </div>
      </div>

      {/* Control de Churn (MoM) */}
      <div className="card p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <p className="label-eyebrow">Eficiencia de segmentación IA & control de churn (MoM)</p>
          <span className="text-xs text-slate-400">Comparativo mes a mes</span>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {CHURN_SEGMENTS.map((seg) => {
            const Icon = seg.icon
            return (
              <div
                key={seg.id}
                className="relative overflow-hidden rounded-xl border border-slate-100 bg-slate-50 p-4 dark:border-white/5 dark:bg-white/5"
              >
                <div className={`absolute -right-4 -top-4 h-16 w-16 rounded-full opacity-20 ${seg.bg}`} />
                <div className="mb-3 flex items-center gap-2">
                  <Icon size={16} className={seg.color} />
                  <span className="text-sm font-bold text-navy-900 dark:text-white">{seg.label}</span>
                </div>
                <div className="flex items-end justify-between">
                  <div>
                    <p className="mb-1 text-xs text-slate-500 dark:text-slate-400">Tasa de retención</p>
                    <p className={`font-display text-2xl font-black ${seg.color}`}>{seg.retencion}</p>
                  </div>
                  <span className="badge bg-emerald-500/10 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-300">
                    ↑ {seg.delta}
                  </span>
                </div>
                <div className="mt-3 text-xs font-semibold text-slate-400">Volumen de base: {seg.vol}</div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Segmentación IA */}
      <div className="card p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <p className="label-eyebrow">Segmentación IA de la base</p>
          {segmentos && <span className="text-xs text-slate-400">Base analizada: {fmt(segmentos.base)} clientes</span>}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {(segmentos?.segmentos || []).map((seg) => {
            const Icon = SEGMENT_ICONS[seg.key] || Target
            return (
              <div key={seg.key} className="rounded-xl border border-slate-100 bg-slate-50 p-4 dark:border-white/5 dark:bg-white/5">
                <div className="mb-3 flex items-center gap-2">
                  <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${SEGMENT_ACCENTS[seg.key]}`}>
                    <Icon size={16} strokeWidth={2.5} />
                  </span>
                  <p className="text-sm font-bold text-navy-900 dark:text-white">{seg.label}</p>
                </div>
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-xs text-slate-400">Clientes elegibles</p>
                    <p className="font-display text-2xl font-black text-navy-900 dark:text-white">{fmt(seg.count)}</p>
                  </div>
                  <span className="badge bg-cyan-500/10 text-cyan-600 dark:bg-cyan-400/10 dark:text-cyan-300">
                    {seg.pct}% de la base
                  </span>
                </div>
                {seg.key === 'movistar_total' && (
                  <p className="mt-2 text-[11px] font-semibold text-cyan-600 dark:text-cyan-400">
                    ≈ S/ {seg.potencial_soles.toLocaleString('es-PE')}/mes de uplift potencial
                  </p>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Contenido principal: ranking + funnel */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Ranking de asesores */}
        <div className="card flex flex-col p-6 lg:col-span-2">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <p className="label-eyebrow">Ranking de asesores · por conversión de cartera</p>
            <select
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600 focus:border-cyan-500 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-slate-300"
            >
              <option value={3}>Mostrar: Top 3</option>
              <option value={5}>Mostrar: Top 5</option>
            </select>
          </div>

          {/* Insight generado con datos reales */}
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-indigo-100 bg-indigo-50 p-4 dark:border-indigo-400/20 dark:bg-indigo-400/5">
            <Sparkles className="mt-0.5 shrink-0 text-indigo-500" size={18} />
            <div className="text-sm leading-relaxed text-indigo-700 dark:text-indigo-300">
              <p className="mb-1 font-bold text-indigo-900 dark:text-white">Insight estratégico IA</p>
              <p><span className="font-semibold">Patrón de éxito:</span> {insight.best}</p>
              <p className="mt-1"><span className="font-semibold">Cuello de botella:</span> {insight.worst}</p>
            </div>
          </div>

          <div className="mb-6">
            <h4 className="mb-4 flex items-center gap-2 text-sm font-bold text-navy-900 dark:text-white">
              <CheckCircle2 size={16} className="text-emerald-500" /> Embajadores de experiencia
            </h4>
            {loading ? (
              <div className="space-y-4"><SkeletonBlock className="h-10" /><SkeletonBlock className="h-10" /><SkeletonBlock className="h-10" /></div>
            ) : ranking.top.length === 0 ? (
              <p className="text-sm text-slate-400">Sin interacciones registradas todavía.</p>
            ) : (
              <div className="space-y-4">
                {ranking.top.slice(0, limit).map((a) => (
                  <RankRow key={a.id} a={a} color="bg-emerald-100 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300" barColor="bg-gradient-to-r from-emerald-400 to-green-500" />
                ))}
              </div>
            )}
          </div>

          <hr className="mb-6 border-slate-100 dark:border-white/5" />

          <div>
            <h4 className="mb-4 flex items-center gap-2 text-sm font-bold text-navy-900 dark:text-white">
              <AlertCircle size={16} className="text-rose-500" /> Foco de riesgo operativo
            </h4>
            {loading ? (
              <div className="space-y-4"><SkeletonBlock className="h-10" /><SkeletonBlock className="h-10" /><SkeletonBlock className="h-10" /></div>
            ) : ranking.bottom.length === 0 ? (
              <p className="text-sm text-slate-400">Sin focos de riesgo detectados.</p>
            ) : (
              <div className="space-y-4">
                {ranking.bottom.slice(0, limit).map((a) => (
                  <RankRow key={a.id} a={a} color="bg-rose-100 text-rose-700 dark:bg-rose-400/10 dark:text-rose-300" barColor="bg-gradient-to-r from-rose-400 to-rose-500" />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Funnel E2E dinámico */}
        <div className="card flex flex-col p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="label-eyebrow">Funnel E2E dinámico</p>
            <button
              onClick={() => navigate('/funnel')}
              className="flex items-center text-xs font-semibold text-cyan-600 transition-colors hover:text-cyan-500 dark:text-cyan-400"
            >
              Ver detalle <ChevronRight size={14} />
            </button>
          </div>

          <div className="mb-5 flex flex-wrap gap-1.5">
            {FUNNEL_PERIODS.map((p) => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                className={`rounded-full px-3 py-1 text-[11px] font-semibold transition-colors ${
                  period === p.key
                    ? 'bg-navy-900 text-white dark:bg-white dark:text-navy-950'
                    : 'border border-slate-200 text-slate-500 hover:text-navy-900 dark:border-white/10 dark:text-slate-400'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {loading || !funnel ? (
            <div className="space-y-4"><SkeletonBlock className="h-3" /><SkeletonBlock className="h-3" /><SkeletonBlock className="h-3" /><SkeletonBlock className="h-3" /><SkeletonBlock className="h-3" /></div>
          ) : (
            <div className="flex flex-1 flex-col justify-between">
              <div className="space-y-4">
                {funnelStages.map((s, i) => {
                  const pct = funnelMax > 0 ? Math.round((s.value / funnelMax) * 100) : 0
                  const width = Math.max(pct, 4)
                  return (
                    <div key={s.label}>
                      <div className="mb-1 flex items-baseline justify-between text-xs">
                        <span className="text-slate-500 dark:text-slate-400">{s.label}</span>
                        <span className="font-mono font-medium text-navy-800 dark:text-white">
                          {s.value.toLocaleString('es-PE')}
                          <span className="ml-1 text-slate-400">({pct}%)</span>
                        </span>
                      </div>
                      <div className="h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-navy-700">
                        <div
                          className={`h-full rounded-full bg-gradient-to-r ${FUNNEL_COLORS[i % FUNNEL_COLORS.length]}`}
                          style={{ width: `${width}%`, transition: 'width 0.6s ease' }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-4 dark:border-white/5">
                <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">Tasa de conversión</span>
                <span className="font-display text-2xl font-black text-cyan-600 dark:text-cyan-400">
                  {funnel.conversion_rate}%
                </span>
              </div>
            </div>
          )}

          <button
            onClick={() => navigate('/funnel')}
            className="mt-5 flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 py-2 text-xs font-semibold text-slate-600 transition-colors hover:border-cyan-500 hover:text-cyan-600 dark:border-white/10 dark:text-slate-300 dark:hover:text-cyan-300"
          >
            <ArrowUpRight size={14} /> Explorar funnel completo
          </button>
        </div>
      </div>
    </div>
  )
}