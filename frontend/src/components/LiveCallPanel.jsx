import React, { useEffect, useRef, useState } from 'react'
import {
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  Copy,
  Check,
  Link2,
  PhoneCall,
  Timer,
  FileDown,
  Loader2,
} from 'lucide-react'
import { useAsesorCall, fmtDuration } from '../hooks/useCall'

/**
 * Llamada en vivo real (WebRTC): el asesor inicia la llamada, comparte el
 * enlace con el "cliente" y negocia el audio peer-to-peer. La transcripcion del
 * cliente alimenta al copilot Nexabot en tiempo real (via onCopilotEvent).
 * Al colgar: mensaje "Guardando grabacion…" y descarga del reporte PDF del E2E.
 */
export default function LiveCallPanel({
  clientId,
  clientName,
  onCopilotEvent,
  onE2E,
  canStart = true,
  onCallEnded,
}) {
  const [copied, setCopied] = useState(false)
  const [savingRecording, setSavingRecording] = useState(false)
  const [lastOffering, setLastOffering] = useState(null)
  const audioRef = useRef(null)
  const wasActive = useRef(false)
  const lastOfferingRef = useRef(null)

  function handleOfferingEvent(offering) {
    if (offering?.id) {
      lastOfferingRef.current = offering
      setLastOffering(offering)
    }
    onE2E?.(offering)
  }

  function downloadPdf() {
    const offering = lastOfferingRef.current
    if (!offering?.id) return
    const token = localStorage.getItem('nexa_token')
    const base = import.meta.env.VITE_API_URL || ''
    fetch(`${base}/api/e2e/offerings/${offering.id}/pdf`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => {
        if (!r.ok) throw new Error(r.statusText)
        return r.blob()
      })
      .then((blob) => {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `reporte-${clientId}-${offering.id}.pdf`
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(url)
      })
      .catch(() => {})
  }

  const call = useAsesorCall({
    clientId,
    onCopilotEvent,
    onOffering: handleOfferingEvent,
    onRemoteStream: (stream) => {
      if (audioRef.current) {
        audioRef.current.srcObject = stream
        audioRef.current.play().catch(() => {})
      }
    },
  })

  // Al terminar una llamada que sí llegó a conectarse: "Guardando grabacion…",
  // luego auto-descarga el PDF del flujo y avisa para completar datos.
  useEffect(() => {
    if (call.phase === 'idle') {
      lastOfferingRef.current = null
      setLastOffering(null)
    }
    if (call.phase === 'active') wasActive.current = true
    if (call.phase === 'ended' && wasActive.current) {
      wasActive.current = false
      setSavingRecording(true)
      const t = setTimeout(() => {
        setSavingRecording(false)
        if (lastOfferingRef.current?.id) downloadPdf()
        onCallEnded?.()
      }, 2600)
      return () => clearTimeout(t)
    }
  }, [call.phase, onCallEnded])

  const firstName = clientName?.split(' ')[0] || 'cliente'

  function copyLink() {
    navigator.clipboard?.writeText(call.callInfo?.url || '')
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const live = call.phase === 'ringing' || call.phase === 'active'

  return (
    <div className="card p-5">
      <div className="mb-1 flex items-center justify-between">
        <p className="label-eyebrow">Llamada en vivo</p>
        {live && (
          <span className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
            {call.phase === 'active' ? 'En llamada · P2P' : 'Esperando respuesta'}
          </span>
        )}
      </div>
      <p className="mb-4 text-xs text-slate-400">
        Llamada WebRTC peer-to-peer: el asesor y el "cliente" hablan en vivo entre
        navegadores. La IA escucha la voz de ambos (Chrome/Edge) y sugiere cómo
        responder.
      </p>

      {!call.sttSupported && (
        <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200">
          La transcripción de voz requiere Chrome o Edge: en este navegador el bot no
          podrá escuchar la llamada.
        </p>
      )}

      <audio ref={audioRef} autoPlay className="hidden" />

      {call.phase === 'idle' && (
        <>
          <button
            onClick={call.start}
            disabled={!canStart}
            className="btn-primary flex w-full items-center justify-center gap-2 text-sm"
          >
            <Phone className="h-4 w-4" />
            Llamar a {firstName}
          </button>
          {!canStart && (
            <p className="mt-2 text-[11px] text-slate-400">
              No tienes permiso para iniciar ofrecimientos.
            </p>
          )}
        </>
      )}

      {call.phase === 'starting' && (
        <p className="py-6 text-center text-sm text-slate-400">Preparando la llamada…</p>
      )}

      {call.phase === 'ringing' && (
        <div>
          <p className="mb-3 flex items-center gap-2 text-sm text-slate-500">
            <PhoneCall className="h-4 w-4 animate-pulse text-emerald-500" />
            Esperando que {firstName} acepte…
          </p>
          <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5">
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-slate-400">
              Enlace para el cliente (ábrelo en otra pestaña)
            </p>
            <p className="mb-2 truncate text-[11px] text-slate-600 dark:text-slate-300">
              {call.callInfo?.url}
            </p>
            <button
              onClick={copyLink}
              className="flex items-center gap-1.5 text-[11px] font-semibold text-cyan-600 hover:text-cyan-700 dark:text-cyan-400"
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? 'Enlace copiado' : 'Copiar enlace'}
            </button>
          </div>
          <button onClick={() => call.hangup('cancelled')} className="btn-secondary w-full text-xs">
            Cancelar llamada
          </button>
        </div>
      )}

      {call.phase === 'active' && (
        <div>
          <div className="mb-4 flex flex-col items-center rounded-xl bg-slate-50 py-5 dark:bg-white/5">
            <p className="font-display text-3xl font-bold tabular-nums text-navy-900 dark:text-white">
              {fmtDuration(call.duration)}
            </p>
            <p className="mt-1 flex items-center gap-1 text-[11px] text-slate-400">
              <Timer className="h-3 w-3" />
              Hablando con {firstName} · audio P2P
            </p>
          </div>
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={call.toggleMute}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition-colors ${
                call.muted
                  ? 'bg-amber-100 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300'
                  : 'bg-white text-slate-600 shadow-sm border border-slate-200 dark:bg-white/5 dark:border-white/10 dark:text-slate-300'
              }`}
            >
              {call.muted ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
              {call.muted ? 'Micrófono apagado' : 'Micrófono'}
            </button>
            <button
              onClick={() => call.hangup()}
              className="flex items-center gap-2 rounded-full bg-rose-600 px-5 py-2 text-xs font-semibold text-white transition-colors hover:bg-rose-700"
            >
              <PhoneOff className="h-3.5 w-3.5" />
              Colgar
            </button>
          </div>
        </div>
      )}

      {call.phase === 'ended' &&
        (savingRecording ? (
          <div className="py-5 text-center">
            <Loader2 className="mx-auto h-6 w-6 animate-spin text-emerald-500" />
            <p className="mt-2 text-sm font-medium text-slate-600 dark:text-slate-300">
              Guardando grabación…
            </p>
            <p className="mt-0.5 text-[11px] text-slate-400">
              Se está registrando el audio como medio probatorio.
            </p>
          </div>
        ) : (
          <div>
            <p className="mb-1 flex items-center justify-center gap-1.5 text-sm font-medium text-slate-500">
              <PhoneOff className="h-4 w-4" />
              Llamada finalizada · {fmtDuration(call.duration)}
            </p>
            <p className="mb-3 text-center text-[11px] text-slate-400">
              Registrar el contacto y el resultado en el seguimiento E2E.
            </p>
            {lastOffering?.id && (
              <button
                onClick={downloadPdf}
                className="mb-2 flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-300 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-500/20 dark:border-emerald-400/30 dark:text-emerald-300"
              >
                <FileDown className="h-4 w-4" />
                Descargar reporte PDF del flujo
              </button>
            )}
            {call.recordingUrl && (
              <a
                href={call.recordingUrl}
                download={`llamada-${clientId}.webm`}
                className="mb-2 flex w-full items-center justify-center gap-2 rounded-lg border border-cyan-300 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-700 transition-colors hover:bg-cyan-500/20 dark:border-cyan-400/30 dark:text-cyan-300"
              >
                <FileDown className="h-4 w-4" />
                Descargar audio · {fmtDuration(call.duration)}
              </a>
            )}
            <button onClick={call.reset} className="btn-secondary w-full text-xs">
              Nueva llamada
            </button>
          </div>
        ))}

      {call.phase === 'ringing' && call.callInfo && (
        <p className="mt-2 flex items-center justify-center gap-1 text-[10px] text-slate-400">
          <Link2 className="h-3 w-3" />
          Demo: el "cliente" es la pestaña que abrió el enlace.
        </p>
      )}

      {call.error && <p className="mt-2 text-xs text-rose-600">{call.error}</p>}
    </div>
  )
}