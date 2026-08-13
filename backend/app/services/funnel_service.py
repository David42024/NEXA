"""
Tracking real del funnel.

Los counters diarios de funnel_daily.analyzed/prioritized/contacted existian solo
por el seed sintetico. Este modulo instrumenta las acciones reales del asesor:

- Contactar a un cliente (abrir su perfil tras una busqueda exitosa) -> contacted + 1
  (una sola vez por cliente por dia).
- Generar una recomendacion para un cliente elegible -> prioritized + 1
  (una sola vez por cliente por dia).

La tabla client_daily_activity guarda la marca de "ya contado" por (fecha, cliente).
"""
from datetime import date

from sqlalchemy.orm import Session

from app import models


def get_or_create_funnel_row(db: Session, day: date = None) -> models.FunnelDaily:
    day = day or date.today()
    funnel = db.query(models.FunnelDaily).filter(models.FunnelDaily.date == day).first()
    if not funnel:
        funnel = models.FunnelDaily(
            date=day, analyzed=0, prioritized=0, contacted=0,
            offered=0, accepted=0, conversion_rate=0,
        )
        db.add(funnel)
        db.flush()
    return funnel


def increment_funnel(db: Session, column: str, amount: int = 1, day: date = None) -> None:
    funnel = get_or_create_funnel_row(db, day)
    setattr(funnel, column, getattr(funnel, column, 0) + amount)


def _activity(db: Session, client_id: str, day: date) -> models.ClientDailyActivity:
    row = (
        db.query(models.ClientDailyActivity)
        .filter(
            models.ClientDailyActivity.date == day,
            models.ClientDailyActivity.client_id == client_id,
        )
        .first()
    )
    if not row:
        row = models.ClientDailyActivity(date=day, client_id=client_id, contacted=False, prioritized=False)
        db.add(row)
    return row


def mark_contacted(db: Session, client_id: str, day: date = None) -> bool:
    """Marca al cliente como contactado hoy. Devuelve True si es la primera vez."""
    day = day or date.today()
    row = _activity(db, client_id, day)
    if row.contacted:
        return False
    row.contacted = True
    increment_funnel(db, "contacted", 1, day)
    return True


def mark_prioritized(db: Session, client_id: str, day: date = None) -> bool:
    """Marca al cliente como priorizado hoy. Devuelve True si es la primera vez."""
    day = day or date.today()
    row = _activity(db, client_id, day)
    if row.prioritized:
        return False
    row.prioritized = True
    increment_funnel(db, "prioritized", 1, day)
    return True
