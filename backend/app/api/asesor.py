"""Progreso comercial del asesor en sesion (ventas de hoy/semana/mes vs metas)."""
from datetime import date, datetime, timedelta
from sqlalchemy import func
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas
from app.security import require_any_permission
from app.services.config_service import get_metas
from app.api.clients import SEGMENTOS, cartera_puntuada

router = APIRouter(prefix="/api/asesor", tags=["asesor"])


def _count_ventas(db: Session, asesor_id: int, desde: datetime) -> int:
    return (
        db.query(func.count(models.Offering.id))
        .filter(
            models.Offering.asesor_id == asesor_id,
            models.Offering.stage == "result",
            models.Offering.result == "accepted",
            models.Offering.created_at >= desde,
        )
        .scalar()
        or 0
    )


@router.get("/progreso")
def get_mi_progreso(
    db: Session = Depends(get_db),
    current_user=Depends(require_any_permission("view_dashboard")),
):
    """Ventas cerradas hoy (y en el mes) del asesor autenticado vs sus metas.

    Las ventas son ofrecimientos E2E cerrados (stage=result, result=accepted).
    La meta diaria la configura el admin (META_VENTAS_DIARIA, por defecto 10).
    """
    metas = get_metas(db)
    meta_diaria = metas["META_VENTAS_DIARIA"]
    meta_semanal = metas["META_VENTAS_SEMANAL"]
    meta_mensual = metas["META_VENTAS_MENSUAL"]

    hoy = date.today()
    hoy_inicio = datetime.combine(hoy, datetime.min.time())
    semana_inicio = datetime.combine(hoy - timedelta(days=hoy.weekday()), datetime.min.time())
    mes_inicio = datetime.combine(hoy.replace(day=1), datetime.min.time())

    ventas_dia = _count_ventas(db, current_user.id, hoy_inicio)
    ventas_semana = _count_ventas(db, current_user.id, semana_inicio)
    ventas_mes = _count_ventas(db, current_user.id, mes_inicio)

    return {
        "ventas_dia": ventas_dia,
        "meta_diaria": meta_diaria,
        "progreso_dia_pct": round((ventas_dia / meta_diaria) * 100) if meta_diaria else 0,
        "ventas_semana": ventas_semana,
        "meta_semanal": meta_semanal,
        "progreso_semana_pct": round((ventas_semana / meta_semanal) * 100) if meta_semanal else 0,
        "ventas_mes": ventas_mes,
        "meta_mensual": meta_mensual,
        "progreso_mes_pct": round((ventas_mes / meta_mensual) * 100) if meta_mensual else 0,
    }


@router.get("/priorizados", response_model=schemas.AsesorPriorizadosResponse)
def get_mis_clientes_priorizados(
    segmento: str = Query("Todos"),
    page: int = Query(1, ge=1),
    page_size: int = Query(30, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user=Depends(require_any_permission("view_dashboard")),
):
    """Clientes de MI cartera, priorizados por score NBO y categorizados en
    segmentos estratégicos, con conteos por chip y paginación servidor-side.

    Los conteos cubren TODA la cartera del asesor (~1k clientes), pero el
    listado devuelve una sola página (por defecto 30) para no transferir todo
    el segmento de golpe. `segmento` filtra por chip; la puntuación se cachea
    por asesor (los scores solo dependen del perfil), así que avanzar de página
    no repite el scoring.
    """
    puntuados = cartera_puntuada(db, current_user.id)

    counts = {sid: 0 for sid, _label in SEGMENTOS if sid != "Todos"}
    for s in puntuados:
        if s.segmento:
            counts[s.segmento] = counts.get(s.segmento, 0) + 1
    counts["Todos"] = len(puntuados)

    filtrados = [s for s in puntuados if segmento == "Todos" or s.segmento == segmento]
    total = len(filtrados)
    start = (page - 1) * page_size
    clientes = filtrados[start:start + page_size]

    segmentos = [
        schemas.SegmentoCount(id=sid, label=label, count=counts[sid])
        for sid, label in SEGMENTOS
    ]
    return schemas.AsesorPriorizadosResponse(
        segmentos=segmentos, total=total, page=page, page_size=page_size, clientes=clientes
    )