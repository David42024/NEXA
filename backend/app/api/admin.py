from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas
from app.security import require_permission, hash_password
from app.services.config_service import (
    ensure_default_config,
    get_thresholds,
    set_config_value,
    get_config,
    get_metas,
    log_event,
)

router = APIRouter(prefix="/api/admin", tags=["admin"])


def _count_elegibles_mt(db, asesor_id: int = None) -> int:
    """Cuenta clientes elegibles a Movistar Total sin cargar todo a memoria.

    Con 100k+ clientes un `.all()` con los perfiles JSON revienta la RAM de
    instancias pequenas (Render 512MB). En Postgres (produccion) se cuenta con
    un unico query sobre el JSON del perfil, evitando decenas de round-trips de
    red contra la BD; en SQLite (tests) se barre por lotes. Con `asesor_id`
    solo cuenta la cartera de ese asesor.
    """
    if db.get_bind().dialect.name == "postgresql":
        try:
            from sqlalchemy import text
            if asesor_id is not None:
                q = text(
                    "SELECT count(*) FROM clients "
                    "WHERE (profile -> 'elegibilidad' ->> 'movistar_total') = 'true' "
                    "AND asesor_id = :asesor_id"
                ).bindparams(asesor_id=asesor_id)
            else:
                q = text(
                    "SELECT count(*) FROM clients "
                    "WHERE (profile -> 'elegibilidad' ->> 'movistar_total') = 'true'"
                )
            return db.execute(q).scalar() or 0
        except Exception:
            pass  # si falla el query JSON, se cae al barrido portable

    count = 0
    last_id = None
    BATCH = 2000
    while True:
        q = db.query(models.Client.id, models.Client.profile).order_by(models.Client.id)
        if asesor_id is not None:
            q = q.filter(models.Client.asesor_id == asesor_id)
        if last_id:
            q = q.filter(models.Client.id > last_id)
        rows = q.limit(BATCH).all()
        if not rows:
            break
        for _, profile in rows:
            if (profile or {}).get("elegibilidad", {}).get("movistar_total"):
                count += 1
        last_id = rows[-1][0]
    return count


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


# ---------- Metas comerciales ----------
@router.get("/metas")
def get_admin_metas(db: Session = Depends(get_db), _user=Depends(require_permission("configure_thresholds"))):
    ensure_default_config(db)
    return get_metas(db)


@router.put("/metas")
def update_admin_metas(
    payload: schemas.MetasUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_permission("configure_thresholds")),
):
    ensure_default_config(db)
    if payload.meta_diaria is not None:
        if payload.meta_diaria < 1:
            raise HTTPException(status_code=422, detail="La meta diaria debe ser al menos 1")
        set_config_value(db, "META_VENTAS_DIARIA", payload.meta_diaria)
    if payload.meta_semanal is not None:
        if payload.meta_semanal < 1:
            raise HTTPException(status_code=422, detail="La meta semanal debe ser al menos 1")
        set_config_value(db, "META_VENTAS_SEMANAL", payload.meta_semanal)
    if payload.meta_mensual is not None:
        if payload.meta_mensual < 1:
            raise HTTPException(status_code=422, detail="La meta mensual debe ser al menos 1")
        set_config_value(db, "META_VENTAS_MENSUAL", payload.meta_mensual)
    metas = get_metas(db)
    log_event(
        db, "meta_change",
        f"Metas actualizadas: diaria={metas['META_VENTAS_DIARIA']}, semanal={metas['META_VENTAS_SEMANAL']}, "
        f"mensual={metas['META_VENTAS_MENSUAL']}",
        current_user.id,
    )
    db.commit()
    return {"detail": "Metas actualizadas", **metas}


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


# ---------- Incidencias ----------
@router.get("/incidents", response_model=schemas.IncidentsListResponse)
def list_incidents(
    status: str = Query("todas"),
    severity: str = Query("todas"),
    category: str = Query("todas"),
    n: int = Query(100),
    db: Session = Depends(get_db),
    _user=Depends(require_permission("view_system_logs")),
):
    """Panel de incidencias: listado filtrable + contadores globales."""
    from app.api.incidents import VALID_CATEGORIES, VALID_SEVERITIES, VALID_STATUSES, _incident_out

    q = db.query(models.Incident).order_by(models.Incident.id.desc())
    if status in VALID_STATUSES:
        q = q.filter(models.Incident.status == status)
    if severity in VALID_SEVERITIES:
        q = q.filter(models.Incident.severity == severity)
    if category in VALID_CATEGORIES:
        q = q.filter(models.Incident.category == category)
    n = max(1, min(n, 200))
    rows = q.limit(n).all()

    total = db.query(models.Incident.id).count()
    abiertas = db.query(models.Incident.id).filter(models.Incident.status == "abierta").count()
    criticas = (
        db.query(models.Incident.id)
        .filter(models.Incident.status == "abierta", models.Incident.severity == "critica")
        .count()
    )
    resueltas = total - abiertas
    stats = {
        "total": total,
        "abiertas": abiertas,
        "criticas_abiertas": criticas,
        "resueltas": resueltas,
    }
    return schemas.IncidentsListResponse(items=[_incident_out(db, r) for r in rows], stats=stats)


