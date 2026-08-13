"""Tests del tracking real del funnel (contacted / prioritized)."""
from datetime import date

from tests.conftest import login, auth


def _contact(c, token, client_id):
    return c.get(f"/api/clients/{client_id}", headers=auth(token))


def _recommend(c, token, client_id):
    return c.post("/api/recommendations/generate", json={"client_id": client_id}, headers=auth(token))


def _today_funnel(session):
    session.expire_all()
    from app import models
    return session.query(models.FunnelDaily).filter(models.FunnelDaily.date == date.today()).first()


def test_abrir_perfil_incrementa_contacted_una_vez_por_cliente(client, session):
    token = login(client)

    _contact(client, token, "C00001")
    _contact(client, token, "C00001")  # misma vez en el dia -> no duplica

    funnel = _today_funnel(session)
    assert funnel.contacted == 1

    _contact(client, token, "C00002")  # otro cliente -> +1
    funnel = _today_funnel(session)
    assert funnel.contacted == 2


def test_cliente_inexistente_no_incrementa_contacted(client, session):
    token = login(client)
    resp = _contact(client, token, "C99999")
    assert resp.status_code == 404
    funnel = _today_funnel(session)
    assert funnel is None or funnel.contacted == 0


def test_recomendacion_cliente_elegible_incrementa_prioritized(client, session):
    token = login(client)

    resp = _recommend(client, token, "C00001")
    assert resp.status_code == 200
    assert len(resp.json()["recomendaciones"]) > 0

    _recommend(client, token, "C00001")  # no duplica en el mismo dia
    funnel = _today_funnel(session)
    assert funnel.prioritized == 1


def test_recomendacion_cliente_no_elegible_no_incrementa_prioritized(client, session):
    token = login(client)

    resp = _recommend(client, token, "C00003")
    assert resp.status_code == 200
    assert resp.json()["recomendaciones"] == []
    assert resp.json()["warning"] is not None

    funnel = _today_funnel(session)
    assert funnel is None or funnel.prioritized == 0


def test_contactar_y_priorizar_acumulan_en_el_mismo_dia(client, session):
    token = login(client)
    _contact(client, token, "C00001")
    _recommend(client, token, "C00001")
    _recommend(client, token, "C00002")

    funnel = _today_funnel(session)
    assert funnel.contacted == 1
    assert funnel.prioritized == 2
    assert funnel.offered == 0


def test_tracking_no_contamina_ofrecimientos(client, session):
    token = login(client)
    _contact(client, token, "C00001")
    _recommend(client, token, "C00001")
    client.post(
        "/api/interactions/register",
        json={"client_id": "C00001", "offer_id": 1, "result": "accepted", "channel": "Digital"},
        headers=auth(token),
    )
    funnel = _today_funnel(session)
    assert funnel.contacted == 1
    assert funnel.prioritized == 1
    assert funnel.offered == 1
    assert funnel.accepted == 1