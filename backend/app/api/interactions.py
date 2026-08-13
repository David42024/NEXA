from datetime import date
from copy import deepcopy
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas
from app.security import require_permission, get_current_user
from app.services.funnel_service import get_or_create_funnel_row

router = APIRouter(prefix="/api/interactions", tags=["interactions"])


@router.post("/register")
def register_interaction(
    payload: schemas.InteractionRegister,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    permission = "register_acceptance" if payload.result == "accepted" else "register_rejection"
    from app.security import get_user_permissions
    perms = get_user_permissions(db, current_user.role)
    if "all_permissions" not in perms and permission not in perms:
        raise HTTPException(status_code=403, detail=f"Permiso requerido: {permission}")

    client = db.query(models.Client).filter(models.Client.id == payload.client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="No se encontró cliente con ese ID")

    interaction = models.Interaction(
        client_id=payload.client_id,
        recommendation_id=payload.recommendation_id,
        asesor_id=current_user.id,
        channel=payload.channel,
        result=payload.result,
        rejection_reason=payload.rejection_reason,
        speech_used=payload.speech_used,
        speech_generated=payload.speech_generated,
    )
    db.add(interaction)

    # Actualizar historial embebido del cliente (para vista de perfil)
    offer_name = None
    if payload.offer_id:
        offer = db.query(models.Offer).filter(models.Offer.id == payload.offer_id).first()
        offer_name = offer.name if offer else None
    entry = {
        "fecha": date.today().isoformat(),
        "oferta": offer_name or "Oferta NEXA",
        "resultado": "Aceptado" if payload.result == "accepted" else "Rechazado",
    }
    if payload.result == "rejected" and payload.rejection_reason:
        entry["motivo"] = payload.rejection_reason
    # deepcopy: mutar dicts JSON anidados con copia superficial no se persiste
    profile = deepcopy(client.profile)
    profile.setdefault("historial_ofertas", []).append(entry)
    client.profile = profile

    # Actualizar funnel del dia
    today = date.today()
    funnel = get_or_create_funnel_row(db, today)
    funnel.offered += 1
    if payload.result == "accepted":
        funnel.accepted += 1
    funnel.conversion_rate = round((funnel.accepted / funnel.offered) * 100, 2) if funnel.offered else 0

    db.commit()
    db.refresh(interaction)
    return {"detail": "Interacción registrada", "interaction_id": interaction.id}
