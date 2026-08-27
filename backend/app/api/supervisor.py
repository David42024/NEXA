"""Dashboard gerencial: resultados de venta, tendencias y analisis de canales.

Solo accesible por supervisor/admin.
"""
from collections import Counter, defaultdict
from datetime import date, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func, cast, Date
from sqlalchemy.orm import Session

from app.database import get_db
from app import models
from app.security import require_permission

router = APIRouter(prefix="/api/supervisor", tags=["supervisor"])


@router.get("/sales-results")
def sales_results(db: Session = Depends(get_db), _user=Depends(require_permission("view_funnel"))):
    """Resumen de resultados de venta, tendencias y analisis de canales."""
    now = date.today()
    last_30 = now - timedelta(days=30)

    # --- Totales ---
    base_offerings = db.query(models.Offering)
    total = base_offerings.count()
    accepted = base_offerings.filter(models.Offering.result == "accepted").count()
    rejected = base_offerings.filter(models.Offering.result == "rejected").count()

    # Etapas alcanzadas
    stages_reached = base_offerings.filter(
        models.Offering.stage.in_(["contacted", "objection", "evidence", "result"])
    ).count()

    # Rebates (objeciones manejadas)
    rebates = base_offerings.filter(models.Offering.objection_status == "rebate").count()

    # --- Motivos de rechazo ---
    rejection_rows = (
        db.query(models.Offering.rejection_reason, func.count(models.Offering.id))
        .filter(models.Offering.result == "rejected", models.Offering.rejection_reason.isnot(None))
        .group_by(models.Offering.rejection_reason)
        .all()
    )
    rejection_reasons = [
        {"reason": r, "count": c} for r, c in rejection_rows if r
    ]

    # --- Tendencia diaria (ultimos 30 dias) ---
    trend_rows = (
        db.query(
            cast(models.Offering.created_at, Date).label("day"),
            func.count(models.Offering.id),
        )
        .filter(models.Offering.created_at >= func.now() - timedelta(days=30))
        .group_by("day")
        .order_by("day")
        .all()
    )
    # Crear mapa de dias con 0 para dias sin datos
    trend_map = {str(r.day): r[1] for r in trend_rows}
    trend = []
    d = last_30
    while d <= now:
        key = d.isoformat()
        trend.append({"date": key, "count": trend_map.get(key, 0)})
        d += timedelta(days=1)

    # --- Ofertas aceptadas diarias ---
    daily_accepted_rows = (
        db.query(
            cast(models.Offering.created_at, Date).label("day"),
            func.count(models.Offering.id),
        )
        .filter(
            models.Offering.result == "accepted",
            models.Offering.created_at >= func.now() - timedelta(days=30),
        )
        .group_by("day")
        .order_by("day")
        .all()
    )
    accepted_map = {str(r.day): r[1] for r in daily_accepted_rows}
    daily_accepted = []
    d = last_30
    while d <= now:
        key = d.isoformat()
        daily_accepted.append({"date": key, "count": accepted_map.get(key, 0)})
        d += timedelta(days=1)

    # --- Ofertas mas aceptadas ---
    offer_accepted_rows = (
        db.query(
            models.Offer.name,
            func.count(models.Offering.id),
        )
        .join(models.Offer, models.Offering.offer_id == models.Offer.id)
        .filter(models.Offering.result == "accepted")
        .group_by(models.Offer.name)
        .order_by(func.count(models.Offering.id).desc())
        .limit(10)
        .all()
    )
    top_offers = [{"name": n, "count": c} for n, c in offer_accepted_rows]

    # --- Canales mas efectivos ---
    channel_rows = (
        db.query(
            models.Offering.channel,
            func.count(models.Offering.id),
        )
        .filter(models.Offering.channel.isnot(None))
        .group_by(models.Offering.channel)
        .order_by(func.count(models.Offering.id).desc())
        .all()
    )
    channels = [{"name": ch or "Otro", "count": c} for ch, c in channel_rows]

    return {
        "summary": {
            "total": total,
            "accepted": accepted,
            "rejected": rejected,
            "stages_reached": stages_reached,
            "rebates": rebates,
        },
        "rejection_reasons": rejection_reasons,
        "trend": trend,
        "daily_accepted": daily_accepted,
        "top_offers": top_offers,
        "channels": channels,
    }
