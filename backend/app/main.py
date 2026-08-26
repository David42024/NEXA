import time
import logging
from collections import defaultdict, deque

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import inspect

from app.config import settings
from app.database import engine, SessionLocal
from app.api import auth, clients, recommendations, speech, interactions, feedback, funnel, admin, e2e, live, nexabot, calls, asesor, tts, incidents, chat_channel, twilio
from app.services.config_service import ensure_default_config
from app.seed_data import backfill_reclamos, backfill_canales, backfill_campania_ofertas, backfill_asesor_cartera, backfill_geographic_fields

logging.basicConfig(level=logging.INFO)

# Fail-fast: fuera de demo, JWT_SECRET no puede ser el valor por defecto.
DEFAULT_JWT_SECRET = "change_this_secret_in_production"
if settings.ENVIRONMENT != "demo" and (
    not settings.JWT_SECRET or settings.JWT_SECRET == DEFAULT_JWT_SECRET
):
    raise RuntimeError(
        "JWT_SECRET no esta configurado. Defina una clave secreta segura en el entorno "
        "(p.ej. `openssl rand -hex 32`) antes de arrancar en modo no-demo."
    )


def _init_config():
    """Siembra la configuracion por defecto (umbrales) en la tabla app_config.

    Si el esquema no esta migrado en esta BD (p.ej. tests con SQLite en memoria),
    no falla al importar: el esquema se gestiona con `alembic upgrade head`.
    """
    if not inspect(engine).has_table("app_config"):
        logging.warning("Esquema no migrado; se omite el seed de config. Ejecute: alembic upgrade head")
        return
    db = SessionLocal()
    try:
        ensure_default_config(db)
    finally:
        db.close()


_init_config()


def _backfill_reclamos():
    """Agrega el historial de reclamos (fecha/motivo) a perfiles sembrados antes
    de que existiera ese campo. Idempotente; en tests (SQLite en memoria sin
    tablas) no hace nada.
    """
    if not inspect(engine).has_table("clients"):
        return
    db = SessionLocal()
    try:
        n = backfill_reclamos(db)
        if n:
            logging.info("Backfill de historial de reclamos: %d cliente(s) actualizado(s)", n)
    finally:
        db.close()


def _backfill_comportamiento():
    """Normaliza canales legacy (Digital/Call Center/Tienda) a los medios de
    contacto reales (WhatsApp/Llamada/App) y agrega el plan objetivo de cada
    campana del timeline. Idempotente.
    """
    if not inspect(engine).has_table("clients"):
        return
    db = SessionLocal()
    try:
        n1 = backfill_canales(db)
        if n1:
            logging.info("Backfill de canales: %d cliente(s) actualizado(s)", n1)
        n2 = backfill_campania_ofertas(db)
        if n2:
            logging.info("Backfill de ofertas por campana: %d cliente(s) actualizado(s)", n2)
    finally:
        db.close()


_backfill_reclamos()
_backfill_comportamiento()


def _backfill_asesor_cartera():
    """Asigna clientes sin asesor_id a un asesor demo (backfill para BDs existentes)."""
    if not inspect(engine).has_table("clients"):
        return
    db = SessionLocal()
    try:
        n = backfill_asesor_cartera(db)
        if n:
            logging.info("Backfill de cartera asesor: %d cliente(s) asignado(s)", n)
    finally:
        db.close()


_backfill_asesor_cartera()


def _backfill_geographic_fields():
    """Agrega ubicacion_departamento/provincia/distrito a perfiles que solo
    tienen el campo 'distrito' (datos demo antiguos). Idempotente.
    """
    if not inspect(engine).has_table("clients"):
        return
    db = SessionLocal()
    try:
        n = backfill_geographic_fields(db)
        if n:
            logging.info("Backfill de campos geograficos: %d cliente(s) actualizado(s)", n)
    finally:
        db.close()


_backfill_geographic_fields()

app = FastAPI(
    title="NEXA API",
    description="Next Experience & Offer AI - Sistema de recomendacion de ofertas para asesores comerciales",
    version="1.0.0-mvp",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Rate limiting simple en memoria (por IP + ruta, ver config) ---
# El bucket es por (IP, ruta): una rafaga de refrescos en un endpoint no bloquea
# el resto (evita que un pico en /api/funnel/daily tumbe tambien el login).
_request_log = defaultdict(deque)


@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    ip = request.client.host if request.client else "unknown"
    path = request.url.path
    # El polling de mensajes del chat (cliente + asesor sobre la misma ruta)
    # equivale a trafico WebSocket: no se cuenta en el bucket, o dos ventanas
    # abiertas agotan el limite y se corta la conversacion con 429.
    if request.method == "GET" and path.startswith("/api/chats/") and path.endswith("/messages"):
        return await call_next(request)
    now = time.time()
    key = f"{ip}:{path}"
    window = _request_log[key]
    while window and now - window[0] > 60:
        window.popleft()
    if len(window) >= settings.RATE_LIMIT_PER_MINUTE:
        return JSONResponse(status_code=429, content={"detail": "Demasiadas solicitudes. Intente en unos segundos."})
    window.append(now)
    return await call_next(request)


app.include_router(auth.router)
app.include_router(clients.router)
app.include_router(recommendations.router)
app.include_router(speech.router)
app.include_router(interactions.router)
app.include_router(feedback.router)
app.include_router(funnel.router)
app.include_router(e2e.router)
app.include_router(live.router)
app.include_router(nexabot.router)
app.include_router(calls.router)
app.include_router(asesor.router)
app.include_router(admin.router)
app.include_router(incidents.router)
app.include_router(chat_channel.router)
app.include_router(tts.router)
app.include_router(twilio.router)


@app.get("/")
def root():
    return {"service": "NEXA API", "status": "ok", "environment": settings.ENVIRONMENT}


@app.get("/health")
def health():
    return {"status": "healthy"}
