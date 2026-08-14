import React from 'react'
import { Check, ChevronRight } from 'lucide-react'

export const E2E_STAGES = [
  { key: 'planned', label: 'Canal' },
  { key: 'contacted', label: 'Contacto' },
  { key: 'objection', label: 'Objeciones' },
  { key: 'evidence', label: 'Evidencia' },
  { key: 'result', label: 'Resultado' },
]

const CHANNELS = ['WhatsApp', 'Llamada', 'App']
const CONTACT_OPTIONS = [
  ['answered', 'Contestó'],
  ['read', 'Leyó'],
  ['unanswered', 'No respondió'],
]
const EVIDENCE_OPTIONS = [
  ['call_audio', 'Audio de llamada'],
  ['platform_register', 'Registro en plataforma'],
]

const RESULT_BADGE = {
  accepted: 'bg-emerald-500/10 text-emerald-700 border-emerald-400/40 dark:text-emerald-300',
  rejected: 'bg-rose-500/10 text-rose-700 border-rose-400/40 dark:text-rose-300',
}

const chip = (active) =>
  `text-[11px] px-2.5 py-1 rounded-full border transition-colors disabled:opacity-50 ${
    active
      ? 'bg-navy-900 text-white border-navy-900 dark:bg-cyan-500 dark:text-navy-950 dark:border-cyan-500'
      : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 dark:bg-white/5 dark:border-white/10 dark:text-white/70'
  }`

export default function E2ETracking({
  offer,
  e2eByOffer,
  e2eChannel,
  e2eContact,
  e2eEvidence,
  e2eObjection,
  e2eSaving,
  onSave,
}) {
  const offering = e2eByOffer[offer.offer_id]
  const raw = offering?.stage === 'classified' ? 'planned' : (offering?.stage || 'planned')
  const reachedIndex = Math.max(0, E2E_STAGES.findIndex((s) => s.key === raw))
  const current = E2E_STAGES[reachedIndex]
  const next = E2E_STAGES[reachedIndex + 1]
  const saving = e2eSaving === offer.offer_id
  const result = offering?.result

  return (
    <div>
      {/* Pipeline de etapas */}
      <div className="flex items-start">
        {E2E_STAGES.map((s, i) => (
          <React.Fragment key={s.key}>
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full border-2 text-[10px] font-bold transition-colors ${
                  i < reachedIndex
                    ? 'border-emerald-500 bg-emerald-500 text-white'
                    : i === reachedIndex
                    ? 'border-cyan-500 bg-cyan-500 text-white ring-4 ring-cyan-500/25'
                    : 'border-slate-200 bg-white text-slate-300 dark:border-white/15 dark:bg-white/5 dark:text-white/30'
                }`}
              >
                {i < reachedIndex ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </div>
              <span
                className={`whitespace-nowrap text-[10px] font-medium ${
                  i <= reachedIndex ? 'text-slate-600 dark:text-white/80' : 'text-slate-400'
                }`}
              >
                {s.label}
              </span>
            </div>
            {i < E2E_STAGES.length - 1 && (
              <div
                className={`mb-5 h-0.5 flex-1 min-w-3 ${
                  i < reachedIndex ? 'bg-emerald-400' : 'bg-slate-200 dark:bg-white/10'
                }`}
              />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Acción de la etapa actual */}
      <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-3.5 dark:border-white/5 dark:bg-white/5">
        <div className="mb-2.5 flex items-center justify-between">
          <p className="text-xs font-semibold text-navy-900 dark:text-white">
            {i18nTitle(current.key)}
          </p>
          <span className="text-[10px] text-slate-400">
            Etapa {reachedIndex + 1} de {E2E_STAGES.length}
          </span>
        </div>

        {/* Canal */}
        {current.key === 'planned' && (
          <div className="flex flex-wrap gap-2">
            {CHANNELS.map((c) => (
              <button
                key={c}
                type="button"
                disabled={saving}
                onClick={() => onSave({ channel: c, stage: 'planned' })}
                className={chip(e2eChannel[offer.offer_id] === c)}
              >
                {c}
              </button>
            ))}
          </div>
        )}

        {/* Contacto */}
        {current.key === 'contacted' && (
          <div className="flex flex-wrap gap-2">
            {CONTACT_OPTIONS.map(([v, label]) => (
              <button
                key={v}
                type="button"
                disabled={saving}
                onClick={() => onSave({ contact_status: v, stage: 'contacted' })}
                className={chip(e2eContact[offer.offer_id] === v)}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Objeciones / rebate */}
        {current.key === 'objection' && (
          <button
            type="button"
            disabled={saving}
            onClick={() => onSave({ objection_handled: !e2eObjection[offer.offer_id], stage: 'objection' })}
            className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors disabled:opacity-50 ${
              e2eObjection[offer.offer_id]
                ? 'bg-emerald-500/10 border-emerald-400/40 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300'
                : 'bg-white border-slate-200 text-slate-600 dark:bg-white/5 dark:border-white/10 dark:text-white/70'
            }`}
          >
            {e2eObjection[offer.offer_id] ? '✓ Usé speech de rebate' : 'Usé speech de rebate'}
          </button>
        )}

        {/* Evidencia */}
        {current.key === 'evidence' && (
          <div className="flex flex-wrap gap-2">
            {EVIDENCE_OPTIONS.map(([v, label]) => (
              <button
                key={v}
                type="button"
                disabled={saving}
                onClick={() => onSave({ evidence_type: v, stage: 'evidence' })}
                className={chip(e2eEvidence[offer.offer_id] === v)}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Resultado */}
        {current.key === 'result' && (
          result ? (
            <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${RESULT_BADGE[result] || RESULT_BADGE.rejected}`}>
              {result === 'accepted' ? '✓ Venta aceptada' : `✕ Rechazada${offering?.rejection_reason ? ` · ${offering.rejection_reason}` : ''}`}
            </span>
          ) : (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Registra el resultado en las acciones comerciales de abajo.
            </p>
          )
        )}

        {/* Avanzar de etapa */}
        {next && (
          <button
            type="button"
            disabled={saving}
            onClick={() => onSave({ stage: next.key })}
            className="mt-3 flex items-center gap-1 text-[11px] font-semibold text-cyan-600 hover:text-cyan-700 dark:text-cyan-300 dark:hover:text-cyan-200"
          >
            Siguiente: {next.label}
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}

function i18nTitle(key) {
  const titles = {
    planned: '¿Por qué canal vas a contactar?',
    contacted: '¿Cómo respondió el cliente?',
    objection: '¿Manejaste la objeción?',
    evidence: '¿Qué medio probatorio dejas?',
    result: 'Resultado de la venta',
  }
  return titles[key] || 'Siguiente paso'
}