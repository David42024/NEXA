from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_
import re

from app.database import get_db
from app import models, schemas
from app.security import require_permission, require_any_permission, get_current_user
from app.services.funnel_service import mark_contacted

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


def _priority_score(profile: dict) -> int:
    """Score 0-100 proxy de prioridad NBO a partir de senales del perfil."""
    elig = profile.get("elegibilidad", {})
    score = sum(1 for v in elig.values() if v) * 20
    consumo = profile.get("consumo", {})
    if (consumo.get("datos_gb") or 0) >= 50:
        score += 10
    if profile.get("facturacion", {}).get("estado_pago") == "Pagado":
        score += 5
    if profile.get("comportamiento", {}).get("reclamos_12m", 1) == 0:
        score += 5
    return min(score, 100)


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
    return schemas.ClientSearchResult(
        results=[
            schemas.ClientSummary(
                id=c.id,
                name=c.name,
                district=c.district,
                elegible=_is_elegible(c.profile),
                score=_priority_score(c.profile),
            )
            for c in results
        ],
        exact_match=exact_match,
        is_id_query=is_id_query,
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
