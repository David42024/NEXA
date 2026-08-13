"""Tests del flujo de autenticacion (login, /me, permisos por rol)."""
from tests.conftest import login, auth


def test_login_correcto(client):
    c = client
    resp = c.post("/api/auth/login", json={"email": "asesor@nexa.demo", "password": "asesor123"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["access_token"]
    assert body["token_type"] == "bearer"
    assert body["user"]["email"] == "asesor@nexa.demo"
    assert body["user"]["role"] == "asesor"


def test_login_credenciales_invalidas(client):
    c = client
    resp = c.post("/api/auth/login", json={"email": "asesor@nexa.demo", "password": "incorrecta"})
    assert resp.status_code == 401


def test_login_email_inexistente(client):
    c = client
    resp = c.post("/api/auth/login", json={"email": "nadie@nexa.demo", "password": "x"})
    assert resp.status_code == 401


def test_me_permisos_por_rol(client):
    c = client

    token_asesor = login(c, "asesor@nexa.demo", "asesor123")
    me = c.get("/api/auth/me", headers=auth(token_asesor))
    assert me.status_code == 200
    perms = me.json()["permissions"]
    assert "search_client" in perms
    assert "manage_roles" not in perms
    assert "all_permissions" not in perms

    token_admin = login(c, "admin@nexa.demo", "admin123")
    me = c.get("/api/auth/me", headers=auth(token_admin))
    assert me.status_code == 200
    assert me.json()["role"] == "admin"
    assert "all_permissions" in me.json()["permissions"]

    token_sup = login(c, "supervisor@nexa.demo", "supervisor123")
    me = c.get("/api/auth/me", headers=auth(token_sup))
    assert me.status_code == 200
    assert "view_funnel" in me.json()["permissions"]
    assert "export_reports" in me.json()["permissions"]


def test_me_sin_token_401(client):
    c = client
    resp = c.get("/api/auth/me")
    assert resp.status_code == 401


def test_me_token_invalido_401(client):
    c = client
    resp = c.get("/api/auth/me", headers=auth("token.invalido.xyz"))
    assert resp.status_code == 401
