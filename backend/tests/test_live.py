"""Tests de la llamada en vivo (definir medio de contacto + stream WebSocket).

Verifica:
  - /api/live/start define canal, genera recomendacion (KPIs) y crea el offering.
  - El WebSocket emite la secuencia de respuestas del cliente en tiempo real.
  - El offering avanza por las etapas E2E y la interaccion se registra al final.
"""
import json

import pytest
from starlette.websockets import WebSocketDisconnect

from app import models

from conftest import login, auth


def _start(client, channel="Llamada", client_id="C00001"):
    token = login(client)
    resp = client.post("/api/live/start", json={"client_id": client_id, "channel": channel},
                       headers=auth(token))
    assert resp.status_code == 200, resp.text
    return token, resp.json()


def test_start_requiere_canal_valido(client):
    token = login(client)
    resp = client.post("/api/live/start", json={"client_id": "C00001", "channel": "Correo"},
                       headers=auth(token))
    assert resp.status_code == 422


def test_start_define_canal_y_genera_recomendacion(client, session):
    token, data = _start(client)
    assert data["session_id"]
    assert data["recomendaciones"], "Debe devolver la NBO para poblar los KPIs"
    assert data["offering_id"]

    offering = session.get(models.Offering, data["offering_id"])
    assert offering is not None
    assert offering.channel == "Llamada"
    assert offering.stage == "planned"

    rec = data["recomendaciones"][0]
    assert rec["ahorro_pct"] > 0 and rec["precio"] > 0


def test_ws_stream_avanza_etapas_y_registra_resultado(client, session):
    token, data = _start(client)
    session_id = data["session_id"]

    stages = []
    result = None
    with client.websocket_connect(f"/api/live/ws/{session_id}?token={token}") as ws:
        while True:
            raw = ws.receive_text()
            event = json.loads(raw)
            stages.append(event.get("stage"))
            if event["type"] == "client_message" and event.get("result"):
                result = event["result"]
            if event["type"] == "done":
                break

    # Debe haber transitado el funnel hasta el resultado
    assert stages, "El stream no emitió eventos"
    assert "planned" in stages or "contacted" in stages
    assert "objection" in stages
    assert "result" in stages
    assert result in ("accepted", "rejected")

    # El offering E2E quedó cerrado
    offering = session.get(models.Offering, data["offering_id"])
    assert offering.stage == "result"
    assert offering.result == result
    assert offering.contact_status == "answered"
    assert offering.objection_status == "rebate"
    assert offering.evidence_type == "platform_register"

    # La interacción se registró y el funnel del día sumó el ofrecimiento
    interaction = (
        session.query(models.Interaction)
        .filter(models.Interaction.client_id == "C00001")
        .order_by(models.Interaction.id.desc())
        .first()
    )
    assert interaction is not None
    assert interaction.result == result


def test_ws_requiere_token_valido(client):
    token, data = _start(client)
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect(f"/api/live/ws/{data['session_id']}?token=token-malo") as ws:
            ws.receive()
