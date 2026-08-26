import React from 'react'
import { ArrowRight, Users, UserX } from 'lucide-react'

/**
 * Panel de detalle (lupa) del nivel hijo seleccionado.
 * Muestra un resumen del area seleccionada y los items del siguiente nivel.
 */
export default function DetailZoomPanel({ parentItem, children, metricMode, onSelectChild }) {
  if (!parentItem) return null

  const totalClientes = parentItem.totalClientes ?? 0
  const sinMT = parentItem.clientesSinMovistarTotal ?? 0
  const pct = parentItem.porcentaje ?? 0

  const top5 = [...children]
    .filter(c => c.id !== parentItem.id)
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
    .slice(0, 5)

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-navy-900/60">
      <h3 className="text-sm font-bold text-navy-900 dark:text-white">
        {parentItem.nombre}
      </h3>
      <div className="mt-3 grid grid-cols-3 gap-3">
        <div className="rounded-lg bg-slate-50 p-3 dark:bg-white/5">
          <div className="flex items-center gap-1.5">
            <Users size={14} className="text-slate-400" />
            <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">Total</span>
          </div>
          <p className="mt-1 font-display text-lg font-black text-navy-900 dark:text-white">
            {totalClientes.toLocaleString('es-PE')}
          </p>
        </div>
        <div className="rounded-lg bg-rose-50 p-3 dark:bg-rose-400/5">
          <div className="flex items-center gap-1.5">
            <UserX size={14} className="text-rose-400" />
            <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">Sin MT</span>
          </div>
          <p className="mt-1 font-display text-lg font-black text-rose-600 dark:text-rose-400">
            {sinMT.toLocaleString('es-PE')}
          </p>
        </div>
        <div className="rounded-lg bg-amber-50 p-3 dark:bg-amber-400/5">
          <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">% Sin MT</span>
          <p className="mt-1 font-display text-lg font-black text-amber-600 dark:text-amber-400">
            {pct}%
          </p>
        </div>
      </div>

      {top5.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Mayores oportunidades
          </p>
          <div className="space-y-1.5">
            {top5.map(child => (
              <button
                key={child.id}
                onClick={() => onSelectChild?.(child)}
                className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition-colors hover:bg-slate-50 dark:hover:bg-white/5"
              >
                <span className="text-sm font-medium text-navy-800 dark:text-white">
                  {child.nombre}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-rose-600 dark:text-rose-400">
                    {metricMode === 'porcentaje' ? `${child.value}%` : child.value?.toLocaleString('es-PE')}
                  </span>
                  <ArrowRight size={12} className="text-slate-400" />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
