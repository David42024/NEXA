import React, { useRef } from 'react'
import { useParams, useSearchParams, Link } from 'react-router-dom'
import {
  Phone,
  PhoneCall,
  PhoneOff,
  Mic,
  MicOff,
  MessageSquareText,
  Lock,
  ShieldCheck,
  Headphones,
  Sparkles,
} from 'lucide-react'
import { useClienteCall, fmtDuration } from '../hooks/useCall'

export default function ClientCall() {
  const { callId } = useParams()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const nombre = searchParams.get('nombre') || 'Cliente NEXA'
  const audioRef = useRef(null)
  const botAudioRef = useRef(null)

  const call = useClienteCall({
    callId,
    clientToken: token || '',
    botAudioRef,
    onRemoteStream: (stream) => {
      if (audioRef.current) {
        audioRef.current.srcObject = stream
        audioRef.current.play().catch(() => {})
      }
    },
  })

  const firstName = nombre.split(' ')[0]

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-navy-950 via-navy-900 to-navy-950 px-4 text-slate-200">
      <audio ref={audioRef} autoPlay className="hidden" />
      <audio ref={botAudioRef} className="hidden" />

      <div className="mb-8 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/20 text-cyan-300">
          <PhoneCall className="h-4 w-4" />
        </div>
        <span className="font-display text-sm font-bold tracking-wide text-white">NEXA - LLAMADA</span>
      </div>

      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/5 p-8 text-center shadow-xl backdrop-blur">
        {call.phase === 'incoming' && (
          <>
            <p className="text-xs font-medium uppercase tracking-widest text-slate-400">
              Llamada entrante
            </p>
            <h1 className="mt-3 font-display text-2xl font-bold text-white">
              Llamada entrante para "{firstName}"
            </h1>
            <p className="mt-1 text-xs text-slate-400">Asesor de Movistar te esta llamando</p>

            <div className="mt-8 flex items-center justify-center gap-4">
              <button
                onClick={call.decline}
                className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-700 text-white transition-colors hover:bg-slate-600"
                aria-label="Rechazar llamada"
              >
                <PhoneOff className="h-6 w-6" />
              </button>
              <button
                onClick={call.answer}
                className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 transition-colors hover:bg-emerald-600"
                aria-label="Contestar llamada"
              >
                <Phone className="h-8 w-8" />
              </button>
            </div>
            <p className="mt-6 text-[11px] text-slate-500">
              Contestar activa tu microfono y el audio de la llamada.
            </p>
          </>
        )}

        {call.phase === 'connecting' && (
          <div className="py-10">
            <Phone className="mx-auto h-10 w-10 animate-pulse text-emerald-400" />
            <p className="mt-4 text-sm text-slate-300">Conectando con el asesor...</p>
            <button
              onClick={() => call.hangup()}
              className="mt-6 flex items-center justify-center gap-2 rounded-full bg-slate-700 px-6 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-600"
            >
              <PhoneOff className="h-4 w-4" />
              Colgar
            </button>
          </div>
        )}

        {call.phase === 'active' && (
          <>
            <p className="flex items-center justify-center gap-1.5 text-xs font-medium text-emerald-400">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
              En llamada
            </p>
            <p className="mt-3 font-display text-4xl font-bold tabular-nums text-white">
              {fmtDuration(call.duration)}
            </p>
            <p className="mt-2 text-xs text-slate-400">
              {call.mode === 'bot'
                ? 'Nexabot (IA de Movistar) esta conduciendo la llamada'
                : `Hablando con ${firstName} (Asesor Movistar)`}
            </p>

            <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-cyan-300">
              <MessageSquareText className="h-3.5 w-3.5" />
              Transcripcion en vivo: la IA del asesor escucha tus objeciones
            </p>

            {call.thinking ? (
              <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-cyan-300">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-400" />
                Nexabot esta pensando...
              </p>
            ) : call.botSpeaking ? (
              <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-slate-400">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                Nexabot esta hablando... escucha
              </p>
            ) : (
              <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-emerald-400">
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                Escuchandote... respondele al asistente
              </p>
            )}

            <div className="mt-8 flex items-center justify-center gap-4">
              <button
                onClick={call.toggleMute}
                className={`flex h-14 w-14 items-center justify-center rounded-full transition-colors ${
                  call.muted
                    ? 'bg-amber-400/20 text-amber-300'
                    : 'bg-white/10 text-slate-200 hover:bg-white/15'
                }`}
                aria-label="Silenciar"
              >
                {call.muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
              </button>
              <button
                onClick={() => call.hangup()}
                className="flex h-20 w-20 items-center justify-center rounded-full bg-rose-600 text-white shadow-lg shadow-rose-600/30 transition-colors hover:bg-rose-700"
                aria-label="Colgar llamada"
              >
                <PhoneOff className="h-8 w-8" />
              </button>
            </div>
          </>
        )}

        {call.phase === 'ended' && (
          <>
            <PhoneOff className="mx-auto h-10 w-10 text-slate-500" />
            <p className="mt-4 text-sm text-slate-300">Llamada finalizada</p>
            <p className="mt-1 text-xs text-slate-500">Duracion {fmtDuration(call.duration)}</p>
            <p className="mt-6 text-[11px] text-slate-500">
              Vuelve a la pestana del asesor para ver las objeciones detectadas y cerrar la venta.
            </p>
          </>
        )}
      </div>

      <div className="mt-6 w-full max-w-sm">
        <div className="grid grid-cols-3 gap-2">
          <div className="flex flex-col items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-2 py-3">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            <p className="text-center text-[10px] leading-tight text-slate-300">
              Asistente oficial<br />Movistar
            </p>
          </div>
          <div className="flex flex-col items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-2 py-3">
            <Lock className="h-4 w-4 text-cyan-300" />
            <p className="text-center text-[10px] leading-tight text-slate-300">
              Llamada cifrada<br />extremo a extremo
            </p>
          </div>
          <div className="flex flex-col items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-2 py-3">
            <Headphones className="h-4 w-4 text-amber-300" />
            <p className="text-center text-[10px] leading-tight text-slate-300">
              Atencion 24/7<br />sin costo
            </p>
          </div>
        </div>

        {call.phase === 'incoming' && (
          <p className="mt-3 text-center text-[11px] text-slate-500">
            Esta llamada puede ser grabada para mejorar la atencion. En ella recibirás tu oferta
            personalizada.
          </p>
        )}

        {call.phase === 'active' && (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-3 py-2.5">
            <Sparkles className="h-4 w-4 shrink-0 text-cyan-300" />
            <p className="text-[11px] leading-snug text-cyan-100">
              Tienes una <strong className="text-white">oferta exclusiva</strong> esperandote. Confiramala
              al final de la llamada y empieza a ahorrar desde hoy.
            </p>
          </div>
        )}
      </div>

      {call.error && (
        <p className="mt-4 max-w-sm text-center text-xs text-rose-400">{call.error}</p>
      )}

      <Link to="/" className="mt-8 text-[11px] text-slate-600 hover:text-slate-400">
        NEXA - Next Experience & Offer AI
      </Link>
    </div>
  )
}
