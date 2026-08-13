import time
import logging
from collections import defaultdict, deque

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import inspect

from app.config import settings
from app.database import engine, SessionLocal
from app.api import auth, clients, recommendations, speech, interactions, feedback, funnel, admin
from app.services.config_service import ensure_default_config

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

# --- Rate limiting simple en memoria (50 req/min por IP) ---
_request_log = defaultdict(deque)


@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    ip = request.client.host if request.client else "unknown"
    now = time.time()
    window = _request_log[ip]
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
app.include_router(admin.router)


@app.get("/")
def root():
    return {"service": "NEXA API", "status": "ok", "environment": settings.ENVIRONMENT}


@app.get("/health")
def health():
    return {"status": "healthy"}
