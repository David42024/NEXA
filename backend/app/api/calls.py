"""Llamadas telefonicas reales via Twilio (PSTN).

WebRTC P2P (deshabilitado): ver git history para el flujo original con enlace.

Flujo actual (Twilio):
  1. `POST /api/calls/start` {client_id, phone_number} -> crea el Offering E2E
     y marca al numero real via Twilio.
  2. Cuando el cliente contesta, Twilio conecta un Media Stream al backend.
  3. El copilot escucha la voz del cliente en tiempo real y responde via TTS.
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
    phone_number: str | None = None


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
    """Prepara la llamada via Twilio: offering E2E (planned) + contexto del copilot.

    phone_number es obligatorio para llamar a un telefono real.
    """
    client = db.query(models.Client).filter(models.Client.id == payload.client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="No se encontro cliente con ese ID")

    if not payload.phone_number or not payload.phone_number.strip():
        raise HTTPException(status_code=400, detail="Se requiere un numero de telefono")

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

    from app.services.twilio_provider import twilio_provider
    sess.call_mode = "twilio"
    sess.phone_number = payload.phone_number.strip()
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(
            twilio_provider.dial(
                sess.id, sess.phone_number, ctx, offering.id, current_user.id
            )
        )
    except RuntimeError:
        pass  # Sin event loop (tests sync): el dial se omite

    return {
        "call_id": sess.id,
        "cliente_token": sess.cliente_token,
        "client_name": client.name,
        "client_id": client.id,
        "offering_id": offering.id,
        "call_mode": "twilio",
        "phone_number": sess.phone_number,
    }


# ---------------------------------------------------------------------------
# Grabacion y STT (funcionan igual que antes, pero ahora el audio viene de
# Twilio Media Streams en vez del WebRTC del cliente)
# ---------------------------------------------------------------------------

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


@router.post("/{call_id}/recording")
async def upload_recording(call_id: str, token: str, file: UploadFile = File(...)):
    """Sube la grabacion de la llamada (audio completo con bot)."""
    sess = provider.get_session(call_id)
    if not sess or token != sess.cliente_token:
        raise HTTPException(status_code=401, detail="Token de cliente invalido")
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Archivo vacio")
    sess.recording = data
    await provider.notify_recording(sess)
    return {"status": "ok", "call_id": call_id}


@router.post("/{call_id}/stt-audio")
async def transcribe_audio(call_id: str, token: str, file: UploadFile = File(...)):
    """El cliente sube un clip de su voz y el servidor lo transcribe (Whisper)."""
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
    """Canal de signaling de la llamada (asesor con JWT)."""
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
