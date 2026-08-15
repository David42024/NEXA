"""
Proveedor de llamadas del MVP (CallProvider).

La capa de llamada es intercambiable: hoy el MVP usa WebRTC peer-to-peer con
señalización a través del backend NEXA (sin telefonía). En producción esta
misma interfaz la implementa un proveedor SIP/Asterisk o el call center de
Movistar: el frontend, el copilot, el NBO y el E2E no cambian.

Flujo del MVP:
  - El asesor inicia la llamada (`POST /api/calls/start`) y recibe un enlace.
  - El "cliente" abre el enlace (navegador) y acepta.
  - Ambos navegadores intercambian señalización WebRTC (offer/answer/ICE) por
    WebSocket; el audio viaja peer-to-peer (DTLS-SRTP).
  - El navegador del cliente transcribe su voz (Web Speech API) y manda el
    texto por WebSocket; aquí se detecta la objeción y el copilot del asesor
    recibe sugerencia + speech en tiempo real.

E2E en tiempo real: a medida que la llamada fluye, el Offering avanza solo
(planned -> contacted -> objection -> evidence) y cada evento WebSocket lleva
el payload `offering` actualizado para que el panel del asesor se refresque.
"""
import asyncio
import secrets
import time
import uuid
from typing import Dict

from app.config import settings
from app import models
from app.services import chat_engine
from app.services import sentiment_engine

OBJECION_LABELS = {
    "precio": "Precio",
    "competencia": "Competencia",
    "no_necesita": "No necesita",
    "reclamo": "Reclamo / experiencia",
    "dudas": "Quiere pensarlo",
    "otro": "Otra",
}

OBJECION_RULES = [
    ("precio", ["caro", "precio", "cuesta", "cost", "no me alcanza", "presupuesto", "mucho dinero", "mas caro"]),
    ("competencia", ["otro operador", "claro", "entel", "bitel", "otra empresa", "mi compania", "mi compañia", "ya tengo con"]),
    ("no_necesita", ["no necesito", "no me interesa", "no me interesan", "no quiero", "no me sirve", "no gracias", "ya tengo", "no estoy interesad"]),
    ("reclamo", ["reclamo", "queja", "problema", "mal servicio", "lento", "no funciona", "senal", "señal"]),
    ("dudas", ["pensar", "lo pienso", "mas adelante", "despues", "luego", "aun no"]),
]


def classify_objection(text: str):
    """Clasificacion inmediata (determinista) de la objecion del cliente."""
    t = (text or "").lower()
    for typ, words in OBJECION_RULES:
        if any(w in t for w in words):
            return {"type": typ, "label": OBJECION_LABELS[typ]}
    return None


def _offering_out(offering):
    """Payload compacto del Offering para los eventos del WebSocket."""
    if offering is None:
        return None
    return {
        "id": offering.id,
        "client_id": offering.client_id,
        "offer_id": offering.offer_id,
        "channel": offering.channel,
        "stage": offering.stage,
        "contact_status": offering.contact_status,
        "objection_status": offering.objection_status,
        "evidence_type": offering.evidence_type,
        "evidence_ref": offering.evidence_ref,
        "result": offering.result,
        "rejection_reason": offering.rejection_reason,
    }


def _clean_speech(text: str) -> str:
    """Quita comillas/guiones para que el TTS no lea la puntuacion."""
    t = (text or "").strip()
    for ch in "\"'“”«»*_-":
        t = t.replace(ch, " ")
    t = " ".join(t.split())
    return t


def _default_opening(ctx: Dict) -> str:
    nombre = ctx.get("nombre") or "cliente"
    oferta = ctx.get("oferta")
    if oferta:
        return (
            f"Hola {nombre}, soy el asistente de Movistar. Te llamo para contarte de "
            f"{oferta}. ¿Me permites un par de minutos para explicarte el beneficio?"
        )
    return (
        f"Hola {nombre}, soy el asistente de Movistar. ¿Tienes un minuto para revisar "
        "cómo ahorrar en tu plan de hoy?"
    )


