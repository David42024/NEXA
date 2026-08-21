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

/**
 * Transcribe la voz del dispositivo (Web Speech API) y la etiqueta por hablante.
 * El copilot del backend escucha al cliente (objeciones) y al asesor (pitch).
 * Devuelve la instancia para poder detenerla; null si el navegador no soporta STT
 * (p.ej. iOS/Safari), donde la llamada funciona igual sin transcripcion.
 *
 * La instancia NO se reutiliza tras stop(): en Chrome re-start() la misma
 * instancia la deja muda silenciosamente. Cada reinicio crea una nueva.
 */
function createSTT({ ws, speaker, isActive, isPaused, isCurrent, onAutoRestart }) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!SR) return null
  const rec = new SR()
  rec.lang = 'es-PE'
  rec.continuous = true
  rec.interimResults = true

  // Resumen por pausa: no se manda cada palabra; se envia la frase completa
  // cuando hay un resultado final o tras una pausa fuerte de voz (~1.6s).
  let flushedUntil = 0
  let lastSent = ''
  let lastInterim = ''
  let pauseTimer = null

  const send = (text) => {
    const t = (text || '').trim()
    if (!t || t === lastSent) return
    lastSent = t
    ws.send(JSON.stringify({ type: 'stt', speaker, text: t, final: true }))
  }

  rec.onresult = (e) => {
    let finals = ''
    for (let i = flushedUntil; i < e.results.length; i += 1) {
      const r = e.results[i]
      if (r.isFinal) {
        finals = (finals + ' ' + r[0].transcript.trim()).trim()
        flushedUntil = i + 1
      }
    }
    if (finals) {
      clearTimeout(pauseTimer)
      send(finals)
      return
    }
    // Sin final todavia: acumula lo provisional y espera la pausa para mandarlo.
    lastInterim = e.results[e.results.length - 1][0].transcript.trim()
    if (lastInterim && lastInterim !== lastSent) {
      clearTimeout(pauseTimer)
      pauseTimer = setTimeout(() => send(lastInterim), 1600)
    }
  }
  rec.onerror = () => {}
  rec.onend = () => {
    clearTimeout(pauseTimer)
    // Si Chrome cerro el reconocimiento antes del timer de pausa (fin de voz),
    // envia lo acumulado para que el bot responda igualmente.
    if (lastInterim && lastInterim !== lastSent) send(lastInterim)
    lastInterim = ''
    if (isCurrent() && isActive() && !isPaused() && onAutoRestart) {
      setTimeout(() => {
        if (isCurrent() && isActive() && !isPaused()) onAutoRestart()
      }, 300)
    }
  }
  try { rec.start() } catch { /* transcribiendo */ }
  return rec
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
export function useAsesorCall({ clientId, onCopilotEvent, onOffering, onRemoteStream, onAcceptance }) {
  const [phase, setPhase] = useState('idle') // idle | starting | ringing | active | ended
  const [error, setError] = useState(null)
  const [callInfo, setCallInfo] = useState(null)
  const [muted, setMuted] = useState(true) // el asesor arranca silenciado
  const [recordingUrl, setRecordingUrl] = useState(null)
  const [localRecordingUrl, setLocalRecordingUrl] = useState(null) // respaldo sin voz del bot
  const [mode, setMode] = useState('bot') // bot | asesor
  const { duration, startTimer, stopTimer } = useTimer()
  const { streamRef, stopStream } = useStreamCleanup()

  const sttSupported = Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)
  const wsRef = useRef(null)
  const pcRef = useRef(null)
  const recRef = useRef(null)
  const remoteStreamRef = useRef(null)
  const recMediaRef = useRef(null)
  const recordingUrlRef = useRef(null)
  const phaseRef = useRef('idle')
  const endedRef = useRef(false)
  const callIdRef = useRef(null)
  const serverRecordingRef = useRef(false)

  function setPhaseAll(value) {
    phaseRef.current = value
    setPhase(value)
  }

  const asesorSttGenRef = useRef(0)

  function stopSTT() {
    asesorSttGenRef.current += 1
    if (recRef.current) {
      recRef.current.onresult = null
      recRef.current.onend = null
      try { recRef.current.abort() } catch { /* ya detenida */ }
      recRef.current = null
    }
  }

  function startSTT() {
    // Instancia nueva SIEMPRE: re-start() la misma tras onend deja Chrome mudo.
    if (recRef.current) {
      try { recRef.current.onresult = null; recRef.current.onend = null; recRef.current.abort() } catch { /* ya detenida */ }
      recRef.current = null
    }
    asesorSttGenRef.current += 1
    const gen = asesorSttGenRef.current
    recRef.current = createSTT({
      ws: wsRef.current,
      speaker: 'asesor',
      isActive: () => phaseRef.current === 'active',
      isPaused: () => false,
      isCurrent: () => gen === asesorSttGenRef.current,
      onAutoRestart: () => startSTT(),
    })
  }

  // Graba la llamada mezclando el micro local y el audio remoto del cliente.
  function startRecording() {
    if (recMediaRef.current || !window.MediaRecorder) return
    const local = streamRef.current
    const remote = remoteStreamRef.current
    if (!local || !remote) return
    try {
      const actx = new (window.AudioContext || window.webkitAudioContext)()
      const dest = actx.createMediaStreamDestination()
      const connect = (stream) => {
        stream.getAudioTracks().forEach((t) => {
          const src = actx.createMediaStreamSource(new MediaStream([t]))
          src.connect(dest)
        })
      }
      connect(local)
      connect(remote)
      const recorder = new MediaRecorder(dest.stream)
      const chunks = []
      recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data) }
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' })
        if (recordingUrlRef.current) URL.revokeObjectURL(recordingUrlRef.current)
        recordingUrlRef.current = URL.createObjectURL(blob)
        setLocalRecordingUrl(recordingUrlRef.current)
        if (!serverRecordingRef.current) {
          // Solo se ofrece el blob local si no existe la grabacion completa del
          // servidor (la unica que incluye la voz del bot).
          setRecordingUrl(recordingUrlRef.current)
        }
        recMediaRef.current = null
        try { actx.close() } catch { /* ya cerrado */ }
      }
      recorder.start()
      recMediaRef.current = { recorder, actx }
    } catch { /* grabacion no disponible */ }
  }

  function stopRecording() {
    const rec = recMediaRef.current
    if (rec?.recorder && rec.recorder.state !== 'inactive') {
      try { rec.recorder.stop() } catch { /* ya detenido */ }
    } else {
      recMediaRef.current = null
    }
  }

  const cleanup = useCallback(() => {
    stopTimer()
    stopStream()
    stopSTT()
    stopRecording()
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
      // Silenciado por defecto: el bot conduce la llamada; el asesor habla cuando quiera.
      stream.getAudioTracks().forEach((t) => { t.enabled = false })
    } catch {
      setError('No se pudo acceder al micrófono. Revisa el permiso del navegador.')
      setPhaseAll('idle')
      return
    }

    try {
      const { data } = await api.post('/api/calls/start', { client_id: clientId })
      callIdRef.current = data.call_id
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
          pc.ontrack = (e) => {
            if (e.streams?.[0]) remoteStreamRef.current = e.streams[0]
            onRemoteStream?.(e.streams[0])
          }
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
        if (msg.type === 'stt') {
          // Transcripcion en vivo del cliente (y eco del asesor) para el panel.
          onCopilotEvent?.({ ...msg, type: 'stt' })
        } else if (msg.type === 'status' && msg.state === 'active') {
          setPhaseAll('active')
          startTimer()
          startSTT()
          setTimeout(() => { if (phaseRef.current === 'active') startRecording() }, 500)
        } else if (msg.type === 'answer' && msg.sdp) {
          await pcRef.current?.setRemoteDescription({ type: 'answer', sdp: msg.sdp })
          setPhaseAll('active')
          startTimer()
          startSTT()
          setTimeout(() => { if (phaseRef.current === 'active') startRecording() }, 500)
        } else if (msg.type === 'candidate') {
          try { await pcRef.current?.addIceCandidate(msg.candidate) } catch { /* candidato tardio */ }
        } else if (msg.type === 'copilot') {
          onCopilotEvent?.(msg)
        } else if (msg.type === 'mood') {
          onCopilotEvent?.({ ...msg, type: 'mood' })
        } else if (msg.type === 'recording') {
          // La grabacion completa (con la voz del bot) ya esta lista en el backend.
          serverRecordingRef.current = true
          const id = callIdRef.current || callInfo?.call_id
          if (id) setRecordingUrl(`${import.meta.env.VITE_API_URL || ''}/api/calls/${id}/recording`)
        } else if (msg.type === 'acceptance') {
          // El cliente acepto la oferta: el asesor puede tomar el control.
          onAcceptance?.(msg)
        } else if (msg.type === 'mode') {
          if (msg.mode === 'bot' || msg.mode === 'asesor') setMode(msg.mode)
        } else if (msg.type === 'ended') {
          endedRef.current = true
          // La grabacion con la voz del bot se sube al servidor justo despues del
          // cierre: apuntar ahi ANTES de detener el recorder local (que solo
          // captura los dos microfonos WebRTC, nunca al bot).
          serverRecordingRef.current = true
          const id = callIdRef.current || callInfo?.call_id
          if (id) setRecordingUrl(`${import.meta.env.VITE_API_URL || ''}/api/calls/${id}/recording`)
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
    if (typeof reason !== 'string') reason = 'ended'
    wsRef.current?.send(JSON.stringify({ type: 'end', reason }))
    wsRef.current?.close()
    endedRef.current = true
    // Apunta a la grabacion completa del servidor (con la voz del bot) antes de
    // detener el recorder local; el cliente la sube tras el cierre.
    serverRecordingRef.current = true
    const id = callIdRef.current || callInfo?.call_id
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
    serverRecordingRef.current = false
    if (recordingUrlRef.current) {
      URL.revokeObjectURL(recordingUrlRef.current)
      recordingUrlRef.current = null
    }
    setRecordingUrl(null)
    setLocalRecordingUrl(null)
    stopTimer()
  }

  function switchMode(next) {
    if (next === mode || (next !== 'bot' && next !== 'asesor')) return
    setMode(next)
    wsRef.current?.send(JSON.stringify({ type: 'mode', mode: next }))
    // En modo bot el mic del asesor se apaga; en modo asesor se enciende para hablar.
    const enable = next === 'asesor'
    streamRef.current?.getAudioTracks().forEach((t) => { t.enabled = enable })
    setMuted(!enable)
  }

  return { phase, error, callInfo, duration, muted, recordingUrl, localRecordingUrl, sttSupported, mode, switchMode, start, toggleMute, hangup, reset }
}

/**
 * Lado del "cliente": pantalla pública /llamada/:callId. Responde, reproduce el
 * audio remoto y transcribe su voz (Web Speech API) hacia el copilot del asesor.
 */
export function useClienteCall({ callId, clientToken, onRemoteStream, botAudioRef }) {
  const [phase, setPhase] = useState('incoming') // incoming | connecting | active | ended
  const [error, setError] = useState(null)
  const [muted, setMuted] = useState(false)
  const [botText, setBotText] = useState('')
  const [botSpeaking, setBotSpeaking] = useState(false)
  const [thinking, setThinking] = useState(false)
  const [mode, setMode] = useState('bot') // bot | asesor
  const { duration, startTimer, stopTimer } = useTimer()
  const { streamRef, stopStream } = useStreamCleanup()

  const wsRef = useRef(null)
  const pcRef = useRef(null)
  const recRef = useRef(null)
  const utteranceRef = useRef(null)
  const phaseRef = useRef('incoming')
  const endedRef = useRef(false)
  const remoteStreamRef = useRef(null)
  const audioCtxRef = useRef(null)
  const recRef2 = useRef(null) // grabacion del lado del cliente

  function setPhaseAll(value) {
    phaseRef.current = value
    setPhase(value)
  }

  // Graba la llamada en el dispositivo del cliente (micro + asesor + voz del bot,
  // que aqui es donde suena). Asi el audio descargable SI incluye al bot.
  // Arranca apenas se contesta para capturar hasta el saludo del bot.
  function startClientRecording() {
    if (recRef2.current || !window.MediaRecorder || !window.AudioContext) return
    const local = streamRef.current
    const botEl = botAudioRef?.current
    if (!local) return
    try {
      const actx = audioCtxRef.current || new (window.AudioContext || window.webkitAudioContext)()
      if (!audioCtxRef.current) audioCtxRef.current = actx
      if (actx.state === 'suspended') actx.resume().catch(() => {})
      const dest = actx.createMediaStreamDestination()
      const connect = (stream) => {
        stream.getAudioTracks().forEach((t) => {
          const src = actx.createMediaStreamSource(new MediaStream([t]))
          src.connect(dest)
        })
      }
      connect(local)   // voz del cliente
      if (botEl) {
        // El audio del bot pasa por el grafo: se oye (destination) y se graba (dest).
        // Si el elemento ya esta en otro grafo, se graba igual sin la voz del bot.
        try {
          const botSrc = actx.createMediaElementSource(botEl)
          botSrc.connect(dest)
          botSrc.connect(actx.destination)
        } catch { /* sin captura del bot */ }
      }
      const recorder = new MediaRecorder(dest.stream)
      const chunks = []
      recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data) }
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' })
        chunks.length = 0
        try { recRef2.current?.actx?.close() } catch { /* ya cerrado */ }
        if (audioCtxRef.current === recRef2.current?.actx) audioCtxRef.current = null
        recRef2.current = null
        uploadRecording(blob)
      }
      recorder.start()
      recRef2.current = { recorder, actx, dest }
    } catch { /* grabacion no disponible */ }
  }

  // Conecta la voz del asesor al grafo cuando la pista remota ya existe.
  function connectRemoteRecording() {
    const rec = recRef2.current
    const remote = remoteStreamRef.current
    if (!rec || !remote) return
    try {
      remote.getAudioTracks().forEach((t) => {
        rec.actx.createMediaStreamSource(new MediaStream([t])).connect(rec.dest)
      })
    } catch { /* sin pista remota */ }
  }

  function stopClientRecording() {
    const rec = recRef2.current
    if (rec?.recorder && rec.recorder.state !== 'inactive') {
      try { rec.recorder.stop() } catch { /* ya detenido */ }
    } else {
      try { rec?.actx?.close() } catch { /* ya cerrado */ }
      if (audioCtxRef.current === rec?.actx) audioCtxRef.current = null
      recRef2.current = null
    }
  }

  // Sube el audio grabado para que el asesor lo descargue (grabacion completa).
  function uploadRecording(blob) {
    try {
      const fd = new FormData()
      fd.append('file', blob, `llamada-${callId}.webm`)
      fetch(`${import.meta.env.VITE_API_URL || ''}/api/calls/${callId}/recording?token=${clientToken}`, {
        method: 'POST',
        body: fd,
      }).catch(() => {})
    } catch { /* sin subida */ }
  }

  const cleanup = useCallback(() => {
    stopTimer()
    stopClientRecording()
    stopStream()
    stopSTT()
    if (utteranceRef.current) {
      window.speechSynthesis?.cancel()
      utteranceRef.current = null
    }
    if (!recRef2.current) {
      audioCtxRef.current?.close().catch(() => {})
      audioCtxRef.current = null
    }
    pcRef.current?.close()
    pcRef.current = null
  }, [stopTimer, stopStream])

  useEffect(() => () => { wsRef.current?.close(); cleanup() }, [cleanup])

  const botSpeakingRef = useRef(false)
  const sttVadRef = useRef(null) // deteccion de voz + captura de frases del cliente
  const sttSentRef = useRef('')

  // Sube el clip y manda la transcripcion al backend como si fuera STT del
  // navegador; el copilot responde igual. Funciona en CUALQUIER navegador.
  function sttUpload(blob) {
    try {
      const fd = new FormData()
      fd.append('file', blob, 'audio.webm')
      fetch(`${import.meta.env.VITE_API_URL || ''}/api/calls/${callId}/stt-audio?token=${clientToken}`, {
        method: 'POST',
        body: fd,
      })
        .then((r) => r.json())
        .then((d) => {
          const t = (d.text || '').trim()
          if (!t || t === sttSentRef.current) return
          sttSentRef.current = t
          wsRef.current?.send(JSON.stringify({ type: 'stt', speaker: 'cliente', text: t, final: true }))
        })
        .catch(() => {})
    } catch { /* sin subida */ }
  }

  function sttStartUtterance(vad) {
    if (vad.rec && vad.rec.state !== 'inactive') return
    vad.chunks = []
    const rec = new MediaRecorder(vad.stream, { mimeType: 'audio/webm' })
    vad.rec = rec
    rec.ondataavailable = (e) => { if (e.data && e.data.size) vad.chunks.push(e.data) }
    rec.onstop = () => {
      const blob = new Blob(vad.chunks, { type: rec.mimeType || 'audio/webm' })
      vad.chunks = []
      vad.rec = null
      sttUpload(blob)
    }
    rec.start()
  }

  // Escucha el micro por volumen: arranca a grabar cuando el cliente habla y
  // cierra la frase tras una pausa fuerte (~800ms) para transcribirla.
  function startClientVAD() {
    const stream = streamRef.current
    if (sttVadRef.current || !stream || !window.AudioContext || !window.MediaRecorder) return
    const vad = { stream, rec: null, chunks: [], speaking: false, silenceStart: 0, check: null, raf: null, actx: null }
    sttVadRef.current = vad
    try {
      const actx = new (window.AudioContext || window.webkitAudioContext)()
      vad.actx = actx
      const src = actx.createMediaStreamSource(stream)
      const analyser = actx.createAnalyser()
      analyser.fftSize = 512
      src.connect(analyser)
      const buf = new Float32Array(analyser.fftSize)
      const check = () => {
        if (!sttVadRef.current) return
        if (botSpeakingRef.current) {
          // El bot suena por los parlantes: no transcribir la voz del propio bot.
          if (vad.rec && vad.rec.state === 'recording') { try { vad.rec.stop() } catch { /* ya detenido */ } }
          vad.speaking = false
          vad.silenceStart = 0
          vad.raf = requestAnimationFrame(check)
          return
        }
        analyser.getFloatTimeDomainData(buf)
        let sum = 0
        for (let i = 0; i < buf.length; i += 1) sum += buf[i] * buf[i]
        const rms = Math.sqrt(sum / buf.length)
        const speaking = rms > 0.02
        const now = Date.now()
        if (speaking && !vad.speaking) {
          vad.speaking = true
          vad.silenceStart = 0
          sttStartUtterance(vad)
        } else if (!speaking && vad.speaking) {
          vad.silenceStart = now
          vad.speaking = false
        } else if (!speaking && vad.silenceStart && now - vad.silenceStart > 800 && vad.rec && vad.rec.state === 'recording') {
          vad.silenceStart = 0
          try { vad.rec.stop() } catch { /* ya detenido */ }
        }
        vad.raf = requestAnimationFrame(check)
      }
      vad.check = check
      vad.raf = requestAnimationFrame(check)
    } catch { /* VAD no disponible */ }
  }

  function stopSTT() {
    const vad = sttVadRef.current
    if (!vad) return
    if (vad.raf) cancelAnimationFrame(vad.raf)
    vad.raf = null
    if (vad.rec && vad.rec.state !== 'inactive') { try { vad.rec.stop() } catch { /* ya detenido */ } }
    try { vad.actx?.close() } catch { /* ya cerrado */ }
    sttVadRef.current = null
  }

  // Pausa la transcripcion mientras el bot habla (evita que se escuche a si mismo).
  function pauseSTT() {
    const vad = sttVadRef.current
    if (!vad) return
    if (vad.raf) cancelAnimationFrame(vad.raf)
    vad.raf = null
    // Cierra la frase en curso: se transcribe y el bot podra responder.
    if (vad.rec && vad.rec.state !== 'inactive') { try { vad.rec.stop() } catch { /* ya detenido */ } }
  }

  function restartSTT() {
    if (phaseRef.current !== 'active') return
    const vad = sttVadRef.current
    if (!vad) return
    vad.speaking = false
    vad.silenceStart = 0
    if (!vad.raf && vad.check) vad.raf = requestAnimationFrame(vad.check)
  }

  function speakBot(text) {
    if (!text) return
    if (utteranceRef.current) window.speechSynthesis?.cancel()
    pauseSTT()
    botSpeakingRef.current = true
    setThinking(false)
    setBotSpeaking(true)
    const done = () => {
      botSpeakingRef.current = false
      utteranceRef.current = null
      setBotSpeaking(false)
      // Pequeña pausa para que el eco del audio se asiente, luego espera al cliente.
      setTimeout(() => restartSTT(), 400)
    }
    const synthFallback = () => {
      // Sin audio servido (TTS caido): habla por speechSynthesis. No entra en la
      // grabacion, pero la conversacion sigue funcionando.
      if (!window.speechSynthesis) { done(); return }
      const u = new SpeechSynthesisUtterance(text)
      u.lang = 'es-PE'
      u.rate = 1.0
      u.volume = 1
      u.onend = done
      u.onerror = done
      utteranceRef.current = u
      window.speechSynthesis.cancel()
      window.speechSynthesis.resume()
      window.speechSynthesis.speak(u)
    }
    const el = botAudioRef?.current
    // Voz del bot por <audio>: el cliente la oye y la grabacion local la capta.
    if (el) {
      try {
        el.onended = done
        el.onerror = () => { synthFallback() }
        el.crossOrigin = 'anonymous'
        el.src = `${import.meta.env.VITE_API_URL || ''}/api/tts?text=${encodeURIComponent(text)}`
        el.load()
        el.play().catch(() => { synthFallback() })
        return
      } catch {
        /* falla -> speechSynthesis */
      }
    }
    synthFallback()
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

    // Desbloquea el autoplay del navegador dentro del gesto de "Contestar",
    // para que la voz del bot (<audio>) pueda reproducirse sin interaccion extra.
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      ctx.resume()
      audioCtxRef.current = ctx
    } catch { /* audio ya disponible */ }

    // La grabacion arranca ya: captura el micro y el audio del bot (<audio>).
    // La pista del asesor se conecta al grafo cuando llegue (pc.ontrack).
    startClientRecording()
    // Escucha al cliente por volumen: transcribe en el servidor (funciona en
    // cualquier navegador) y el bot responde cuando termina de hablar.
    startClientVAD()

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
          pc.ontrack = (e) => {
            if (e.streams?.[0]) remoteStreamRef.current = e.streams[0]
            connectRemoteRecording()
            onRemoteStream?.(e.streams[0])
          }
          await pc.setRemoteDescription({ type: 'offer', sdp: msg.sdp })
          const answer = await pc.createAnswer()
          await pc.setLocalDescription(answer)
          ws.send(JSON.stringify({ type: 'answer', sdp: answer.sdp }))
          setPhaseAll('active')
          startTimer()
        } catch {
          setError('No se pudo establecer el audio de la llamada.')
          setPhaseAll('incoming')
        }
      } else if (msg.type === 'candidate') {
        try { await pcRef.current?.addIceCandidate(msg.candidate) } catch { /* candidato tardio */ }
      } else if (msg.type === 'bot_speech') {
        speakBot(msg.text)
      } else if (msg.type === 'bot_thinking') {
        setThinking(true)
      } else if (msg.type === 'mode') {
        if (msg.mode === 'bot' || msg.mode === 'asesor') setMode(msg.mode)
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
    if (typeof reason !== 'string') reason = 'ended'
    wsRef.current?.send(JSON.stringify({ type: 'end', reason }))
    wsRef.current?.close()
    endedRef.current = true
    stopTimer()
    cleanup()
    setPhaseAll('ended')
  }

  return { phase, error, duration, muted, botText, botSpeaking, thinking, mode, answer, decline, toggleMute, hangup }
}