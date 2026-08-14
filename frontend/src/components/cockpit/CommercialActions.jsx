import React from 'react'
import { Check, X, Mic, ShieldCheck, Flag, Loader2 } from 'lucide-react'

export default function CommercialActions({
  offer,
  status,
  registering,
  onAccept,
  onOpenReject,
  evidence,
  onEvidence,
  saving,
  canAccept,
  canReject,
  onReport,
}) {
  const canAct = Boolean(offer)
  const registeringNow = registering === offer?.oferta

  return (
    <div className="sticky bottom-4 z-20">
      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-white p-3 shadow-lg border border-slate-200 dark:bg-navy-800 dark:border-white/10">
        <div className="mr-auto flex items-center gap-2">
          <p className="label-eyebrow hidden sm:block">Acciones comerciales</p>
          {offer && (
            <span className="hidden truncate text-xs font-medium text-slate-500 sm:block dark:text-white/60">
              {offer.oferta}
            </span>
          )}
        </div>

        <button
          onClick={() => canAct && onAccept(offer)}
          disabled={!canAct || status === 'accepted' || registeringNow}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed ${
            status === 'accepted'
              ? 'bg-emerald-500 text-white'
              : 'bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-40'
          }`}
        >
          {registeringNow ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : status === 'accepted' ? (
            <Check className="h-4 w-4" />
          ) : (
            <Check className="h-4 w-4" />
          )}
          {registeringNow ? 'Registrando…' : status === 'accepted' ? 'Oferta aceptada' : 'Oferta aceptada'}
        </button>

        <button
          onClick={() => canAct && status !== 'rejected' && onOpenReject(offer)}
          disabled={!canAct || status === 'rejected'}
          className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
            status === 'rejected'
              ? 'border-rose-500 bg-rose-500/10 text-rose-600 dark:text-rose-300'
              : 'border-slate-200 bg-white text-slate-700 hover:bg-rose-500/5 dark:border-white/10 dark:bg-white/5 dark:text-white'
          }`}
        >
          <X className="h-4 w-4" />
          {status === 'rejected' ? 'Oferta rechazada' : 'Oferta rechazada'}
        </button>

        <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-white">
          <ShieldCheck className="h-4 w-4 text-slate-400" />
          <span className="text-xs font-medium">Medio probatorio</span>
          <select
            value={evidence || ''}
            onChange={(e) => canAct && e.target.value && onEvidence(offer, e.target.value)}
            disabled={!canAct || saving}
            className="bg-transparent text-xs font-medium outline-none disabled:opacity-50"
          >
            <option value="">Seleccionar…</option>
            <option value="call_audio">Audio de llamada</option>
            <option value="platform_register">Registro en plataforma</option>
          </select>
        </label>

        <button
          onClick={() => canAct && onReport()}
          disabled={!canAct}
          className="flex items-center gap-1.5 text-xs font-medium text-slate-400 transition-colors hover:text-slate-600 disabled:opacity-40 dark:hover:text-white"
        >
          <Flag className="h-3.5 w-3.5" />
          Reportar
        </button>
      </div>
      {!canAct && (
        <p className="mt-1.5 text-center text-[11px] text-slate-400">
          Genera una recomendación para habilitar el registro comercial.
        </p>
      )}
    </div>
  )
}