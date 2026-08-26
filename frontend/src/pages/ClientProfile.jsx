import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import api from '../utils/api'
import { computeNboKpis, applyLiveMood } from '../utils/nboKpis'
import LiveCallPanel from '../components/LiveCallPanel.jsx'
import ClientHeader from '../components/cockpit/ClientHeader.jsx'
import NboScoreCard from '../components/cockpit/NboScoreCard.jsx'
import SavingsCard from '../components/cockpit/SavingsCard.jsx'
import CampaignTimeline from '../components/cockpit/CampaignTimeline.jsx'
import E2ETracking from '../components/cockpit/E2ETracking.jsx'
import NexabotCopilot from '../components/cockpit/NexabotCopilot.jsx'
import CommercialActions from '../components/cockpit/CommercialActions.jsx'
import RejectModal from '../components/cockpit/RejectModal.jsx'
import MessageChatModal from '../components/cockpit/MessageChatModal.jsx'
import { useAuth } from '../context/AuthContext.jsx'

const FEEDBACK_OPTIONS = [
  { value: 'wrong_data', label: 'Datos incorrectos del cliente' },
  { value: 'bad_offer', label: 'Oferta inapropiada para este cliente' },
  { value: 'wrong_probability', label: 'Probabilidad parece incorrecta' },
  { value: 'other', label: 'Otro (especificar)' },
]

const MOOD_STYLE = {
  good: 'border-emerald-300 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/30 dark:text-emerald-300',
  warn: 'border-amber-300 bg-amber-500/10 text-amber-700 dark:border-amber-400/30 dark:text-amber-300',
  bad: 'border-rose-300 bg-rose-500/10 text-rose-700 dark:border-rose-400/30 dark:text-rose-300',
  muted: 'border-slate-300 bg-slate-500/10 text-slate-600 dark:border-slate-400/30 dark:text-slate-300',
}

const MOOD_DRIVE = {
  2: 'Más dispuesto a comprar ↑',
  1: 'Abierto a la oferta ↑',
  0: 'Indeciso →',
  '-1': 'Fricción en aumento ↓',
  '-2': 'Riesgo de fricción alta ↓',
}

const MISSING_FIELD_PRESETS = [
  'Consumo de datos',
  'Datos del hogar',
  'Estado de pagos',
  'Canales de contacto',
  'Equipo actual',
]

const CALL_RESULTS = [
  'La oferta le interesó',
  'Pidió más información',
  'No interesado',
  'Sin respuesta',
]

const NEXT_STEPS = [
  'Llamar mañana',
  'Enviar WhatsApp',
  'Enviar SMS',
  'Agendar reunión',
  'Sin seguimiento',
]

function ProfileSkeleton() {
  return (
    <div className="animate-pulse space-y-5">
      <div className="h-28 rounded-xl border border-black/60 bg-white dark:border-white/60 dark:bg-navy-800/60" />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <div className="h-72 rounded-xl border border-black/60 bg-white dark:border-white/60 dark:bg-navy-800/60" />
            <div className="h-72 rounded-xl border border-black/60 bg-white dark:border-white/60 dark:bg-navy-800/60" />
          </div>
          <div className="h-56 rounded-xl border border-black/60 bg-white dark:border-white/60 dark:bg-navy-800/60" />
        </div>
        <div className="h-[620px] rounded-xl bg-navy-900/80" />
      </div>
    </div>
  )
}

