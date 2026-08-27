import React, { useEffect, useRef, useState } from 'react'
import {
  Phone,
  PhoneOff,
  PhoneCall,
  Timer,
  FileDown,
  Loader2,
  Bot,
  MessageSquareText,
  Link2,
  Copy,
  Check,
} from 'lucide-react'
import { useAsesorCall, useAsesorWebRTCCall, callUrl, fmtDuration } from '../hooks/useCall'

/**
 * Llamada en vivo: soporta dos modos.
 *   - Twilio (PSTN): llama a un numero real via Twilio.
 *   - WebRTC (enlace): genera un link P2P que el cliente abre en su navegador.
 */
export default function LiveCallPanel({
  clientId,
  clientName,
  clientPhone,
  onCopilotEvent,
  onE2E,
  canStart = true,
  onStartChat,
  onCallEnded,
  onCallReset,
}) {
  const [callMode, setCallMode] = useState('twilio') // 'twilio' | 'webrtc'
  const [savingRecording, setSavingRecording] = useState(false)
  const [lastOffering, setLastOffering] = useState(null)
  const [handoff, setHandoff] = useState(null)
  const [copied, setCopied] = useState(false)
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

  function downloadRecording() {
    const url = callTwilio.recordingUrl || callWebRTC.recordingUrl
    if (!url) return
    const save = (blob) => {
      const objUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objUrl
      a.download = `llamada-${clientId}.webm`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(objUrl), 4000)
    }
    const fromServer = (u) => {
      const token = localStorage.getItem('nexa_token')
      return fetch(u, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
        .then((r) => { if (!r.ok) throw new Error(r.statusText); return r.blob() })
        .then(save)
    }
    fromServer(url).catch(() => {})
  }

  const callTwilio = useAsesorCall({
    clientId,
    clientPhone,
    onCopilotEvent,
    onOffering: handleOfferingEvent,
    onAcceptance: (msg) => setHandoff(msg),
  })

  const callWebRTC = useAsesorWebRTCCall({
    clientId,
    onCopilotEvent,
    onOffering: handleOfferingEvent,
    onAcceptance: (msg) => setHandoff(msg),
    onRemoteStream: () => {},
  })

  const call = callMode === 'twilio' ? callTwilio : callWebRTC

  useEffect(() => {
    const ph = call.phase
    if (ph === 'idle') {
      lastOfferingRef.current = null
      setLastOffering(null)
      setHandoff(null)
      setCopied(false)
      onCallReset?.()
    }
    if (ph === 'active' || ph === 'ringing' || ph === 'dialing' || ph === 'starting') wasActive.current = true
    if (ph === 'ended' && wasActive.current) {
      wasActive.current = false
      setHandoff(null)
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

  const live = call.phase === 'ringing' || call.phase === 'active' || call.phase === 'dialing' || call.phase === 'starting' || call.phase === 'connecting'

  function copyLink() {
    const url = callWebRTC.callInfo?.url
    if (!url) return
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {})
  }

  return (
    <div className="card p-5">
      <div className="mb-1 flex items-center justify-between">
        <p className="label-eyebrow">Llamada en vivo</p>
        {live && (
          <span className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
            {call.phase === 'active' ? `En llamada ${callMode === 'twilio' ? 'PSTN' : 'WebRTC'}` : 'Esperando respuesta'}
          </span>
        )}
      </div>
      <p className="mb-4 text-xs text-slate-400">
        {callMode === 'twilio'
          ? 'Llamada telefonica real via Twilio. La IA escucha la voz de ambos en tiempo real.'
          : 'Llamada P2P via enlace WebRTC. Comparte el link con el cliente para que conteste desde su navegador.'}
      </p>

      <audio ref={useRef()} autoPlay className="hidden" />

      {live && (
        <div className="mb-3 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 dark:bg-navy-950/50">
            <button
              type="button"
              onClick={() => call.switchMode('bot')}
              className={`flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold transition-colors ${
                call.mode === 'bot'
                  ? 'bg-cyan-500 text-white shadow-sm'
                  : 'text-slate-500 hover:text-navy-900 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              <Bot className="h-3.5 w-3.5" />
              Bot habla
            </button>
            <button
              type="button"
              onClick={() => call.switchMode('asesor')}
              className={`flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold transition-colors ${
                call.mode === 'asesor'
                  ? 'bg-navy-800 text-white shadow-sm dark:bg-white dark:text-navy-900'
                  : 'text-slate-500 hover:text-navy-900 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              <Phone className="h-3.5 w-3.5" />
              Asesor habla
            </button>
        </div>
      )}

      {call.phase === 'idle' && (
        <>
          <div className="mb-3 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 dark:bg-navy-950/50">
            <button
              type="button"
              onClick={() => setCallMode('twilio')}
              className={`flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold transition-colors ${
                callMode === 'twilio'
                  ? 'bg-emerald-500 text-white shadow-sm'
                  : 'text-slate-500 hover:text-navy-900 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              <Phone className="h-3.5 w-3.5" />
              Telefonico
            </button>
            <button
              type="button"
              onClick={() => setCallMode('webrtc')}
              className={`flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold transition-colors ${
                callMode === 'webrtc'
                  ? 'bg-emerald-500 text-white shadow-sm'
                  : 'text-slate-500 hover:text-navy-900 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              <Link2 className="h-3.5 w-3.5" />
              Por enlace
            </button>
          </div>

          {callMode === 'twilio' ? (
            <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-white/10 dark:bg-white/5">
              <p className="text-[11px] font-medium text-slate-400">Numero del cliente</p>
              <p className="text-sm font-semibold text-navy-900 dark:text-white">
                {clientPhone || 'No registrado'}
              </p>
              <p className="mt-1 text-[10px] text-slate-400">
                Linea verificada: +51 920 611 224
              </p>
            </div>
          ) : (
            <div className="mb-3 rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2.5 dark:border-cyan-400/20 dark:bg-cyan-500/5">
              <p className="text-[11px] font-medium text-cyan-600 dark:text-cyan-400">Enlace para el cliente</p>
              <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                Al iniciar la llamada se genera un link unico. Compartelo con {firstName} para que
                conteste desde su navegador (sin app ni descarga).
              </p>
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => call.start()}
              disabled={!canStart}
              className="btn-primary flex flex-1 items-center justify-center gap-2 text-sm"
            >
              {callMode === 'twilio' ? <Phone className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
              {callMode === 'twilio' ? `Marcar a ${firstName}` : `Crear enlace para ${firstName}`}
            </button>
            {onStartChat && (
              <button
                onClick={onStartChat}
                className="btn-secondary flex items-center justify-center gap-2 text-sm"
                title="Chat de mensajes con el cliente"
              >
                <MessageSquareText className="h-4 w-4" />
                Chat
              </button>
            )}
          </div>
          {!canStart && (
            <p className="mt-2 text-[11px] text-slate-400">
              No tienes permiso para iniciar ofrecimientos.
            </p>
          )}
        </>
      )}

      {(call.phase === 'dialing' || call.phase === 'starting') && (
        <div>
          <p className="mb-3 flex items-center gap-2 text-sm text-slate-500">
            <PhoneCall className="h-4 w-4 animate-pulse text-emerald-500" />
            {callMode === 'twilio' ? `Marcando a ${firstName}...` : `Creando enlace WebRTC...`}
          </p>
          <p className="mb-3 text-[11px] text-slate-400">
            {callMode === 'twilio'
              ? 'Twilio esta marcando el numero real. Espera a que se conteste.'
              : 'Preparando la llamada P2P. Comparte el enlace con el cliente.'}
          </p>
          <button onClick={() => call.hangup('cancelled')} className="btn-secondary w-full text-xs">
            Cancelar llamada
          </button>
        </div>
      )}

      {call.phase === 'ringing' && (
        <div>
          <p className="mb-3 flex items-center gap-2 text-sm text-slate-500">
            <PhoneCall className="h-4 w-4 animate-pulse text-emerald-500" />
            {callMode === 'twilio'
              ? `Esperando que ${firstName} acepte...`
              : `Esperando que ${firstName} abra el enlace...`}
          </p>
          {callMode === 'webrtc' && callWebRTC.callInfo?.url && (
            <div className="mb-3 flex items-center gap-2">
              <input
                readOnly
                value={callWebRTC.callInfo.url}
                className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300"
              />
              <button
                onClick={copyLink}
                className="flex items-center gap-1.5 rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-[11px] font-medium text-cyan-700 transition-colors hover:bg-cyan-100 dark:border-cyan-400/20 dark:bg-cyan-500/10 dark:text-cyan-300"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? 'Copiado' : 'Copiar'}
              </button>
            </div>
          )}
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
              Hablando con {firstName} {callMode === 'twilio' ? 'via PSTN' : 'via WebRTC'}
            </p>
          </div>
          <div className="flex items-center justify-center gap-2">
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
              Guardando grabacion...
            </p>
            <p className="mt-0.5 text-[11px] text-slate-400">
              Se esta registrando el audio como medio probatorio.
            </p>
          </div>
        ) : (
          <div>
            <p className="mb-1 flex items-center justify-center gap-1.5 text-sm font-medium text-slate-500">
              <PhoneOff className="h-4 w-4" />
              Llamada finalizada - {fmtDuration(call.duration)}
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
            {(callTwilio.recordingUrl || callWebRTC.recordingUrl) && (
              <button
                onClick={downloadRecording}
                className="mb-2 flex w-full items-center justify-center gap-2 rounded-lg border border-cyan-300 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-700 transition-colors hover:bg-cyan-500/20 dark:border-cyan-400/30 dark:text-cyan-300"
              >
                <FileDown className="h-4 w-4" />
                Descargar audio - {fmtDuration(call.duration)}
              </button>
            )}
            <button onClick={call.reset} className="btn-secondary w-full text-xs">
              Nueva llamada
            </button>
          </div>
        ))}

      {call.error && <p className="mt-2 text-xs text-rose-600">{call.error}</p>}

      {handoff && call.phase === 'active' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-emerald-300 bg-white p-6 text-center shadow-2xl dark:border-emerald-400/40 dark:bg-navy-900">
            <h3 className="mt-4 font-display text-lg font-bold text-navy-900 dark:text-white">
              {firstName} acepto la oferta
            </h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-300">
              "{handoff.text}". Es el momento del cierre: tomas el control de la llamada?
            </p>
            <div className="mt-6 flex flex-col gap-2">
              <button
                onClick={() => { call.switchMode('asesor'); setHandoff(null) }}
                className="btn-primary flex w-full items-center justify-center gap-2 text-sm"
              >
                <Phone className="h-4 w-4" />
                Tomar el control
              </button>
              <button
                onClick={() => setHandoff(null)}
                className="btn-secondary w-full text-xs"
              >
                Que siga el bot
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