@router.patch("/incidents/{incident_id}", response_model=schemas.IncidentOut)
def update_incident(
    incident_id: int,
    payload: schemas.IncidentUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_permission("view_system_logs")),
):
    """Gestion de la incidencia: resolver / reabrir con nota de resolucion."""
    from datetime import datetime

    from app.api.incidents import _incident_out

    inc = db.query(models.Incident).filter(models.Incident.id == incident_id).first()
    if not inc:
        raise HTTPException(status_code=404, detail="Incidencia no encontrada")

    if payload.status is not None:
        if payload.status not in ("abierta", "resuelta"):
            raise HTTPException(status_code=422, detail="Estado invalido: usa 'abierta' o 'resuelta'")
        inc.status = payload.status
        if payload.status == "resuelta":
            inc.resolved_at = datetime.now()
            inc.resolved_by = current_user.id
            if payload.resolution_note and payload.resolution_note.strip():
                inc.resolution_note = payload.resolution_note.strip()
        else:
            inc.resolved_at = None
            inc.resolved_by = None
            if payload.resolution_note is not None:
                inc.resolution_note = payload.resolution_note.strip() or None
    elif payload.resolution_note is not None:
        inc.resolution_note = payload.resolution_note.strip() or None

    log_event(
        db, "incident_status_change",
        f"Incidencia #{inc.id} -> {inc.status}" + (f" por {current_user.name or current_user.email}" if inc.status == "resuelta" else ""),
        current_user.id,
    )
    db.commit()
    db.refresh(inc)
    return _incident_out(db, inc)


@router.get("/kpis")
def get_kpis(db: Session = Depends(get_db), current_user=Depends(require_permission("view_dashboard"))):
    """KPIs del dashboard.

    Para el asesor los KPIs se limitan a SU cartera (`clients.asesor_id`): ve
    sus clientes, sus elegibles MT, su conversion y su valor potencial. El
    supervisor/admin sigue viendo los totales globales.
    """
    from sqlalchemy import func

    is_asesor = current_user.role == "asesor"

    if is_asesor:
        base = db.query(models.Client).filter(models.Client.asesor_id == current_user.id)
        total_clients = base.count()
        elegibles_mt = _count_elegibles_mt(db, asesor_id=current_user.id)
        accepted = (
            db.query(func.count(models.Interaction.id))
            .join(models.Client, models.Interaction.client_id == models.Client.id)
            .filter(models.Client.asesor_id == current_user.id, models.Interaction.result == "accepted")
            .scalar()
            or 0
        )
        total_interactions = (
            db.query(func.count(models.Interaction.id))
            .join(models.Client, models.Interaction.client_id == models.Client.id)
            .filter(models.Client.asesor_id == current_user.id)
            .scalar()
            or 0
        )
    else:
        total_clients = db.query(func.count(models.Client.id)).scalar() or 0
        elegibles_mt = _count_elegibles_mt(db)
        accepted = db.query(func.count(models.Interaction.id)).filter(models.Interaction.result == "accepted").scalar() or 0
        total_interactions = db.query(func.count(models.Interaction.id)).scalar() or 0

    conversion = round((accepted / total_interactions) * 100, 1) if total_interactions else 0

    return {
        "total_clientes": total_clients,
        "elegibles_mt": elegibles_mt,
        "conversion_pct": conversion,
        "valor_potencial_soles": round(elegibles_mt * 22.3, 2),
        "aceptadas": accepted,
        "total_interacciones": total_interactions,
    }


