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
from app.services.call_provider import classify_objection, classify_acceptance
from app.services import sentiment_engine

from conftest import login, auth


def _start(client, client_id="C00001"):
    token = login(client)
    resp = client.post("/api/calls/start", json={"client_id": client_id}, headers=auth(token))
    assert resp.status_code == 200, resp.text
    return token, resp.json()


def _recv_until(ws, *types, predicate=None):
    """Consume mensajes hasta encontrar uno de los tipos pedidos (y que cumpla el predicado)."""
    while True:
        evt = ws.receive_json()
        if evt["type"] in types and (predicate is None or predicate(evt)):
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


def test_stt_audio_transcribe_con_whisper(client, monkeypatch):
    """El clip de voz del cliente se transcribe en el servidor (Whisper de Groq)."""
    token, data = _start(client)
    call_id = data["call_id"]

    async def fake_transcribe(_data, _filename):
        return "no estoy interesado"

    monkeypatch.setattr("app.api.calls.stt_engine.transcribe_audio", fake_transcribe)

    resp = client.post(
        f"/api/calls/{call_id}/stt-audio?token={data['cliente_token']}",
        files={"file": ("audio.webm", b"audio-bytes", "audio/webm")},
    )
    assert resp.status_code == 200
    assert resp.json()["text"] == "no estoy interesado"

    # Token invalido -> 401
    resp = client.post(
        f"/api/calls/{call_id}/stt-audio?token=malo",
        files={"file": ("audio.webm", b"audio-bytes", "audio/webm")},
    )
    assert resp.status_code == 401


def test_stt_audio_sin_whisper_devuelve_vacio(client, monkeypatch):
    """Si la transcripcion falla, devuelve texto vacio (la llamada sigue)."""
    token, data = _start(client)
    call_id = data["call_id"]

    async def fake_transcribe(_data, _filename):
        return ""

    monkeypatch.setattr("app.api.calls.stt_engine.transcribe_audio", fake_transcribe)

    resp = client.post(
        f"/api/calls/{call_id}/stt-audio?token={data['cliente_token']}",
        files={"file": ("audio.webm", b"audio-bytes", "audio/webm")},
    )
    assert resp.status_code == 200
    assert resp.json()["text"] == ""


def test_grabacion_subida_por_cliente_y_descargada_por_asesor(client):
    token, data = _start(client)
    call_id = data["call_id"]

    # Sin grabacion aun -> 404
    resp = client.get(f"/api/calls/{call_id}/recording", headers=auth(token))
    assert resp.status_code == 404

    # Token de cliente invalido -> 401
    resp = client.post(
        f"/api/calls/{call_id}/recording?token=malo",
        files={"file": ("llamada.webm", b"audio-bytes", "audio/webm")},
    )
    assert resp.status_code == 401

    # El cliente sube el audio completo (cliente + asesor + bot)
    resp = client.post(
        f"/api/calls/{call_id}/recording?token={data['cliente_token']}",
        files={"file": ("llamada.webm", b"audio-bytes", "audio/webm")},
    )
    assert resp.status_code == 200

    # El asesor lo descarga con su JWT
    resp = client.get(f"/api/calls/{call_id}/recording", headers=auth(token))
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "audio/webm"
    assert resp.content == b"audio-bytes"


def test_grabacion_subida_tras_colar_gracia_de_sesion(client):
    """El upload del cliente llega justo tras el 'ended' (el recorder se detiene
    con ese evento): la sesion debe sobrevivir en gracia para que la grabacion
    completa (con la voz del bot) no se pierda con un 401."""
    token, data = _start(client)
    call_id = data["call_id"]

    with client.websocket_connect(f"/api/calls/ws/{call_id}?role=asesor&token={token}") as asesor_ws:
        with client.websocket_connect(
            f"/api/calls/ws/{call_id}?role=cliente&token={data['cliente_token']}"
        ) as cliente_ws:
            _recv_until(asesor_ws, "status")  # active
            asesor_ws.send_json({"type": "end", "reason": "ended"})
            assert _recv_until(cliente_ws, "ended")["type"] == "ended"
            assert _recv_until(asesor_ws, "ended")["type"] == "ended"

    # Sesion ya cerrada: el upload tardio del cliente se acepta igual.
    resp = client.post(
        f"/api/calls/{call_id}/recording?token={data['cliente_token']}",
        files={"file": ("llamada.webm", b"audio-con-bot", "audio/webm")},
    )
    assert resp.status_code == 200

    # Y el asesor puede descargarla despues del cierre.
    resp = client.get(f"/api/calls/{call_id}/recording", headers=auth(token))
    assert resp.status_code == 200
    assert resp.content == b"audio-con-bot"


