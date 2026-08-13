import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../utils/api'
import ShapExplainability from '../components/ShapExplainability.jsx'
import ProbabilityRing from '../components/ProbabilityRing.jsx'
import Badge from '../components/Badge.jsx'
import { useAuth } from '../context/AuthContext.jsx'

const REJECTION_REASONS = ['Precio', 'No necesita', 'Ya tiene con otro operador', 'Quiere pensarlo', 'Mal momento']
const FEEDBACK_OPTIONS = [
  { value: 'wrong_data', label: 'Datos incorrectos del cliente' },
  { value: 'bad_offer', label: 'Oferta inapropiada para este cliente' },
  { value: 'wrong_probability', label: 'Probabilidad parece incorrecta' },
  { value: 'other', label: 'Otro (especificar)' },
]

export default function ClientProfile() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { hasPermission } = useAuth()

  const [client, setClient] = useState(null)
  const [notFound, setNotFound] = useState(false)
  const [loading, setLoading] = useState(true)

  const [recs, setRecs] = useState(null)
  const [recWarning, setRecWarning] = useState(null)
  const [recLoading, setRecLoading] = useState(false)

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
  const [missingField, setMissingField] = useState('')
  const [dataNotes, setDataNotes] = useState('')
  const [dataSubmitting, setDataSubmitting] = useState(false)
  const [dataConfirmation, setDataConfirmation] = useState(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setNotFound(false)
      setRecs(null)
      try {
        const { data } = await api.get(`/api/clients/${id}`)
        setClient(data)
      } catch (e) {
        if (e.response?.status === 404) setNotFound(true)
      } finally {
        setLoading(false)
      }
    }
    load()
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
        canal: 'Digital',
      })
      setSpeechByOffer((prev) => ({ ...prev, [offer.oferta]: data }))
    } finally {
      setSpeechLoading(null)
    }
  }

  function copySpeech(text, key) {
    navigator.clipboard?.writeText(text)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 1500)
  }

  async function registerResult(offer, result, reason = null) {
    setRegistering(offer.oferta)
    try {
      await api.post('/api/interactions/register', {
        client_id: id,
        recommendation_id: null,
        offer_id: offer.offer_id,
        channel: 'Digital',
        result,
        rejection_reason: reason,
        speech_used: speechByOffer[offer.oferta]?.variantes?.[0]?.texto || null,
      })
      setRegisteredOffers((prev) => ({ ...prev, [offer.oferta]: result }))
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
      const { data } = await api.post(`/api/clients/${id}/request-data`, {
        campos_solicitados: missingField.trim(),
        notas: dataNotes.trim() || null,
      })
      setDataConfirmation(data.detail)
      setDataModal(false)
      setMissingField('')
      setDataNotes('')
    } finally {
      setDataSubmitting(false)
    }
  }

  if (loading) return <p className="text-sm text-slate-400">Cargando perfil…</p>

  if (notFound) {
    return (
      <div className="card p-6 max-w-lg">
        <p className="font-medium text-navy-900">⚠️ No se encontró cliente con ese ID</p>
        <p className="text-sm text-slate-500 mt-1 mb-4">Verifique el ID o busque por nombre.</p>
        <button className="btn-secondary" onClick={() => navigate('/clientes')}>Volver a buscar</button>
      </div>
    )
  }

  const p = client.profile
  const historial = p.historial_ofertas || []

  return (
    <div>
      <button onClick={() => navigate('/clientes')} className="btn-ghost text-sm mb-4">← Volver a búsqueda</button>

      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-navy-900/5 flex items-center justify-center font-display font-bold text-navy-800 text-xl">
            {client.name?.[0]}
          </div>
          <div>
            <h1 className="font-display font-bold text-2xl text-navy-900">{client.name}</h1>
            <p className="text-sm text-slate-400 font-mono">{client.id} · {client.district} · DNI ***{client.document_last4}</p>
          </div>
        </div>
        {hasPermission('view_recommendation') && (
          <button onClick={generateRecommendation} disabled={recLoading} className="btn-primary">
            {recLoading ? 'Generando…' : recs ? 'Regenerar recomendación' : '✨ Recomendar'}
          </button>
        )}
      </div>

      {client.data_completeness_warning && (
        <div className="mb-6 px-4 py-3 rounded-lg bg-amber-50 text-amber-800 text-sm">
          ⚠️ Información incompleta. Las recomendaciones pueden ser menos precisas.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-6">
        <div className="card p-5">
          <p className="label-eyebrow mb-3">Servicio</p>
          <dl className="space-y-2 text-sm">
            <Row k="Tipo" v={p.servicio?.tipo} />
            <Row k="Plan" v={p.servicio?.plan} />
            <Row k="Antigüedad" v={`${p.servicio?.antiguedad_meses} meses (${p.servicio?.antiguedad_dias} días)`} />
            <Row k="Activación" v={p.servicio?.fecha_activacion} />
          </dl>
        </div>
        <div className="card p-5">
          <p className="label-eyebrow mb-3">Consumo</p>
          <dl className="space-y-2 text-sm">
            <Row k="Datos" v={p.consumo?.datos_gb != null ? `${p.consumo.datos_gb} GB` : 'No disponible'} />
            <Row k="Voz" v={p.consumo?.voz_minutos != null ? `${p.consumo.voz_minutos} min` : 'No disponible'} />
            <Row k="Uso de app" v={p.consumo?.app_uso} />
            <Row k="Streaming" v={p.consumo?.streaming ? 'Sí' : 'No'} />
          </dl>
        </div>
        <div className="card p-5">
          <p className="label-eyebrow mb-3">Facturación</p>
          <dl className="space-y-2 text-sm">
            <Row k="Monto actual" v={`S/ ${p.facturacion?.monto_actual?.toFixed(2)}`} />
            <Row k="Promedio 6m" v={`S/ ${p.facturacion?.monto_promedio_6m?.toFixed(2)}`} />
            <Row k="Último pago" v={p.facturacion?.ultimo_pago} />
            <Row k="Estado" v={<Badge tone={p.facturacion?.estado_pago === 'Pagado' ? 'success' : 'warning'}>{p.facturacion?.estado_pago}</Badge>} />
          </dl>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <p className="label-eyebrow">Recomendación NBO</p>

          {!recs && !recLoading && (
            <div className="card p-8 text-center">
              <p className="text-3xl mb-2">✨</p>
              <p className="text-sm text-slate-500">Genera una recomendación para ver las mejores ofertas para {client.name?.split(' ')[0]}.</p>
            </div>
          )}

          {recLoading && <div className="card p-8 text-center text-sm text-slate-400">Calculando probabilidades…</div>}

          {recWarning && (
            <div className="px-4 py-3 rounded-lg bg-amber-50 text-amber-800 text-sm">{recWarning}</div>
          )}

          {recs?.recomendaciones?.map((offer) => {
            const speech = speechByOffer[offer.oferta]
            const status = registeredOffers[offer.oferta]
            return (
              <div key={offer.oferta} className="card p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <ProbabilityRing value={offer.probabilidad} lowProbability={offer.low_probability} />
                    <div>
                      <h3 className="font-display font-semibold text-lg text-navy-900">{offer.oferta}</h3>
                      <p className="text-xs text-slate-400 font-mono mt-0.5">score comercial: {offer.score.toFixed(2)}</p>
                      {offer.low_probability && <Badge tone="warning">⚠️ Probabilidad baja</Badge>}
                    </div>
                  </div>
                  {status && (
                    <Badge tone={status === 'accepted' ? 'success' : 'danger'}>
                      {status === 'accepted' ? '✓ Aceptado' : '✕ Rechazado'}
                    </Badge>
                  )}
                </div>

                <div className="mt-4 pt-4 border-t border-slate-100">
                  <p className="text-xs text-slate-400 mb-2">Top razones (SHAP)</p>
                  <ShapExplainability shapValues={offer.shap_values} />
                </div>

                {hasPermission('view_speech') && (
                  <div className="mt-4 pt-4 border-t border-slate-100">
                    {!speech ? (
                      <button
                        onClick={() => generateSpeech(offer)}
                        disabled={speechLoading === offer.oferta}
                        className="btn-secondary text-sm"
                      >
                        {speechLoading === offer.oferta ? 'Generando speech…' : '💬 Generar speech'}
                      </button>
                    ) : (
                      <div className="space-y-3">
                        {speech.variantes.map((v, i) => {
                          const key = `${offer.oferta}-${i}`
                          return (
                            <div key={key} className="bg-slate-50 rounded-lg p-3.5">
                              <div className="flex items-center justify-between mb-1.5">
                                <p className="text-xs font-semibold text-navy-700">{v.variante}</p>
                                <button
                                  onClick={() => copySpeech(v.texto, key)}
                                  className="text-xs text-cyan-600 hover:text-cyan-700 font-medium"
                                >
                                  {copiedKey === key ? '✓ Copiado' : 'Copiar'}
                                </button>
                              </div>
                              <p className="text-sm text-slate-700 leading-relaxed">{v.texto}</p>
                            </div>
                          )
                        })}
                        <div className="flex items-center justify-between">
                          <button onClick={() => generateSpeech(offer)} className="btn-ghost text-xs">
                            🔄 Generar nuevo speech
                          </button>
                          {speech.source !== 'grok' && (
                            <span className="text-[11px] text-slate-400">fuente: {speech.source}</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {!status && (
                  <div className="mt-4 pt-4 border-t border-slate-100 flex items-center gap-2 flex-wrap">
                    {hasPermission('register_acceptance') && (
                      <button
                        onClick={() => registerResult(offer, 'accepted')}
                        disabled={registering === offer.oferta}
                        className="btn-primary text-sm"
                      >
                        ✓ Registrar aceptación
                      </button>
                    )}
                    {hasPermission('register_rejection') && (
                      <button
                        onClick={() => setRejectingOffer(offer.oferta)}
                        className="btn-secondary text-sm"
                      >
                        ✕ Registrar rechazo
                      </button>
                    )}
                    <button
                      onClick={() => setFeedbackModal(offer.oferta)}
                      className="btn-ghost text-xs ml-auto"
                    >
                      ⚠️ Reportar problema
                    </button>
                  </div>
                )}

                {rejectingOffer === offer.oferta && (
                  <div className="mt-3 bg-rose-50/50 rounded-lg p-3.5">
                    <p className="text-xs font-medium text-navy-700 mb-2">Motivo de rechazo</p>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {REJECTION_REASONS.map((r) => (
                        <button
                          key={r}
                          onClick={() => setRejectReason(r)}
                          className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                            rejectReason === r ? 'bg-navy-900 text-white border-navy-900' : 'bg-white border-slate-200 text-slate-600'
                          }`}
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <button
                        disabled={!rejectReason}
                        onClick={() => registerResult(offer, 'rejected', rejectReason)}
                        className="btn-primary text-xs"
                      >
                        Confirmar rechazo
                      </button>
                      <button onClick={() => setRejectingOffer(null)} className="btn-ghost text-xs">Cancelar</button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="card p-6 h-fit">
          <p className="label-eyebrow mb-4">📜 Historial de ofertas</p>
          {historial.length === 0 ? (
            <p className="text-sm text-slate-400">No hay ofertas previas registradas</p>
          ) : (
            <div className="space-y-3">
              {[...historial].reverse().map((h, i) => (
                <div key={i} className="text-sm border-l-2 border-slate-100 pl-3">
                  <p className="text-xs text-slate-400 font-mono">{h.fecha}</p>
                  <p className="font-medium text-navy-900">{h.oferta}</p>
                  <p className={`text-xs ${h.resultado === 'Aceptado' ? 'text-emerald-600' : 'text-rose-500'}`}>
                    {h.resultado}{h.motivo ? ` · ${h.motivo}` : ''}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card p-6 h-fit">
          <p className="label-eyebrow mb-2">Solicitar más datos</p>
          <p className="text-xs text-slate-500 mb-3">
            ¿Falta información del cliente para evaluar una mejor oferta? Puedes usar este complemento informativo solamente en tu propia experiencia de atención al cliente.
          </p>
          <button onClick={() => setDataModal(true)} className="btn-secondary text-sm">Solicitar más datos</button>
          {dataConfirmation && (
            <p className="text-xs text-emerald-600 mt-2">✓ {dataConfirmation}</p>
          )}
        </div>
      </div>

      {feedbackModal && (
        <div className="fixed inset-0 bg-navy-950/50 flex items-center justify-center px-4 z-50">
          <div className="card p-6 w-full max-w-sm">
            <p className="font-display font-semibold text-navy-900 mb-1">¿Por qué esta recomendación no es buena?</p>
            <p className="text-xs text-slate-400 mb-4">{feedbackModal}</p>
            <div className="space-y-2 mb-4">
              {FEEDBACK_OPTIONS.map((opt) => (
                <label key={opt.value} className="flex items-center gap-2.5 text-sm cursor-pointer">
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
              <button onClick={submitFeedback} disabled={!feedbackType} className="btn-primary text-sm">Enviar feedback</button>
              <button onClick={() => setFeedbackModal(null)} className="btn-ghost text-sm">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {dataModal && (
        <div
          className="fixed inset-0 bg-navy-950/50 flex items-center justify-center px-4 z-50"
          role="dialog"
          aria-modal="true"
          aria-label="Solicitar más datos del cliente"
        >
          <div className="card p-6 w-full max-w-sm">
            <p className="font-display font-semibold text-navy-900 mb-1">Solicitar más datos</p>
            <p className="text-xs text-slate-400 mb-4">
              {client.name} · {client.id} — indica qué información falta para mejorar la recomendación.
            </p>
            <div className="space-y-3 mb-4">
              <div>
                <label className="label-eyebrow block mb-1.5" htmlFor="missing-field">¿Qué información falta?</label>
                <input
                  id="missing-field"
                  value={missingField}
                  onChange={(e) => setMissingField(e.target.value)}
                  className="input"
                  placeholder="Ej: consumo de datos, estado de pagos, datos del hogar…"
                />
              </div>
              <div>
                <label className="label-eyebrow block mb-1.5" htmlFor="data-notes">Notas</label>
                <textarea
                  id="data-notes"
                  value={dataNotes}
                  onChange={(e) => setDataNotes(e.target.value)}
                  className="input"
                  rows={3}
                  placeholder="Detalle de lo que necesitas…"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={submitDataRequest}
                disabled={!missingField.trim() || dataSubmitting}
                className="btn-primary text-sm"
              >
                {dataSubmitting ? 'Enviando…' : 'Enviar solicitud'}
              </button>
              <button onClick={() => setDataModal(false)} className="btn-ghost text-sm">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Row({ k, v }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-slate-400">{k}</dt>
      <dd className="font-medium text-navy-800 text-right">{v ?? 'No disponible'}</dd>
    </div>
  )
}
