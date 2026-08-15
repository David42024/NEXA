import React, { useEffect, useRef, useState } from 'react'
import {
  Bot,
  Zap,
  BadgePercent,
  Copy,
  Check,
  Send,
  RefreshCw,
  MessageSquare,
  Phone,
  Hourglass,
  List,
} from 'lucide-react'
import api from '../../utils/api'

const QUICK_PROMPTS = ['¿Qué incluye Movistar Total?', '¿Cómo funciona la portabilidad?']

const SOURCE_STYLE = {
  groq: 'text-cyan-600 bg-cyan-500/10 dark:text-cyan-300',
  gemini: 'text-amber-700 bg-amber-500/10 dark:text-amber-300',
  local: 'text-slate-500 bg-slate-500/10 dark:text-slate-300 dark:bg-white/10',
  error: 'text-rose-600 bg-rose-500/10 dark:text-rose-300',
}

const OBJECTION_STYLE = {
  precio: 'bg-rose-500/10 text-rose-600 border-rose-300 dark:text-rose-300 dark:border-rose-400/30',
  competencia: 'bg-amber-500/10 text-amber-700 border-amber-300 dark:text-amber-300 dark:border-amber-400/30',
  no_necesita: 'bg-slate-500/10 text-slate-600 border-slate-300 dark:text-slate-300 dark:border-slate-400/30',
  reclamo: 'bg-orange-500/10 text-orange-700 border-orange-300 dark:text-orange-300 dark:border-orange-400/30',
  dudas: 'bg-cyan-500/10 text-cyan-700 border-cyan-300 dark:text-cyan-300 dark:border-cyan-400/30',
  otro: 'bg-slate-500/10 text-slate-600 border-slate-300 dark:text-slate-300 dark:border-slate-400/30',
}