def test_ws_relay_de_senalizacion(client):
    """Asesor envia offer; cliente recibe offer, responde answer; ICE se reenvia."""
    token, data = _start(client)
    call_id = data["call_id"]

    # El cliente conecta primero (la oferta queda en cola hasta que el asesor la mande).
    with client.websocket_connect(f"/api/calls/ws/{call_id}?role=cliente&token={data['cliente_token']}") as cliente_ws:
        with client.websocket_connect(f"/api/calls/ws/{call_id}?role=asesor&token={token}") as asesor_ws:
            asesor_ws.receive_json()  # status dialing
            asesor_ws.send_json({"type": "offer", "sdp": "sdp-asesor-1"})

            offer = _recv_until(cliente_ws, "offer")
            assert offer == {"type": "offer", "sdp": "sdp-asesor-1"}

            cliente_ws.send_json({"type": "answer", "sdp": "sdp-cliente-1"})
            answer = _recv_until(asesor_ws, "answer")
            assert answer == {"type": "answer", "sdp": "sdp-cliente-1"}

            asesor_ws.send_json({"type": "candidate", "candidate": {"candidate": "c-asesor", "sdpMid": "0"}})
            cand = _recv_until(cliente_ws, "candidate")
            assert cand["type"] == "candidate" and cand["candidate"]["candidate"] == "c-asesor"

            cliente_ws.send_json({"type": "candidate", "candidate": {"candidate": "c-cliente", "sdpMid": "0"}})
            cand = _recv_until(asesor_ws, "candidate")
            assert cand["type"] == "candidate" and cand["candidate"]["candidate"] == "c-cliente"


def test_ws_bot_abre_la_llamada(client, monkeypatch):
    """Al aceptar el cliente, el bot saluda solo: bot_speech al cliente + copilot al asesor."""
    async def fake_reply(ctx, message):
        return {"reply": "Hola Ana, soy Nexabot de Movistar.", "source": "groq"}
    monkeypatch.setattr("app.services.call_provider.chat_engine.generate_nexabot_reply", fake_reply)

    token, data = _start(client)
    call_id = data["call_id"]

    with client.websocket_connect(f"/api/calls/ws/{call_id}?role=asesor&token={token}") as asesor_ws:
        _recv_until(asesor_ws, "status")  # dialing

        with client.websocket_connect(
            f"/api/calls/ws/{call_id}?role=cliente&token={data['cliente_token']}"
        ) as cliente_ws:
            # El bot habla en el lado del cliente sin ningun click.
            speech = _recv_until(cliente_ws, "bot_speech")
            assert speech["kind"] == "opening"
            assert "Hola Ana" in speech["text"]

            # El asesor ve el saludo del bot en su panel.
            copilot = _recv_until(asesor_ws, "copilot", predicate=lambda e: e.get("speaker") == "bot")
            assert copilot["suggestion"]


def test_ws_bot_rebate_siempre_aun_sin_ia(client, monkeypatch):
    """El bot SIEMPRE rebate la objecion: si la IA devuelve vacio, usa la plantilla."""
    async def fake_reply(ctx, message):
        return {"reply": "", "source": "local"}
    monkeypatch.setattr("app.services.call_provider.chat_engine.generate_nexabot_reply", fake_reply)

    token, data = _start(client)
    call_id = data["call_id"]

    with client.websocket_connect(f"/api/calls/ws/{call_id}?role=asesor&token={token}") as asesor_ws:
        _recv_until(asesor_ws, "status")  # dialing
        with client.websocket_connect(
            f"/api/calls/ws/{call_id}?role=cliente&token={data['cliente_token']}"
        ) as cliente_ws:
            _recv_until(asesor_ws, "status")  # active
            _recv_until(cliente_ws, "bot_speech")  # apertura del bot

            cliente_ws.send_json({"type": "stt", "text": "no estoy interesada", "final": True})
            speech = _recv_until(cliente_ws, "bot_speech")
            assert speech["kind"] == "response"
            assert speech["text"], "El bot nunca debe quedarse callado ante un 'no'"
            assert "ahorra" in speech["text"].lower() or "ahorrar" in speech["text"].lower()

            # El asesor ve la objecion clasificada en su panel.
            copilot = _recv_until(asesor_ws, "copilot", predicate=lambda e: e.get("objection") is not None)
            assert copilot["objection"]["type"] == "no_necesita"
            assert copilot["suggestion"]


