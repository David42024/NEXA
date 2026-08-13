"""Tests de los endpoints administrativos nuevos (users, logs, thresholds, export)."""
import io
import csv

from tests.conftest import login, auth


def test_list_users(client):
    token = login(client, "admin@nexa.demo", "admin123")
    resp = client.get("/api/admin/users", headers=auth(token))
    assert resp.status_code == 200
    emails = [u["email"] for u in resp.json()]
    assert "asesor@nexa.demo" in emails
    assert "admin@nexa.demo" in emails
    # no debe exponer password_hash
    assert all("password_hash" not in u for u in resp.json())


def test_create_user_valida_email_unico(client):
    token = login(client, "admin@nexa.demo", "admin123")
    resp = client.post(
        "/api/admin/users",
        json={"email": "nuevo@nexa.demo", "password": "secret123", "role": "asesor", "name": "Nuevo Asesor"},
        headers=auth(token),
    )
    assert resp.status_code == 200
    assert resp.json()["email"] == "nuevo@nexa.demo"

    # Duplicado -> 409
    resp = client.post(
        "/api/admin/users",
        json={"email": "nuevo@nexa.demo", "password": "x", "role": "asesor"},
        headers=auth(token),
    )
    assert resp.status_code == 409
    assert "Ya existe un usuario con ese email" in resp.json()["detail"]

    # El nuevo usuario puede hacer login (password hasheado)
    resp = client.post("/api/auth/login", json={"email": "nuevo@nexa.demo", "password": "secret123"})
    assert resp.status_code == 200


def test_create_user_requiere_permiso(client):
    token = login(client, "asesor@nexa.demo", "asesor123")
    resp = client.post(
        "/api/admin/users",
        json={"email": "x@nexa.demo", "password": "x", "role": "asesor"},
        headers=auth(token),
    )
    assert resp.status_code == 403


def test_thresholds_get_y_put_persistente(client):
    admin_token = login(client, "admin@nexa.demo", "admin123")

    resp = client.get("/api/admin/thresholds", headers=auth(admin_token))
    assert resp.status_code == 200
    assert resp.json()["LOW_PROBABILITY_THRESHOLD"] == 0.5
    assert resp.json()["NOISE_PROBABILITY_THRESHOLD"] == 0.2

    resp = client.put(
        "/api/admin/thresholds",
        json={"low_probability": 0.60, "noise_probability": 0.15},
        headers=auth(admin_token),
    )
    assert resp.status_code == 200
    assert resp.json()["LOW_PROBABILITY_THRESHOLD"] == 0.6
    assert resp.json()["NOISE_PROBABILITY_THRESHOLD"] == 0.15


def test_thresholds_validacion_noise_menor_que_low(client):
    admin_token = login(client, "admin@nexa.demo", "admin123")
    resp = client.put(
        "/api/admin/thresholds",
        json={"low_probability": 0.2, "noise_probability": 0.5},
        headers=auth(admin_token),
    )
    assert resp.status_code == 422


def test_threshold_change_afecta_recomendaciones_en_caliente(client):
    """Cambiar el umbral bajo debe reflejarse en la siguiente recomendacion."""
    admin_token = login(client, "admin@nexa.demo", "admin123")
    asesor_token = login(client)

    # Cliente C00002: sus ofertas rondan 0.63-0.70. Con el umbral por defecto
    # (0.5) no hay warning; al subirlo a 0.95 todas quedan bajo el umbral.
    resp = client.post(
        "/api/recommendations/generate",
        json={"client_id": "C00002"},
        headers=auth(asesor_token),
    )
    assert resp.status_code == 200
    assert "Baja probabilidad" not in (resp.json()["warning"] or "")

    resp = client.put(
        "/api/admin/thresholds",
        json={"low_probability": 0.95},
        headers=auth(admin_token),
    )
    assert resp.status_code == 200

    resp = client.post(
        "/api/recommendations/generate",
        json={"client_id": "C00002"},
        headers=auth(asesor_token),
    )
    assert resp.status_code == 200
    assert resp.json()["warning"] is not None
    assert "Baja probabilidad" in resp.json()["warning"]


def test_thresholds_requiere_permiso(client):
    token = login(client)
    resp = client.get("/api/admin/thresholds", headers=auth(token))
    assert resp.status_code == 403


def test_system_logs_registran_login_y_cambios(client, session):
    admin_token = login(client, "admin@nexa.demo", "admin123")
    login(client)  # login asesor queda registrado
    client.post("/api/auth/login", json={"email": "asesor@nexa.demo", "password": "mal"})  # fallo

    # cambio de permisos
    resp = client.get("/api/admin/permissions", headers=auth(admin_token))
    perms = resp.json()["asesor"]["permissions"]
    client.put("/api/admin/permissions/asesor", json={"permissions": perms + ["view_funnel"]}, headers=auth(admin_token))

    resp = client.get("/api/admin/logs?n=50", headers=auth(admin_token))
    assert resp.status_code == 200
    logs = resp.json()
    types = [l["event_type"] for l in logs]
    assert "login" in types
    assert "login_failed" in types
    assert "permission_change" in types
    assert all("password_hash" not in l for l in logs)


def test_logs_requiere_permiso(client):
    token = login(client)
    resp = client.get("/api/admin/logs", headers=auth(token))
    assert resp.status_code == 403


def test_export_funnel_csv(client, session):
    from datetime import date, timedelta
    from app import models

    for d in range(3):
        day = date.today() - timedelta(days=d)
        session.add(models.FunnelDaily(
            date=day, analyzed=100, prioritized=60, contacted=50, offered=40,
            accepted=20, conversion_rate=20.0,
        ))
    session.commit()

    token = login(client, "supervisor@nexa.demo", "supervisor123")
    start = (date.today() - timedelta(days=10)).isoformat()
    end = date.today().isoformat()
    resp = client.get(f"/api/funnel/export?start={start}&end={end}", headers=auth(token))
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/csv")
    assert "attachment" in resp.headers["content-disposition"]

    rows = list(csv.reader(io.StringIO(resp.text)))
    assert rows[0] == ["date", "analyzed", "prioritized", "contacted", "offered", "accepted", "conversion_rate"]
    assert len(rows) >= 4  # header + 3 dias


def test_export_funnel_requiere_permiso(client):
    token = login(client)
    resp = client.get(f"/api/funnel/export?start=2025-01-01&end=2025-01-31", headers=auth(token))
    assert resp.status_code == 403