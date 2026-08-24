import React, { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import api from '../utils/api'
import { MessageCircle, Send, ShieldCheck } from 'lucide-react'

export default function ClientChat() {
  const { chatId } = useParams()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [state, setState] = useState('loading') // loading | ready | error

  const scrollRef = useRef(null)
  const lastIdRef = useRef(0)

  // Carga inicial + polling cada 2s (mismo patron que el modal del asesor)
  useEffect(() => {
    if (!chatId) return undefined
    let alive = true
    async function poll(first = false) {
      try {
        const after = first ? 0 : lastIdRef.current
        const { data } = await api.get(`/api/chats/${chatId}/messages?after=${after}`)
        if (!alive) return
        setState('ready')
        if (data.length) {
          lastIdRef.current = data[data.length - 1].id
          setMessages((prev) => (first ? data : [...prev, ...data]))
        }
      } catch {
        if (alive && first) setState('error')
      }
    }
    poll(true)
    const id = setInterval(() => poll(false), 2000)
    return () => { alive = false; clearInterval(id) }
  }, [chatId])

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  async function send(e) {
    e.preventDefault()
    const body = input.trim()
    if (!body || sending) return
    setSending(true)
    setInput('')
    try {
      const { data } = await api.post(`/api/chats/${chatId}/client-messages`, { body })
      lastIdRef.current = data.messages[data.messages.length - 1].id
      setMessages((prev) => [...prev, ...data.messages])
    } catch {
      setInput(body)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-navy-950 via-navy-900 to-navy-950 px-4 py-8 text-slate-200">
      <div className="mb-6 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/20 text-cyan-300">
          <MessageCircle className="h-4 w-4" />
        </div>
        <span className="font-display text-sm font-bold tracking-wide text-white">NEXA · MENSAJES</span>
      </div>

      <div className="flex h-[70vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-xl backdrop-blur">
        <div className="border-b border-white/10 px-5 py-4 text-center">
          <p className="font-display text-lg font-bold text-white">Conversación con Movistar</p>
          <p className="mt-0.5 flex items-center justify-center gap-1 text-[11px] text-slate-400">
            <ShieldCheck className="h-3 w-3 text-emerald-400" />
            Chat oficial · responde nuestro asistente virtual
          </p>
        </div>

        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
          {state === 'loading' && (
            <p className="py-10 text-center text-xs text-slate-400">Cargando conversación…</p>
          )}
          {state === 'error' && (
            <div className="py-10 text-center">
              <p className="text-sm font-semibold text-white">Conversación no encontrada</p>
              <p className="mt-1 text-xs text-slate-400">Pide a tu asesor un enlace nuevo.</p>
            </div>
          )}
          {messages.map((m) => {
            const mine = m.sender === 'cliente'
            return (
              <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-xl px-3.5 py-2.5 ${
                  mine
                    ? 'rounded-br-sm bg-emerald-600 text-white'
                    : 'rounded-bl-sm border border-white/10 bg-white/10 text-slate-100'
                }`}>
                  {!mine && (
                    <p className={`mb-0.5 text-[9px] font-bold uppercase tracking-wide ${
                      m.sender === 'bot' ? 'text-cyan-300' : 'text-emerald-300'
                    }`}>
                      {m.sender === 'bot' ? 'Asistente Movistar' : 'Asesor'}
                    </p>
                  )}
                  <p className="whitespace-pre-line text-sm leading-snug">{m.body}</p>
                </div>
              </div>
            )
          })}
        </div>

        <form onSubmit={send} className="flex gap-2 border-t border-white/10 p-3">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Escribe un mensaje…"
            disabled={state !== 'ready' || sending}
            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/10 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
            maxLength={4000}
          />
          <button
            type="submit"
            disabled={!input.trim() || sending || state !== 'ready'}
            className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/25 transition-colors hover:bg-emerald-600 disabled:opacity-40"
            aria-label="Enviar mensaje"
          >
            <Send size={17} />
          </button>
        </form>
      </div>

      <p className="mt-4 max-w-md text-center text-[11px] text-slate-500">
        Al escribir aquí te comunicas con el equipo comercial de Movistar a traves de NEXA.
      </p>
    </div>
  )
}