# ---------- Desempeño de asesores ----------
@router.get("/asesores")
def get_asesores(db: Session = Depends(get_db), _user=Depends(require_permission("view_funnel"))):
    """Panel de supervision: ventas del mes por asesor vs su meta (cumplido o no).

    Las ventas son ofrecimientos E2E cerrados (stage=result, result=accepted)
    del mes en curso. La meta se lee de la config en caliente (META_VENTAS_MENSUAL).

    Ademas expone el desempeno real de la cartera de cada asesor (via
    `clients.asesor_id`): interacciones, aceptadas, rechazadas, conversion y
    friccion. Las interacciones del CSV real no tienen `asesor_id` propio, pero
    sus clientes si estan en la cartera, asi que se agregan por ese join.
    """
    from datetime import date, datetime
    from sqlalchemy import func

    month_start = datetime.combine(date.today().replace(day=1), datetime.min.time())
    config = get_config(db)
    meta = int(float(config.get("META_VENTAS_MENSUAL", 4)))

    # Estadisticas de cartera (toda la interaccion de los clientes asignados).
    total_stats = dict(
        db.query(models.Client.asesor_id, func.count(models.Interaction.id))
        .join(models.Interaction, models.Interaction.client_id == models.Client.id)
        .filter(models.Client.asesor_id.isnot(None))
        .group_by(models.Client.asesor_id)
        .all()
    )
    accepted_stats = dict(
        db.query(models.Client.asesor_id, func.count(models.Interaction.id))
        .join(models.Interaction, models.Interaction.client_id == models.Client.id)
        .filter(models.Client.asesor_id.isnot(None), models.Interaction.result == "accepted")
        .group_by(models.Client.asesor_id)
        .all()
    )
    # Con 50k ofrecimientos hacer 3 queries POR asesor (103) dispara ~300
    # round-trips contra la BD remota (55s+ en Neon). Se agrupan en 3 queries
    # unicas y se resuelve por dict.
    cartera_stats = dict(
        db.query(models.Client.asesor_id, func.count(models.Client.id))
        .filter(models.Client.asesor_id.isnot(None))
        .group_by(models.Client.asesor_id)
        .all()
    )
    ofrecimiento_stats = dict(
        db.query(models.Offering.asesor_id, func.count(models.Offering.id))
        .filter(models.Offering.asesor_id.isnot(None), models.Offering.created_at >= month_start)
        .group_by(models.Offering.asesor_id)
        .all()
    )
    ventas_stats = dict(
        db.query(models.Offering.asesor_id, func.count(models.Offering.id))
        .filter(
            models.Offering.asesor_id.isnot(None),
            models.Offering.stage == "result",
            models.Offering.result == "accepted",
            models.Offering.created_at >= month_start,
        )
        .group_by(models.Offering.asesor_id)
        .all()
    )

    rows = []
    for a in db.query(models.User).filter(models.User.role == "asesor").order_by(models.User.id).all():
        ventas = ventas_stats.get(a.id, 0)
        ofrecimientos = ofrecimiento_stats.get(a.id, 0)
        clientes_cartera = cartera_stats.get(a.id, 0)
        interacciones = total_stats.get(a.id, 0)
        aceptadas = accepted_stats.get(a.id, 0)
        rechazadas = max(interacciones - aceptadas, 0)
        rows.append({
            "id": a.id,
            "name": a.name,
            "email": a.email,
            "ventas": ventas,
            "ofrecimientos": ofrecimientos,
            "clientes_cartera": clientes_cartera,
            "interacciones": interacciones,
            "aceptadas": aceptadas,
            "rechazadas": rechazadas,
            "conversion_pct": round((aceptadas / interacciones) * 100, 1) if interacciones else None,
            "friccion_pct": round((rechazadas / interacciones) * 100, 1) if interacciones else None,
            "meta_ventas": meta,
            "cumplido": ventas >= meta,
            "progreso": round((ventas / meta) * 100) if meta else 0,
        })
    rows.sort(key=lambda r: -r["ventas"])
    return {"mes": month_start.strftime("%Y-%m"), "meta_ventas": meta, "asesores": rows}


# ---------- Segmentación IA (dashboard supervisor) ----------
SEGMENTOS_DEF = [
    ("movistar_total", "Movistar Total", "Clientes listos para la oferta estrella MT"),
    ("upgrade", "Upgrade", "Clientes para mejora de plan movil"),
    ("equipo", "Equipo", "Clientes para renovacion/venta de equipo"),
    ("plan_hogar", "Plan Hogar", "Clientes para internet / TV / fija"),
]


