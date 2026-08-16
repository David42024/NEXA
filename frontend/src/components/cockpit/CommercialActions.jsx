import React, { useEffect, useRef, useState } from 'react'
import { Check, X, ShieldCheck, Flag, Loader2, ChevronDown, Mic, Database } from 'lucide-react'

const EVIDENCE_OPTIONS = [
  { value: 'call_audio', label: 'Audio de llamada', desc: 'Descargar grabación y reporte', icon: Mic, locked: true },
  { value: 'platform_register', label: 'Registro en plataforma', desc: 'Tras finalizar la llamada', icon: Database, locked: true },
]

function parseEvidence(v) {
  return (v || '').split(',').filter(Boolean)
}

function EvidencePicker({ value, disabled, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function onDocClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  const selected = parseEvidence(value)
  const labelOf = (v) => EVIDENCE_OPTIONS.find((o) => o.value === v)?.label || v

  function toggle(v) {
    const next = selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]
    onChange(next.join(','))
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
          open
            ? 'border-cyan-500 bg-cyan-500/5 dark:border-cyan-400'
            : 'border-slate-200 bg-white hover:border-slate-300 dark:border-white/10 dark:bg-white/5'
        }`}
      >
        <ShieldCheck className={`h-4 w-4 ${selected.length ? 'text-emerald-500' : 'text-slate-400'}`} />
        <span className="max-w-[180px] truncate whitespace-nowrap text-xs font-medium text-slate-700 dark:text-white">
          {selected.length ? selected.map(labelOf).join(' + ') : 'Medio probatorio'}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute bottom-full right-0 z-30 mb-2 w-64 max-w-[calc(100vw-2.5rem)] overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg dark:border-white/10 dark:bg-navy-800"
        >
          {EVIDENCE_OPTIONS.map((o) => {
            const Icon = o.icon
            const active = selected.includes(o.value)
            const disabled = o.locked
            return (
              <li key={o.value} role="option" aria-selected={active}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => toggle(o.value)}
                  className={`flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-slate-50 dark:hover:bg-white/5 ${
                    active ? 'bg-cyan-500/5 dark:bg-cyan-400/5' : ''
                  } ${disabled ? 'cursor-not-allowed opacity-60 hover:bg-transparent dark:hover:bg-transparent' : ''}`}
                >
                  <Icon
                    className={`mt-0.5 h-4 w-4 shrink-0 ${
                      active ? 'text-cyan-600 dark:text-cyan-300' : 'text-slate-400'
                    }`}
                  />
                  <span className="min-w-0">
                    <span
                      className={`block text-xs font-semibold ${
                        active ? 'text-cyan-700 dark:text-cyan-300' : 'text-slate-700 dark:text-white'
                      }`}
                    >
                      {o.label}
                    </span>
                    <span className="block text-[11px] text-slate-400">
                      {o.locked ? `🔒 ${o.desc}` : o.desc}
                    </span>
                  </span>
                  {active && <Check className="ml-auto mt-0.5 h-4 w-4 shrink-0 text-cyan-600 dark:text-cyan-300" />}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

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
  const accepted = status === 'accepted'
  const rejected = status === 'rejected'

  return (
    <div className="sticky bottom-4 z-20">
      <div className="rounded-xl border border-black/60 bg-white p-3 shadow-lg dark:border-white/60 dark:bg-navy-800">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="mr-auto min-w-0">
            <p className="label-eyebrow">Acciones comerciales</p>
            {offer && (
              <p className="truncate text-xs font-medium text-slate-500 dark:text-white/60">{offer.oferta}</p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => canAct && onAccept(offer)}
              disabled={!canAct || accepted || registeringNow}
              className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                accepted ? 'bg-emerald-500 text-white' : 'bg-emerald-500 text-white hover:bg-emerald-600'
              }`}
            >
              {registeringNow ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {registeringNow ? 'Registrando…' : accepted ? 'Venta registrada' : 'Registrar venta'}
            </button>

            <button
              onClick={() => canAct && !rejected && onOpenReject(offer)}
              disabled={!canAct || rejected}
              className={`flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                rejected
                  ? 'border-rose-500 bg-rose-500/10 text-rose-600 dark:text-rose-300'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-rose-500/5 dark:border-white/10 dark:bg-white/5 dark:text-white'
              }`}
            >
              <X className="h-4 w-4" />
              {rejected ? 'Rechazo registrado' : 'Registrar rechazo'}
            </button>

            <EvidencePicker
              value={evidence}
              disabled={!canAct || saving}
              onChange={(v) => canAct && onEvidence(offer, v)}
            />

            <button
              onClick={() => canAct && onReport()}
              disabled={!canAct}
              className="flex items-center gap-1.5 text-xs font-medium text-slate-400 transition-colors hover:text-slate-600 disabled:opacity-40 dark:hover:text-white"
            >
              <Flag className="h-3.5 w-3.5" />
              Reportar
            </button>
          </div>
        </div>
      </div>
      {!canAct && (
        <p className="mt-1.5 text-center text-[11px] text-slate-400">
          Genera una recomendación para habilitar el registro comercial.
        </p>
      )}
    </div>
  )
}