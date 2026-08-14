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

# Metas comerciales en caliente: el admin las ajusta desde el panel (por defecto
# el asesor debe cerrar 3 ventas al dia, 15 a la semana y 60 al mes).
DEFAULT_METAS = {
    "META_VENTAS_DIARIA": 3,
    "META_VENTAS_SEMANAL": 15,
    "META_VENTAS_MENSUAL": 60,
}

DEFAULT_CONFIG = {**DEFAULT_THRESHOLDS, **DEFAULT_METAS}


def ensure_default_config(db: Session) -> None:
    """Inserta los valores por defecto de config si la tabla esta vacia."""
    for key, value in DEFAULT_CONFIG.items():
        existing = db.query(models.AppConfig).filter(models.AppConfig.key == key).first()
        if not existing:
            db.add(models.AppConfig(key=key, value=str(value)))
    db.commit()


def get_config(db: Session) -> dict:
    return {r.key: r.value for r in db.query(models.AppConfig).all()}


def get_metas(db: Session) -> dict:
    """Metas comerciales actuales (diaria, semanal y mensual) como enteros."""
    config = get_config(db)
    return {
        "META_VENTAS_DIARIA": int(float(config.get("META_VENTAS_DIARIA", DEFAULT_METAS["META_VENTAS_DIARIA"]))),
        "META_VENTAS_SEMANAL": int(float(config.get("META_VENTAS_SEMANAL", DEFAULT_METAS["META_VENTAS_SEMANAL"]))),
        "META_VENTAS_MENSUAL": int(float(config.get("META_VENTAS_MENSUAL", DEFAULT_METAS["META_VENTAS_MENSUAL"]))),
    }


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
