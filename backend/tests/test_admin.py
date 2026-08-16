"""Tests de administracion: cambios de permisos en caliente y KPIs del dashboard."""
from tests.conftest import login, auth
from app import models


def test_actualizar_permisos_se_refleja_de_inmediato(client):
    """Al agregar un permiso via admin, un login posterior lo respeta sin reiniciar."""
    c = client
    admin_token = login(c, "admin@nexa.demo", "admin123")

    # 1) Antes: asesor NO tiene view_funnel
    token_asesor = login(c, "asesor@nexa.demo", "asesor123")
    resp = c.get("/api/funnel/weekly", headers=auth(token_asesor))
    assert resp.status_code == 403

    # 2) Admin agrega view_funnel al rol asesor
    resp = c.get("/api/admin/permissions", headers=auth(admin_token))
    asesor_perms = resp.json()["asesor"]["permissions"]
    assert "view_funnel" not in asesor_perms

    updated = asesor_perms + ["view_funnel"]
    put = c.put("/api/admin/permissions/asesor", json={"permissions": updated}, headers=auth(admin_token))
    assert put.status_code == 200

    # 3) Nuevo login del asesor -> ya accede al endpoint protegido
    token_asesor2 = login(c, "asesor@nexa.demo", "asesor123")
    resp = c.get("/api/funnel/weekly", headers=auth(token_asesor2))
    assert resp.status_code == 200

    # 4) El rol admin no puede ser demorado por asesor (sin permiso)
    resp = c.put("/api/admin/permissions/asesor", json={"permissions": updated}, headers=auth(token_asesor))
    assert resp.status_code == 403


def test_quitar_permiso_revoca_acceso(client):
    c = client
    admin_token = login(c, "admin@nexa.demo", "admin123")

    # Quitar search_client al asesor
    resp = c.get("/api/admin/permissions", headers=auth(admin_token))
    asesor_perms = resp.json()["asesor"]["permissions"]
    assert "search_client" in asesor_perms
    without = [p for p in asesor_perms if p != "search_client"]
    c.put("/api/admin/permissions/asesor", json={"permissions": without}, headers=auth(admin_token))

    token = login(c, "asesor@nexa.demo", "asesor123")
    resp = c.get("/api/clients/search?q=C00001", headers=auth(token))
    assert resp.status_code == 403


def test_kpis_asesor_ven_solo_su_cartera(client, session):
    """Los KPIs del asesor se limitan a SUS clientes (asesor_id)."""
    c = client
    asesor = session.query(models.User).filter(models.User.email == "asesor@nexa.demo").first()
    # Asigna la mitad de los clientes demo a la cartera de este asesor.
    for cid in ("C00001", "C00002"):
        cli = session.query(models.Client).filter(models.Client.id == cid).first()
        cli.asesor_id = asesor.id
    session.commit()

    token = login(c, "asesor@nexa.demo", "asesor123")
    resp = c.get("/api/admin/kpis", headers=auth(token))
    assert resp.status_code == 200
    k = resp.json()
    assert k["total_clientes"] == 2
    # C00001 es elegible MT, C00002 no.
    assert k["elegibles_mt"] == 1
    assert k["valor_potencial_soles"] == round(1 * 22.3, 2)


def test_kpis_supervisor_siguen_siendo_globales(client):
    """El supervisor ve los totales globales, no los de una cartera."""
    c = client
    token = login(c, "supervisor@nexa.demo", "supervisor123")
    resp = c.get("/api/admin/kpis", headers=auth(token))
    assert resp.status_code == 200
    assert resp.json()["total_clientes"] == 3