@router.get("/segmentos")
def get_segmentos(db: Session = Depends(get_db), _user=Depends(require_permission("view_funnel"))):
    """Segmentacion IA de la base: clientes elegibles por tipo de oferta.

    En Postgres (produccion) cuenta las 4 elegibilidades en un solo query sobre
    el JSON del perfil (evita escanear 100k perfiles por lotes de red). En
    SQLite (tests) barre los perfiles por lotes de forma portable.
    """
    from sqlalchemy import func

    counts = {key: 0 for key, _, _ in SEGMENTOS_DEF}
    base = db.query(func.count(models.Client.id)).scalar() or 0

    if db.get_bind().dialect.name == "postgresql":
        try:
            from sqlalchemy import text
            cols = ", ".join(
                f"count(*) FILTER (WHERE (profile -> 'elegibilidad' ->> '{key}') = 'true') AS {key}"
                for key in counts
            )
            row = db.execute(text(f"SELECT {cols} FROM clients")).one()
            counts = {key: int(row._mapping[key] or 0) for key in counts}
        except Exception:
            counts = _count_segmentos_portable(db, {key: 0 for key, _, _ in SEGMENTOS_DEF})
    else:
        counts = _count_segmentos_portable(db, counts)

    segmentos = [
        {
            "key": key,
            "label": label,
            "descripcion": desc,
            "count": counts[key],
            "pct": round((counts[key] / base) * 100, 1) if base else 0,
            "potencial_soles": round(counts[key] * 22.3, 2),
        }
        for key, label, desc in SEGMENTOS_DEF
    ]
    return {"base": base, "segmentos": segmentos}


def _count_segmentos_portable(db, counts):
    """Barrido por lotes de los perfiles (portable SQLite/Postgres)."""
    last_id = None
    while True:
        q = db.query(models.Client.id, models.Client.profile).order_by(models.Client.id)
        if last_id:
            q = q.filter(models.Client.id > last_id)
        rows = q.limit(2000).all()
        if not rows:
            break
        for _, profile in rows:
            elig = (profile or {}).get("elegibilidad", {})
            for key in counts:
                if elig.get(key):
                    counts[key] += 1
        last_id = rows[-1][0]
    return counts


# ---------------------------------------------------------------------------
# Mapa de calor: clientes sin Movistar Total por nivel geografico
# ---------------------------------------------------------------------------

