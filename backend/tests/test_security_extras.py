"""Tests de seguridad: bloqueo de cuenta, refresh token y validacion de JWT_SECRET."""
import os
import subprocess
import sys

from tests.conftest import login, auth


def test_bloqueo_de_cuenta_tras_intentos_fallidos(client):
    c = client
    resp = None
    for _ in range(5):
        resp = c.post("/api/auth/login", json={"email": "asesor@nexa.demo", "password": "mal"})
        assert resp.status_code == 401

    # El 6to intento (aunque la contrasena sea correcta) debe estar bloqueado
    resp = c.post("/api/auth/login", json={"email": "asesor@nexa.demo", "password": "asesor123"})
    assert resp.status_code == 429
    assert "bloqueada temporalmente" in resp.json()["detail"]


def test_login_exitoso_limpia_intentos_fallidos(client):
    c = client
    for _ in range(3):
        c.post("/api/auth/login", json={"email": "asesor@nexa.demo", "password": "mal"})

    # Login correcto limpia el contador
    resp = c.post("/api/auth/login", json={"email": "asesor@nexa.demo", "password": "asesor123"})
    assert resp.status_code == 200

    # Ya no esta bloqueado
    for _ in range(4):
        resp = c.post("/api/auth/login", json={"email": "asesor@nexa.demo", "password": "mal"})
        assert resp.status_code == 401
    resp = c.post("/api/auth/login", json={"email": "asesor@nexa.demo", "password": "asesor123"})
    assert resp.status_code == 200


def test_refresh_token_renueva_access_token(client):
    c = client
    login_resp = c.post("/api/auth/login", json={"email": "asesor@nexa.demo", "password": "asesor123"})
    assert login_resp.status_code == 200
    refresh_token = login_resp.json()["refresh_token"]
    assert refresh_token

    resp = c.post("/api/auth/refresh", json={"refresh_token": refresh_token})
    assert resp.status_code == 200
    body = resp.json()
    assert body["access_token"]
    # El nuevo access token funciona en un endpoint protegido
    resp = c.get("/api/auth/me", headers=auth(body["access_token"]))
    assert resp.status_code == 200


def test_refresh_token_invalido_401(client):
    c = client
    resp = c.post("/api/auth/refresh", json={"refresh_token": "no.es.un.token"})
    assert resp.status_code == 401


def test_access_token_viejo_sigue_funcionando_y_es_distinto_del_refresh(client):
    c = client
    login_resp = c.post("/api/auth/login", json={"email": "asesor@nexa.demo", "password": "asesor123"})
    access = login_resp.json()["access_token"]
    refresh = login_resp.json()["refresh_token"]
    assert access != refresh


def test_arranque_rechaza_jwt_secret_por_defecto_fuera_de_demo():
    """main.py debe fallar explicitamente si JWT_SECRET es el default y no es demo."""
    backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    env = {
        **os.environ,
        "DATABASE_URL": "sqlite://",
        "ENVIRONMENT": "production",
        "JWT_SECRET": "change_this_secret_in_production",
    }
    result = subprocess.run(
        [sys.executable, "-c", "import app.main"],
        capture_output=True,
        text=True,
        env=env,
        cwd=backend_dir,
    )
    assert result.returncode != 0
    assert "JWT_SECRET" in result.stderr


def test_arranque_acepta_jwt_secret_propio_fuera_de_demo():
    backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    env = {
        **os.environ,
        "DATABASE_URL": "sqlite://",
        "ENVIRONMENT": "production",
        "JWT_SECRET": "una-clave-segura-generada-aleatoriamente-123456",
    }
    result = subprocess.run(
        [sys.executable, "-c", "import app.main; print('ok')"],
        capture_output=True,
        text=True,
        env=env,
        cwd=backend_dir,
    )
    assert result.returncode == 0, result.stderr


def test_cors_lee_origenes_desde_entorno():
    """El middleware CORS debe usar la lista de CORS_ALLOWED_ORIGINS (no hardcodear '*')."""
    from app.main import app as nexapp
    from app.config import settings

    cors = [m for m in nexapp.user_middleware if m.cls.__name__ == "CORSMiddleware"]
    assert cors, "CORSMiddleware no registrado"
    options = cors[0].kwargs
    assert options["allow_origins"] == settings.CORS_ALLOWED_ORIGINS
    assert isinstance(options["allow_origins"], list)
