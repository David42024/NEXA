from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas
from app.security import require_permission, get_current_user
from app.services import speech_engine
from app.services.config_service import log_event

router = APIRouter(prefix="/api/speech", tags=["speech"])


@router.post("/generate", response_model=schemas.SpeechResponse)
async def generate_speech(
    payload: schemas.SpeechRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    _user=Depends(require_permission("view_speech")),
):
    client = db.query(models.Client).filter(models.Client.id == payload.client_id).first()
    cliente_nombre = client.name.split()[0] if client and client.name else "cliente"

    # Contexto real del cliente (si existe) para que el speech argumente con
    # datos del perfil (departamento, edad, consumo, mora, facturacion) y no con
    # texto generico.
    contexto = {}
    if client:
        p = client.profile or {}
        contexto = {
            "departamento": p.get("ubicacion_departamento") or p.get("distrito"),
            "edad_rango": (p.get("servicio") or {}).get("edad_rango"),
            "datos_gb": (p.get("consumo") or {}).get("datos_gb"),
            "dias_agotamiento": (p.get("consumo") or {}).get("dias_agotamiento_datos_promedio"),
            "voz_minutos": (p.get("consumo") or {}).get("voz_minutos"),
            "sms": (p.get("consumo") or {}).get("sms"),
            "app_uso": (p.get("consumo") or {}).get("app_uso"),
            "monto_facturado": (p.get("facturacion") or {}).get("monto_facturado_prom")
            or (p.get("facturacion") or {}).get("monto_promedio_6m"),
            "metodo_pago": (p.get("facturacion") or {}).get("metodo_pago_frecuente"),
            "n_reclamos": (p.get("comportamiento") or {}).get("n_reclamos")
            or (p.get("comportamiento") or {}).get("reclamos_12m"),
            "dias_mora": (p.get("facturacion") or {}).get("dias_mora_prom"),
            "tiene_internet": (p.get("hogar") or {}).get("tiene_internet"),
        }

    engine_payload = {
        "cliente_nombre": cliente_nombre,
        "oferta": payload.offer,
        "probabilidad": round(payload.probabilidad * 100) if payload.probabilidad <= 1 else payload.probabilidad,
        "razones": payload.razones,
        "beneficio": payload.beneficio,
        "tono": payload.tono,
        "canal": payload.canal,
        "contexto_cliente": contexto,
    }

    result = await speech_engine.generate_speech_variants(engine_payload)

    # Bitacora: fallo de IA generativa cuando no se pudo usar Groq
    if result["source"] != "groq":
        log_event(
            db,
            "ai_generative_failure",
            f"Generacion de speech con source='{result['source']}' para oferta '{payload.offer}'",
            current_user.id,
        )
        db.commit()

    return schemas.SpeechResponse(
        client_id=payload.client_id,
        variantes=[schemas.SpeechVariant(**v) for v in result["variantes"]],
        source=result["source"],
    )
