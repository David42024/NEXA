"""Tests del progreso diario del asesor y la configuracion de metas."""
from tests.conftest import login, auth


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