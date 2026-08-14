"""Tests de la llamada WebRTC (señalización P2P + copilot en vivo).

Verifica:
  - /api/calls/start crea el offering E2E (planned, canal Llamada) y credenciales.
  - El WebSocket reenvía oferta/answer/ICE entre asesor y cliente.
  - La transcripcion (stt) del cliente se reenvía y dispara el copilot.
  - El cierre de llamada se notifica a ambas partes.
  - Acceso denegado con token invalido (cierre 1008).
"""
import json

import pytest
from starlette.websockets import WebSocketDisconnect

from app import models
from app.services.call_provider import classify_objection

from conftest import login, auth


def _start(client, client_id="C00001"):
    token = login(client)
    resp = client.post("/api/calls/start", json={"client_id": client_id}, headers=auth(token))
    assert resp.status_code == 200, resp.text
    return token, resp.json()


def _recv_until(ws, *types):
    """Consume mensajes hasta encontrar uno de los tipos pedidos."""
    while True:
        evt = ws.receive_json()
        if evt["type"] in types:
            return evt


def test_start_crea_offering_y_credenciales(client, session):
    token, data = _start(client)
    assert data["call_id"]
    assert data["cliente_token"]
    assert data["client_id"] == "C00001"
    assert data["client_name"]
    assert data["offering_id"]

    offering = session.get(models.Offering, data["offering_id"])
    assert offering is not None
    assert offering.channel == "Llamada"
    assert offering.stage == "planned"


def test_start_requiere_permiso(client):
    token = login(client, email="supervisor@nexa.demo", password="supervisor123")
    resp = client.post("/api/calls/start", json={"client_id": "C00001"}, headers=auth(token))
    assert resp.status_code == 403


def test_start_cliente_inexistente(client):
    token = login(client)
    resp = client.post("/api/calls/start", json={"client_id": "C09999"}, headers=auth(token))
    assert resp.status_code == 404


def test_ws_relay_de_senalizacion(client):
    """Asesor envia offer; cliente recibe offer, responde answer; ICE se reenvia."""
    token, data = _start(client)
    call_id = data["call_id"]

    # El cliente conecta primero (la oferta queda en cola hasta que el asesor la mande).
    with client.websocket_connect(f"/api/calls/ws/{call_id}?role=cliente&token={data['cliente_token']}") as cliente_ws:
        with client.websocket_connect(f"/api/calls/ws/{call_id}?role=asesor&token={token}") as asesor_ws:
            asesor_ws.receive_json()  # status dialing
            asesor_ws.send_json({"type": "offer", "sdp": "sdp-asesor-1"})

            offer = cliente_ws.receive_json()
            assert offer == {"type": "offer", "sdp": "sdp-asesor-1"}

            cliente_ws.send_json({"type": "answer", "sdp": "sdp-cliente-1"})
            answer = asesor_ws.receive_json()
            assert answer == {"type": "answer", "sdp": "sdp-cliente-1"}

            asesor_ws.send_json({"type": "candidate", "candidate": {"candidate": "c-asesor", "sdpMid": "0"}})
            cand = cliente_ws.receive_json()
            assert cand["type"] == "candidate" and cand["candidate"]["candidate"] == "c-asesor"

            cliente_ws.send_json({"type": "candidate", "candidate": {"candidate": "c-cliente", "sdpMid": "0"}})
            cand = asesor_ws.receive_json()
            assert cand["type"] == "candidate" and cand["candidate"]["candidate"] == "c-cliente"


