import React from 'react'
import { X, Loader2 } from 'lucide-react'

export const REJECTION_REASONS = ['Precio', 'No necesita', 'Ya tiene con otro operador', 'Quiere pensarlo', 'Mal momento']

export default function RejectModal({ open, offerName, reason, onReason, onConfirm, onCancel, confirming }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/50 px-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-lg dark:bg-navy-800 dark:border dark:border-white/10">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <p className="font-display font-semibold text-navy-900 dark:text-white">¿Por qué rechazó la oferta?</p>
            <p className="mt-0.5 text-xs text-slate-400">{offerName}</p>
          </div>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600 dark:hover:text-white" aria-label="Cerrar">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-5 flex flex-wrap gap-2">
          {REJECTION_REASONS.map((r) => (
            <button
              key={r}
              onClick={() => onReason(r)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                reason === r
                  ? 'border-navy-900 bg-navy-900 text-white dark:border-cyan-500 dark:bg-cyan-500 dark:text-navy-950'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-white/10 dark:bg-white/5 dark:text-white/70'
              }`}
            >
              {r}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <button
            onClick={onConfirm}
            disabled={!reason || confirming}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-rose-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-rose-600 disabled:opacity-50"
          >
            {confirming && <Loader2 className="h-4 w-4 animate-spin" />}
            Confirmar rechazo
          </button>
          <button onClick={onCancel} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-500 hover:text-navy-900 dark:hover:text-white">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}