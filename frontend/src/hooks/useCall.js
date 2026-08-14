import { useCallback, useEffect, useRef, useState } from 'react'
import api from '../utils/api'

const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }]

function wsUrl(path) {
  const base = import.meta.env.VITE_API_URL || ''
  if (base) return `${base.replace(/^http/, 'ws')}${path}`
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${proto}://${window.location.host}${path}`
}

export function callUrl(callId, token, name) {
  const query = new URLSearchParams({ token })
  if (name) query.set('nombre', name)
  return `${window.location.origin}/llamada/${callId}?${query.toString()}`
}

export function fmtDuration(seconds) {
  const s = Math.max(0, Math.floor(seconds))
  const m = Math.floor(s / 60)
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

async function createPeer(stream, onCandidate) {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
  stream.getTracks().forEach((t) => pc.addTrack(t, stream))
  pc.onicecandidate = (e) => {
    if (e.candidate) onCandidate(e.candidate.toJSON())
  }
  return pc
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

function useStreamCleanup() {
  const streamRef = useRef(null)
  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])
  return { streamRef, stopStream }
}

/**
 * Lado del asesor: inicia la llamada, publica el enlace y negocia el audio P2P.
 */
export function useAsesorCall({ clientId, onCopilotEvent, onOffering, onRemoteStream }) {
  const [phase, setPhase] = useState('idle') // idle | starting | ringing | active | ended
  const [error, setError] = useState(null)
  const [callInfo, setCallInfo] = useState(null)
  const [muted, setMuted] = useState(false)
  const { duration, startTimer, stopTimer } = useTimer()
  const { streamRef, stopStream } = useStreamCleanup()

  const wsRef = useRef(null)
  const pcRef = useRef(null)
  const phaseRef = useRef('idle')
  const endedRef = useRef(false)

  function setPhaseAll(value) {
    phaseRef.current = value
    setPhase(value)
  }

  const cleanup = useCallback(() => {
    stopTimer()
    stopStream()
    pcRef.current?.close()
    pcRef.current = null
  }, [stopTimer, stopStream])

  useEffect(() => () => { wsRef.current?.close(); cleanup() }, [cleanup])

  async function start() {
    if (phase !== 'idle') return
    setPhaseAll('starting')
    setError(null)
    stopTimer()
    endedRef.current = false
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
    } catch {
      setError('No se pudo acceder al micrófono. Revisa el permiso del navegador.')
      setPhaseAll('idle')
      return
    }

    try {
      const { data } = await api.post('/api/calls/start', { client_id: clientId })
      setCallInfo({ ...data, url: callUrl(data.call_id, data.cliente_token, data.client_name) })

      const token = localStorage.getItem('nexa_token')
      const ws = new WebSocket(wsUrl(`/api/calls/ws/${data.call_id}?role=asesor&token=${token}`))
      wsRef.current = ws

      ws.onopen = async () => {
        try {
          const pc = await createPeer(streamRef.current, (candidate) =>
            ws.send(JSON.stringify({ type: 'candidate', candidate }))
          )
          pcRef.current = pc
          pc.ontrack = (e) => onRemoteStream?.(e.streams[0])
          const offer = await pc.createOffer()
          await pc.setLocalDescription(offer)
          ws.send(JSON.stringify({ type: 'offer', sdp: offer.sdp }))
          setPhaseAll('ringing')
        } catch {
          setError('No se pudo preparar el audio de la llamada.')
          setPhaseAll('idle')
        }
      }

      ws.onmessage = async (ev) => {
        const msg = JSON.parse(ev.data)
        // El offering E2E se actualiza en tiempo real con cada evento.
        if (msg.offering) onOffering?.(msg.offering)
        if (msg.type === 'status' && msg.state === 'active') {
          setPhaseAll('active')
          startTimer()
        } else if (msg.type === 'answer' && msg.sdp) {
          await pcRef.current?.setRemoteDescription({ type: 'answer', sdp: msg.sdp })
          setPhaseAll('active')
          startTimer()
        } else if (msg.type === 'candidate') {
          try { await pcRef.current?.addIceCandidate(msg.candidate) } catch { /* candidato tardio */ }
        } else if (msg.type === 'copilot') {
          onCopilotEvent?.(msg)
        } else if (msg.type === 'ended') {
          endedRef.current = true
          stopTimer()
          cleanup()
          setPhaseAll('ended')
          ws.close()
        }
      }

      ws.onerror = () => setError('No se pudo conectar con la llamada.')
      ws.onclose = () => {
        if (!endedRef.current) {
          stopTimer()
          cleanup()
          setPhaseAll('ended')
        }
      }
    } catch (e) {
      stopStream()
      setError(e.response?.data?.detail || 'No se pudo iniciar la llamada.')
      setPhaseAll('idle')
    }
  }

  function toggleMute() {
    streamRef.current?.getAudioTracks().forEach((t) => { t.enabled = muted })
    setMuted(!muted)
  }

  function hangup(reason = 'ended') {
    wsRef.current?.send(JSON.stringify({ type: 'end', reason }))
    wsRef.current?.close()
    endedRef.current = true
    stopTimer()
    cleanup()
    setPhaseAll('ended')
  }

  function reset() {
    setPhaseAll('idle')
    setError(null)
    setCallInfo(null)
    setMuted(false)
    stopTimer()
  }

  return { phase, error, callInfo, duration, muted, start, toggleMute, hangup, reset }
}

