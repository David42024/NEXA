from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas
from app.security import require_permission, hash_password
from app.services.config_service import (
    ensure_default_config,
    get_thresholds,
    set_config_value,
    log_event,
)

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/permissions")
def get_permissions(db: Session = Depends(get_db), _user=Depends(require_permission("manage_roles"))):
    rows = db.query(models.Permission).all()
    return {r.role: r.permissions for r in rows}


@router.put("/permissions/{role}")
def update_permissions(
    role: str,
    payload: schemas.PermissionsUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_permission("manage_roles")),
):
    perm = db.query(models.Permission).filter(models.Permission.role == role).first()
    if not perm:
        raise HTTPException(status_code=404, detail="Rol no encontrado")
    data = dict(perm.permissions)
    data["permissions"] = payload.permissions
    perm.permissions = data
    log_event(db, "permission_change", f"Permisos actualizados para el rol '{role}'", current_user.id)
    db.commit()
    return {"detail": f"Permisos actualizados para el rol '{role}'", "permissions": data}


# ---------- Usuarios ----------
@router.get("/users", response_model=List[schemas.UserOut])
def list_users(db: Session = Depends(get_db), _user=Depends(require_permission("manage_users"))):
    rows = db.query(models.User).order_by(models.User.id).all()
    return [
        schemas.UserOut(
            id=u.id, email=u.email, role=u.role, name=u.name,
            created_at=u.created_at.isoformat() if u.created_at else None,
        )
        for u in rows
    ]


@router.post("/users", response_model=schemas.UserOut)
def create_user(
    payload: schemas.UserCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_permission("manage_users")),
):
    if db.query(models.User).filter(models.User.email == payload.email).first():
        raise HTTPException(status_code=409, detail="Ya existe un usuario con ese email")
    if payload.role not in ("asesor", "supervisor", "admin"):
        raise HTTPException(status_code=422, detail="Rol inválido")
    user = models.User(
        email=payload.email,
        password_hash=hash_password(payload.password),
        role=payload.role,
        name=payload.name,
    )
    db.add(user)
    log_event(db, "user_created", f"Usuario creado: {payload.email}", current_user.id)
    db.commit()
    db.refresh(user)
    return schemas.UserOut(
        id=user.id, email=user.email, role=user.role, name=user.name,
        created_at=user.created_at.isoformat() if user.created_at else None,
    )


# ---------- Umbrales del motor NBO ----------
@router.get("/thresholds")
def get_admin_thresholds(db: Session = Depends(get_db), _user=Depends(require_permission("configure_thresholds"))):
    ensure_default_config(db)
    t = get_thresholds(db)
    return {
        "LOW_PROBABILITY_THRESHOLD": t["low"],
        "NOISE_PROBABILITY_THRESHOLD": t["noise"],
    }


@router.put("/thresholds")
def update_admin_thresholds(
    payload: schemas.ThresholdsUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_permission("configure_thresholds")),
):
    ensure_default_config(db)
    if payload.low_probability is not None:
        if not (0 <= payload.low_probability <= 1):
            raise HTTPException(status_code=422, detail="Umbral bajo debe estar entre 0 y 1")
        set_config_value(db, "LOW_PROBABILITY_THRESHOLD", payload.low_probability)
    if payload.noise_probability is not None:
        if not (0 <= payload.noise_probability <= 1):
            raise HTTPException(status_code=422, detail="Umbral de ruido debe estar entre 0 y 1")
        set_config_value(db, "NOISE_PROBABILITY_THRESHOLD", payload.noise_probability)
    t = get_thresholds(db)
    if t["noise"] >= t["low"]:
        db.rollback()
        raise HTTPException(
            status_code=422,
            detail="El umbral de ruido debe ser menor que el umbral de baja probabilidad",
        )
    log_event(db, "threshold_change", f"Umbrales actualizados: low={t['low']}, noise={t['noise']}", current_user.id)
    db.commit()
    return {
        "detail": "Umbrales actualizados",
        "LOW_PROBABILITY_THRESHOLD": t["low"],
        "NOISE_PROBABILITY_THRESHOLD": t["noise"],
    }


# ---------- Logs del sistema ----------
@router.get("/logs", response_model=List[schemas.SystemLogOut])
def get_system_logs(
    n: int = 50,
    db: Session = Depends(get_db),
    _user=Depends(require_permission("view_system_logs")),
):
    n = max(1, min(n, 200))
    rows = (
        db.query(models.SystemLog)
        .order_by(models.SystemLog.id.desc())
        .limit(n)
        .all()
    )
    return [
        schemas.SystemLogOut(
            id=r.id, event_type=r.event_type, user_id=r.user_id, detail=r.detail,
            created_at=r.created_at.isoformat() if r.created_at else None,
        )
        for r in rows
    ]


@router.get("/kpis")
def get_kpis(db: Session = Depends(get_db), _user=Depends(require_permission("view_dashboard"))):
    """KPIs principales para el dashboard de asesor/supervisor."""
    from sqlalchemy import func
    from datetime import date, timedelta

    total_clients = db.query(func.count(models.Client.id)).scalar() or 0
    elegibles_mt = sum(
        1 for c in db.query(models.Client).all() if c.profile.get("elegibilidad", {}).get("movistar_total")
    )

    accepted = db.query(func.count(models.Interaction.id)).filter(models.Interaction.result == "accepted").scalar() or 0
    total_interactions = db.query(func.count(models.Interaction.id)).scalar() or 0
    conversion = round((accepted / total_interactions) * 100, 1) if total_interactions else 0

    return {
        "total_clientes": total_clients,
        "elegibles_mt": elegibles_mt,
        "conversion_pct": conversion,
        "valor_potencial_soles": round(elegibles_mt * 22.3, 2),
    }
