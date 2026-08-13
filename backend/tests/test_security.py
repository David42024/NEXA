"""Tests de validacion de permisos (require_permission)."""
from tests.conftest import login, auth


def test_require_permission_bloquea_rol_sin_permiso(client):
    """El asesor no tiene view_funnel -> debe recibir 403."""
    c = client
    token = login(c, "asesor@nexa.demo", "asesor123")
    resp = c.get("/api/funnel/weekly", headers=auth(token))
    assert resp.status_code == 403
    assert "view_funnel" in resp.json()["detail"]


def test_require_permission_permite_rol_con_permiso(client):
    """El supervisor si tiene view_funnel -> 200."""
    c = client
    token = login(c, "supervisor@nexa.demo", "supervisor123")
    resp = c.get("/api/funnel/weekly", headers=auth(token))
    assert resp.status_code == 200


def test_require_permission_permite_all_permissions(client):
    """Admin tiene all_permissions -> accede a cualquier endpoint."""
    c = client
    token = login(c, "admin@nexa.demo", "admin123")
    resp = c.get("/api/funnel/weekly", headers=auth(token))
    assert resp.status_code == 200


def test_require_permission_sin_token_401(client):
    c = client
    resp = c.get("/api/funnel/weekly")
    assert resp.status_code == 401
