import time
import logging
from collections import defaultdict, deque

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import inspect

from app.config import settings
from app.database import engine, SessionLocal
from app.api import auth, clients, recommendations, speech, interactions, feedback, funnel, admin, e2e, live, nexabot, calls, asesor, tts, incidents, chat_channel, twilio, supervisor
from app.services.config_service import ensure_default_config
from app.seed_data import backfill_reclamos, backfill_canales, backfill_campania_ofertas, backfill_asesor_cartera, ensure_demo_asesores

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


def _startup_backfills():
    """Run schema-dependent init and backfills in a single DB session.

    On Neon, each SessionLocal() opens a new SSL connection (~2s). By reusing
    a single session we cut cold-start from ~18s to ~5s.
    """
    db = SessionLocal()
    try:
        # 1) Config seed
        if inspect(engine).has_table("app_config"):
            ensure_default_config(db)
        else:
            logging.warning("Esquema no migrado; se omite el seed de config.")

        # 2) Client backfills (only for synthetic/demo clients, not CSV imports)
        if inspect(engine).has_table("clients"):
            from app import models
            ensure_demo_asesores(db)
            n4 = backfill_asesor_cartera(db)
            if n4:
                logging.info("Backfill cartera completado: %d clientes asignados", n4)
            has_synth = db.query(models.Client.id).filter(
                ~models.Client.id.like("CLI%")
            ).first() is not None
            if has_synth:
                n1 = backfill_reclamos(db)
                n2, n3 = backfill_canales(db), backfill_campania_ofertas(db)
                if any([n1, n2, n3]):
                    logging.info(
                        "Backfills completados: reclamos=%d canales=%d ofertas=%d",
                        n1, n2, n3,
                    )
            else:
                logging.info("No hay clientes sinteticos; backfills omitidos.")
    except Exception:
        logging.exception("Error en backfills de startup")
    finally:
        db.close()


_startup_backfills()

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
app.include_router(supervisor.router)


@app.get("/")
def root():
    return {"service": "NEXA API", "status": "ok", "environment": settings.ENVIRONMENT}


@app.get("/health")
def health():
    return {"status": "healthy"}
