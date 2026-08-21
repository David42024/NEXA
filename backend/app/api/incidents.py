"""Incidencias operativas (panel del admin).

- Cualquier usuario autenticado puede reportar una incidencia.
- El asesor puede consultar las suyas; admin gestiona todas via /api/admin/incidents.
"""
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas
from app.security import get_current_user
from app.services.config_service import log_event

router = APIRouter(prefix="/api/incidents", tags=["incidencias"])

VALID_CATEGORIES = {"sistema", "llamada", "datos", "cliente", "otro"}
VALID_SEVERITIES = {"baja", "media", "alta", "critica"}
VALID_STATUSES = {"abierta", "resuelta"}


def _user_names(db: Session, ids: set) -> dict:
    if not ids:
        return {}
    rows = db.query(models.User.id, models.User.name).filter(models.User.id.in_(ids)).all()
    return {uid: name for uid, name in rows}


def _incident_out(db: Session, inc: models.Incident) -> schemas.IncidentOut:
    names = _user_names(db, {i for i in (inc.reported_by, inc.resolved_by) if i})
    return schemas.IncidentOut(
        id=inc.id,
        title=inc.title,
        description=inc.description,
        category=inc.category,
        severity=inc.severity,
        status=inc.status,
        client_id=inc.client_id,
        reporter_name=names.get(inc.reported_by),
        resolver_name=names.get(inc.resolved_by),
        created_at=inc.created_at.isoformat() if inc.created_at else None,
        resolved_at=inc.resolved_at.isoformat() if inc.resolved_at else None,
        resolution_note=inc.resolution_note,
    )


@router.post("", response_model=schemas.IncidentOut, status_code=201)
def report_incident(
    payload: schemas.IncidentCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Reportar una nueva incidencia (cualquier usuario autenticado)."""
    if not payload.title or not payload.title.strip():
        raise HTTPException(status_code=422, detail="La incidencia necesita un titulo")
    if payload.category not in VALID_CATEGORIES:
        raise HTTPException(status_code=422, detail=f"Categoria invalida: usa {sorted(VALID_CATEGORIES)}")
    if payload.severity not in VALID_SEVERITIES:
        raise HTTPException(status_code=422, detail=f"Severidad invalida: usa {sorted(VALID_SEVERITIES)}")
    if payload.client_id and not db.query(models.Client).filter(models.Client.id == payload.client_id).first():
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    inc = models.Incident(
        title=payload.title.strip()[:150],
        description=payload.description,
        category=payload.category,
        severity=payload.severity,
        client_id=payload.client_id,
        reported_by=current_user.id,
    )
    db.add(inc)
    db.flush()
    log_event(db, "incident_reported", f"Incidencia #{inc.id}: {inc.title} ({payload.severity})", current_user.id)
    db.commit()
    db.refresh(inc)
    return _incident_out(db, inc)


@router.get("/mine", response_model=List[schemas.IncidentOut])
def my_incidents(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Incidencias reportadas por el usuario actual."""
    rows = (
        db.query(models.Incident)
        .filter(models.Incident.reported_by == current_user.id)
        .order_by(models.Incident.id.desc())
        .limit(50)
        .all()
    )
    return [_incident_out(db, r) for r in rows]


@router.patch("/{incident_id}", response_model=schemas.IncidentOut)
def update_own_incident_note(
    incident_id: int,
    payload: schemas.IncidentUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """El autor puede anexar detalle a su propia incidencia mientras sigue abierta."""
    inc = db.query(models.Incident).filter(models.Incident.id == incident_id).first()
    if not inc:
        raise HTTPException(status_code=404, detail="Incidencia no encontrada")
    if inc.reported_by != current_user.id:
        raise HTTPException(status_code=403, detail="Solo el autor puede editar su reporte")
    if inc.status != "abierta":
        raise HTTPException(status_code=422, detail="La incidencia ya fue resuelta por el administrador")
    if payload.resolution_note is None or not payload.resolution_note.strip():
        raise HTTPException(status_code=422, detail="Indica el detalle adicional")
    inc.description = ((inc.description or "") + "\n" + payload.resolution_note.strip()).strip()
    log_event(db, "incident_updated", f"Incidencia #{inc.id}: detalle anexado por el autor", current_user.id)
    db.commit()
    db.refresh(inc)
    return _incident_out(db, inc)
