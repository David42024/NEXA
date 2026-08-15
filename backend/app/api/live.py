"""Llamada en vivo (tiempo real).

Flujo:
  1. `POST /api/live/start` define el MEDIO de contacto (WhatsApp/Llamada/App),
     genera la recomendacion NBO (para poblar los KPIs) y crea el ofrecimiento E2E
     en etapa `planned`. Devuelve `session_id`.
  2. `WS /api/live/ws/{session_id}?token=...` abre la llamada: el backend simula
     las respuestas del cliente en tiempo real y emite eventos (bot_message /
     client_message / done). Cada respuesta avanza el Offering E2E y, al final,
     registra la interaccion (aceptada/rechazada). El frontend escucha el stream
     y actualiza el panel conforme responde el cliente.

En produccion, el "cliente" seria una integracion real (CRM/telefonia); aqui se
simula el contrato para que el flujo end-to-end funcione igual.
"""
import asyncio
import random
import uuid

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app import models, schemas
from app.security import require_permission, decode_token, get_user_permissions
from app.services import nbo_engine
from app.services.config_service import get_thresholds
from app.services.funnel_service import mark_prioritized
from app.api.e2e import _out, VALID_CHANNELS
from app.api.interactions import register_interaction_record

router = APIRouter(prefix="/api/live", tags=["live"])

REASONS = ["Precio", "Mal Servicio", "Competencia"]

# Sesiones de llamada activas (demo, en memoria): session_id -> estado.
_sessions = {}


class LiveStartRequest(BaseModel):
    client_id: str
    channel: str


def _money(value) -> str:
    return f"S/ {value:.2f}"


@router.post("/start")
def start_call(
    payload: LiveStartRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_permission("view_recommendation")),
):
    """Define el medio de contacto y prepara la llamada (recomendacion + offering)."""
    if payload.channel not in VALID_CHANNELS:
        raise HTTPException(status_code=422, detail=f"Canal no válido: {payload.channel}")

    client = db.query(models.Client).filter(models.Client.id == payload.client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="No se encontró cliente con ese ID")

    # Recomendacion NBO (misma logica que /api/recommendations/generate)
    thresholds = get_thresholds(db)
    result = nbo_engine.get_recommendations_for_client(
        client.id,
        client.profile,
        low_threshold=thresholds["low"],
        noise_threshold=thresholds["noise"],
    )
    if result.get("eligible"):
        mark_prioritized(db, client.id)

    recs_out = []
    top = None
    for r in result["recomendaciones"]:
        offer = db.query(models.Offer).filter(models.Offer.code == r["offer_code"]).first()
        entry = schemas.OfferRecommendation(
            oferta=r["offer_name"],
            offer_id=offer.id if offer else 0,
            probabilidad=r["probabilidad"],
            score=r["score"],
            shap_values=r["shap_values"],
            low_probability=r["low_probability"],
            precio=r.get("precio"),
            ahorro_pct=r.get("ahorro_pct"),
        )
        recs_out.append(entry)
        if top is None:
            top = entry
    db.commit()

    offering = models.Offering(
        client_id=client.id,
        offer_id=top.offer_id if top else None,
        asesor_id=current_user.id,
        channel=payload.channel,
        stage="planned",
    )
    db.add(offering)
    db.commit()
    db.refresh(offering)

    monto = (client.profile.get("facturacion", {}) or {}).get("monto_facturado_prom") or 0
    ahorro = monto * (top.ahorro_pct if top else 0)

    session_id = uuid.uuid4().hex
    _sessions[session_id] = {
        "client_id": client.id,
        "client_name": client.name,
        "channel": payload.channel,
        "user_id": current_user.id,
        "offer_id": offering.offer_id,
        "offering_id": offering.id,
        "oferta": top.oferta if top else None,
        "prob": top.probabilidad if top else None,
        "monto": monto,
        "ahorro": ahorro,
    }

    return {
        "session_id": session_id,
        "recomendaciones": recs_out,
        "warning": result["warning"],
        "offering_id": offering.id,
    }


@router.websocket("/ws/{session_id}")
async def live_ws(websocket: WebSocket, session_id: str, token: str, db: Session = Depends(get_db)):
    """Stream real-time de la conversacion simulada del cliente."""
    try:
        payload = decode_token(token)
        user = db.query(models.User).filter(models.User.id == int(payload.get("sub"))).first()
        if not user:
            await websocket.close(code=1008)
            return
        perms = get_user_permissions(db, user.role)
        if "all_permissions" not in perms and "view_recommendation" not in perms:
            await websocket.close(code=1008)
            return
    except Exception:
        await websocket.close(code=1008)
        return

    sess = _sessions.get(session_id)
    if not sess:
        await websocket.close(code=1008)
        return

    await websocket.accept()
    try:
        await _run_conversation(websocket, db, sess)
    except WebSocketDisconnect:
        pass
    finally:
        _sessions.pop(session_id, None)