export default function ClientProfile() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { hasPermission } = useAuth()

  const [client, setClient] = useState(null)
  const [notFound, setNotFound] = useState(false)
  const [loading, setLoading] = useState(true)

  const [recs, setRecs] = useState(null)
  const [recWarning, setRecWarning] = useState(null)
  const [progreso, setProgreso] = useState(null)
  const [recLoading, setRecLoading] = useState(false)
  const [focusSale, setFocusSale] = useState(false)

  const [speechByOffer, setSpeechByOffer] = useState({})
  const [speechLoading, setSpeechLoading] = useState(null)
  const [copiedKey, setCopiedKey] = useState(null)

  const [registering, setRegistering] = useState(null)
  const [rejectingOffer, setRejectingOffer] = useState(null)
  const [rejectReason, setRejectReason] = useState('')
  const [registeredOffers, setRegisteredOffers] = useState({})

  const [feedbackModal, setFeedbackModal] = useState(null)
  const [feedbackType, setFeedbackType] = useState('')
  const [feedbackComment, setFeedbackComment] = useState('')

  const [dataModal, setDataModal] = useState(false)
  const [msgChatOpen, setMsgChatOpen] = useState(false)
  const [missingField, setMissingField] = useState('')
  const [dataNotes, setDataNotes] = useState('')
  const [callResult, setCallResult] = useState('')
  const [nextStep, setNextStep] = useState('')
  const [dataSubmitting, setDataSubmitting] = useState(false)
  const [dataConfirmation, setDataConfirmation] = useState(null)

  // Seguimiento E2E del ofrecimiento
  const [e2eByOffer, setE2eByOffer] = useState({})
  const [e2eChannel, setE2eChannel] = useState({})
  const [e2eContact, setE2eContact] = useState({})
  const [e2eEvidence, setE2eEvidence] = useState({})
  const [e2eObjection, setE2eObjection] = useState({})
  const [e2eSaving, setE2eSaving] = useState(null)

  // Copilot en vivo: objeciones detectadas durante la llamada WebRTC
  const [liveCopilot, setLiveCopilot] = useState([])
  // Animo del cliente en vivo (del backend): ajusta KPIs en tiempo real
  const [liveMood, setLiveMood] = useState(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setNotFound(false)
      setRecs(null)
      try {
        const { data } = await api.get(`/api/clients/${id}`)
        setClient(data)
        api.get(`/api/e2e/offerings?client_id=${id}`)
          .then(({ data: offerings }) => {
            const map = {}
            offerings.forEach((o) => { if (o.offer_id) map[o.offer_id] = o })
            setE2eByOffer(map)
            const ch = {}; const ct = {}; const ev = {}; const ob = {}
            Object.values(map).forEach((o) => {
              if (o.channel) ch[o.offer_id] = o.channel
              if (o.contact_status) ct[o.offer_id] = o.contact_status
              if (o.evidence_type) ev[o.offer_id] = o.evidence_type
              if (o.objection_status) ob[o.offer_id] = o.objection_status
            })
            setE2eChannel(ch); setE2eContact(ct); setE2eEvidence(ev); setE2eObjection(ob)
          })
          .catch(() => {})
      } catch (e) {
        if (e.response?.status === 404) setNotFound(true)
      } finally {
        setLoading(false)
      }
    }
    load()
    api.get('/api/asesor/progreso').then(({ data }) => setProgreso(data)).catch(() => null)
  }, [id])

  async function generateRecommendation() {
    setRecLoading(true)
    try {
      const { data } = await api.post('/api/recommendations/generate', { client_id: id })
      setRecs(data)
      setRecWarning(data.warning)
    } finally {
      setRecLoading(false)
    }
  }

  async function generateSpeech(offer) {
    setSpeechLoading(offer.oferta)
    try {
      const { data } = await api.post('/api/speech/generate', {
        client_id: id,
        offer: offer.oferta,
        probabilidad: offer.probabilidad,
        razones: Object.keys(offer.shap_values || {}).slice(0, 3),
        beneficio: 'Ahorro y beneficios adicionales en tu plan',
        tono: 'Consultivo',
        canal: 'App',
      })
      setSpeechByOffer((prev) => ({ ...prev, [offer.oferta]: data }))
      const firstVariant = data.variantes?.[0]?.texto
      if (firstVariant && offer.offer_id) {
        await saveE2E(offer, {
          channel: e2eChannel[offer.offer_id] || 'Llamada',
          message_text: firstVariant,
          stage: 'planned',
        })
      }
    } finally {
      setSpeechLoading(null)
    }
  }

  async function saveE2E(offer, fields) {
    setE2eSaving(offer.offer_id)
    try {
      const existing = e2eByOffer[offer.offer_id]
      const res = existing
        ? await api.patch(`/api/e2e/offerings/${existing.id}`, fields)
        : await api.post('/api/e2e/offerings', { client_id: id, offer_id: offer.offer_id, ...fields })
      const data = res.data
      setE2eByOffer((prev) => ({ ...prev, [offer.offer_id]: data }))
      if (data.channel) setE2eChannel((prev) => ({ ...prev, [offer.offer_id]: data.channel }))
      if (data.contact_status) setE2eContact((prev) => ({ ...prev, [offer.offer_id]: data.contact_status }))
      if (data.evidence_type) setE2eEvidence((prev) => ({ ...prev, [offer.offer_id]: data.evidence_type }))
      if (data.objection_status) setE2eObjection((prev) => ({ ...prev, [offer.offer_id]: data.objection_status }))
    } finally {
      setE2eSaving(null)
    }
  }

  function copySpeech(text, key) {
    navigator.clipboard?.writeText(text)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 1500)
  }

  // ---- Llamada en vivo (WebRTC): el copilot detecta objeciones en tiempo real ----
  function handleCopilotEvent(event) {
    if (event.type === 'mood') {
      // El animo del cliente ajusta los KPIs del dashboard en vivo.
      setLiveMood({ mood: event.mood, score: event.score, time: Date.now() })
      return
    }
    // Historial completo de la llamada: alimenta el chat "Llamada" y da
    // contexto a las preguntas del chat Copilot IA.
    setLiveCopilot((prev) => [...prev.slice(-200), { ...event, time: Date.now() }])
  }

  // El backend avanza el E2E solo durante la llamada; aquí solo se refleja en vivo.
  function handleOffering(offering) {
    setE2eByOffer((prev) => ({ ...prev, [offering.offer_id]: offering }))
    if (offering.channel) setE2eChannel((prev) => ({ ...prev, [offering.offer_id]: offering.channel }))
    if (offering.contact_status) setE2eContact((prev) => ({ ...prev, [offering.offer_id]: offering.contact_status }))
    if (offering.evidence_type) setE2eEvidence((prev) => ({ ...prev, [offering.offer_id]: offering.evidence_type }))
    if (offering.objection_status) setE2eObjection((prev) => ({ ...prev, [offering.offer_id]: offering.objection_status }))
  }

  async function registerResult(offer, result, reason = null) {
    setRegistering(offer.oferta)
    try {
      await api.post('/api/interactions/register', {
        client_id: id,
        recommendation_id: null,
        offer_id: offer.offer_id,
        channel: 'App',
        result,
        rejection_reason: reason,
        speech_used: speechByOffer[offer.oferta]?.variantes?.[0]?.texto || null,
      })
      setRegisteredOffers((prev) => ({ ...prev, [offer.oferta]: result }))
      if (e2eByOffer[offer.offer_id]) {
        setE2eByOffer((prev) => ({
          ...prev,
          [offer.offer_id]: { ...prev[offer.offer_id], stage: 'result', result, rejection_reason: reason },
        }))
      }
      setRejectingOffer(null)
      setRejectReason('')
    } finally {
      setRegistering(null)
    }
  }

  async function submitFeedback() {
    if (!feedbackType) return
    await api.post('/api/feedback/submit', {
      feedback_type: feedbackType,
      comments: feedbackType === 'other' ? feedbackComment : FEEDBACK_OPTIONS.find(f => f.value === feedbackType)?.label,
    })
    setFeedbackModal(null)
    setFeedbackType('')
    setFeedbackComment('')
  }

  async function submitDataRequest() {
    if (!missingField.trim()) return
    setDataSubmitting(true)
    try {
      const notas = [
        dataNotes.trim(),
        callResult ? `Resultado de la llamada: ${callResult}` : null,
        nextStep ? `Próximo paso: ${nextStep}` : null,
      ].filter(Boolean).join('\n')
      const { data } = await api.post(`/api/clients/${id}/request-data`, {
        campos_solicitados: missingField.trim(),
        notas: notas || null,
      })
      setDataConfirmation(data.detail)
      setDataModal(false)
      setMissingField('')
      setDataNotes('')
      setCallResult('')
      setNextStep('')
    } finally {
      setDataSubmitting(false)
    }
  }

  if (loading) return <ProfileSkeleton />

  if (notFound) {
    return (
      <div className="max-w-lg rounded-xl border border-black/60 bg-white p-6 shadow-sm dark:border-white/60 dark:bg-navy-800/60">
        <p className="font-medium text-navy-900 dark:text-white">⚠️ No se encontró cliente con ese ID</p>
        <p className="mt-1 mb-4 text-sm text-slate-500">Verifique el ID o busque por nombre.</p>
        <button className="btn-secondary" onClick={() => navigate('/clientes')}>Volver a buscar</button>
      </div>
    )
  }

  const p = client.profile

  // ---- Derivaciones del Dashboard Comercial NBO (módulo puro, validado por tests) ----
  const topOffer = recs?.recomendaciones?.[0] || null
  const k = computeNboKpis(p, topOffer)
  const campanias = p.historial_campanias || []
  const lastCampana = campanias[campanias.length - 1]
  const copilotOffer =
    topOffer ||
    (lastCampana?.oferta
      ? { oferta: lastCampana.oferta, probabilidad: 0.5, ahorro_pct: 0, shap_values: {}, offer_id: null }
      : null)

  const status = topOffer ? registeredOffers[topOffer.oferta] : null
  const canGenerate = hasPermission('view_recommendation')
  const canSpeech = hasPermission('view_speech')

  // ---- KPIs en vivo: la probabilidad se ajusta segun el animo del cliente ----
  const liveProbPct = topOffer ? applyLiveMood(Math.round(topOffer.probabilidad * 100), liveMood?.score) : k.probPct
  const liveProbTone =
    liveProbPct == null ? 'muted' : liveProbPct >= 70 ? 'good' : liveProbPct >= 50 ? 'warn' : 'bad'

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <button onClick={() => navigate('/clientes')} className="flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-cyan-600">
          <ArrowLeft className="h-4 w-4" />
          Volver a búsqueda
        </button>
        {progreso && (
          <div
            className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] text-slate-500 dark:border-white/10 dark:bg-navy-800/60 dark:text-slate-400"
            title="Ventas del día vs meta diaria configurada por el admin"
          >
            🎯 Meta diaria <span className="font-semibold text-navy-800 dark:text-white">{progreso.meta_diaria}</span>
            <span className="mx-1">·</span>
            hoy <span className="font-semibold text-navy-800 dark:text-white">{progreso.ventas_dia}</span>
          </div>
        )}
      </div>

      <ClientHeader
        client={client}
        k={k}
        hasRecs={Boolean(recs)}
        generating={recLoading}
        onGenerate={generateRecommendation}
        onRequestData={() => setDataModal(true)}
        canGenerate={canGenerate}
      />

      {recWarning && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200">
          {recWarning}
        </div>
      )}

      {client.data_completeness_warning && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 dark:border-amber-400/30 dark:bg-amber-400/10">
          <p className="text-xs text-amber-800 dark:text-amber-200">
            ⚠ Información incompleta — las recomendaciones pueden tener menor precisión.
            Podrás solicitar los datos faltantes al terminar la llamada.
          </p>
        </div>
      )}

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        {/* ===== Área analítica principal ===== */}
        <div className="space-y-5">
          {liveMood && (
            <div className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-4 py-2.5 ${MOOD_STYLE[liveMood.mood?.tone] || MOOD_STYLE.muted}`}>
              <p className="text-xs font-semibold">
                Ánimo del cliente en la llamada: {liveMood.mood?.label}
              </p>
              <p className="text-[11px]">
                {MOOD_DRIVE[String(liveMood.mood?.level)] || 'Neutral'}
                {liveProbPct != null && ` · probabilidad ajustada en vivo a ${liveProbPct}%`}
              </p>
            </div>
          )}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <NboScoreCard
              percent={liveProbPct}
              tone={liveProbTone}
              offer={topOffer}
              shapValues={topOffer?.shap_values}
            />
            <SavingsCard
              monto={k.montoProm}
              precio={k.precioProyectado}
              ahorro={k.ahorroMensual}
              ahorroPct={k.ahorroPct}
              offer={topOffer}
              loading={recLoading}
              onViewDetails={() => {
                const el = document.getElementById('avance-venta')
                el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                setFocusSale(true)
                setTimeout(() => setFocusSale(false), 1800)
              }}
            />
          </div>

          <section
            id="avance-venta"
            className={`rounded-xl border bg-white p-5 shadow-sm dark:bg-navy-800/60 ${
              focusSale
                ? 'border-emerald-400 ring-4 ring-emerald-400/20 transition-all duration-700'
                : 'border-black/60 dark:border-white/60'
            }`}
          >
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="label-eyebrow">Avance de la venta</p>
                <p className="mt-0.5 text-xs text-slate-400">Estado de cada intento de oferta al cliente</p>
              </div>
              {campanias.length > 0 && (
                <span className="text-[11px] text-slate-400">Intentos previos · {campanias.length}</span>
              )}
            </div>
            <CampaignTimeline campanias={campanias} topOffer={topOffer} />
            {topOffer && (
              <div className="mt-4 border-t border-slate-100 pt-4 dark:border-white/10">
                <E2ETracking
                  offer={topOffer}
                  e2eByOffer={e2eByOffer}
                  e2eChannel={e2eChannel}
                  e2eContact={e2eContact}
                  e2eEvidence={e2eEvidence}
                  e2eObjection={e2eObjection}
                  e2eSaving={e2eSaving}
                  onSave={(fields) => saveE2E(topOffer, fields)}
                />
              </div>
            )}
          </section>

          <LiveCallPanel
            clientId={id}
            clientName={client.name}
            clientPhone={client.profile?.telefono}
            onCopilotEvent={handleCopilotEvent}
            onE2E={handleOffering}
            canStart={canGenerate}
            onStartChat={canSpeech ? () => setMsgChatOpen(true) : undefined}
            onCallEnded={() => setDataModal(true)}
            onCallReset={() => setLiveMood(null)}
          />
        </div>

        {/* ===== IA Nexabot ===== */}
        <NexabotCopilot
          clientId={id}
          clientName={client.name}
          k={k}
          topOffer={copilotOffer}
          speech={copilotOffer ? speechByOffer[copilotOffer.oferta] : null}
          speechLoading={speechLoading}
          onGenerateSpeech={generateSpeech}
          copiedKey={copiedKey}
          onCopy={copySpeech}
          onRequestData={() => setDataModal(true)}
          canChat={canSpeech}
          canSpeech={canSpeech}
          liveCopilot={liveCopilot}
        />
      </div>

      {/* ===== Acciones comerciales (sticky) ===== */}
      <div className="mt-5">
        <CommercialActions
          offer={topOffer}
          status={status}
          registering={registering}
          onAccept={(offer) => registerResult(offer, 'accepted')}
          onOpenReject={(offer) => setRejectingOffer(offer.oferta)}
          evidence={topOffer ? e2eEvidence[topOffer.offer_id] : ''}
          onEvidence={(offer, v) => saveE2E(offer, { evidence_type: v })}
          saving={topOffer ? e2eSaving === topOffer.offer_id : false}
          canAccept={hasPermission('register_acceptance')}
          canReject={hasPermission('register_rejection')}
          onReport={() => setFeedbackModal(topOffer.oferta)}
        />
      </div>

      {/* Modal rechazo */}
      <RejectModal
        open={Boolean(rejectingOffer)}
        offerName={rejectingOffer}
        reason={rejectReason}
        onReason={setRejectReason}
        onConfirm={() => topOffer && registerResult(topOffer, 'rejected', rejectReason)}
        onCancel={() => { setRejectingOffer(null); setRejectReason('') }}
        confirming={topOffer ? registering === topOffer.oferta : false}
      />

      {/* Modal contacto por mensaje */}
      {msgChatOpen && (
        <MessageChatModal
          clientId={id}
          clientName={client.name}
          onClose={() => setMsgChatOpen(false)}
        />
      )}

      {/* Modal feedback */}
      {feedbackModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/50 px-4">
          <div className="w-full max-w-sm rounded-xl border border-black/60 bg-white p-6 shadow-lg dark:border-white/60 dark:bg-navy-800">
            <p className="mb-1 font-display font-semibold text-navy-900 dark:text-white">¿Por qué esta recomendación no es buena?</p>
            <p className="mb-4 text-xs text-slate-400">{feedbackModal}</p>
            <div className="mb-4 space-y-2">
              {FEEDBACK_OPTIONS.map((opt) => (
                <label key={opt.value} className="flex items-center gap-2.5 text-sm text-navy-900 cursor-pointer dark:text-white">
                  <input
                    type="radio"
                    name="feedback"
                    checked={feedbackType === opt.value}
                    onChange={() => setFeedbackType(opt.value)}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
            {feedbackType === 'other' && (
              <textarea
                value={feedbackComment}
                onChange={(e) => setFeedbackComment(e.target.value)}
                className="input mb-4"
                rows={3}
                placeholder="Especifica el problema…"
              />
            )}
            <div className="flex gap-2">
              <button onClick={submitFeedback} disabled={!feedbackType} className="btn-primary flex-1 text-sm">
                Enviar
              </button>
              <button onClick={() => setFeedbackModal(null)} className="btn-ghost text-sm">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal solicitar datos (post-llamada) */}
      {dataModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/50 px-4">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-black/60 bg-white p-6 shadow-lg dark:border-white/60 dark:bg-navy-800">
            <p className="mb-1 font-display font-semibold text-navy-900 dark:text-white">Completar datos del cliente</p>
            <p className="mb-4 text-xs text-slate-400">
              {client.name} · {client.id} — la llamada terminó. Propón qué información falta para mejorar la recomendación.
            </p>

            <div className="mb-4 space-y-4">
              <div>
                <label className="label-eyebrow mb-1.5 block" htmlFor="missing-field">¿Qué información falta?</label>
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {MISSING_FIELD_PRESETS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setMissingField(p)}
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                        missingField === p
                          ? 'border-cyan-500 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300'
                          : 'border-slate-200 text-slate-500 hover:border-cyan-400 hover:text-cyan-600 dark:border-white/10 dark:text-slate-300'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
                <input
                  id="missing-field"
                  value={missingField}
                  onChange={(e) => setMissingField(e.target.value)}
                  className="input"
                  placeholder="Ej: consumo de datos, estado de pagos, datos del hogar…"
                />
              </div>

              <div>
                <p className="label-eyebrow mb-1.5 block">Resultado de la llamada</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {CALL_RESULTS.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setCallResult(r)}
                      className={`rounded-lg border px-2 py-1.5 text-left text-[11px] font-medium transition-colors ${
                        callResult === r
                          ? 'border-cyan-500 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300'
                          : 'border-slate-200 text-slate-500 hover:border-cyan-400 hover:text-cyan-600 dark:border-white/10 dark:text-slate-300'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="label-eyebrow mb-1.5 block" htmlFor="next-step">Próximo paso</label>
                <select
                  id="next-step"
                  value={nextStep}
                  onChange={(e) => setNextStep(e.target.value)}
                  className="input"
                >
                  <option value="">Sin seguimiento</option>
                  {NEXT_STEPS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label-eyebrow mb-1.5 block" htmlFor="data-notes">Notas</label>
                <textarea
                  id="data-notes"
                  value={dataNotes}
                  onChange={(e) => setDataNotes(e.target.value)}
                  className="input"
                  rows={2}
                  placeholder="Detalles que capturaste en la llamada…"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={submitDataRequest}
                disabled={!missingField.trim() || dataSubmitting}
                className="btn-primary flex-1 text-sm"
              >
                {dataSubmitting ? 'Enviando…' : 'Enviar solicitud'}
              </button>
              <button onClick={() => setDataModal(false)} className="btn-ghost text-sm">Omitir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}