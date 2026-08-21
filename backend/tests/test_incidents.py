"""Tests del panel de incidencias del admin."""
from tests.conftest import login, auth


def _report(c, **overrides):
    payload = {
        "title": "El bot no responde en la llamada",
        "description": "Al iniciar la llamada el bot se queda mudo",
        "category": "sistema",
        "severity": "alta",
    }
    payload.update(overrides)
    return c.post("/api/incidents", json=payload, headers=auth(login(c)))


def test_reportar_incidencia_y_consultarla(client):
    resp = _report(client, client_id="C00001")
    assert resp.status_code == 201
    data = resp.json()
    assert data["status"] == "abierta"
    assert data["severity"] == "alta"
    assert data["category"] == "sistema"
    assert data["client_id"] == "C00001"
    assert data["reporter_name"]  # nombre de quien reporta
    assert data["created_at"]

    # El autor ve su reporte en /mine
    token = login(client)
    mine = client.get("/api/incidents/mine", headers=auth(token)).json()
    assert any(i["id"] == data["id"] for i in mine)


def test_validacion_de_reporte(client):
    h = auth(login(client))
    assert client.post("/api/incidents", json={"title": "   ", "category": "sistema", "severity": "media"}, headers=h).status_code == 422
    assert client.post("/api/incidents", json={"title": "x", "category": "voladora", "severity": "media"}, headers=h).status_code == 422
    assert client.post("/api/incidents", json={"title": "x", "category": "datos", "severity": "apocaliptica"}, headers=h).status_code == 422
    assert client.post("/api/incidents", json={"title": "x", "category": "cliente", "client_id": "NOPE99"}, headers=h).status_code == 404


def test_admin_lista_filtra_y_resuelve_incidencias(client):
    inc_a = _report(client).json()
    _report(client, title="Cliente cuelga al tercer tono", severity="critica", category="llamada")

    admin_h = auth(login(client, "admin@nexa.demo", "admin123"))

    listing = client.get("/api/admin/incidents", headers=admin_h)
    assert listing.status_code == 200
    body = listing.json()
    ids = [i["id"] for i in body["items"]]
    assert inc_a["id"] in ids
    assert body["stats"]["abiertas"] >= 2
    assert body["stats"]["criticas_abiertas"] >= 1

    # Filtro por severidad
    criticas = client.get("/api/admin/incidents?severity=critica", headers=admin_h).json()
    assert all(i["severity"] == "critica" for i in criticas["items"])
    # Filtro por estado (todas siguen abiertas)
    resueltas = client.get("/api/admin/incidents?status=resuelta", headers=admin_h).json()
    assert resueltas["items"] == []

    # Resolver con nota
    patch = client.patch(
        f"/api/admin/incidents/{inc_a['id']}",
        json={"status": "resuelta", "resolution_note": "Se reinicio el servicio de voz"},
        headers=admin_h,
    )
    assert patch.status_code == 200
    resolved = patch.json()
    assert resolved["status"] == "resuelta"
    assert resolved["resolved_at"]
    assert resolved["resolver_name"]
    assert resolved["resolution_note"] == "Se reinicio el servicio de voz"

    # Reabrir limpia la marca de resolucion
    reopened = client.patch(
        f"/api/admin/incidents/{inc_a['id']}", json={"status": "abierta"}, headers=admin_h
    ).json()
    assert reopened["status"] == "abierta"
    assert reopened["resolved_at"] is None


def test_asesor_no_puede_gestionar_panel_de_admin(client):
    data = _report(client).json()
    h = auth(login(client))
    assert client.get("/api/admin/incidents", headers=h).status_code == 403
    assert client.patch(f"/api/admin/incidents/{data['id']}", json={"status": "resuelta"}, headers=h).status_code == 403


def test_estado_invalido_rechazado(client):
    data = _report(client).json()
    admin_h = auth(login(client, "admin@nexa.demo", "admin123"))
    resp = client.patch(f"/api/admin/incidents/{data['id']}", json={"status": "pausada"}, headers=admin_h)
    assert resp.status_code == 422
    missing = client.patch("/api/admin/incidents/999999", json={"status": "resuelta"}, headers=admin_h)
    assert missing.status_code == 404


def test_autor_anexa_detalle_mientras_esta_abierta(client):
    data = _report(client).json()
    autor_h = auth(login(client))

    extra = client.patch(
        f"/api/incidents/{data['id']}",
        json={"resolution_note": "Ocurre solo con clientes de Lima"},
        headers=autor_h,
    )
    assert extra.status_code == 200
    assert "Lima" in extra.json()["description"]

    # Otro usuario no puede editar el reporte ajeno
    otro = auth(login(client, "supervisor@nexa.demo", "supervisor123"))
    assert (
        client.patch(
            f"/api/incidents/{data['id']}", json={"resolution_note": "x"}, headers=otro
        ).status_code
        == 403
    )
