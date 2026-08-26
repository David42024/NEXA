from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_
import re
import time
from datetime import datetime

from app.database import get_db
from app import models, schemas
from app.config import settings
from app.security import require_permission, require_any_permission, get_current_user
from app.services.funnel_service import mark_contacted
from app.services.nbo_engine import get_recommendations_for_client

router = APIRouter(prefix="/api/clients", tags=["clients"])

# IDs de cliente NEXA con formato como "C00001" (letra + 4+ digitos) o "CLI_000001"
ID_PATTERN = re.compile(r"^[A-Za-z]{1,5}_?\d{4,}$")

# Limite maximo de clientes que se puntuan en el listado. Con decenas/hundreds de
# miles de registros y un perfil JSON enorme por cliente, NO se puede recorrer toda
# la tabla: se puntua solo este subconjunto y se pagina sobre el (Neon free tier).
LIST_MAX_CLIENTS = 5000  # Aumentado para mostrar todos los clientes del asesor

# Hora local de Perú (sin horario de verano). Si no está disponible, usa la del servidor.
try:
    from zoneinfo import ZoneInfo
    _TZ = ZoneInfo("America/Lima")
except Exception:
    _TZ = None


def _mejor_hora(profile: dict) -> str | None:
    """Franja de mejor hora de contacto ('08:00-12:00'), o None si no se conoce."""
    consumo = profile.get("consumo") or {}
    return consumo.get("mejor_franja_horaria_contacto") or consumo.get("horario_pico")


def _now_hora() -> int:
    """Minuto del día actual en la zona horaria de Perú."""
    now = datetime.now(_TZ) if _TZ else datetime.now()
    return now.hour * 60 + now.minute


def _llamable_ahora(mejor_hora: str | None, now: int | None = None) -> bool:
    """True si `now` cae dentro de la franja 'HH:MM-HH:MM' (cruza medianoche incluida)."""
    if not mejor_hora or "-" not in mejor_hora:
        return False
    try:
        start_s, end_s = [part.strip() for part in mejor_hora.split("-")]

        def to_min(s):
            h, m = s.split(":")
            return int(h) * 60 + int(m)

        start, end = to_min(start_s), to_min(end_s)
    except Exception:
        return False
    t = now if now is not None else _now_hora()
    if start <= end:
        return start <= t <= end
    return t >= start or t <= end


def _has_missing_data(profile: dict) -> bool:
    for section in profile.values():
        if isinstance(section, dict):
            for k, v in section.items():
                if k.endswith("_missing") and v:
                    return True
    return False


def _is_elegible(profile: dict) -> bool:
    return bool(profile.get("elegibilidad", {}).get("movistar_total"))


def _plan_actual(profile: dict) -> str | None:
    """Plan móvil vigente del cliente (ej. 'Plan 69')."""
    return profile.get("servicio", {}).get("plan")


REASON_LABELS = {
    "elegibilidad_mt": "Elegible MT",
    "consumo_datos": "Alto consumo de datos",
    "internet_hogar": "Internet en hogar",
    "sin_internet_hogar": "Sin internet en hogar",
    "elegibilidad_upgrade": "Elegible upgrade",
    "elegibilidad_equipo": "Elegible equipo",
    "elegibilidad_hogar": "Elegible Plan Hogar",
    "antiguedad": "Cliente antiguo",
    "satisfaccion": "Buena satisfacción",
    "app_uso": "Alto uso de app",
}


def _nbo_top(client: models.Client):
    """Score (%) + oferta sugerida + motivo del cliente según el motor NBO.

    El "motivo" es el driver SHAP positivo más fuerte (el porqué de la
    recomendación), para que el asesor entienda el ranking de un vistazo.
    """
    recs = get_recommendations_for_client(client.id, client.profile)
    top = recs.get("recomendaciones", [])
    if not top:
        return 0, None, None
    shap = top[0].get("shap_values") or {}
    mejor = max(shap, key=shap.get) if shap else None
    motivo = REASON_LABELS.get(mejor) if mejor else None
    return round(top[0]["probabilidad"] * 100), top[0]["offer_name"], motivo


# Segmentos estratégicos (adaptados del reference gerencial).
SEGMENTOS = [
    ("Todos", "Todos"),
    ("Oro", "Oro Convergente"),
    ("Alerta", "Alerta Roja"),
    ("Gigas", "Hambrientos de Datos"),
    ("Digital", "Nativos Digitales"),
]

