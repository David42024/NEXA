from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_
import re

from app.database import get_db
from app import models, schemas
from app.security import require_permission, require_any_permission, get_current_user
from app.services.funnel_service import mark_contacted
from app.services.nbo_engine import get_recommendations_for_client

router = APIRouter(prefix="/api/clients", tags=["clients"])

# IDs de cliente NEXA con formato como "C00001" (letra + 4+ digitos)
ID_PATTERN = re.compile(r"^[A-Za-z]\d{4,}$")


def _has_missing_data(profile: dict) -> bool:
    for section in profile.values():
        if isinstance(section, dict):
            for k, v in section.items():
                if k.endswith("_missing") and v:
                    return True
    return False


def _is_elegible(profile: dict) -> bool:
    return bool(profile.get("elegibilidad", {}).get("movistar_total"))


def _nbo_probability(client: models.Client) -> int:
    """Probabilidad (%) de la mejor oferta del cliente, calculada por el motor NBO."""
    recs = get_recommendations_for_client(client.id, client.profile)
    top = recs.get("recomendaciones", [])
    if not top:
        return 0
    return round(top[0]["probabilidad"] * 100)


@router.get("/search", response_model=schemas.ClientSearchResult)
def search_clients(
    q: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
    _user=Depends(require_any_permission("search_client", "view_all_clients")),
):
    """Busca por ID (principal), nombre (autocomplete) o documento (alternativo).

    Devuelve flags para distinguir un match exacto por ID de meras sugerencias
    (spec 10.5): el frontend muestra un modal de confirmacion cuando el usuario
    teclea un ID que no existe exactamente pero hay coincidencias parciales.
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
    scored = [
        schemas.ClientSummary(
            id=c.id,
            name=c.name,
            district=c.district,
            elegible=_is_elegible(c.profile),
            score=_nbo_probability(c),
        )
        for c in results
    ]
    # El orden ES la recomendacion para el asesor: priorizar por score descendente.
    scored.sort(key=lambda s: s.score, reverse=True)
    return schemas.ClientSearchResult(
        results=scored,
        exact_match=exact_match,
        is_id_query=is_id_query,
    )


@router.get("", response_model=schemas.ClientListResponse)
def list_clients(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    _user=Depends(require_any_permission("search_client", "view_all_clients")),
):
    """Lista paginada de clientes ordenados por probabilidad NBO (descendente).

    El orden ES la recomendacion para el asesor: el cliente con la mejor oferta
    de mayor probabilidad aparece primero.
    """
    clients = db.query(models.Client).order_by(models.Client.id).all()
    scored = [
        schemas.ClientSummary(
            id=c.id,
            name=c.name,
            district=c.district,
            elegible=_is_elegible(c.profile),
            score=_nbo_probability(c),
        )
        for c in clients
    ]
    scored.sort(key=lambda s: s.score, reverse=True)
    total = len(scored)
    start = (page - 1) * page_size
    items = scored[start:start + page_size]
    return schemas.ClientListResponse(total=total, page=page, page_size=page_size, results=items)


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
