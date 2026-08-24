"""Canal de contacto por mensajes con el cliente.

- El asesor crea el chat (POST /api/chats) y comparte un link publico
  /mensaje/{chat_id} donde el cliente conversa.
- El bot (Nexabot) escribe el mensaje inicial y responde automaticamente a
  los mensajes del cliente usando el contexto comercial (perfil + oferta).
  Si el asesor toma la conversacion, el bot se retira y no vuelve a responder.
"""
import uuid
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas
from app.security import get_current_user
from app.services import chat_engine
from app.services.config_service import log_event

router = APIRouter(prefix="/api/chats", tags=["chat-mensajes"])

SENDER_LABEL = {"cliente": "Cliente", "asesor": "Asesor", "bot": "Movistar"}


def _out(m: models.ChatMessage) -> schemas.ChatMessageOut:
    return schemas.ChatMessageOut(
        id=m.id,
        sender=m.sender,
        body=m.body,
        created_at=m.created_at.isoformat() if m.created_at else None,
    )


def _chat_head(db: Session, chat_id: str):
    """Primer mensaje del chat: define cliente/asesor de la conversacion."""
    return (
        db.query(models.ChatMessage)
        .filter(models.ChatMessage.chat_id == chat_id)
        .order_by(models.ChatMessage.id.asc())
        .first()
    )


def _bot_enabled(db: Session, chat_id: str) -> bool:
    """Autopiloto Nexabot del chat (sin registro = activo)."""
    row = db.get(models.ChatBotState, chat_id)
    return True if row is None else row.bot_enabled


def _client_ctx(db: Session, client_id: str):
    client = db.query(models.Client).filter(models.Client.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="No se encontró cliente con ese ID")
    ctx = chat_engine.build_context(client.__dict__)
    top_offer = chat_engine.latest_top_offer(db, client.id)
    if top_offer:
        chat_engine._fill_top_offer(ctx, top_offer)
    return client, ctx


def _history(db: Session, chat_id: str, upto_id: int) -> List[str]:
    rows = (
        db.query(models.ChatMessage)
        .filter(models.ChatMessage.chat_id == chat_id, models.ChatMessage.id <= upto_id)
        .order_by(models.ChatMessage.id.asc())
        .limit(50)
        .all()
    )
    return [f"{SENDER_LABEL.get(m.sender, m.sender)}: {m.body}" for m in rows]