def _rebate_template(ctx: Dict, text: str, objection) -> str:
    """Rebate determinista orientado a VENDER. Se usa SIEMPRE que la IA falle o
    este en cooldown, para que el bot nunca se quede callado ante un 'no'."""
    nombre = ctx.get("nombre") or "cliente"
    oferta = ctx.get("oferta")
    monto = ctx.get("monto_facturado")
    precio = ctx.get("precio")
    ahorro_pct = ctx.get("ahorro_pct")
    ahorro = (monto * ahorro_pct) if monto and ahorro_pct is not None else None

    def con_oferta() -> str:
        if oferta and precio is not None and ahorro is not None:
            return (
                f"Entiendo, {nombre}. Hoy pagas S/ {monto:.2f} y con {oferta} pasarías "
                f"a S/ {precio:.2f}: S/ {ahorro:.2f} de ahorro cada mes, en un solo recibo "
                "con móvil, fibra y TV, sin cambiar de número. ¿Quieres que te muestre "
                "cuánto ahorrarías exactamente en tu caso?"
            )
        return (
            f"Lo entiendo, {nombre}, y no te quito más de un minuto. Esta opción te "
            "ahorra en el recibo y une tus servicios en uno solo. ¿Me dejas contarte "
            "el beneficio exacto para tu plan?"
        )

    t = (text or "").lower()
    obj_type = (objection or {}).get("type", "")
    if obj_type in ("precio", "no_necesita") or any(
        w in t for w in ("caro", "precio", "cost", "no interesa", "no necesito", "no quiero", "no gracias")
    ):
        return con_oferta()
    if obj_type == "competencia" or any(w in t for w in ("claro", "entel", "bitel", "otro operador", "otra empresa")):
        ahorro_txt = f"S/ {ahorro:.2f} menos al mes" if ahorro is not None else "un mejor precio"
        return (
            f"Te entiendo, {nombre}. La ventaja es que te quedas con Movistar: mismo "
            f"número y sin portabilidad, pero con {ahorro_txt} en el recibo. "
            "¿Qué te ofrecen ellos, para compararte con números reales?"
        )
    if obj_type == "reclamo" or any(w in t for w in ("reclamo", "queja", "problema", "mal servicio")):
        return (
            f"Lamento el inconveniente, {nombre}. Justamente este plan es una forma de "
            "compensarte por tu permanencia: un recibo único y más barato. ¿Quieres que "
            "revise tu caso y te confirme cuánto bajaría tu factura?"
        )
    if obj_type == "dudas" or any(w in t for w in ("pensar", "después", "luego", "más adelante", "no se")):
        dato = (
            f"bajarías de S/ {monto:.2f} a S/ {precio:.2f} ({ahorro:.2f} soles menos al mes)"
            if ahorro is not None and precio is not None
            else "tu factura bajaría"
        )
        return (
            f"Claro, {nombre}, sin presión. Solo te dejo el dato: {dato} con este plan. "
            "¿Prefieres que te lo detalle ahora o te dejo la información para que lo "
            "revises con calma?"
        )
    return con_oferta()


class CallSession:
    def __init__(self, call_id, client_id, client_name, ctx, offering_id, user_id):
        self.id = call_id
        self.client_id = client_id
        self.client_name = client_name
        self.ctx = ctx
        self.offering_id = offering_id
        self.user_id = user_id
        self.cliente_token = secrets.token_urlsafe(24)
        self.asesor_ws = None
        self.cliente_ws = None
        self.pending_offer = None
        self.pending_candidates = []
        self.state = "dialing"  # dialing | active | ended
        self.started_at = None
        self.ended_at = None
        self.mode = "bot"  # bot | asesor: quien conduce la llamada (cambiable en vivo)
        self.last_ai_at = {}  # cooldown por hablante (cliente / asesor)
        self.mood_score = 0.0  # animo del cliente en vivo (-1 enojado .. +1 entusiasmado)
        self.recording = None  # bytes del audio completo subido por el cliente