def test_ws_aceptacion_avisa_al_asesor(client, monkeypatch):
    """Cuando el cliente dice que si, el asesor recibe el aviso para tomar control."""
    async def fake_reply(ctx, message):
        return {"reply": "perfecto, me interesa", "source": "groq"}
    monkeypatch.setattr("app.services.call_provider.chat_engine.generate_nexabot_reply", fake_reply)

    token, data = _start(client)
    call_id = data["call_id"]

    with client.websocket_connect(f"/api/calls/ws/{call_id}?role=asesor&token={token}") as asesor_ws:
        _recv_until(asesor_ws, "status")  # dialing
        with client.websocket_connect(
            f"/api/calls/ws/{call_id}?role=cliente&token={data['cliente_token']}"
        ) as cliente_ws:
            _recv_until(asesor_ws, "status")  # active
            _recv_until(cliente_ws, "bot_speech")  # apertura del bot
            _recv_until(asesor_ws, "copilot")  # apertura vista por el asesor

            # El cliente acepta: llega el aviso de traspaso (una sola vez).
            cliente_ws.send_json({"type": "stt", "text": "sí me parece bien, quiero el plan", "final": True})
            stt = _recv_until(asesor_ws, "stt")
            assert stt["speaker"] == "cliente"
            acc = _recv_until(asesor_ws, "acceptance")
            assert acc["text"] == "sí me parece bien, quiero el plan"

            # Consume el copilot de la primera respuesta para dejar la cola limpia.
            assert _recv_until(asesor_ws, "copilot")["type"] == "copilot"

            # Un segundo "si" NO vuelve a disparar el aviso (solo se avisa una vez).
            cliente_ws.send_json({"type": "stt", "text": "si quiero, adelante", "final": True})
            assert _recv_until(asesor_ws, "stt")["speaker"] == "cliente"
            mood_evt = asesor_ws.receive_json()
            cop_evt = asesor_ws.receive_json()
            assert mood_evt["type"] == "mood"
            assert cop_evt["type"] == "copilot", "No debe re-dispararse el acceptance"


def test_classify_acceptance():
    assert classify_acceptance("sí me parece bien")
    assert classify_acceptance("está bien, me interesa")
    assert classify_acceptance("adelante, quiero el plan")
    assert classify_acceptance("de acuerdo, acepto")
    assert not classify_acceptance("no, gracias, no estoy interesada")
    assert not classify_acceptance("me parece un poco caro")


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

            copilot = _recv_until(asesor_ws, "copilot", predicate=lambda e: e.get("objection") is not None)
            assert copilot["objection"]["type"] == "precio"
            assert copilot["quote"] == "me parece muy caro"
            assert copilot["suggestion"]
            assert "monto_facturado" in captured["ctx"], "El contexto del cliente alimenta al copilot"


def test_ws_stt_del_asesor_genera_copilot_asesor(client, monkeypatch):
    """La voz del asesor tambien alimenta al copilot (mejora del pitch/argumento)."""
    captured = {}

    async def fake_reply(ctx, message):
        captured["message"] = message
        return {"reply": "Buen cierre: refuerza el ahorro mensual.", "source": "groq"}
    monkeypatch.setattr("app.services.call_provider.chat_engine.generate_nexabot_reply", fake_reply)

    token, data = _start(client)
    call_id = data["call_id"]

    with client.websocket_connect(f"/api/calls/ws/{call_id}?role=asesor&token={token}") as asesor_ws:
        _recv_until(asesor_ws, "status")  # dialing

        with client.websocket_connect(
            f"/api/calls/ws/{call_id}?role=cliente&token={data['cliente_token']}"
        ) as cliente_ws:
            _recv_until(asesor_ws, "status")  # active
            asesor_ws.send_json({
                "type": "stt", "text": "le baja su factura a S/ 100", "speaker": "asesor", "final": True,
            })

            stt = _recv_until(asesor_ws, "stt")
            assert stt["speaker"] == "asesor"
            assert stt["text"] == "le baja su factura a S/ 100"

            copilot = _recv_until(asesor_ws, "copilot", predicate=lambda e: e.get("speaker") == "asesor")
            assert copilot["speaker"] == "asesor"
            assert copilot["objection"] is None
            assert copilot["suggestion"]
            assert "asesor acaba de decir" in captured["message"].lower()