@router.post("", response_model=schemas.ChatCreatedResponse, status_code=201)
async def create_chat(
    payload: schemas.ChatCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Abrir un chat de contacto: genera el mensaje inicial automatico del bot."""
    client, ctx = _client_ctx(db, payload.client_id)

    chat_id = uuid.uuid4().hex[:16]
    opening = await chat_engine.generate_client_chat_opening(ctx)
    msg = models.ChatMessage(
        chat_id=chat_id,
        client_id=client.id,
        asesor_id=current_user.id,
        sender="bot",
        body=opening["reply"],
    )
    db.add(msg)
    db.flush()
    log_event(db, "chat_started", f"Chat de contacto iniciado con {client.id}", current_user.id)
    if opening["source"] != "groq":
        log_event(
            db, "ai_generative_failure",
            f"Chat cliente respondio con source='{opening['source']}' para {client.id}",
            current_user.id,
        )
    db.commit()
    db.refresh(msg)
    return schemas.ChatCreatedResponse(chat_id=chat_id, bot_enabled=True, messages=[_out(msg)])


@router.get("/{chat_id}/messages", response_model=List[schemas.ChatMessageOut])
def list_messages(
    chat_id: str,
    after: int = Query(0),
    db: Session = Depends(get_db),
):
    """Historial del chat (publico via link; `after` para polling incremental)."""
    q = db.query(models.ChatMessage).filter(models.ChatMessage.chat_id == chat_id)
    if after > 0:
        q = q.filter(models.ChatMessage.id > after)
    rows = q.order_by(models.ChatMessage.id.asc()).limit(200).all()
    if after <= 0 and not rows:
        raise HTTPException(status_code=404, detail="Chat no encontrado")
    return [_out(m) for m in rows]


@router.post("/{chat_id}/client-messages", response_model=schemas.ClientChatReplyResponse)
async def post_client_message(
    chat_id: str,
    payload: schemas.ClientChatMessage,
    db: Session = Depends(get_db),
):
    """Mensaje del cliente desde el link publico; dispara respuesta del bot."""
    body = (payload.body or "").strip()
    if not body:
        raise HTTPException(status_code=422, detail="Escribe un mensaje")

    last = (
        db.query(models.ChatMessage)
        .filter(models.ChatMessage.chat_id == chat_id)
        .order_by(models.ChatMessage.id.desc())
        .first()
    )
    if not last:
        raise HTTPException(status_code=404, detail="Chat no encontrado")

    out: List[schemas.ChatMessageOut] = []
    msg = models.ChatMessage(chat_id=chat_id, client_id=last.client_id, asesor_id=last.asesor_id, sender="cliente", body=body[:4000])
    db.add(msg)

    bot_msg = None
    # El bot responde solo mientras su autopiloto este activo.
    if _bot_enabled(db, chat_id):
        _, ctx = _client_ctx(db, last.client_id)
        history = _history(db, chat_id, upto_id=last.id)
        result = await chat_engine.generate_client_chat_reply(ctx, body, history=history)
        bot_msg = models.ChatMessage(
            chat_id=chat_id, client_id=last.client_id, asesor_id=last.asesor_id,
            sender="bot", body=result["reply"],
        )
        db.add(bot_msg)
        if result["source"] != "groq":
            log_event(
                db, "ai_generative_failure",
                f"Chat cliente respondio con source='{result['source']}' para {last.client_id}",
                None,
            )

    db.commit()
    db.refresh(msg)
    out.append(_out(msg))
    if bot_msg is not None:
        db.refresh(bot_msg)
        out.append(_out(bot_msg))
    return schemas.ClientChatReplyResponse(messages=out)


@router.post("/{chat_id}/asesor-messages", response_model=schemas.ChatMessageOut)
def post_asesor_message(
    chat_id: str,
    payload: schemas.ClientChatMessage,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """El asesor escribe manualmente; a partir de ahi el bot no responde solo."""
    body = (payload.body or "").strip()
    if not body:
        raise HTTPException(status_code=422, detail="Escribe un mensaje")
    head = _chat_head(db, chat_id)
    if not head:
        raise HTTPException(status_code=404, detail="Chat no encontrado")
    if head.asesor_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Este chat pertenece a otro asesor")

    msg = models.ChatMessage(
        chat_id=chat_id, client_id=head.client_id, asesor_id=head.asesor_id,
        sender="asesor", body=body[:4000],
    )
    db.add(msg)
    # Escribir manualmente pausa el autopiloto (se puede reactivar con PATCH /bot).
    state_row = db.get(models.ChatBotState, chat_id)
    if state_row is None:
        db.add(models.ChatBotState(chat_id=chat_id, bot_enabled=False))
    else:
        state_row.bot_enabled = False
    log_event(db, "chat_asesor_message", f"Asesor respondio en chat con {head.client_id} (Nexabot en pausa)", current_user.id)
    db.commit()
    db.refresh(msg)
    return _out(msg)


@router.patch("/{chat_id}/bot", response_model=schemas.ChatBotStateOut)
def toggle_bot_autopilot(
    chat_id: str,
    payload: schemas.ChatBotToggle,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Alternar Nexabot entre activo (responde solo) y pausado (modo manual)."""
    head = _chat_head(db, chat_id)
    if not head:
        raise HTTPException(status_code=404, detail="Chat no encontrado")
    if head.asesor_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Este chat pertenece a otro asesor")

    row = db.get(models.ChatBotState, chat_id)
    if row is None:
        row = models.ChatBotState(chat_id=chat_id, bot_enabled=payload.enabled)
        db.add(row)
    else:
        row.bot_enabled = payload.enabled
    log_event(
        db, "chat_bot_toggle",
        f"Nexabot {'activado' if payload.enabled else 'pausado'} en chat con {head.client_id}",
        current_user.id,
    )
    db.commit()
    return schemas.ChatBotStateOut(enabled=payload.enabled)