# Cache en memoria de la cartera puntuada por asesor. El score NBO depende solo
# del perfil (estático), así que paginar un segmento no vuelve a puntuar a los
# ~1k clientes en cada request: la primera petición puntúa y las siguientes
# páginas reusan el mismo orden. Se desactiva en tests para que sigan
# deterministas (cada test usa su propia BD en memoria).
_CARTERA_CACHE: dict = {}
_CARTERA_CACHE_TTL = 300
_CARTERA_CACHE_MAX = 50


def segmento_cliente(profile: dict) -> str | None:
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


def cartera_puntuada(db: Session, asesor_id: int) -> list:
    """Cartera completa del asesor puntuada (NBO) y ordenada por score desc."""
    if settings.ENVIRONMENT != "test":
        now = time.time()
        hit = _CARTERA_CACHE.get(asesor_id)
        if hit and now - hit[0] < _CARTERA_CACHE_TTL:
            return hit[1]

    cartera = (
        db.query(models.Client)
        .filter(models.Client.asesor_id == asesor_id)
        .all()
    )
    clientes = []
    for c in cartera:
        mejor_hora = _mejor_hora(c.profile)
        score, top_offer, motivo = _nbo_top(c)
        clientes.append(schemas.ClientSummary(
            id=c.id,
            name=c.name,
            district=c.district,
            segmento=segmento_cliente(c.profile),
            elegible=_is_elegible(c.profile),
            score=score,
            top_offer=top_offer,
            motivo=motivo,
            plan_actual=_plan_actual(c.profile),
            mejor_hora=mejor_hora,
            llamable_ahora=_llamable_ahora(mejor_hora),
        ))
    clientes.sort(key=lambda s: s.score, reverse=True)

    if settings.ENVIRONMENT != "test":
        if len(_CARTERA_CACHE) >= _CARTERA_CACHE_MAX:
            _CARTERA_CACHE.pop(next(iter(_CARTERA_CACHE)))
        _CARTERA_CACHE[asesor_id] = (time.time(), clientes)
    return clientes


@router.get("/search", response_model=schemas.ClientSearchResult)
def search_clients(
    q: str = Query(..., min_length=1),
    solo_ahora: bool = Query(False),
    db: Session = Depends(get_db),
    _user=Depends(require_any_permission("search_client", "view_all_clients")),
):
    """Busca por ID (principal), nombre (autocomplete) o documento (alternativo).

    Devuelve flags para distinguir un match exacto por ID de meras sugerencias
    (spec 10.5): el frontend muestra un modal de confirmacion cuando el usuario
    teclea un ID que no existe exactamente pero hay coincidencias parciales.
    Con `solo_ahora=true` filtra los clientes cuya mejor hora de contacto
    incluye el momento actual (para que el call center llame solo cuando puede).
    """
    is_id_query = bool(ID_PATTERN.match(q))
    exact_match = db.query(models.Client.id).filter(models.Client.id == q).first() is not None

    query = db.query(models.Client).filter(
        or_(
            models.Client.id.ilike(f"%{q}%"),
            models.Client.name.ilike(f"%{q}%"),
            models.Client.document_last4.ilike(f"%{q}%"),
        )
    ).limit(10)
    results = query.all()
    scored = []
    for c in results:
        score, top_offer, motivo = _nbo_top(c)
        mejor_hora = _mejor_hora(c.profile)
        scored.append(schemas.ClientSummary(
            id=c.id,
            name=c.name,
            district=c.district,
            elegible=_is_elegible(c.profile),
            score=score,
            top_offer=top_offer,
            motivo=motivo,
            plan_actual=_plan_actual(c.profile),
            mejor_hora=mejor_hora,
            llamable_ahora=_llamable_ahora(mejor_hora),
        ))
    # El orden ES la recomendacion para el asesor: priorizar por score descendente.
    scored.sort(key=lambda s: s.score, reverse=True)
    if solo_ahora:
        scored = [s for s in scored if s.llamable_ahora]
    return schemas.ClientSearchResult(
        results=scored,
        exact_match=exact_match,
        is_id_query=is_id_query,
    )