/**
 * Lado del "cliente": pantalla pública /llamada/:callId. Responde, reproduce el
 * audio remoto y transcribe su voz (Web Speech API) hacia el copilot del asesor.
 */
export function useClienteCall({ callId, clientToken, onRemoteStream }) {
  const [phase, setPhase] = useState('incoming') // incoming | connecting | active | ended
  const [error, setError] = useState(null)
  const [muted, setMuted] = useState(false)
  const { duration, startTimer, stopTimer } = useTimer()
  const { streamRef, stopStream } = useStreamCleanup()

  const wsRef = useRef(null)
  const pcRef = useRef(null)
  const recRef = useRef(null)
  const phaseRef = useRef('incoming')
  const endedRef = useRef(false)

  function setPhaseAll(value) {
    phaseRef.current = value
    setPhase(value)
  }

  const cleanup = useCallback(() => {
    stopTimer()
    stopStream()
    stopSTT()
    pcRef.current?.close()
    pcRef.current = null
  }, [stopTimer, stopStream])

  useEffect(() => () => { wsRef.current?.close(); cleanup() }, [cleanup])

  function stopSTT() {
    if (recRef.current) {
      recRef.current.onresult = null
      recRef.current.onend = null
      recRef.current.stop()
      recRef.current = null
    }
  }

  function startSTT(ws) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) return
    const rec = new SR()
    recRef.current = rec
    rec.lang = 'es-PE'
    rec.continuous = true
    rec.interimResults = true
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i += 1) {
        const result = e.results[i]
        const text = result[0].transcript.trim()
        if (!text) continue
        ws.send(JSON.stringify({ type: 'stt', text, final: result.isFinal }))
      }
    }
    rec.onerror = () => {}
    rec.onend = () => {
      // La transcripcion no debe cortar la llamada; solo reinicia.
      if (phaseRef.current === 'active') {
        try { rec.start() } catch { /* transcribiendo */ }
      }
    }
    rec.start()
  }

  async function answer() {
    if (phase !== 'incoming') return
    setPhaseAll('connecting')
    setError(null)
    endedRef.current = false

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
    } catch {
      setError('No se pudo acceder al micrófono. Revisa el permiso del navegador.')
      setPhaseAll('incoming')
      return
    }

    const ws = new WebSocket(wsUrl(`/api/calls/ws/${callId}?role=cliente&token=${clientToken}`))
    wsRef.current = ws

    ws.onmessage = async (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.type === 'offer' && msg.sdp) {
        try {
          const pc = await createPeer(streamRef.current, (candidate) =>
            ws.send(JSON.stringify({ type: 'candidate', candidate }))
          )
          pcRef.current = pc
          pc.ontrack = (e) => onRemoteStream?.(e.streams[0])
          await pc.setRemoteDescription({ type: 'offer', sdp: msg.sdp })
          const answer = await pc.createAnswer()
          await pc.setLocalDescription(answer)
          ws.send(JSON.stringify({ type: 'answer', sdp: answer.sdp }))
          setPhaseAll('active')
          startTimer()
          startSTT(ws)
        } catch {
          setError('No se pudo establecer el audio de la llamada.')
          setPhaseAll('incoming')
        }
      } else if (msg.type === 'candidate') {
        try { await pcRef.current?.addIceCandidate(msg.candidate) } catch { /* candidato tardio */ }
      } else if (msg.type === 'ended') {
        endedRef.current = true
        stopTimer()
        cleanup()
        setPhaseAll('ended')
        ws.close()
      }
    }

    ws.onerror = () => setError('No se pudo conectar con la llamada.')
    ws.onclose = () => {
      if (!endedRef.current) {
        stopTimer()
        cleanup()
        setPhaseAll('ended')
      }
    }
  }

  function decline() {
    setPhaseAll('ended')
  }

  function toggleMute() {
    streamRef.current?.getAudioTracks().forEach((t) => { t.enabled = muted })
    setMuted(!muted)
  }

  function hangup(reason = 'ended') {
    wsRef.current?.send(JSON.stringify({ type: 'end', reason }))
    wsRef.current?.close()
    endedRef.current = true
    stopTimer()
    cleanup()
    setPhaseAll('ended')
  }

  return { phase, error, duration, muted, answer, decline, toggleMute, hangup }
}