import React from 'react'
import { Flame, AlertTriangle, BatteryWarning, Smartphone, Users } from 'lucide-react'

// Segmentos estratégicos: definición visual + etiqueta corta para el chip del cliente.
export const SEGMENT_DEFS = {
  Todos: {
    label: 'Todos',
    icon: Users,
    desc: 'Toda tu cartera priorizada por el motor NBO, sin aplicar ninguna estrategia.',
    chipActive: 'bg-navy-900 text-white border-navy-900 dark:bg-white dark:text-navy-900 dark:border-white',
    pill: 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300',
  },
  Oro: {
    label: 'Oro Convergente',
    icon: Flame,
    desc: 'Clientes de alto valor con línea + fijo/internet en riesgo de perderse: la oferta Movistar Total les une todo en un solo recibo. Máxima prioridad de contacto.',
    chipActive: 'bg-emerald-600 text-white border-emerald-600',
    pill: 'bg-emerald-500/10 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-300',
  },
  Alerta: {
    label: 'Alerta Roja',
    icon: AlertTriangle,
    desc: 'Señales claras de fuga: reclamos recientes, mora o insatisfacción. Llámalos hoy mismo antes de que la competencia se los lleve.',
    chipActive: 'bg-rose-600 text-white border-rose-600',
    pill: 'bg-rose-500/10 text-rose-600 dark:bg-rose-400/10 dark:text-rose-300',
  },
  Gigas: {
    label: 'Hambrientos de Datos',
    icon: BatteryWarning,
    desc: 'Agotan sus gigas antes de terminar el mes: un plan con más datos se vende casi solo. Recuérdales cuánto les falta para fin de ciclo.',
    chipActive: 'bg-amber-500 text-navy-900 border-amber-500 dark:text-white',
    pill: 'bg-amber-500/10 text-amber-600 dark:bg-amber-400/10 dark:text-amber-300',
  },
  Digital: {
    label: 'Nativos Digitales',
    icon: Smartphone,
    desc: 'Gestionan todo desde la app y consumen contenido móvil todo el día: propón planes flexibles con más gigas y beneficios digitales.',
    chipActive: 'bg-blue-600 text-white border-blue-600',
    pill: 'bg-blue-500/10 text-blue-600 dark:bg-blue-400/10 dark:text-blue-300',
  },
}

export default function SegmentChips({ segmentos, active = 'Todos', onSelect }) {
  const activeDef = SEGMENT_DEFS[active]
  return (
    <div className="mb-4">
      <div className="flex flex-wrap gap-2">
        {segmentos.map((seg) => {
          const def = SEGMENT_DEFS[seg.id]
          if (!def) return null
          const Icon = def.icon
          const isActive = active === seg.id
          return (
            <button
              key={seg.id}
              onClick={() => onSelect(seg.id)}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${
                isActive
                  ? def.chipActive
                  : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50 dark:bg-navy-800/60 dark:text-slate-400 dark:border-white/10'
              }`}
            >
              <Icon size={13} />
              {def.label}
              <span
                className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] ${
                  isActive ? 'bg-white/20' : 'bg-slate-100 dark:bg-navy-700'
                }`}
              >
                {seg.count.toLocaleString('es-PE')}
              </span>
            </button>
          )
        })}
      </div>
      {activeDef?.desc && (
        <p className="mt-2 flex items-start gap-1.5 text-xs leading-snug text-slate-500 dark:text-slate-400">
          <activeDef.icon size={13} className="mt-0.5 shrink-0" />
          {activeDef.desc}
        </p>
      )}
    </div>
  )
}