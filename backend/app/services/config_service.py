"""
Servicios de configuracion en caliente y bitacora de eventos.

- Umbrales del motor NBO (LOW_PROBABILITY_THRESHOLD, NOISE_PROBABILITY_THRESHOLD)
  persistidos en la tabla app_config para poder editarlos sin reiniciar.
- Bitacora de eventos relevantes (system_logs) para el panel de administracion.
"""
from sqlalchemy.orm import Session

from app import models
from app.config import settings

DEFAULT_THRESHOLDS = {
    "LOW_PROBABILITY_THRESHOLD": settings.LOW_PROBABILITY_THRESHOLD,
    "NOISE_PROBABILITY_THRESHOLD": settings.NOISE_PROBABILITY_THRESHOLD,
}


def ensure_default_config(db: Session) -> None:
    """Inserta los valores por defecto de config si la tabla esta vacia."""
    for key, value in DEFAULT_THRESHOLDS.items():
        existing = db.query(models.AppConfig).filter(models.AppConfig.key == key).first()
        if not existing:
            db.add(models.AppConfig(key=key, value=str(value)))
    db.commit()


def get_config(db: Session) -> dict:
    return {r.key: r.value for r in db.query(models.AppConfig).all()}


def get_thresholds(db: Session) -> dict:
    """Devuelve los umbrales actuales (desde DB si estan, si no por defecto)."""
    config = get_config(db)
    return {
        "low": float(config.get("LOW_PROBABILITY_THRESHOLD", DEFAULT_THRESHOLDS["LOW_PROBABILITY_THRESHOLD"])),
        "noise": float(config.get("NOISE_PROBABILITY_THRESHOLD", DEFAULT_THRESHOLDS["NOISE_PROBABILITY_THRESHOLD"])),
    }


def set_config_value(db: Session, key: str, value) -> None:
    row = db.query(models.AppConfig).filter(models.AppConfig.key == key).first()
    if not row:
        db.add(models.AppConfig(key=key, value=str(value)))
    else:
        row.value = str(value)


def log_event(db: Session, event_type: str, detail: str, user_id=None) -> models.SystemLog:
    """Registra un evento en system_logs (sin commit: lo hace el llamador)."""
    entry = models.SystemLog(event_type=event_type, user_id=user_id, detail=detail)
    db.add(entry)
    return entry
