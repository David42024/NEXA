from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas
from app.security import require_permission, get_current_user
from app.services import chat_engine
from app.services.config_service import log_event

router = APIRouter(prefix="/api/nexabot", tags=["nexabot"])


@router.post("/chat", response_model=schemas.NexabotResponse)
async def nexabot_chat(
    payload: schemas.NexabotRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    _user=Depends(require_permission("view_speech")),
):
    if not payload.message.strip():
        raise HTTPException(status_code=422, detail="Escribe una pregunta u objeción")

    client = db.query(models.Client).filter(models.Client.id == payload.client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="No se encontró cliente con ese ID")

    ctx = chat_engine.build_context(client.__dict__)
    top_offer = chat_engine.latest_top_offer(db, client.id)
    if top_offer:
        chat_engine._fill_top_offer(ctx, top_offer)

    result = await chat_engine.generate_nexabot_reply(
        ctx, payload.message, transcript=payload.transcript
    )

    if result["source"] != "groq":
        log_event(
            db,
            "ai_generative_failure",
            f"Nexabot respondio con source='{result['source']}' para cliente '{client.id}'",
            current_user.id,
        )
        db.commit()

    return schemas.NexabotResponse(reply=result["reply"], source=result["source"])