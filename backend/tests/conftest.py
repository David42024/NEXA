"""
Fixtures compartidos de pytest para NEXA.

Configura un SQLite en memoria (StaticPool) por test, lo siembra con datos
minimos (usuarios, permisos, ofertas, clientes) y expone un TestClient de
FastAPI con el dependency `get_db` sobrescrito hacia esa BD.
"""
import os

# Debe fijarse ANTES de importar app.* para que el engine/seed de arranque
# no toque archivos ni dependa de credenciales del entorno real.
os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ.setdefault("ENVIRONMENT", "test")
os.environ.setdefault("JWT_SECRET", "test_secret_not_default")
os.environ.setdefault("RATE_LIMIT_PER_MINUTE", "100000")
os.environ.setdefault("CORS_ALLOWED_ORIGINS", "*")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app import models
from app.security import hash_password
from app.services.nbo_engine import OFFER_CATALOG
from app.services.config_service import ensure_default_config

ROLE_PERMISSIONS = {
    "asesor": [
        "view_dashboard", "search_client", "view_client_profile",
        "view_recommendation", "view_speech", "register_acceptance",
        "register_rejection", "copy_speech",
    ],
    "supervisor": [
        "view_dashboard", "view_funnel", "view_trends", "view_all_clients",
        "view_team_performance", "export_reports",
    ],
    "admin": [
        "all_permissions", "manage_users", "manage_roles",
        "view_system_logs", "configure_thresholds",
    ],
}

DEMO_USERS = [
    {"email": "asesor@nexa.demo", "password": "asesor123", "role": "asesor", "name": "Ana Torres"},
    {"email": "supervisor@nexa.demo", "password": "supervisor123", "role": "supervisor", "name": "Luis Ramirez"},
    {"email": "admin@nexa.demo", "password": "admin123", "role": "admin", "name": "Admin NEXA"},
]

DEMO_CLIENTS = [
    {
        "id": "C00001", "name": "Ana Maria Gomez", "document_last4": "1234",
        "phone_last4": "5678", "district": "Miraflores",
        "profile": {
            "servicio": {"tipo": "Postpago", "antiguedad_meses": 24},
            "consumo": {"datos_gb": 40, "app_uso": "Alto"},
            "hogar": {"tiene_internet": True},
            "elegibilidad": {"movistar_total": True, "upgrade": True, "equipo": True, "plan_hogar": False},
        },
    },
    {
        "id": "C00002", "name": "Carlos Perez", "document_last4": "4321",
        "phone_last4": "8765", "district": "Surco",
        "profile": {
            "servicio": {"tipo": "Postpago", "antiguedad_meses": 6},
            "consumo": {"datos_gb": 15, "app_uso": "Bajo"},
            "hogar": {"tiene_internet": False},
            "elegibilidad": {"movistar_total": False, "upgrade": True, "equipo": False, "plan_hogar": True},
        },
    },
    {
        "id": "C00003", "name": "Maria Lopez", "document_last4": "9999",
        "phone_last4": "1111", "district": "Lince",
        "profile": {
            "servicio": {"tipo": "Postpago", "antiguedad_meses": 2},
            "consumo": {"datos_gb": 5, "app_uso": "Bajo"},
            "hogar": {"tiene_internet": False},
            "elegibilidad": {"movistar_total": False, "upgrade": False, "equipo": False, "plan_hogar": False},
        },
    },
]


def seed(session):
    """Siembra datos minimos de prueba en una sesion."""
    ensure_default_config(session)
    for role, perms in ROLE_PERMISSIONS.items():
        session.add(models.Permission(
            role=role,
            permissions={"permissions": perms, "description": f"Rol {role}"},
        ))
    for u in DEMO_USERS:
        session.add(models.User(
            email=u["email"],
            password_hash=hash_password(u["password"]),
            role=u["role"],
            name=u["name"],
        ))
    for o in OFFER_CATALOG:
        session.add(models.Offer(
            name=o["name"], code=o["code"],
            description=f"Oferta {o['name']}", priority=o["priority"], active=True,
        ))
    for c in DEMO_CLIENTS:
        session.add(models.Client(**c))
    session.commit()


@pytest.fixture()
def db_engine():
    """Engine SQLite en memoria compartido (StaticPool) por test, ya sembrado."""
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    s = Session()
    seed(s)
    s.close()
    yield engine, Session
    engine.dispose()


@pytest.fixture()
def session(db_engine):
    """Sesion directa a la BD de prueba (para inspeccionar/alterar datos)."""
    engine, Session = db_engine
    s = Session()
    yield s
    s.close()


@pytest.fixture()
def client(db_engine):
    """TestClient de FastAPI con get_db sobrescrito hacia la BD de prueba.

    Cada request usa su propia sesion contra la misma BD en memoria (StaticPool).
    """
    engine, Session = db_engine

    def override_get_db():
        db = Session()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.pop(get_db, None)


def login(client, email="asesor@nexa.demo", password="asesor123"):
    resp = client.post("/api/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, f"Login fallo: {resp.text}"
    return resp.json()["access_token"]


def auth(token):
    return {"Authorization": f"Bearer {token}"}
