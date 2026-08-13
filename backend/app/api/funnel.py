from datetime import date, timedelta
import csv
import io

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app import models, schemas
from app.security import require_permission

router = APIRouter(prefix="/api/funnel", tags=["funnel"])


def _aggregate(db: Session, since: date):
    rows = db.query(models.FunnelDaily).filter(models.FunnelDaily.date >= since).all()
    analyzed = sum(r.analyzed for r in rows)
    prioritized = sum(r.prioritized for r in rows)
    contacted = sum(r.contacted for r in rows)
    offered = sum(r.offered for r in rows)
    accepted = sum(r.accepted for r in rows)
    conversion = round((accepted / analyzed) * 100, 2) if analyzed else 0
    return schemas.FunnelResponse(
        stages=[
            schemas.FunnelStage(label="Clientes analizados", value=analyzed),
            schemas.FunnelStage(label="Priorizados (elegibles)", value=prioritized),
            schemas.FunnelStage(label="Contactados", value=contacted),
            schemas.FunnelStage(label="Ofrecimientos", value=offered),
            schemas.FunnelStage(label="Aceptaciones", value=accepted),
        ],
        conversion_rate=conversion,
    )


@router.get("/daily", response_model=schemas.FunnelResponse)
def funnel_daily(db: Session = Depends(get_db), _user=Depends(require_permission("view_dashboard"))):
    return _aggregate(db, date.today() - timedelta(days=7))


@router.get("/weekly", response_model=schemas.FunnelResponse)
def funnel_weekly(db: Session = Depends(get_db), _user=Depends(require_permission("view_funnel"))):
    return _aggregate(db, date.today() - timedelta(weeks=4))


@router.get("/monthly", response_model=schemas.FunnelResponse)
def funnel_monthly(db: Session = Depends(get_db), _user=Depends(require_permission("view_funnel"))):
    return _aggregate(db, date.today() - timedelta(days=180))


@router.get("/export")
def export_funnel(
    start: date = Query(..., description="Fecha inicio (YYYY-MM-DD)"),
    end: date = Query(..., description="Fecha fin (YYYY-MM-DD)"),
    db: Session = Depends(get_db),
    _user=Depends(require_permission("export_reports")),
):
    """CSV descargable del funnel en el rango de fechas solicitado."""
    if start > end:
        start, end = end, start
    rows = (
        db.query(models.FunnelDaily)
        .filter(models.FunnelDaily.date >= start, models.FunnelDaily.date <= end)
        .order_by(models.FunnelDaily.date.asc())
        .all()
    )

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow([
        "date", "analyzed", "prioritized", "contacted", "offered", "accepted", "conversion_rate",
    ])
    for r in rows:
        writer.writerow([
            r.date.isoformat(), r.analyzed, r.prioritized, r.contacted,
            r.offered, r.accepted, r.conversion_rate,
        ])

    filename = f"funnel_{start.isoformat()}_{end.isoformat()}.csv"
    return Response(
        content=buffer.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/trends")
def funnel_trends(db: Session = Depends(get_db), _user=Depends(require_permission("view_trends"))):
    """Series diarias (ultimos 30 dias) para graficos de tendencia del supervisor."""
    rows = (
        db.query(models.FunnelDaily)
        .filter(models.FunnelDaily.date >= date.today() - timedelta(days=30))
        .order_by(models.FunnelDaily.date.asc())
        .all()
    )
    return [
        {
            "date": r.date.isoformat(),
            "analyzed": r.analyzed,
            "offered": r.offered,
            "accepted": r.accepted,
            "conversion_rate": float(r.conversion_rate or 0),
        }
        for r in rows
    ]


@router.get("/breakdown")
def funnel_breakdown(db: Session = Depends(get_db), _user=Depends(require_permission("view_trends"))):
    """Ofertas mas aceptadas, canales mas efectivos, motivos de rechazo (para dashboard supervisor)."""
    top_offers = (
        db.query(models.Offer.name, func.count(models.Interaction.id).label("count"))
        .join(models.Recommendation, models.Recommendation.offer_id == models.Offer.id)
        .join(models.Interaction, models.Interaction.recommendation_id == models.Recommendation.id)
        .filter(models.Interaction.result == "accepted")
        .group_by(models.Offer.name)
        .order_by(func.count(models.Interaction.id).desc())
        .limit(5)
        .all()
    )
    channels = (
        db.query(models.Interaction.channel, func.count(models.Interaction.id).label("count"))
        .filter(models.Interaction.result == "accepted")
        .group_by(models.Interaction.channel)
        .all()
    )
    rejection_reasons = (
        db.query(models.Interaction.rejection_reason, func.count(models.Interaction.id).label("count"))
        .filter(models.Interaction.result == "rejected", models.Interaction.rejection_reason.isnot(None))
        .group_by(models.Interaction.rejection_reason)
        .all()
    )
    return {
        "top_offers": [{"name": n, "count": c} for n, c in top_offers],
        "channels": [{"channel": ch, "count": c} for ch, c in channels],
        "rejection_reasons": [{"reason": r, "count": c} for r, c in rejection_reasons],
    }
