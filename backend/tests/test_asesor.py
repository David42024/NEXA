"""Tests del progreso diario del asesor y la configuracion de metas."""
from tests.conftest import login, auth
from app import models


def test_asesor_ve_clientes_priorizados_de_su_cartera(client, session):
    """Los priorizados salen SOLO de la cartera del asesor y traen segmento + conteos."""
    asesor = session.query(models.User).filter_by(email="asesor@nexa.demo").first()
    for c in session.query(models.Client).all():
        c.asesor_id = asesor.id
    # Cliente en riesgo de churn (mora + reclamos) para cubrir el segmento Alerta.
    session.add(models.Client(
        id="C00009", name="Riesgo Perez", document_last4="0000", phone_last4="0000",
        district="Ate", asesor_id=asesor.id,
        profile={
            "servicio": {"tipo": "Postpago"},
            "consumo": {"datos_gb": 5, "app_uso": "Bajo"},
            "hogar": {"tiene_internet": False},
            "facturacion": {"dias_mora_prom": 12},
            "comportamiento": {"n_reclamos": 2},
            "elegibilidad": {"movistar_total": False, "upgrade": False, "equipo": False, "plan_hogar": True},
        },
    ))
    session.commit()

    token = login(client)
    resp = client.get("/api/asesor/priorizados", headers=auth(token))
    assert resp.status_code == 200
    body = resp.json()

    segs = {s["id"]: s["count"] for s in body["segmentos"]}
    assert segs["Todos"] == 4
    assert segs["Oro"] == 1      # C00001 tiene internet hogar
    assert segs["Alerta"] == 1   # C00009 mora 12 / reclamos 2
    assert segs["Gigas"] == 0
    assert segs["Digital"] == 0

    by_id = {c["id"]: c for c in body["clientes"]}
    assert by_id["C00001"]["segmento"] == "Oro"
    assert by_id["C00002"]["segmento"] is None
    assert by_id["C00009"]["segmento"] == "Alerta"
    scores = [c["score"] for c in body["clientes"]]
    assert scores == sorted(scores, reverse=True)


def test_priorizados_solo_la_propia_cartera(client):
    """Sin clientes asignados, la lista sale vacía (no ve la cartera ajena)."""
    token = login(client)
    resp = client.get("/api/asesor/priorizados", headers=auth(token))
    assert resp.status_code == 200
    body = resp.json()
    assert body["clientes"] == []
    assert body["segmentos"][0] == {"id": "Todos", "label": "Todos", "count": 0}


def test_asesor_ve_su_progreso_del_dia(client):
    c = client
    token = login(c)
    resp = c.get("/api/asesor/progreso", headers=auth(token))
    assert resp.status_code == 200
    body = resp.json()
    assert body["ventas_dia"] == 0
    assert body["meta_diaria"] == 3
    assert body["meta_semanal"] == 15
    assert body["meta_mensual"] == 60
    assert body["progreso_dia_pct"] == 0
    assert "ventas_semana" in body and "progreso_semana_pct" in body


def test_admin_configura_metas_y_el_asesor_las_ve(client):
    c = client
    admin_token = login(c, email="admin@nexa.demo", password="admin123")
    resp = c.put("/api/admin/metas", json={"meta_diaria": 15, "meta_semanal": 25, "meta_mensual": 8}, headers=auth(admin_token))
    assert resp.status_code == 200
    assert resp.json()["META_VENTAS_DIARIA"] == 15
    assert resp.json()["META_VENTAS_SEMANAL"] == 25

    token = login(c)
    progreso = c.get("/api/asesor/progreso", headers=auth(token))
    assert progreso.status_code == 200
    assert progreso.json()["meta_diaria"] == 15
    assert progreso.json()["meta_semanal"] == 25
    assert progreso.json()["meta_mensual"] == 8


def test_metas_rechaza_valores_invalidos(client):
    c = client
    admin_token = login(c, email="admin@nexa.demo", password="admin123")
    resp = c.put("/api/admin/metas", json={"meta_diaria": 0}, headers=auth(admin_token))
    assert resp.status_code == 422


def test_supervisor_no_puede_configurar_metas(client):
    c = client
    token = login(c, email="supervisor@nexa.demo", password="supervisor123")
    resp = c.put("/api/admin/metas", json={"meta_diaria": 20}, headers=auth(token))
    assert resp.status_code == 403