@router.get("/heatmap")
def get_heatmap(
    nivel: str = Query("departamento", pattern="^(departamento|provincia|distrito)$"),
    parent_name: str | None = Query(None),
    db: Session = Depends(get_db),
    _user=Depends(require_permission("view_funnel")),
):
    """Agrega clientes por nivel geografico con conteo de sin Movistar Total.

    nivel: 'departamento', 'provincia' o 'distrito'
    parent_name: nombre del padre para filtrar (ej. nombre del depto al ver provincias)

    En Postgres (produccion Neon) se usa un unico query JSON sobre la columna
    profile para evitar escanear 100k perfiles en Python (timeout por SSL).
    En SQLite (tests) se usa el barrido portable por lotes.
    """
    from app.data.peru_geography import (
        DEPARTAMENTOS, PROVINCIAS, DISTRITOS,
        normalizar as norm_geo,
    )

    if nivel == "departamento":
        GEO_KEY = "ubicacion_departamento"
        FALLBACK_KEY = "distrito"
        PARENT_KEY = None
    elif nivel == "provincia":
        GEO_KEY = "ubicacion_provincia"
        FALLBACK_KEY = None
        PARENT_KEY = "ubicacion_departamento"
    else:
        GEO_KEY = "ubicacion_distrito"
        FALLBACK_KEY = "distrito"
        PARENT_KEY = "ubicacion_provincia"

    norm_map = {}
    if nivel == "departamento":
        norm_map = {norm_geo(d["nombre"]): (d["id"], d["nombre"]) for d in DEPARTAMENTOS}
    elif nivel == "provincia":
        norm_map = {norm_geo(p["nombre"]): (p["id"], p["nombre"]) for p in PROVINCIAS}
    else:
        norm_map = {norm_geo(d["nombre"]): (d["id"], d["nombre"]) for d in DISTRITOS}

    norm_parent = norm_geo(parent_name) if parent_name else None
    counts = {}

    if db.get_bind().dialect.name == "postgresql":
        try:
            from sqlalchemy import text
            col = f"profile ->> '{GEO_KEY}'"
            fallback_col = f"profile ->> '{FALLBACK_KEY}'" if FALLBACK_KEY else col
            agg_col = f"COALESCE({col}, {fallback_col})" if FALLBACK_KEY else col

            q = text(f"""
                SELECT
                    {agg_col} AS geo_name,
                    count(*) AS total,
                    count(*) FILTER (WHERE NOT (profile -> 'elegibilidad' ->> 'movistar_total')::boolean) AS sin_mt
                FROM clients
                WHERE {agg_col} IS NOT NULL AND {agg_col} != ''
                GROUP BY {agg_col}
            """)

            for row in db.execute(q).fetchall():
                raw_name = str(row[0]).strip()
                nkey = norm_geo(raw_name)
                if nkey in norm_map:
                    geo_id, display_name = norm_map[nkey]
                    if nkey in counts:
                        counts[nkey]["total"] += row[1]
                        counts[nkey]["sin_mt"] += row[2]
                    else:
                        counts[nkey] = {"total": row[1], "sin_mt": row[2], "raw_name": display_name}

            if norm_parent and PARENT_KEY:
                from app.data.peru_geography import (
                    NORM_PROV_TO_DEPTO, NORM_DIST_TO_PROV,
                )
                parent_members: set[str] = set()
                if nivel == "provincia":
                    for pn, dept in NORM_PROV_TO_DEPTO.items():
                        if norm_geo(dept["nombre"]) == norm_parent:
                            parent_members.add(pn)
                elif nivel == "distrito":
                    for dn, prov in NORM_DIST_TO_PROV.items():
                        if norm_geo(prov["nombre"]) == norm_parent:
                            parent_members.add(dn)
                counts = {k: v for k, v in counts.items() if k in parent_members}

            items = [
                {"id": geo_id, "descripcion": d["raw_name"],
                 "totalClientes": d["total"], "clientesSinMovistarTotal": d["sin_mt"]}
                for nkey, d in counts.items()
                if (geo_id := norm_map[nkey][0]) is not None
            ]
            return {"items": items}
        except Exception:
            pass  # fall through to portable

    # Portable fallback (SQLite / tests): barrido por lotes
    from app.data.peru_geography import (
        NORM_DIST_TO_DEPTO, NORM_DIST_TO_PROV, NORM_PROV_TO_DEPTO,
    )

    last_id = None
    while True:
        q = db.query(models.Client.id, models.Client.profile).order_by(models.Client.id)
        if last_id:
            q = q.filter(models.Client.id > last_id)
        rows = q.limit(2000).all()
        if not rows:
            break
        for _, profile in rows:
            p = profile or {}
            elig = p.get("elegibilidad", {})
            has_mt = bool(elig.get("movistar_total"))

            raw_dept = p.get("ubicacion_departamento")
            raw_prov = p.get("ubicacion_provincia")
            raw_dist = p.get("ubicacion_distrito") or p.get("distrito")

            dept_name = str(raw_dept).strip() if raw_dept else None
            prov_name = str(raw_prov).strip() if raw_prov else None
            dist_name = str(raw_dist).strip() if raw_dist else None

            if dist_name and not dept_name:
                nd = norm_geo(dist_name)
                pd = NORM_DIST_TO_DEPTO.get(nd)
                if pd:
                    dept_name = pd["nombre"]
                pp = NORM_DIST_TO_PROV.get(nd)
                if pp:
                    prov_name = pp["nombre"]
                if not dept_name:
                    pdp = NORM_PROV_TO_DEPTO.get(nd)
                    if pdp:
                        dept_name = pdp["nombre"]
                        if not prov_name:
                            prov_name = dist_name

            if prov_name and not dept_name:
                pdp = NORM_PROV_TO_DEPTO.get(norm_geo(prov_name))
                if pdp:
                    dept_name = pdp["nombre"]

            if norm_parent:
                if nivel == "provincia" and dept_name:
                    if norm_geo(dept_name) != norm_parent:
                        continue
                elif nivel == "distrito" and prov_name:
                    if norm_geo(prov_name) != norm_parent:
                        continue

            geo_value = None
            if nivel == "departamento" and dept_name:
                geo_value = dept_name
            elif nivel == "provincia" and prov_name:
                geo_value = prov_name
            elif nivel == "distrito" and dist_name:
                geo_value = dist_name

            if geo_value:
                nkey = norm_geo(geo_value)
                entry = counts.setdefault(nkey, {"total": 0, "sin_mt": 0, "raw_name": geo_value})
                entry["total"] += 1
                if not has_mt:
                    entry["sin_mt"] += 1
        last_id = rows[-1][0]

    items = []
    for nkey, data in counts.items():
        if nkey in norm_map:
            geo_id = norm_map[nkey][0]
            items.append({
                "id": geo_id, "descripcion": data["raw_name"],
                "totalClientes": data["total"], "clientesSinMovistarTotal": data["sin_mt"],
            })
    return {"items": items}
