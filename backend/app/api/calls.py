"""Llamada WebRTC (MVP real).

Flujo:
  1. `POST /api/calls/start` {client_id} -> crea el Offering E2E en etapa
     `planned` (canal Llamada), construye el contexto del copilot y devuelve
     `{call_id, cliente_token, client_name, client_id, offering_id}`. El asesor
     comparte el enlace con el cliente.
  2. `WS /api/calls/ws/{call_id}?role=asesor|cliente&token=...` es el canal de
     señalización WebRTC peer-to-peer a traves del backend:
       - asesor:  JWT (permiso view_recommendation).
       - cliente: token aleatorio devuelto en /start.
     Eventos: offer / answer / candidate (WebRTC), stt (transcripcion del
     cliente via Web Speech API), copilot (objecion + sugerencia del Nexabot),
     status / ended.

En produccion el audio no pasa por el backend (P2P); solo la señalización y el
copilot. Si se quiere telefonia real, se implementa el mismo CallProvider con
SIP/Asterisk y el frontend no cambia.
"""
import asyncio

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app import models
from app.security import require_permission, decode_token, get_user_permissions
from app.services import chat_engine, stt_engine
from app.services.call_provider import provider
from app.services.nbo_engine import OFFER_CATALOG

router = APIRouter(prefix="/api/calls", tags=["calls"])


class CallStartRequest(BaseModel):
    client_id: str


def _latest_top_offer(db: Session, client_id: str):
    """Mejor recomendacion vigente del cliente (si existe) para contextualizar el copilot."""
    rec = (
        db.query(models.Recommendation)
        .filter(models.Recommendation.client_id == client_id)
        .order_by(models.Recommendation.id.desc())
        .first()
    )
    if not rec or not rec.offer_id:
        return None
    offer = db.query(models.Offer).filter(models.Offer.id == rec.offer_id).first()
    if not offer:
        return None
    catalog = next((o for o in OFFER_CATALOG if o["code"] == offer.code), None)
    return {
        "oferta": offer.name,
        "offer_id": rec.offer_id,
        "precio": (catalog or {}).get("precio"),
        "ahorro_pct": (catalog or {}).get("ahorro_pct"),
        "probabilidad": rec.probability,
    }


@router.post("/start")
def start_call(
    payload: CallStartRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_permission("view_recommendation")),
):
    """Prepara la llamada: offering E2E (planned) + contexto del copilot + credenciales."""
    client = db.query(models.Client).filter(models.Client.id == payload.client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="No se encontró cliente con ese ID")

    ctx = chat_engine.build_context(client.__dict__)
    top = _latest_top_offer(db, client.id)
    if top:
        chat_engine._fill_top_offer(ctx, top)

    offering = models.Offering(
        client_id=client.id,
        offer_id=top["offer_id"] if top else None,
        asesor_id=current_user.id,
        channel="Llamada",
        stage="planned",
    )
    db.add(offering)
    db.commit()
    db.refresh(offering)

    sess = provider.create_session(client.id, client.name, ctx, offering.id, current_user.id)
    return {
        "call_id": sess.id,
        "cliente_token": sess.cliente_token,
        "client_name": client.name,
        "client_id": client.id,
        "offering_id": offering.id,
    }


@router.post("/{call_id}/recording")
async def upload_recording(call_id: str, token: str, file: UploadFile = File(...)):
    """El cliente sube la grabacion completa (cliente + asesor + voz del bot).

    El audio se graba en el navegador del cliente (donde suena el bot), se sube
    aqui y el asesor la descarga al finalizar. Almacenamiento en memoria: apto
    para el MVP (una sola instancia).
    """
    sess = provider.get_session(call_id)
    if not sess or token != sess.cliente_token:
        raise HTTPException(status_code=401, detail="Token de cliente invalido")
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Archivo vacio")
    sess.recording = data
    await provider.notify_recording(sess)
    return {"status": "ok", "call_id": call_id}


@router.get("/{call_id}/recording")
def download_recording(
    call_id: str,
    current_user: models.User = Depends(require_permission("view_recommendation")),
):
    """Descarga del asesor: audio completo de la llamada (incluye al bot)."""
    sess = provider.get_session(call_id)
    if not sess or not sess.recording:
        raise HTTPException(status_code=404, detail="Grabacion no disponible")
    return Response(
        content=sess.recording,
        media_type="audio/webm",
        headers={"Content-Disposition": f'attachment; filename="llamada-{call_id}.webm"'},
    )


@router.post("/{call_id}/stt-audio")
async def transcribe_audio(call_id: str, token: str, file: UploadFile = File(...)):
    """El cliente sube un clip de su voz y el servidor lo transcribe (Whisper).

    Asi la llamada escucha al cliente desde CUALQUIER navegador (Safari,
    Firefox, etc.), no solo donde esta disponible la Web Speech API de Chrome.
    """
    sess = provider.get_session(call_id)
    if not sess or token != sess.cliente_token:
        raise HTTPException(status_code=401, detail="Token de cliente invalido")
    data = await file.read()
    text = await stt_engine.transcribe_audio(data, file.filename or "audio.webm")
    return {"text": text}


@router.websocket("/ws/{call_id}")
async def call_ws(
    websocket: WebSocket,
    call_id: str,
    role: str,
    token: str,
    db: Session = Depends(get_db),
):
    """Canal de señalización de la llamada (asesor con JWT, cliente con token)."""
    sess = provider.get_session(call_id)
    if not sess:
        await websocket.close(code=1008)
        return

    if role == "asesor":
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
    elif role == "cliente":
        if token != sess.cliente_token:
            await websocket.close(code=1008)
            return
    else:
        await websocket.close(code=1008)
        return

    await websocket.accept()
    await provider.attach(sess, role, websocket, db)
    try:
        while True:
            msg = await websocket.receive_json()
            await provider.route(sess, role, msg, db)
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        await provider.end(sess, reason="ended", db=db)