class P2PWebRTCProvider:
    """MVP: señalización WebRTC peer-to-peer a través del backend NEXA."""

    def __init__(self):
        self._calls = {}

    def create_session(self, client_id, client_name, ctx, offering_id, user_id):
        sess = CallSession(
            uuid.uuid4().hex, client_id, client_name, ctx, offering_id, user_id
        )
        self._calls[sess.id] = sess
        return sess

    def get_session(self, call_id):
        return self._calls.get(call_id)

    async def _send(self, ws, msg):
        if ws is None:
            return
        try:
            await ws.send_json(msg)
        except Exception:
            pass

    async def _update_mood(self, sess, text):
        """Ajusta y emite el animo del cliente en tiempo real (solo asesor)."""
        delta = sentiment_engine.score_text(text)
        sess.mood_score = sentiment_engine.smooth_score(sess.mood_score, delta)
        mood = sentiment_engine.mood_from_score(sess.mood_score)
        await self._send(sess.asesor_ws, {
            "type": "mood",
            "mood": mood,
            "score": round(sess.mood_score, 2),
        })

    async def notify_recording(self, sess):
        """Avisa al asesor que la grabacion completa del cliente ya esta lista."""
        await self._send(sess.asesor_ws, {"type": "recording"})

    async def attach(self, sess, role, ws, db=None):
        if role == "asesor":
            sess.asesor_ws = ws
            await self._send(ws, {"type": "status", "state": sess.state})
            return
        # Cliente conecta SOLO tras aceptar: se activa la llamada y el E2E
        # avanza a "contactado" en tiempo real.
        sess.cliente_ws = ws
        sess.started_at = time.time()
        sess.state = "active"

        offering = None
        if db is not None:
            try:
                offering = db.query(models.Offering).filter(models.Offering.id == sess.offering_id).first()
                if offering and offering.stage in ("classified", "planned"):
                    offering.stage = "contacted"
                    offering.contact_status = "answered"
                    db.commit()
                    db.refresh(offering)
                offering = _offering_out(offering)
            except Exception:
                offering = None

        if sess.pending_offer:
            await self._send(ws, {"type": "offer", "sdp": sess.pending_offer})
        for pc in sess.pending_candidates:
            target = sess.asesor_ws if pc["role"] == "asesor" else sess.cliente_ws
            await self._send(target, {"type": "candidate", "candidate": pc["candidate"]})
        sess.pending_candidates = []
        await self._send(sess.asesor_ws, {"type": "status", "state": "active", "offering": offering})
        await self._send(ws, {"type": "mode", "mode": sess.mode})

        # El bot arranca solo: saluda y presenta la oferta sin que nadie haga click.
        asyncio.create_task(self._run_bot_opening(sess, db))

    async def route(self, sess, role, msg, db=None):
        kind = msg.get("type")
        if kind == "offer" and role == "asesor":
            sess.pending_offer = msg.get("sdp")
            await self._send(sess.cliente_ws, {"type": "offer", "sdp": msg.get("sdp")})
        elif kind == "answer" and role == "cliente":
            await self._send(sess.asesor_ws, {"type": "answer", "sdp": msg.get("sdp")})
        elif kind == "candidate":
            cand = msg.get("candidate")
            other = sess.cliente_ws if role == "asesor" else sess.asesor_ws
            if other is None:
                sess.pending_candidates.append({"role": role, "candidate": cand})
            else:
                await self._send(other, {"type": "candidate", "candidate": cand})
        elif kind == "stt":
            text = (msg.get("text") or "").strip()
            speaker = msg.get("speaker") or "cliente"
            if not text:
                return
            # Transcripcion en vivo de ambos lados hacia el panel del asesor.
            await self._send(sess.asesor_ws, {"type": "stt", "speaker": speaker, "text": text})
            if msg.get("final"):
                if speaker == "cliente":
                    await self._update_mood(sess, text)
                asyncio.create_task(self._run_copilot(sess, text, speaker, db))
        elif kind == "mode":
            # El asesor decide en vivo si habla el (modo asesor) o el bot (modo bot).
            mode = msg.get("mode")
            if mode in ("bot", "asesor"):
                sess.mode = mode
                await self._send(sess.asesor_ws, {"type": "mode", "mode": sess.mode})
                await self._send(sess.cliente_ws, {"type": "mode", "mode": sess.mode})
                if mode == "bot":
                    asyncio.create_task(self._run_bot_opening(sess, db, continuation=True))
        elif kind == "end":
            await self.end(sess, reason=msg.get("reason") or "ended", db=db)

    async def _run_bot_opening(self, sess, db=None, continuation=False):
        """El agente abre (o retoma) la llamada: habla solo en modo bot."""
        if sess.mode != "bot":
            return
        if continuation:
            prompt = (
                "Eres Nexabot, el agente de voz de Movistar. El asesor te devuelve la "
                "conversacion. Retomala con 2 frases breves y naturales para seguir "
                "ayudando al cliente. Sin comillas ni viñetas."
            )
        else:
            prompt = (
                "Eres Nexabot, el agente de voz de Movistar. Abre la llamada saludando al "
                "cliente por su nombre y presentando la oferta en 2 o 3 frases cortas y "
                "naturales, como si hablaras. Termina con una pregunta corta para iniciar "
                "la conversacion. No uses comillas ni viñetas."
            )
        try:
            result = await chat_engine.generate_nexabot_reply(sess.ctx, prompt)
        except Exception:
            result = {"reply": "", "source": "local"}
        text = _clean_speech(result["reply"]) or _default_opening(sess.ctx)
        kind = "response" if continuation else "opening"
        await self._send(sess.cliente_ws, {"type": "bot_thinking"})
        await self._send(sess.cliente_ws, {"type": "bot_speech", "text": text, "source": result["source"], "kind": kind})
        await self._send(sess.asesor_ws, {
            "type": "copilot",
            "speaker": "bot",
            "objection": None,
            "quote": "El bot abrió la llamada" if not continuation else "El bot retomó la llamada",
            "suggestion": text,
            "source": result["source"],
            "offering": None,
        })

    async def _run_copilot(self, sess, text, speaker="cliente", db=None):
        if speaker == "asesor":
            now = time.time()
            if now - sess.last_ai_at.get(speaker, 0) < settings.CALL_AI_COOLDOWN_SECONDS:
                return
            sess.last_ai_at[speaker] = now
            # El copilot tambien escucha al asesor: revisa si aplico bien el
            # argumento/pitch y sugiere como mejorar la respuesta.
            prompt = (
                f"El asesor acaba de decir: \"{text}\". Analiza si aplico bien su "
                "pitch o argumento (menciono ahorro/beneficio/cierre). Si aplica, "
                "dalo por bueno y corto. Si puede mejorar, sugiere una alternativa "
                "accionable (max 4 frases). Si parece una pregunta del cliente, "
                "propone la respuesta."
            )
            try:
                result = await chat_engine.generate_nexabot_reply(sess.ctx, prompt)
            except Exception:
                result = {"reply": "", "source": "local"}
            await self._send(sess.asesor_ws, {
                "type": "copilot",
                "speaker": "asesor",
                "objection": None,
                "quote": text,
                "suggestion": result["reply"],
                "source": result["source"],
                "offering": None,
            })
            return

        # Voz del cliente: deteccion de objecion.
        objection = classify_objection(text)

        # E2E en tiempo real: objecion detectada -> etapa "objection".
        offering = None
        if db is not None and objection is not None:
            try:
                offering = db.query(models.Offering).filter(models.Offering.id == sess.offering_id).first()
                if offering and offering.stage not in ("result",):
                    offering.stage = "objection"
                    offering.objection_status = "rebate"
                    db.commit()
                    db.refresh(offering)
                offering = _offering_out(offering)
            except Exception:
                offering = None

        # Modo bot: el agente de voz SIEMPRE rebate la objecion (objetivo: vender).
        # No depende de la IA: si falla o esta en cooldown, usa la plantilla.
        if sess.mode == "bot":
            await self._send(sess.cliente_ws, {"type": "bot_thinking"})
            speech = await self._bot_rebate(sess, text, objection)
            if db is not None and objection is not None:
                try:
                    offering_row = db.query(models.Offering).filter(models.Offering.id == sess.offering_id).first()
                    if offering_row:
                        offering_row.speech_rebate = speech[:500] or offering_row.speech_rebate
                        db.commit()
                except Exception:
                    pass
            await self._send(sess.cliente_ws, {
                "type": "bot_speech",
                "text": speech,
                "source": "local",
                "kind": "response",
            })
            await self._send(sess.asesor_ws, {
                "type": "copilot",
                "speaker": "bot",
                "objection": objection,
                "quote": text,
                "suggestion": speech,
                "source": "local",
                "offering": offering,
            })
            return

        # Modo asesor: sugerencia accionable para el asesor (el asesor habla).
        now = time.time()
        if now - sess.last_ai_at.get("cliente", 0) < settings.CALL_AI_COOLDOWN_SECONDS:
            return
        sess.last_ai_at["cliente"] = now
        prompt = (
            f"El cliente acaba de decir: \"{text}\". Detecta su objecion y redacta una "
            "sugerencia accionable (max 4 frases) para el asesor. Si el asesor va a "
            "responder, escribe el speech entre comillas."
        )
        try:
            result = await chat_engine.generate_nexabot_reply(sess.ctx, prompt)
        except Exception:
            result = {"reply": "", "source": "local"}

        await self._send(sess.asesor_ws, {
            "type": "copilot",
            "speaker": "cliente",
            "objection": objection,
            "quote": text,
            "suggestion": result["reply"],
            "source": result["source"],
            "offering": offering,
        })

    async def _bot_rebate(self, sess, text, objection):
        """Rebate del bot al cliente: IA si puede, plantilla si no. Nunca vacio."""
        now = time.time()
        if now - sess.last_ai_at.get("cliente", 0) >= settings.CALL_AI_COOLDOWN_SECONDS:
            sess.last_ai_at["cliente"] = now
            nombre = sess.ctx.get("nombre") or "cliente"
            label = (objection or {}).get("label", "duda")
            prompt = (
                f"Eres Nexabot, agente de voz de Movistar, en llamada con {nombre}. "
                f"El cliente acaba de decir: \"{text}\" (objecion: {label}). Rebatela en "
                "maximo 3 frases habladas, directo al cliente y con objetivo de vender: "
                "enfocate en el ahorro o beneficio exacto (usa los datos del contexto), "
                "sin presionar, y termina con una pregunta corta que invite a seguir. "
                "Habla como persona, sin comillas ni viñetas."
            )
            try:
                # Rebote rapido: si la IA tarda, se responde con la plantilla.
                result = await asyncio.wait_for(
                    chat_engine.generate_nexabot_reply(sess.ctx, prompt), timeout=2.5
                )
                speech = _clean_speech(result["reply"])
                if speech:
                    return speech
            except Exception:
                pass
        return _rebate_template(sess.ctx, text, objection)

    async def end(self, sess, reason="ended", db=None):
        if sess.state == "ended":
            return
        sess.state = "ended"
        sess.ended_at = time.time()

        # E2E en tiempo real: al cerrar una llamada atendida se registra el audio
        # como medio probatorio (la etapa "evidencia" ya no es un paso manual).
        offering = None
        if db is not None and sess.started_at:
            try:
                offering = db.query(models.Offering).filter(models.Offering.id == sess.offering_id).first()
                if offering and offering.stage != "result":
                    offering.evidence_type = "call_audio"
                    offering.evidence_ref = sess.id
                    db.commit()
                    db.refresh(offering)
                offering = _offering_out(offering)
            except Exception:
                offering = None

        duration = round(max(sess.ended_at - (sess.started_at or sess.ended_at), 0))
        msg = {"type": "ended", "reason": reason, "duration": duration, "offering": offering}
        await self._send(sess.asesor_ws, msg)
        await self._send(sess.cliente_ws, msg)
        self._calls.pop(sess.id, None)


provider = P2PWebRTCProvider()