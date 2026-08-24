import React, { useEffect, useRef, useState } from 'react'
import api from '../../utils/api'
import { Copy, Link2, MessageSquareText, Send, X } from 'lucide-react'

const SENDER_STYLE = {
  cliente: { wrap: 'justify-start', bubble: 'border-slate-200 bg-white text-navy-900 dark:border-white/10 dark:bg-navy-950/40 dark:text-slate-200', label: null },
  asesor: { wrap: 'justify-end', bubble: 'border-cyan-100 bg-cyan-50/60 text-cyan-900 dark:border-cyan-400/20 dark:bg-cyan-500/10 dark:text-cyan-100', label: 'Tú' },
  bot: { wrap: 'justify-end', bubble: 'border-emerald-100 bg-emerald-50/60 text-emerald-900 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-100', label: 'Nexabot' },
}

export default function MessageChatModal({ clientId, clientName, onClose }) {
  const [chatId, setChatId] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)
  const [botOn, setBotOn] = useState(null) // null = desconocido hasta abrir el chat

  const lastIdRef = useRef(0)
  const scrollRef = useRef(null)

  // Abrir el chat: el backend genera el mensaje inicial del bot
  useEffect(() => {
    let alive = true
    api.post('/api/chats', { client_id: clientId })
      .then(({ data }) => {
        if (!alive) return
        setChatId(data.chat_id)
        setMessages(data.messages)
        setBotOn(data.bot_enabled !== false)
        lastIdRef.current = data.messages.length ? data.messages[data.messages.length - 1].id : 0
      })
      .catch((e) => {
        if (!alive) return
        const status = e?.response?.status
        setError(
          status === 404
            ? 'El backend no tiene el canal de mensajes: reinicia el servidor para cargar el código nuevo.'
            : `No se pudo abrir el chat${status ? ` (error ${status})` : ''}. Intenta de nuevo.`
        )
      })
    return () => { alive = false }
  }, [clientId])

  // Polling: trae mensajes nuevos cada 2.5s
  useEffect(() => {
    if (!chatId) return undefined
    const id = setInterval(async () => {
      try {
        const { data } = await api.get(`/api/chats/${chatId}/messages?after=${lastIdRef.current}`)
        if (data.length) {
          lastIdRef.current = data[data.length - 1].id
          setMessages((prev) => [...prev, ...data])
        }
      } catch { /* reintenta en el siguiente tick */ }
    }, 2500)
    return () => clearInterval(id)
  }, [chatId])

  // Auto-scroll al ultimo mensaje
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  const link = chatId ? `${window.location.origin}/mensaje/${chatId}` : ''

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch { /* clipboard bloqueado */ }
  }

  async function send(e) {
    e.preventDefault()
    const body = input.trim()
    if (!body || !chatId) return
    setSending(true)
    setInput('')
    try {
      await api.post(`/api/chats/${chatId}/asesor-messages`, { body })
      const { data } = await api.get(`/api/chats/${chatId}/messages?after=${lastIdRef.current}`)
      if (data.length) {
        lastIdRef.current = data[data.length - 1].id
        setMessages((prev) => [...prev, ...data])
      }
    } catch {
      setError('No se pudo enviar el mensaje.')
      setInput(body)
    } finally {
      setSending(false)
    }
  }

  async function toggleBot() {
    const next = !botOn
    setBotOn(next)
    try {
      await api.patch(`/api/chats/${chatId}/bot`, { enabled: next })
      setMessages((prev) => [...prev, {
        id: `local-${Date.now()}`,
        sender: 'system',
        body: next
          ? 'Nexabot activado: responde los mensajes del cliente por ti.'
          : 'Nexabot en pausa: tú respondes los mensajes del cliente.',
      }])
    } catch {
      setBotOn(!next)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/60 px-4">
      <div className="flex h-[75vh] w-full max-w-md flex-col rounded-xl border border-black/60 bg-white shadow-lg dark:border-white/60 dark:bg-navy-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-white/10">
          <div className="min-w-0">
            <p className="label-eyebrow">Contacto por mensaje</p>
            <p className="truncate font-display font-semibold text-navy-900 dark:text-white">{clientName}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2.5">
            {/* Deslizante Nexabot activo/pausado */}
            <span className={`text-[10px] font-bold uppercase tracking-wide ${botOn ? 'text-emerald-600 dark:text-emerald-300' : 'text-slate-400'}`}>
              Nexabot {botOn ? 'activo' : 'en pausa'}
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={!!botOn}
              disabled={!chatId || botOn === null}
              onClick={toggleBot}
              className={`relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-40 ${
                botOn ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-white/20'
              }`}
              title={botOn ? 'Pausar respuestas automáticas' : 'Activar respuestas automáticas'}
            >
              <span className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                botOn ? 'translate-x-4' : ''
              }`} />
            </button>
            <button onClick={onClose} className="text-slate-400 hover:text-cyan-600" aria-label="Cerrar">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Link para el cliente */}
        <div className="border-b border-slate-100 px-4 py-3 dark:border-white/10">
          <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
            <Link2 size={12} /> Envíale este enlace a tu cliente para que escriba aquí:
          </p>
          <div className="flex gap-2">
            <input readOnly value={link} onFocus={(e) => e.target.select()} className="input flex-1 font-mono text-[11px]" />
            <button onClick={copyLink} disabled={!link} className="btn-secondary shrink-0 px-3 text-xs flex items-center gap-1.5">
              <Copy size={13} /> {copied ? 'Copiado' : 'Copiar'}
            </button>
          </div>
        </div>

        {/* Mensajes */}
        <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto bg-slate-50 p-3 dark:bg-white/5">
          {error && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-600 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>
          )}
          {!chatId && !error && <p className="py-6 text-center text-xs text-slate-400">Abriendo conversación…</p>}
          {messages.map((m) => {
            if (m.sender === 'system') {
              return (
                <p key={m.id} className="text-center text-[10px] font-medium text-slate-400">
                  {m.body}
                </p>
              )
            }
            const st = SENDER_STYLE[m.sender] || SENDER_STYLE.bot
            return (
              <div key={m.id} className={`flex ${st.wrap}`}>
                <div className={`max-w-[85%] rounded-xl border px-3 py-2 ${st.bubble}`}>
                  {st.label && (
                    <p className={`mb-0.5 text-[9px] font-bold uppercase tracking-wide ${
                      m.sender === 'bot' ? 'text-emerald-600 dark:text-emerald-300' : 'text-cyan-600 dark:text-cyan-300'
                    }`}>{st.label}</p>
                  )}
                  <p className="whitespace-pre-line text-sm leading-snug">{m.body}</p>
                  {m.created_at && (
                    <p className="mt-1 text-right text-[9px] opacity-50">
                      {new Date(m.created_at).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Input del asesor (toma manual de la conversación; el bot se retira) */}
        <form onSubmit={send} className="flex gap-2 border-t border-slate-100 p-3 dark:border-white/10">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={chatId ? (botOn ? 'Escribe como asesor… (pausa el bot)' : 'Escribe como asesor (modo manual)…') : 'Esperando chat…'}
            disabled={!chatId || sending}
            className="input flex-1"
            maxLength={4000}
          />
          <button type="submit" disabled={!input.trim() || sending || !chatId} className="btn-primary shrink-0 px-3" aria-label="Enviar">
            <Send size={15} />
          </button>
        </form>

        <p className="flex items-center gap-1.5 px-4 pb-3 text-[10px] text-slate-400">
          <MessageSquareText size={11} />
          {botOn
            ? 'Nexabot saluda y responde solo; si escribes tú, se pausa automáticamente.'
            : 'Modo manual: tú respondes cada mensaje. Activa Nexabot para que responda solo.'}
        </p>
      </div>
    </div>
  )
}
