from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas
from app.security import require_permission
from app.services import nbo_engine
from app.services.config_service import get_thresholds
from app.services.funnel_service import mark_prioritized

router = APIRouter(prefix="/api/recommendations", tags=["recommendations"])


@router.post("/generate", response_model=schemas.RecommendationResponse)
def generate_recommendation(
    payload: schemas.RecommendationRequest,
    db: Session = Depends(get_db),
    _user=Depends(require_permission("view_recommendation")),
):
    client = db.query(models.Client).filter(models.Client.id == payload.client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="No se encontró cliente con ese ID")

    thresholds = get_thresholds(db)
    result = nbo_engine.get_recommendations_for_client(
        client.id,
        client.profile,
        low_threshold=thresholds["low"],
        noise_threshold=thresholds["noise"],
    )

    # Tracking real del funnel: generar recomendacion para cliente elegible
    # cuenta como "priorizado" (una vez por cliente por dia).
    if result.get("eligible"):
        mark_prioritized(db, client.id)

    recs_out = []
    rec_ids = []
    for r in result["recomendaciones"]:
        offer = db.query(models.Offer).filter(models.Offer.code == r["offer_code"]).first()
        rec_row = models.Recommendation(
            client_id=client.id,
            offer_id=offer.id if offer else None,
            probability=r["probabilidad"],
            shap_values=r["shap_values"],
            score=r["score"],
        )
        db.add(rec_row)
        db.flush()
        rec_ids.append(rec_row.id)
        recs_out.append(schemas.OfferRecommendation(
            oferta=r["offer_name"],
            offer_id=offer.id if offer else 0,
            probabilidad=r["probabilidad"],
            score=r["score"],
            shap_values=r["shap_values"],
            low_probability=r["low_probability"],
        ))
    db.commit()

    return schemas.RecommendationResponse(
        recommendation_ids=rec_ids,
        cliente_id=client.id,
        recomendaciones=recs_out,
        warning=result["warning"],
    )


@router.get("/{rec_id}")
def get_recommendation(
    rec_id: int,
    db: Session = Depends(get_db),
    _user=Depends(require_permission("view_recommendation")),
):
    rec = db.query(models.Recommendation).filter(models.Recommendation.id == rec_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Recomendación no encontrada")
    return {
        "id": rec.id,
        "client_id": rec.client_id,
        "offer_id": rec.offer_id,
        "probability": float(rec.probability) if rec.probability is not None else None,
        "shap_values": rec.shap_values,
        "score": float(rec.score) if rec.score is not None else None,
        "created_at": rec.created_at,
    }