@router.get("", response_model=schemas.ClientListResponse)
def list_clients(
    segmento: str = Query("Todos"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    solo_ahora: bool = Query(False),
    db: Session = Depends(get_db),
    current_user=Depends(require_any_permission("search_client", "view_all_clients")),
):
    """Lista paginada de clientes ordenados por probabilidad NBO (descendente).

    Si el usuario tiene cartera asignada (asesor) la lista se acota a SU cartera
    y los conteos de segmentos (chips) cubren toda la cartera (reusa la cache de
    puntuación, los scores solo dependen del perfil). Para usuarios sin cartera
    (admin/supervisor) el barrido queda acotado a LIST_MAX_CLIENTS clientes (por
    id): no se recorre ni se carga toda la tabla (perfiles JSON enormes), se
    puntúan solo esos y se pagina sobre ese subconjunto.

    El orden ES la recomendacion para el asesor: el cliente con la mejor oferta
    de mayor probabilidad aparece primero. Con `solo_ahora=true` se limita a los
    clientes cuya mejor hora de contacto incluye el momento actual. `segmento`
    filtra por chip estratégico (Oro/Alerta/Gigas/Digital).
    """
    tiene_cartera = (
        db.query(models.Client.id)
        .filter(models.Client.asesor_id == current_user.id)
        .limit(1)
        .first()
        is not None
    )

    if tiene_cartera:
        scored = cartera_puntuada(db, current_user.id)
        if solo_ahora:
            scored = [s for s in scored if s.llamable_ahora]
    else:
        clients = db.query(models.Client).order_by(models.Client.id).limit(LIST_MAX_CLIENTS).all()
        scored = []
        for c in clients:
            mejor_hora = _mejor_hora(c.profile)
            llamable = _llamable_ahora(mejor_hora)
            if solo_ahora and not llamable:
                continue
            score, top_offer, motivo = _nbo_top(c)
            scored.append(schemas.ClientSummary(
                id=c.id,
                name=c.name,
                district=c.district,
                segmento=segmento_cliente(c.profile),
                elegible=_is_elegible(c.profile),
                score=score,
                top_offer=top_offer,
                motivo=motivo,
                plan_actual=_plan_actual(c.profile),
                mejor_hora=mejor_hora,
                llamable_ahora=llamable,
            ))
        scored.sort(key=lambda s: s.score, reverse=True)

    counts = {sid: 0 for sid, _label in SEGMENTOS if sid != "Todos"}
    for s in scored:
        if s.segmento:
            counts[s.segmento] = counts.get(s.segmento, 0) + 1
    counts["Todos"] = len(scored)

    filtrados = [s for s in scored if segmento == "Todos" or s.segmento == segmento]
    total = len(filtrados)
    start = (page - 1) * page_size
    items = filtrados[start:start + page_size]
    segmentos = [
        schemas.SegmentoCount(id=sid, label=label, count=counts[sid])
        for sid, label in SEGMENTOS
    ]
    return schemas.ClientListResponse(
        total=total, page=page, page_size=page_size, results=items, segmentos=segmentos
    )


@router.get("/{client_id}", response_model=schemas.ClientProfileResponse)
def get_client(
    client_id: str,
    db: Session = Depends(get_db),
    _user=Depends(require_permission("view_client_profile")),
):
    client = db.query(models.Client).filter(models.Client.id == client_id).first()
    if not client:
        # 10.2 / manejo de cliente no encontrado -> no crear cliente automaticamente
        raise HTTPException(
            status_code=404,
            detail="No se encontró cliente con ese ID. Verifique el ID o busque por nombre.",
        )
    # Tracking real del funnel: abrir el perfil del cliente tras una busqueda
    # exitosa cuenta como "contactado" (una vez por cliente por dia).
    mark_contacted(db, client_id)
    db.commit()
    return schemas.ClientProfileResponse(
        id=client.id,
        name=client.name,
        district=client.district,
        document_last4=client.document_last4,
        phone_last4=client.phone_last4,
        profile=client.profile,
        data_completeness_warning=_has_missing_data(client.profile),
    )


@router.post("/{client_id}/request-data", response_model=schemas.DataRequestResponse)
def request_client_data(
    client_id: str,
    payload: schemas.DataRequestSubmit,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Spec 10.3: el asesor solicita mas datos del cliente cuando el perfil esta incompleto."""
    client = db.query(models.Client).filter(models.Client.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="No se encontró cliente con ese ID")

    req = models.DataRequest(
        client_id=client_id,
        asesor_id=current_user.id,
        campos_solicitados=payload.campos_solicitados,
        notas=payload.notas,
    )
    db.add(req)
    db.commit()
    db.refresh(req)
    return schemas.DataRequestResponse(detail="Solicitud de datos registrada", request_id=req.id)


@router.get("/{client_id}/history")
def get_client_history(
    client_id: str,
    db: Session = Depends(get_db),
    _user=Depends(require_permission("view_client_profile")),
):
    client = db.query(models.Client).filter(models.Client.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="No se encontró cliente con ese ID")
    historial = client.profile.get("historial_ofertas", [])
    if not historial:
        return {"historial": [], "message": "No hay ofertas previas registradas"}
    return {"historial": historial}
