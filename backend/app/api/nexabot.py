from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas
from app.security import require_permission, get_current_user
from app.services import chat_engine
from app.services.nbo_engine import OFFER_CATALOG
from app.services.config_service import log_event

router = APIRouter(prefix="/api/nexabot", tags=["nexabot"])


def _latest_top_offer(db: Session, client_id: str):
    """Mejor recomendacion vigente del cliente (si existe) para contextualizar al asistente."""
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
        "precio": (catalog or {}).get("precio"),
        "ahorro_pct": (catalog or {}).get("ahorro_pct"),
        "probabilidad": rec.probability,
    }


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
    top_offer = _latest_top_offer(db, client.id)
    if top_offer:
        chat_engine._fill_top_offer(ctx, top_offer)

    result = await chat_engine.generate_nexabot_reply(ctx, payload.message)

    if result["source"] != "groq":
        log_event(
            db,
            "ai_generative_failure",
            f"Nexabot respondio con source='{result['source']}' para cliente '{client.id}'",
            current_user.id,
        )
        db.commit()

    return schemas.NexabotResponse(reply=result["reply"], source=result["source"])