export default function NexabotCopilot({
  clientId,
  clientName,
  k,
  topOffer,
  speech,
  speechLoading,
  onGenerateSpeech,
  copiedKey,
  onCopy,
  onRequestData,
  canChat,
  canSpeech,
  liveCopilot = [],
}) {
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [showRebate, setShowRebate] = useState(false)
  const chatRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, sending])

  async function send(text) {
    const value = (text ?? draft).trim()
    if (!value || sending) return
    setMessages((m) => [...m, { role: 'user', text: value }])
    setDraft('')
    setSending(true)
    try {
      const { data } = await api.post('/api/nexabot/chat', { client_id: clientId, message: value })
      setMessages((m) => [...m, { role: 'bot', text: data.reply, source: data.source }])
    } catch (e) {
      setMessages((m) => [
        ...m,
        { role: 'bot', text: e.response?.data?.detail || 'No pude responder. Intenta de nuevo.', source: 'error' },
      ])
    } finally {
      setSending(false)
    }
  }

  function focusChat() {
    inputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    inputRef.current?.focus()
  }

  const speechLoadingNow = speechLoading === topOffer?.oferta
  const firstVariant = speech?.variantes?.[0]
  const rebateVariant = speech?.variantes?.[1]

  // Resumen de lo que el cliente dijo durante la llamada (sin repetir seguidas).
  const clientLines = []
  let lastLine = ''
  liveCopilot.forEach((e) => {
    if (e.type === 'stt' && e.speaker !== 'asesor' && e.text !== lastLine) {
      clientLines.push(e)
      lastLine = e.text
    }
  })

  const urgent = k.datosUrgent
  const datosAlerta = k.datosAlerta

  return (
    <aside className="flex flex-col rounded-xl border border-black/60 bg-white text-navy-900 shadow-sm transition-colors xl:sticky xl:top-6 xl:h-fit dark:border-white/60 dark:bg-navy-900 dark:text-slate-200">
      {/* Cabecera minimal */}
      <div className="flex items-center gap-2.5 border-b border-slate-100 px-4 py-3 dark:border-white/10">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-600 dark:bg-cyan-500/20 dark:text-cyan-300">
          <Bot className="h-4 w-4" />
        </div>
        <p className="flex min-w-0 items-center gap-1.5 font-display text-sm font-bold text-navy-900 dark:text-white">
          Nexabot
          <span className="text-slate-300 dark:text-slate-600">·</span>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
            En línea
          </span>
        </p>
      </div>

      <div className="flex-1 space-y-3 px-4 py-3">
        {/* Datos: urgencia real solo si se agotan antes del ciclo */}
        {datosAlerta && (
          <div
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${
              urgent
                ? 'border-amber-200 bg-amber-50 dark:border-amber-400/30 dark:bg-amber-500/15'
                : 'border-emerald-200 bg-emerald-50 dark:border-emerald-400/30 dark:bg-emerald-500/15'
            }`}
          >
            <Hourglass
              className={`h-3.5 w-3.5 shrink-0 ${
                urgent ? 'text-amber-600 dark:text-amber-300' : 'text-emerald-600 dark:text-emerald-300'
              }`}
            />
            <p
              className={`text-xs font-semibold ${
                urgent ? 'text-amber-700 dark:text-amber-200' : 'text-emerald-700 dark:text-emerald-200'
              }`}
            >
              {datosAlerta}
            </p>
          </div>
        )}

        {/* Acciones principales */}
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => onGenerateSpeech(topOffer)}
            disabled={!topOffer || speechLoadingNow || !canSpeech}
            className="flex flex-col items-center justify-center gap-1 rounded-lg bg-cyan-500 px-1 py-2.5 text-[11px] font-semibold text-white transition-colors hover:bg-cyan-600 disabled:opacity-40"
          >
            {speechLoadingNow ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            <span className="leading-none">{speechLoadingNow ? 'Generando' : 'Generar pitch'}</span>
          </button>
          <button
            type="button"
            onClick={() => setShowRebate((v) => !v)}
            disabled={!topOffer || !firstVariant}
            className="flex flex-col items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-1 py-2.5 text-[11px] font-semibold text-navy-900 transition-colors hover:border-cyan-400 hover:text-cyan-600 disabled:opacity-40 dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
          >
            <BadgePercent className="h-4 w-4" />
            <span className="leading-none">Ver rebate</span>
          </button>
          <button
            type="button"
            onClick={focusChat}
            className="flex flex-col items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-1 py-2.5 text-[11px] font-semibold text-navy-900 transition-colors hover:border-cyan-400 hover:text-cyan-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
          >
            <MessageSquare className="h-4 w-4" />
            <span className="leading-none">Preguntar</span>
          </button>
        </div>

        {/* Pitch */}
        {firstVariant && (
          <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-white/5 dark:bg-white/5">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <Zap className="h-3.5 w-3.5" />
                Pitch
              </p>
              <button
                type="button"
                onClick={() => onCopy(firstVariant.texto, `speech-${topOffer.oferta}`)}
                className="flex items-center gap-1 text-[10px] font-semibold text-cyan-600 hover:text-cyan-700 dark:text-cyan-300 dark:hover:text-cyan-200"
              >
                {copiedKey === `speech-${topOffer.oferta}` ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                {copiedKey === `speech-${topOffer.oferta}` ? 'Copiado' : 'Copiar'}
              </button>
            </div>
            <p className="text-xs leading-relaxed text-navy-900 dark:text-slate-200">{firstVariant.texto}</p>
            <span className="mt-1.5 block text-[10px] text-slate-400 dark:text-slate-500">{firstVariant.variante}</span>
          </div>
        )}

        {/* Rebate */}
        {showRebate && topOffer && firstVariant && (
          <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-white/5 dark:bg-white/5">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <BadgePercent className="h-3.5 w-3.5" />
                Rebate
              </p>
              {rebateVariant && (
                <button
                  type="button"
                  onClick={() => onCopy(rebateVariant.texto, `rebate-${topOffer.oferta}`)}
                  className="flex items-center gap-1 text-[10px] font-semibold text-cyan-600 hover:text-cyan-700 dark:text-cyan-300 dark:hover:text-cyan-200"
                >
                  {copiedKey === `rebate-${topOffer.oferta}` ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  {copiedKey === `rebate-${topOffer.oferta}` ? 'Copiado' : 'Copiar'}
                </button>
              )}
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              De <strong className="text-navy-900 dark:text-white">S/ {k.montoProm.toFixed(2)}</strong> a{' '}
              <strong className="text-navy-900 dark:text-white">S/ {k.precioProyectado.toFixed(2)}</strong> ·{' '}
              <strong className="text-emerald-600 dark:text-emerald-300">−S/ {k.ahorroMensual.toFixed(2)}/mes</strong>
            </p>
            {rebateVariant ? (
              <>
                <p className="mt-1.5 text-xs leading-relaxed text-navy-900 dark:text-slate-200">{rebateVariant.texto}</p>
                <span className="mt-1 block text-[10px] text-slate-400 dark:text-slate-500">{rebateVariant.variante}</span>
              </>
            ) : (
              <p className="mt-1.5 text-[11px] text-slate-400 dark:text-slate-500">Genera el pitch para obtener el rebate.</p>
            )}
          </div>
        )}

        {/* Llamada en vivo */}
        {liveCopilot.length > 0 && (
          <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-white/5 dark:bg-white/5">
            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <Phone className="h-3.5 w-3.5" />
              Llamada en vivo · {liveCopilot.length}
            </p>
            <div className="max-h-64 space-y-2.5 overflow-y-auto pr-1">
              {liveCopilot.map((e, i) => {
                if (e.type === 'stt') {
                  const esCliente = e.speaker !== 'asesor'
                  return (
                    <div
                      key={i}
                      className={`rounded-lg border px-3 py-2 ${
                        esCliente
                          ? 'border-cyan-100 bg-cyan-50/60 dark:border-cyan-400/20 dark:bg-cyan-500/10'
                          : 'border-slate-100 bg-slate-50/70 dark:border-white/5 dark:bg-navy-950/40'
                      }`}
                    >
                      <span className={`text-[9px] font-bold uppercase tracking-wide ${esCliente ? 'text-cyan-600 dark:text-cyan-300' : 'text-slate-400 dark:text-slate-500'}`}>
                        {esCliente ? 'Cliente' : 'Asesor'}
                      </span>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-navy-900 dark:text-slate-200">{e.text}</p>
                    </div>
                  )
                }
                return (
                  <div key={i} className="rounded-lg border border-slate-100 bg-slate-50/70 p-3 dark:border-white/5 dark:bg-navy-950/40">
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                          e.objection ? OBJECTION_STYLE[e.objection.type] || OBJECTION_STYLE.otro : OBJECTION_STYLE.otro
                        }`}
                      >
                        {e.objection?.label || (e.speaker === 'asesor' ? 'Feedback' : 'Escuchando')}
                      </span>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500">
                        {new Date(e.time).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    {e.quote && (
                      <p className="mb-1.5 text-[11px] italic leading-relaxed text-slate-500 dark:text-slate-400">
                        “{e.quote}”
                      </p>
                    )}
                    {e.suggestion && (
                      <p className="text-xs leading-relaxed text-navy-900 dark:text-slate-200">{e.suggestion}</p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Resumen de la llamada: lo que dijo el cliente + pitch/rebate */}
        {clientLines.length > 0 && (
          <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-white/5 dark:bg-white/5">
            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <List className="h-3.5 w-3.5" />
              Resumen del cliente
            </p>
            <div className="max-h-36 space-y-1.5 overflow-y-auto pr-1">
              {clientLines.map((line, i) => (
                <p
                  key={i}
                  className="rounded-md bg-white px-2.5 py-1.5 text-[11px] leading-relaxed text-navy-900 dark:bg-white/5 dark:text-slate-200"
                >
                  {line.text}
                </p>
              ))}
            </div>
            {topOffer && (
              <div className="mt-2.5 grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => onGenerateSpeech(topOffer)}
                  disabled={speechLoadingNow || !canSpeech}
                  className="flex items-center justify-center gap-1 rounded-md bg-cyan-500 px-2 py-1.5 text-[10px] font-semibold text-white transition-colors hover:bg-cyan-600 disabled:opacity-40"
                >
                  {speechLoadingNow ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                  {speechLoadingNow ? 'Generando' : 'Generar pitch'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowRebate((v) => !v)}
                  disabled={!firstVariant}
                  className="flex items-center justify-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[10px] font-semibold text-navy-900 transition-colors hover:border-cyan-400 hover:text-cyan-600 disabled:opacity-40 dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
                >
                  <BadgePercent className="h-3 w-3" />
                  {showRebate ? 'Ocultar' : 'Ver rebate'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Chat */}
        <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-white/5 dark:bg-white/5">
          <div ref={chatRef} className="max-h-44 space-y-2 overflow-y-auto pr-1">
            {messages.length === 0 && !sending && (
              <p className="text-[11px] text-slate-400 dark:text-slate-500">Pregúntale lo que necesites: planes, ofertas, objeciones…</p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[88%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                    m.role === 'user'
                      ? 'bg-cyan-500 text-white'
                      : 'bg-slate-100 text-navy-900 dark:bg-white/10 dark:text-slate-200'
                  }`}
                >
                  <p>{m.text}</p>
                  {m.source && (
                    <span className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide ${SOURCE_STYLE[m.source] || SOURCE_STYLE.local}`}>
                      {m.source}
                    </span>
                  )}
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex justify-start">
                <div className="flex items-center gap-1.5 rounded-xl bg-slate-100 px-3 py-2 dark:bg-white/10">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:120ms]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:240ms]" />
                </div>
              </div>
            )}
          </div>

          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {QUICK_PROMPTS.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => send(q)}
                disabled={!canChat}
                className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-40 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
              >
                {q}
              </button>
            ))}
          </div>

          <div className="mt-2.5 flex items-center gap-2">
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
              disabled={!canChat}
              placeholder={canChat ? 'Escribe tu pregunta...' : 'Sin permiso'}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-navy-900 placeholder:text-slate-400 focus:border-cyan-500 focus:outline-none disabled:opacity-40 dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-slate-500"
            />
            <button
              type="button"
              onClick={() => send()}
              disabled={!draft.trim() || sending || !canChat}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cyan-500 text-white transition-colors hover:bg-cyan-600 disabled:opacity-40"
              aria-label="Enviar a Nexabot"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </aside>
  )
}