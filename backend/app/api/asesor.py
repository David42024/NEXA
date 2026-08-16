"""Progreso comercial del asesor en sesion (ventas de hoy/semana/mes vs metas)."""
from datetime import date, datetime, timedelta
from sqlalchemy import func
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas
from app.security import require_any_permission
from app.services.config_service import get_metas
from app.api.clients import _nbo_top, _mejor_hora, _llamable_ahora, _is_elegible, _plan_actual

router = APIRouter(prefix="/api/asesor", tags=["asesor"])

# Segmentos estratégicos del asesor (adaptados del reference gerencial).
_SEGMENTOS = [
    ("Todos", "Todos"),
    ("Oro", "Oro Convergente"),
    ("Alerta", "Alerta Roja"),
    ("Gigas", "Hambrientos de Datos"),
    ("Digital", "Nativos Digitales"),
]


def _segmento_cliente(profile: dict) -> str | None:
    """Clasifica un cliente en su segmento estratégico principal.

    El orden es deliberado: el riesgo de churn (Alerta) manda, luego la
    convergencia (Oro), el consumo de datos (Gigas) y por último el uso de la
    app (Digital). Los clientes sin ninguna señal quedan sin segmento (solo
    aparecen bajo 'Todos').
    """
    fact = profile.get("facturacion") or {}
    comp = profile.get("comportamiento") or {}
    consumo = profile.get("consumo") or {}
    if (fact.get("dias_mora_prom") or 0) >= 5 or (comp.get("n_reclamos") or 0) >= 1:
        return "Alerta"
    if (profile.get("hogar") or {}).get("tiene_internet"):
        return "Oro"
    if (consumo.get("datos_gb") or 0) >= 20:
        return "Gigas"
    if consumo.get("app_uso") == "Alto":
        return "Digital"
    return None


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
    db: Session = Depends(get_db),
    current_user=Depends(require_any_permission("view_dashboard")),
):
    """Clientes de MI cartera, priorizados por score NBO y categorizados en
    segmentos estratégicos (Oro Convergente, Alerta Roja, Hambrientos de
    Datos, Nativos Digitales) con sus conteos por chip.

    El barrido se acota a la cartera del asesor autenticado (~1k clientes) y el
    scoring NBO es CPU puro (no toca la BD por cliente), así que la petición
    sigue siendo pequeña y rápida incluso contra Neon.
    """
    cartera = (
        db.query(models.Client)
        .filter(models.Client.asesor_id == current_user.id)
        .all()
    )

    counts = {sid: 0 for sid, _label in _SEGMENTOS if sid != "Todos"}
    counts["Todos"] = len(cartera)

    clientes = []
    for c in cartera:
        seg = _segmento_cliente(c.profile)
        if seg:
            counts[seg] += 1
        mejor_hora = _mejor_hora(c.profile)
        score, top_offer, motivo = _nbo_top(c)
        clientes.append(schemas.ClientSummary(
            id=c.id,
            name=c.name,
            district=c.district,
            segmento=seg,
            elegible=_is_elegible(c.profile),
            score=score,
            top_offer=top_offer,
            motivo=motivo,
            plan_actual=_plan_actual(c.profile),
            mejor_hora=mejor_hora,
            llamable_ahora=_llamable_ahora(mejor_hora),
        ))

    clientes.sort(key=lambda s: s.score, reverse=True)
    segmentos = [
        schemas.SegmentoCount(id=sid, label=label, count=counts[sid])
        for sid, label in _SEGMENTOS
    ]
    return schemas.AsesorPriorizadosResponse(segmentos=segmentos, clientes=clientes[:30])