def test_ws_stt_dispara_copilot(client, monkeypatch):
    """La transcripcion del cliente llega al asesor y genera la objecion + sugerencia."""
    captured = {}

    async def fake_reply(ctx, message):
        captured["ctx"] = ctx
        return {"reply": "Rebate de unificacion", "source": "groq"}
    monkeypatch.setattr("app.services.call_provider.chat_engine.generate_nexabot_reply", fake_reply)

    token, data = _start(client)
    call_id = data["call_id"]

    with client.websocket_connect(f"/api/calls/ws/{call_id}?role=asesor&token={token}") as asesor_ws:
        _recv_until(asesor_ws, "status")  # dialing

        with client.websocket_connect(
            f"/api/calls/ws/{call_id}?role=cliente&token={data['cliente_token']}"
        ) as cliente_ws:
            _recv_until(asesor_ws, "status")  # active
            cliente_ws.send_json({"type": "stt", "text": "me parece muy caro", "final": True})

            stt = _recv_until(asesor_ws, "stt")
            assert stt["text"] == "me parece muy caro"

            copilot = _recv_until(asesor_ws, "copilot")
            assert copilot["objection"]["type"] == "precio"
            assert copilot["quote"] == "me parece muy caro"
            assert copilot["suggestion"]
            assert "monto_facturado" in captured["ctx"], "El contexto del cliente alimenta al copilot"


def test_ws_cierra_llamada_y_notifica(client):
    token, data = _start(client)
    call_id = data["call_id"]

    with client.websocket_connect(f"/api/calls/ws/{call_id}?role=asesor&token={token}") as asesor_ws:
        with client.websocket_connect(
            f"/api/calls/ws/{call_id}?role=cliente&token={data['cliente_token']}"
        ) as cliente_ws:
            _recv_until(asesor_ws, "status")  # active al conectar el cliente
            asesor_ws.send_json({"type": "end", "reason": "rejected"})

            ended = _recv_until(cliente_ws, "ended")
            assert ended["reason"] == "rejected"
            ended = _recv_until(asesor_ws, "ended")
            assert ended["reason"] == "rejected"


def test_ws_avanza_e2e_en_tiempo_real(client, session, monkeypatch):
    """El E2E avanza solo con la conversacion: contacted -> objection -> evidence."""
    async def fake_reply(ctx, message):
        return {"reply": "Rebate de prueba", "source": "groq"}
    monkeypatch.setattr("app.services.call_provider.chat_engine.generate_nexabot_reply", fake_reply)

    token, data = _start(client)
    call_id = data["call_id"]

    with client.websocket_connect(f"/api/calls/ws/{call_id}?role=asesor&token={token}") as asesor_ws:
        _recv_until(asesor_ws, "status")  # dialing

        with client.websocket_connect(
            f"/api/calls/ws/{call_id}?role=cliente&token={data['cliente_token']}"
        ) as cliente_ws:
            # 1) El cliente acepta -> contacted / answered (payload offering en vivo)
            status = _recv_until(asesor_ws, "status")
            assert status["state"] == "active"
            assert status["offering"]["stage"] == "contacted"
            assert status["offering"]["contact_status"] == "answered"

            # 2) El cliente objeta -> objection / objection_handled
            cliente_ws.send_json({"type": "stt", "text": "me parece muy caro", "final": True})
            copilot = _recv_until(asesor_ws, "copilot")
            assert copilot["offering"]["stage"] == "objection"
            assert copilot["offering"]["objection_handled"] is True

            # 3) Se cuelga la llamada -> evidence (audio de llamada)
            asesor_ws.send_json({"type": "end", "reason": "accepted"})
            ended = _recv_until(asesor_ws, "ended")
            assert ended["offering"]["stage"] == "evidence"
            assert ended["offering"]["evidence_type"] == "call_audio"

    # Persistido en BD
    offering = session.get(models.Offering, data["offering_id"])
    assert offering.stage == "evidence"
    assert offering.evidence_type == "call_audio"
    assert offering.contact_status == "answered"
    assert offering.objection_handled is True


def test_ws_rechaza_token_cliente_invalido(client):
    token, data = _start(client)
    call_id = data["call_id"]
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect(f"/api/calls/ws/{call_id}?role=cliente&token=token-malo") as ws:
            ws.receive()


def test_classify_objection():
    assert classify_objection("está muy caro eso") == {"type": "precio", "label": "Precio"}
    assert classify_objection("ya tengo con claro")["type"] == "competencia"
    assert classify_objection("no necesito nada")["type"] == "no_necesita"
    assert classify_objection("hola buenas tardes") is None