def test_ws_deteccion_de_animo_del_cliente(client):
    """El animo del cliente se detecta en vivo y llega como evento mood al asesor."""
    token, data = _start(client)
    call_id = data["call_id"]

    with client.websocket_connect(f"/api/calls/ws/{call_id}?role=asesor&token={token}") as asesor_ws:
        _recv_until(asesor_ws, "status")  # dialing

        with client.websocket_connect(
            f"/api/calls/ws/{call_id}?role=cliente&token={data['cliente_token']}"
        ) as cliente_ws:
            _recv_until(asesor_ws, "status")  # active

            cliente_ws.send_json({"type": "stt", "text": "estoy enojado por el mal servicio", "final": True})
            stt = _recv_until(asesor_ws, "stt")
            assert stt["text"] == "estoy enojado por el mal servicio"

            mood = _recv_until(asesor_ws, "mood")
            assert mood["score"] < 0
            assert mood["mood"]["label"] in ("Molesto", "Enojado")

            cliente_ws.send_json({"type": "stt", "text": "me interesa la oferta, cuanto cuesta", "final": True})
            mood2 = _recv_until(asesor_ws, "mood", predicate=lambda e: e["type"] == "mood")
            assert mood2["score"] > mood["score"]


def test_sentiment_engine_labels():
    assert sentiment_engine.mood_from_score(-0.8)["label"] == "Enojado"
    assert sentiment_engine.mood_from_score(0.0)["label"] == "Indeciso"
    assert sentiment_engine.mood_from_score(0.6)["label"] == "Entusiasmado"
    assert sentiment_engine.score_text("me interesa, cuanto cuesta") > 0
    assert sentiment_engine.score_text("estoy enojado, mal servicio") < 0


def test_ws_toggle_modo_asesor_y_bot(client, monkeypatch):
    """El asesor intercambia en vivo quien habla: bot (habla solo) o asesor (solo sugiere)."""
    async def fake_reply(ctx, message):
        return {"reply": "Respuesta del agente", "source": "groq"}
    monkeypatch.setattr("app.services.call_provider.chat_engine.generate_nexabot_reply", fake_reply)

    token, data = _start(client)
    call_id = data["call_id"]

    with client.websocket_connect(f"/api/calls/ws/{call_id}?role=asesor&token={token}") as asesor_ws:
        _recv_until(asesor_ws, "status")  # dialing

        with client.websocket_connect(
            f"/api/calls/ws/{call_id}?role=cliente&token={data['cliente_token']}"
        ) as cliente_ws:
            # Modo por defecto: bot. Saluda al aceptar.
            _recv_until(cliente_ws, "bot_speech")
            _recv_until(asesor_ws, "status")  # active

            # El asesor pasa a modo asesor: el bot deja de hablar.
            asesor_ws.send_json({"type": "mode", "mode": "asesor"})
            assert _recv_until(cliente_ws, "mode")["mode"] == "asesor"

            # El cliente objeta: el asesor recibe la sugerencia, el bot NO habla.
            cliente_ws.send_json({"type": "stt", "text": "me parece muy caro", "final": True})
            copilot = _recv_until(asesor_ws, "copilot", predicate=lambda e: e.get("objection") is not None)
            assert copilot["objection"]["type"] == "precio"
            assert copilot["suggestion"]

            # Vuelve a modo bot: el bot retoma la llamada y habla.
            asesor_ws.send_json({"type": "mode", "mode": "bot"})
            assert _recv_until(cliente_ws, "mode")["mode"] == "bot"
            speech = _recv_until(cliente_ws, "bot_speech")
            assert speech["text"]


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

            # 2) El cliente objeta -> objection / objection_status
            cliente_ws.send_json({"type": "stt", "text": "me parece muy caro", "final": True})
            copilot = _recv_until(asesor_ws, "copilot", predicate=lambda e: e.get("offering") is not None)
            assert copilot["offering"]["stage"] == "objection"
            assert copilot["offering"]["objection_status"] == "rebate"

            # 3) Se cuelga la llamada -> se registra el audio como medio probatorio
            asesor_ws.send_json({"type": "end", "reason": "accepted"})
            ended = _recv_until(asesor_ws, "ended")
            assert ended["offering"]["stage"] == "objection"
            assert ended["offering"]["evidence_type"] == "call_audio"

    # Persistido en BD
    offering = session.get(models.Offering, data["offering_id"])
    assert offering.stage == "objection"
    assert offering.evidence_type == "call_audio"
    assert offering.contact_status == "answered"
    assert offering.objection_status == "rebate"


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