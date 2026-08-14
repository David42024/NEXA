"""Seguimiento E2E del ofrecimiento (funnel completo por oferta).

Rastrea el viaje de cada oferta por las 6 etapas del funnel:

    classified -> planned -> contacted -> objection -> evidence -> result

El reporte `/api/e2e/report` responde cuantos ofrecimientos llegaron a cada
etapa, para detectar en que punto se pierden las ventas (ej. "contactamos bien
pero falla el manejo de objeciones").
"""
from datetime import date, timedelta, datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas
from app.security import require_permission, get_current_user, get_user_permissions

router = APIRouter(prefix="/api/e2e", tags=["e2e"])

STAGE_ORDER = ["classified", "planned", "contacted", "objection", "evidence", "result"]
STAGE_LABELS = {
    "classified": "Clasificados",
    "planned": "Contacto y mensaje",
    "contacted": "Contactabilidad",
    "objection": "Objeciones manejadas",
    "evidence": "Medios probatorios",
    "result": "Resultado de venta",
}
VALID_STAGES = set(STAGE_ORDER)
VALID_CHANNELS = {"WhatsApp", "Llamada", "App"}
VALID_CONTACT = {"answered", "read", "unanswered"}
VALID_EVIDENCE = {"call_audio", "platform_register"}
VALID_RESULTS = {"accepted", "rejected"}


def _stage_index(stage: str) -> int:
    return STAGE_ORDER.index(stage) if stage in VALID_STAGES else -1


def _out(db: Session, o: models.Offering) -> schemas.OfferingOut:
    offer = db.query(models.Offer).filter(models.Offer.id == o.offer_id).first() if o.offer_id else None
    return schemas.OfferingOut(
        id=o.id,
        client_id=o.client_id,
        offer_id=o.offer_id,
        offer_name=offer.name if offer else None,
        asesor_id=o.asesor_id,
        channel=o.channel,
        message_text=o.message_text,
        stage=o.stage,
        contact_status=o.contact_status,
        objection_handled=bool(o.objection_handled),
        speech_rebate=o.speech_rebate,
        evidence_type=o.evidence_type,
        evidence_ref=o.evidence_ref,
        result=o.result,
        rejection_reason=o.rejection_reason,
        created_at=o.created_at.isoformat() if o.created_at else None,
    )


@router.post("/offerings", response_model=schemas.OfferingOut)
def create_offering(
    payload: schemas.OfferingCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    _user=Depends(require_permission("view_recommendation")),
):
    """Inicia el seguimiento de un ofrecimiento (clasificacion del cliente).

    Si ya viene canal y/o mensaje, avanza directo a la etapa "planned".
    """
    client = db.query(models.Client).filter(models.Client.id == payload.client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="No se encontró cliente con ese ID")

    if payload.channel is not None and payload.channel not in VALID_CHANNELS:
        raise HTTPException(status_code=422, detail=f"Canal no válido: {payload.channel}")

    stage = "planned" if (payload.channel or payload.message_text) else "classified"
    offering = models.Offering(
        client_id=payload.client_id,
        offer_id=payload.offer_id,
        asesor_id=current_user.id,
        channel=payload.channel,
        message_text=payload.message_text,
        stage=stage,
    )
    db.add(offering)
    db.commit()
    db.refresh(offering)
    return _out(db, offering)


