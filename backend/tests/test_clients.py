"""Tests del modulo de clientes (busqueda, perfil, historial)."""
from tests.conftest import login, auth


def test_busqueda_por_id_exacto(client):
    c = client
    token = login(c)
    resp = c.get("/api/clients/search?q=C00001", headers=auth(token))
    assert resp.status_code == 200
    body = resp.json()
    results = body["results"]
    assert any(r["id"] == "C00001" for r in results)
    assert body["exact_match"] is True
    assert body["is_id_query"] is True


def test_supervisor_puede_buscar_clientes(client):
    """Supervisor no tiene search_client pero puede ver todos los clientes."""
    c = client
    token = login(c, email="supervisor@nexa.demo", password="supervisor123")
    resp = c.get("/api/clients/search?q=C00001", headers=auth(token))
    assert resp.status_code == 200
    assert any(r["id"] == "C00001" for r in resp.json()["results"])


def test_busqueda_incluye_elegible_y_score(client):
    c = client
    token = login(c)
    resp = c.get("/api/clients/search?q=C00001", headers=auth(token))
    assert resp.status_code == 200
    r = next(r for r in resp.json()["results"] if r["id"] == "C00001")
    assert r["elegible"] is True
    assert 0 <= r["score"] <= 100


def test_busqueda_id_parcial_sin_match_exacto(client):
    """Spec 10.5: ID inexistente con match parcial -> exact_match False + is_id_query True."""
    c = client
    token = login(c)
    resp = c.get("/api/clients/search?q=C0000", headers=auth(token))
    assert resp.status_code == 200
    body = resp.json()
    assert body["exact_match"] is False
    assert body["is_id_query"] is True
    assert len(body["results"]) > 0


def test_busqueda_por_nombre_no_es_id_query(client):
    c = client
    token = login(c)
    resp = c.get("/api/clients/search?q=Carlos", headers=auth(token))
    assert resp.status_code == 200
    body = resp.json()
    assert body["is_id_query"] is False
    ids = [r["id"] for r in body["results"]]
    assert "C00002" in ids


def test_busqueda_por_nombre(client):
    c = client
    token = login(c)
    resp = c.get("/api/clients/search?q=Carlos", headers=auth(token))
    assert resp.status_code == 200
    ids = [r["id"] for r in resp.json()["results"]]
    assert "C00002" in ids


def test_busqueda_por_documento(client):
    c = client
    token = login(c)
    resp = c.get("/api/clients/search?q=4321", headers=auth(token))
    assert resp.status_code == 200
    ids = [r["id"] for r in resp.json()["results"]]
    assert "C00002" in ids


def test_cliente_inexistente_404_con_mensaje(client):
    c = client
    token = login(c)
    resp = c.get("/api/clients/C99999", headers=auth(token))
    assert resp.status_code == 404
    assert "No se encontró cliente con ese ID" in resp.json()["detail"]


def test_historial_vacio_devuelve_mensaje(client):
    c = client
    token = login(c)
    resp = c.get("/api/clients/C00002/history", headers=auth(token))
    assert resp.status_code == 200
    body = resp.json()
    assert body["historial"] == []
    assert body["message"] == "No hay ofertas previas registradas"


def test_perfil_cliente_con_historial(client, session):
    # Agregar historial y verificar que se devuelve
    from app import models
    cli = session.query(models.Client).filter(models.Client.id == "C00001").first()
    profile = dict(cli.profile)
    profile["historial_ofertas"] = [
        {"fecha": "2025-01-01", "oferta": "Movistar Total Premium", "resultado": "Aceptado"}
    ]
    cli.profile = profile
    session.commit()

    token = login(client)
    resp = client.get("/api/clients/C00001/history", headers=auth(token))
    assert resp.status_code == 200
    assert len(resp.json()["historial"]) == 1


def test_missing_data_warning(client, session):
    from copy import deepcopy
    from app import models
    cli = session.query(models.Client).filter(models.Client.id == "C00001").first()
    profile = deepcopy(cli.profile)
    profile.setdefault("consumo", {})["datos_gb_missing"] = True
    cli.profile = profile
    session.commit()

    token = login(client)
    resp = client.get("/api/clients/C00001", headers=auth(token))
    assert resp.status_code == 200
    assert resp.json()["data_completeness_warning"] is True


def test_solicitar_mas_datos_guarda_solicitud(client, session):
    """Spec 10.3: POST /api/clients/{id}/request-data registra la solicitud."""
    from app import models
    token = login(client)
    resp = client.post(
        "/api/clients/C00001/request-data",
        json={"campos_solicitados": "consumo de datos", "notas": "El cliente no reporta datos"},
        headers=auth(token),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["detail"] == "Solicitud de datos registrada"
    assert body["request_id"] > 0

    session.expire_all()
    req = session.query(models.DataRequest).filter(models.DataRequest.id == body["request_id"]).first()
    assert req is not None
    assert req.client_id == "C00001"
    assert req.campos_solicitados == "consumo de datos"
    assert req.notas == "El cliente no reporta datos"
    assert req.asesor_id is not None


def test_solicitar_mas_datos_cliente_inexistente_404(client):
    token = login(client)
    resp = client.post(
        "/api/clients/C99999/request-data",
        json={"campos_solicitados": "x"},
        headers=auth(token),
    )
    assert resp.status_code == 404
