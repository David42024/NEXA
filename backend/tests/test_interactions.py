"""Tests de registro de interacciones y su efecto en funnel_daily."""
from datetime import date

import pytest

from tests.conftest import login, auth


def _register(c, token, client_id, result, offer_id=1, reason=None):
    payload = {
        "client_id": client_id,
        "offer_id": offer_id,
        "channel": "Digital",
        "result": result,
        "rejection_reason": reason,
        "speech_used": "Variante 1 (Consultiva)",
    }
    return c.post("/api/interactions/register", json=payload, headers=auth(token))


def test_registrar_aceptacion_actualiza_funnel(client, session):
    token = login(client)
    resp = _register(client, token, "C00001", "accepted")
    assert resp.status_code == 200

    session.expire_all()
    from app import models
    funnel = session.query(models.FunnelDaily).filter(models.FunnelDaily.date == date.today()).first()
    assert funnel is not None
    assert funnel.offered == 1
    assert funnel.accepted == 1
    assert float(funnel.conversion_rate) == 100.0


def test_registrar_rechazo_actualiza_funnel(client, session):
    token = login(client)
    resp = _register(client, token, "C00001", "rejected", reason="Precio")
    assert resp.status_code == 200

    session.expire_all()
    from app import models
    funnel = session.query(models.FunnelDaily).filter(models.FunnelDaily.date == date.today()).first()
    assert funnel.offered == 1
    assert funnel.accepted == 0
    assert float(funnel.conversion_rate) == 0.0


def test_dos_interacciones_acumulan_y_recalculan_tasa(client, session):
    token = login(client)
    _register(client, token, "C00001", "accepted")
    _register(client, token, "C00001", "accepted")
    _register(client, token, "C00002", "rejected", reason="Precio")

    session.expire_all()
    from app import models
    funnel = session.query(models.FunnelDaily).filter(models.FunnelDaily.date == date.today()).first()
    assert funnel.offered == 3
    assert funnel.accepted == 2
    assert float(funnel.conversion_rate) == pytest.approx(round(2 / 3 * 100, 2))


def test_interaccion_cliente_inexistente_404(client):
    token = login(client)
    resp = _register(client, token, "C99999", "accepted")
    assert resp.status_code == 404


def test_interaccion_actualiza_historial_embebido_del_cliente(client, session):
    token = login(client)
    _register(client, token, "C00002", "accepted")

    session.expire_all()
    from app import models
    cli = session.query(models.Client).filter(models.Client.id == "C00002").first()
    assert len(cli.profile["historial_ofertas"]) == 1
    assert cli.profile["historial_ofertas"][0]["resultado"] == "Aceptado"