@router.patch("/offerings/{offering_id}", response_model=schemas.OfferingOut)
def update_offering(
    offering_id: int,
    payload: schemas.OfferingUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    _user=Depends(require_permission("view_recommendation")),
):
    """Avanza el ofrecimiento de etapa en etapa (contactabilidad, objeciones, evidencia, resultado)."""
    offering = db.query(models.Offering).filter(models.Offering.id == offering_id).first()
    if not offering:
        raise HTTPException(status_code=404, detail="Ofrecimiento no encontrado")

    changes = payload.model_dump(exclude_unset=True)

    if "stage" in changes:
        if changes["stage"] not in VALID_STAGES:
            raise HTTPException(status_code=422, detail=f"Etapa no válida: {changes['stage']}")
        offering.stage = changes["stage"]
    if "channel" in changes:
        if changes["channel"] is not None and changes["channel"] not in VALID_CHANNELS:
            raise HTTPException(status_code=422, detail=f"Canal no válido: {changes['channel']}")
        offering.channel = changes["channel"]
    if "message_text" in changes:
        offering.message_text = changes["message_text"]
    if "contact_status" in changes:
        if changes["contact_status"] is not None and changes["contact_status"] not in VALID_CONTACT:
            raise HTTPException(status_code=422, detail=f"Estado de contacto no válido: {changes['contact_status']}")
        offering.contact_status = changes["contact_status"]
    if "objection_handled" in changes:
        offering.objection_handled = bool(changes["objection_handled"])
    if "speech_rebate" in changes:
        offering.speech_rebate = changes["speech_rebate"]
    if "evidence_type" in changes:
        if changes["evidence_type"] is not None and changes["evidence_type"] not in VALID_EVIDENCE:
            raise HTTPException(status_code=422, detail=f"Tipo de evidencia no válido: {changes['evidence_type']}")
        offering.evidence_type = changes["evidence_type"]
    if "evidence_ref" in changes:
        offering.evidence_ref = changes["evidence_ref"]
    if "result" in changes:
        if changes["result"] not in VALID_RESULTS:
            raise HTTPException(status_code=422, detail=f"Resultado no válido: {changes['result']}")
        perm = "register_acceptance" if changes["result"] == "accepted" else "register_rejection"
        perms = get_user_permissions(db, current_user.role)
        if "all_permissions" not in perms and perm not in perms:
            raise HTTPException(status_code=403, detail=f"Permiso requerido: {perm}")
        offering.result = changes["result"]
        offering.stage = "result"
    if "rejection_reason" in changes:
        offering.rejection_reason = changes["rejection_reason"]

    db.commit()
    db.refresh(offering)
    return _out(db, offering)


@router.get("/offerings")
def list_offerings(
    client_id: str = Query(...),
    db: Session = Depends(get_db),
    _user=Depends(require_permission("view_client_profile")),
):
    """Historial de ofrecimientos (seguimiento E2E) de un cliente, para el perfil."""
    rows = (
        db.query(models.Offering)
        .filter(models.Offering.client_id == client_id)
        .order_by(models.Offering.id.desc())
        .all()
    )
    return [_out(db, r) for r in rows]


@router.get("/report", response_model=schemas.FunnelE2EReport)
def e2e_report(
    days: int = Query(30, ge=1, le=365),
    db: Session = Depends(get_db),
    _user=Depends(require_permission("view_funnel")),
):
    """Reporte E2E: cuantos ofrecimientos llegaron a cada etapa + desgloses.

    `stages[].value` = ofrecimientos que alcanzaron al menos esa etapa (embudo).
    """
    since = datetime.combine(date.today() - timedelta(days=days), datetime.min.time())
    rows = (
        db.query(models.Offering)
        .filter(models.Offering.created_at >= since)
        .all()
    )

    reached = {}
    for s in STAGE_ORDER:
        idx = _stage_index(s)
        reached[s] = sum(1 for r in rows if _stage_index(r.stage) >= idx)

    stages = []
    prev = None
    for s in STAGE_ORDER:
        st = schemas.E2EStage(key=s, label=STAGE_LABELS[s], value=reached[s])
        if prev is not None:
            st.pct_of_previous = round((reached[s] / prev) * 100, 1) if prev else None
        stages.append(st)
        prev = reached[s]

    def _count(fn):
        d = {}
        for r in rows:
            v = fn(r)
            if v:
                d[v] = d.get(v, 0) + 1
        return [
            schemas.E2EBreakdown(label=k, value=v)
            for k, v in sorted(d.items(), key=lambda x: -x[1])
        ]

    return schemas.FunnelE2EReport(
        stages=stages,
        total=len(rows),
        channels=_count(lambda r: r.channel),
        contact_status=_count(lambda r: r.contact_status),
        objections={
            "alcanzaron_objecion": reached.get("objection", 0),
            "manejadas_con_rebate": sum(1 for r in rows if r.objection_handled),
        },
        evidence_types=_count(lambda r: r.evidence_type),
        results=_count(lambda r: r.result),
        rejection_reasons=_count(lambda r: r.rejection_reason),
    )