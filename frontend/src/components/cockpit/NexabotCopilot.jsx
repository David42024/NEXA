import React, { useEffect, useRef, useState } from 'react'
import {
  Bot,
  Zap,
  AlertTriangle,
  Copy,
  Check,
  Send,
  RefreshCw,
  Sparkles,
  Database,
  MessageSquare,
  Phone,
} from 'lucide-react'
import api from '../../utils/api'

const QUICK_PROMPTS = [
  '¿Qué hago si dice que está caro?',
  '¿Cómo manejo sus reclamos?',
]

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

function Section({ icon: Icon, title, children }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 p-3.5 dark:border-white/5 dark:bg-white/5">
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {title}
      </p>
      {children}
    </div>
  )
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
  const chatRef = useRef(null)

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

  const speechLoadingNow = speechLoading === topOffer?.oferta
  const firstVariant = speech?.variantes?.[0]
  const rebateVariant = speech?.variantes?.[1]

  const urgent = k.datosUrgent
  const urgencyCopy = k.diasAgotamiento == null
    ? null
    : urgent
    ? `Agota sus datos en ${k.diasAgotamiento} días — prioriza la llamada hoy.`
    : k.diasAgotamiento <= 30
    ? `Agota sus datos en ${k.diasAgotamiento} días. Buen momento para ofrecer datos.`
    : null

  const firstName = clientName?.split(' ')[0] || 'el cliente'

  return (
    <aside className="flex flex-col rounded-xl border border-slate-200 bg-white text-navy-900 shadow-sm transition-colors xl:sticky xl:top-6 xl:h-fit dark:border-navy-800 dark:bg-navy-900 dark:text-slate-200">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4 dark:border-white/10">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-600 dark:bg-cyan-500/20 dark:text-cyan-300">
          <Bot className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 font-display text-sm font-bold text-navy-900 dark:text-white">
            Nexabot
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              En línea
            </span>
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">Asesor comercial IA</p>
        </div>
      </div>

      <div className="flex-1 space-y-3 px-4 py-4">
        {/* Urgencia */}
        {urgencyCopy && (
          <div
            className={`rounded-lg border p-3.5 ${
              urgent
                ? 'border-rose-200 bg-rose-50 dark:border-rose-400/30 dark:bg-rose-500/15'
                : 'border-slate-100 bg-slate-50 dark:border-white/5 dark:bg-white/5'
            }`}
          >
            <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {urgent ? (
                <AlertTriangle className="h-3.5 w-3.5 text-rose-500 dark:text-rose-300" />
              ) : (
                <Zap className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
              )}
              Urgencia
            </p>
            <p className={`text-xs leading-relaxed ${urgent ? 'text-rose-600 dark:text-rose-200' : 'text-slate-600 dark:text-slate-300'}`}>
              {urgencyCopy}
            </p>
          </div>
        )}

        {/* Objeciones en vivo */}
        {liveCopilot.length > 0 && (
          <Section icon={Phone} title={`Llamada en vivo · ${liveCopilot.length}`}>
            <div className="max-h-64 space-y-2.5 overflow-y-auto pr-1">
              {liveCopilot.map((e, i) => (
                <div key={i} className="rounded-lg border border-slate-100 bg-slate-50/70 p-3 dark:border-white/5 dark:bg-navy-950/40">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                        OBJECTION_STYLE[e.objection?.type] || OBJECTION_STYLE.otro
                      }`}
                    >
                      {e.objection?.label || 'Escuchando'}
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
              ))}
            </div>
          </Section>
        )}

        {/* Speech sugerido */}
        <Section icon={MessageSquare} title="Pitch inicial">
          {!topOffer ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">Genera una recomendación para obtener el pitch.</p>
          ) : !firstVariant ? (
            <button
              onClick={() => onGenerateSpeech(topOffer)}
              disabled={speechLoadingNow || !canSpeech}
              className="flex items-center gap-2 rounded-lg bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-cyan-600 disabled:opacity-50"
            >
              {speechLoadingNow ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              {speechLoadingNow ? 'Generando…' : 'Generar pitch'}
            </button>
          ) : (
            <div className="space-y-2">
              <p className="text-xs leading-relaxed text-navy-900 dark:text-slate-200">{firstVariant.texto}</p>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-slate-400 dark:text-slate-500">{firstVariant.variante}</span>
                <button
                  onClick={() => onCopy(firstVariant.texto, `speech-${topOffer.oferta}`)}
                  className="flex items-center gap-1 text-[10px] font-semibold text-cyan-600 hover:text-cyan-700 dark:text-cyan-300 dark:hover:text-cyan-200"
                >
                  {copiedKey === `speech-${topOffer.oferta}` ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  {copiedKey === `speech-${topOffer.oferta}` ? 'Copiado' : 'Copiar'}
                </button>
              </div>
            </div>
          )}
        </Section>

        {/* Rebate */}
        <Section icon={Zap} title="Rebate">
          {!topOffer || !firstVariant ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">Disponible al generar el pitch.</p>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-slate-600 dark:text-slate-300">
                De <strong className="text-navy-900 dark:text-white">S/ {k.montoProm.toFixed(2)}</strong> a{' '}
                <strong className="text-navy-900 dark:text-white">S/ {k.precioProyectado.toFixed(2)}</strong> ·{' '}
                <strong className="text-emerald-600 dark:text-emerald-300">−S/ {k.ahorroMensual.toFixed(2)}/mes</strong>
              </p>
              {rebateVariant ? (
                <>
                  <p className="text-xs leading-relaxed text-navy-900 dark:text-slate-200">{rebateVariant.texto}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">{rebateVariant.variante}</span>
                    <button
                      onClick={() => onCopy(rebateVariant.texto, `rebate-${topOffer.oferta}`)}
                      className="flex items-center gap-1 text-[10px] font-semibold text-cyan-600 hover:text-cyan-700 dark:text-cyan-300 dark:hover:text-cyan-200"
                    >
                      {copiedKey === `rebate-${topOffer.oferta}` ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      {copiedKey === `rebate-${topOffer.oferta}` ? 'Copiado' : 'Copiar'}
                    </button>
                  </div>
                </>
              ) : (
                <button
                  onClick={() => onGenerateSpeech(topOffer)}
                  disabled={speechLoadingNow || !canSpeech}
                  className="text-[11px] font-semibold text-cyan-600 hover:text-cyan-700 dark:text-cyan-300 dark:hover:text-cyan-200 disabled:opacity-50"
                >
                  {speechLoadingNow ? 'Generando…' : 'Generar rebate'}
                </button>
              )}
            </div>
          )}
        </Section>

        {/* Chat */}
        <div className="rounded-lg border border-slate-100 bg-slate-50 p-3.5 dark:border-white/5 dark:bg-white/5">
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            <MessageSquare className="h-3.5 w-3.5" />
            Pregunta a Nexabot
          </p>

          <div ref={chatRef} className="max-h-52 space-y-2 overflow-y-auto pr-1">
            {messages.length === 0 && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Respóndele a {firstName} sobre objeciones, ofertas o reclamos.
              </p>
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
                onClick={() => setDraft(q)}
                disabled={!canChat}
                className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-40 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
              >
                {q}
              </button>
            ))}
          </div>

          <div className="mt-3 flex items-center gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
              disabled={!canChat}
              placeholder={canChat ? 'Escribe una objeción…' : 'Sin permiso para consultar a Nexabot'}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-navy-900 placeholder:text-slate-400 focus:border-cyan-500 focus:outline-none disabled:opacity-40 dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-slate-500"
            />
            <button
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

      <div className="border-t border-slate-100 px-4 py-3 dark:border-white/10">
        <button
          onClick={onRequestData}
          className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 transition-colors hover:text-cyan-600 dark:text-slate-400 dark:hover:text-white"
        >
          <Database className="h-3.5 w-3.5" />
          ¿Falta información? Solicitar datos
        </button>
      </div>
    </aside>
  )
}