async def _run_conversation(websocket: WebSocket, db: Session, sess: dict):
    delay = settings.LIVE_STEP_DELAY_SECONDS
    name = sess["client_name"].split(" ")[0]
    oferta = sess["oferta"]
    monto = sess["monto"]
    ahorro = sess["ahorro"]
    nuevo = monto - ahorro

    offering = db.query(models.Offering).filter(models.Offering.id == sess["offering_id"]).first()

    def offering_out():
        return _out(db, offering).model_dump()

    async def emit(payload: dict):
        await websocket.send_json(payload)

    # 1) Mensaje inicial del asesor (pitch con el "gancho" financiero)
    if oferta:
        pitch = (
            f"Hola {name}, soy tu asesor de Movistar. Revisé tu consumo y vi que {oferta} "
            f"te queda perfecta: tu factura pasaría de {_money(monto)} a {_money(nuevo)}, "
            f"un ahorro de {_money(ahorro)} cada mes. ¿Te cuento los detalles?"
        )
    else:
        pitch = (
            f"Hola {name}, soy tu asesor de Movistar. Quería conversar contigo sobre cómo "
            f"aprovechar mejor tu plan actual y tu consumo."
        )
    await emit({"type": "bot_message", "role": "bot", "message": pitch, "stage": "planned", "offering": offering_out()})
    await asyncio.sleep(delay)

    # 2) El cliente contesta (contactabilidad real)
    offering.contact_status = "answered"
    offering.stage = "contacted"
    db.commit()
    db.refresh(offering)
    await emit({
        "type": "client_message", "role": "client",
        "message": "¡Hola! Suena interesante, ¿qué incluye exactamente?",
        "stage": "contacted", "offering": offering_out(),
    })
    await asyncio.sleep(delay)

    # 3) Detalle de la oferta
    detalle = (
        f"Claro. {oferta} une todos tus servicios en un solo recibo. "
        f"En lugar de pagar {_money(monto)} por separado, unificando pagas {_money(nuevo)} "
        f"y te sobran datos para todo el mes."
        if oferta else
        "Te propongo revisar tu plan y ajustar el consumo para que no te quedes sin datos a mitad de mes."
    )
    await emit({"type": "bot_message", "role": "bot", "message": detalle, "stage": "contacted", "offering": offering_out()})
    await asyncio.sleep(delay)

    # 4) Objecion del cliente -> rebate manejado
    offering.objection_status = "rebate"
    offering.speech_rebate = "Argumento de unificación: un solo recibo y datos ilimitados."
    offering.stage = "objection"
    db.commit()
    db.refresh(offering)
    await emit({
        "type": "client_message", "role": "client",
        "message": "No está mal… pero ¿seguro que al final no me sale más caro?",
        "stage": "objection", "offering": offering_out(),
    })
    await asyncio.sleep(delay)

    rebate = (
        f"Entiendo tu preocupación, y es justo al revés: hoy pagas {_money(monto)} y unificando "
        f"pasarías a {_money(nuevo)}. Te lo dejo por escrito en la plataforma para que lo compruebes."
    )
    await emit({"type": "bot_message", "role": "bot", "message": rebate, "stage": "objection", "offering": offering_out()})
    await asyncio.sleep(delay)

    # 5) Registro del medio probatorio (metadata; ya no es una etapa del pipeline)
    offering.evidence_type = "platform_register"
    db.commit()
    db.refresh(offering)
    await asyncio.sleep(delay)

    # 6) Resultado: aceptacion segun la probabilidad del motor NBO
    prob = sess.get("prob") or 0.5
    accept = random.random() < max(0.25, min(0.9, prob))
    reason = random.choice(REASONS) if not accept else None

    client = db.query(models.Client).filter(models.Client.id == sess["client_id"]).first()
    register_interaction_record(
        db,
        client,
        offering.offer_id,
        sess["user_id"],
        sess["channel"],
        "accepted" if accept else "rejected",
        rejection_reason=reason,
        speech_used=pitch,
    )
    offering.stage = "result"
    db.commit()
    db.refresh(offering)

    result_msg = (
        "¡Perfecto! Acepto, actívalo por favor."
        if accept else
        "Prefiero pensarlo unos días antes de decidir."
    )
    await emit({
        "type": "client_message", "role": "client",
        "message": result_msg,
        "stage": "result",
        "result": "accepted" if accept else "rejected",
        "rejection_reason": reason,
        "offering": offering_out(),
    })
    await asyncio.sleep(delay)

    await emit({"type": "done", "result": "accepted" if accept else "rejected"})
