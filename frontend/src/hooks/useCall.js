import { useCallback, useEffect, useRef, useState } from 'react'
import api from '../utils/api'

function wsUrl(path) {
  const base = import.meta.env.VITE_API_URL || ''
  if (base) return `${base.replace(/^http/, 'ws')}${path}`
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${proto}://${window.location.host}${path}`
}

export function fmtDuration(seconds) {
  const s = Math.max(0, Math.floor(seconds))
  const m = Math.floor(s / 60)
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

function useTimer() {
  const [duration, setDuration] = useState(0)
  const timerRef = useRef(null)
  const stop = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])
  const start = useCallback(() => {
    stop()
    const t0 = Date.now()
    setDuration(0)
    timerRef.current = setInterval(() => setDuration((Date.now() - t0) / 1000), 500)
  }, [stop])
  return { duration, startTimer: start, stopTimer: stop }
}

/**
 * Lado del asesor: llama a un numero real via Twilio (PSTN).
 * El audio lo maneja Twilio (Media Streams en el backend).
 * El asesor solo ve el panel de copilot (STT, sugerencias, mood, modo).
 * No usa WebRTC ni microfono del navegador.
 */
export function useAsesorCall({ clientId, clientPhone, onCopilotEvent, onOffering, onAcceptance }) {
  const [phase, setPhase] = useState('idle') // idle | dialing | ringing | active | ended
  const [error, setError] = useState(null)
  const [callInfo, setCallInfo] = useState(null)
  const [muted, setMuted] = useState(false)
  const [recordingUrl, setRecordingUrl] = useState(null)
  const [mode, setMode] = useState('bot')
  const { duration, startTimer, stopTimer } = useTimer()

  const wsRef = useRef(null)
  const phaseRef = useRef('idle')
  const endedRef = useRef(false)
  const callIdRef = useRef(null)

  function setPhaseAll(value) {
    phaseRef.current = value
    setPhase(value)
  }

  const cleanup = useCallback(() => {
    stopTimer()
  }, [stopTimer])

  useEffect(() => () => { wsRef.current?.close(); cleanup() }, [cleanup])

  async function start() {
    if (phase !== 'idle') return
    setPhaseAll('dialing')
    setError(null)
    stopTimer()
    endedRef.current = false

    try {
      const { data } = await api.post('/api/calls/start', {
        client_id: clientId,
        phone_number: clientPhone || undefined,
      })
      callIdRef.current = data.call_id
      setCallInfo(data)

      const token = localStorage.getItem('nexa_token')
      const ws = new WebSocket(wsUrl(`/api/calls/ws/${data.call_id}?role=asesor&token=${token}`))
      wsRef.current = ws

      ws.onopen = () => {
        setPhaseAll('ringing')
      }

      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data)
        if (msg.offering) onOffering?.(msg.offering)
        if (msg.type === 'stt') {
          onCopilotEvent?.({ ...msg, type: 'stt' })
        } else if (msg.type === 'status' && msg.state === 'active') {
          setPhaseAll('active')
          startTimer()
        } else if (msg.type === 'copilot') {
          onCopilotEvent?.(msg)
        } else if (msg.type === 'mood') {
          onCopilotEvent?.({ ...msg, type: 'mood' })
        } else if (msg.type === 'acceptance') {
          onAcceptance?.(msg)
        } else if (msg.type === 'mode') {
          if (msg.mode === 'bot' || msg.mode === 'asesor') setMode(msg.mode)
        } else if (msg.type === 'ended') {
          endedRef.current = true
          const id = callIdRef.current
          if (id) setRecordingUrl(`${import.meta.env.VITE_API_URL || ''}/api/calls/${id}/recording`)
          stopTimer()
          cleanup()
          setPhaseAll('ended')
          ws.close()
        }
      }

      ws.onerror = () => setError('No se pudo conectar la llamada.')
      ws.onclose = () => {
        if (!endedRef.current) {
          stopTimer()
          cleanup()
          setPhaseAll('ended')
        }
      }
    } catch (e) {
      setError(e.response?.data?.detail || 'No se pudo iniciar la llamada.')
      setPhaseAll('idle')
    }
  }

  function hangup(reason = 'ended') {
    if (typeof reason !== 'string') reason = 'ended'
    wsRef.current?.send(JSON.stringify({ type: 'end', reason }))
    wsRef.current?.close()
    endedRef.current = true
    const id = callIdRef.current
    if (id) setRecordingUrl(`${import.meta.env.VITE_API_URL || ''}/api/calls/${id}/recording`)
    stopTimer()
    cleanup()
    setPhaseAll('ended')
  }

  function reset() {
    setPhaseAll('idle')
    setError(null)
    setCallInfo(null)
    setMuted(false)
    callIdRef.current = null
    setRecordingUrl(null)
    stopTimer()
  }

  function switchMode(next) {
    if (next === mode || (next !== 'bot' && next !== 'asesor')) return
    setMode(next)
    wsRef.current?.send(JSON.stringify({ type: 'mode', mode: next }))
  }

  return { phase, error, callInfo, duration, muted, recordingUrl, mode, switchMode, start, hangup, reset }
}

// ---------------------------------------------------------------------------
// WebRTC P2P (deshabilitado: se usa Twilio para llamadas reales)
// ---------------------------------------------------------------------------
/*
export function useAsesorWebRTCCall({ clientId, onCopilotEvent, onOffering, onRemoteStream, onAcceptance }) {
  // ... hook WebRTC P2P original (client-to-client via link) ...
  // Ver git history: 9e5e08e~1
}

export function useClienteCall({ callId, clientToken, onRemoteStream, botAudioRef }) {
  // ... hook WebRTC del lado del "cliente" (navegador) ...
  // Ver git history: 9e5e08e~1
}
*/
