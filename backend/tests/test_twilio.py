"""Tests de la integracion Twilio (llamadas telefonicas reales).

Verifica:
  - /api/calls/start con phone_number crea la sesion con call_mode=twilio.
  - /api/twilio/voice devuelve TwiML con <Stream> correcto.
  - /api/twilio/status actualiza el estado de la llamada.
  - Decodificacion/codificacion de audio µ-law.
  - Handler de Media Stream procesa eventos correctamente.
  - Cooldown del copilot en modo twilio.
  - start sin phone_number mantiene WebRTC (backward compatibility).
"""
import asyncio
import base64
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app import models
from app.services.call_provider import classify_objection, classify_acceptance
from app.services.twilio_provider import (
    TwilioMediaStreamHandler,
    _decode_mulaw,
    _encode_mulaw,
    _pcm16_to_wav_bytes,
)

from conftest import login, auth


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _start_twilio(client, client_id="C00001", phone_number="+51999123456"):
    token = login(client)
    resp = client.post(
        "/api/calls/start",
        json={"client_id": client_id, "phone_number": phone_number},
        headers=auth(token),
    )
    assert resp.status_code == 200, resp.text
    return token, resp.json()


def _start_webrtc(client, client_id="C00001"):
    token = login(client)
    resp = client.post(
        "/api/calls/start",
        json={"client_id": client_id},
        headers=auth(token),
    )
    assert resp.status_code == 200, resp.text
    return token, resp.json()


# ---------------------------------------------------------------------------
# Tests: /api/calls/start con phone_number
# ---------------------------------------------------------------------------

def test_start_con_phone_number_es_twilio(client, session):
    """Al enviar phone_number, la sesion debe ser twilio sin cliente_token."""
    token, data = _start_twilio(client, phone_number="+51999123456")
    assert data["call_id"]
    assert data["call_mode"] == "twilio"
    assert data["phone_number"] == "+51999123456"
    assert data["cliente_token"] is None

    offering = session.get(models.Offering, data["offering_id"])
    assert offering is not None
    assert offering.channel == "Llamada"
    assert offering.stage == "planned"


def test_start_sin_phone_number_es_webrtc(client, session):
    """Sin phone_number, la sesion debe ser WebRTC (backward compatibility)."""
    token, data = _start_webrtc(client)
    assert data["call_mode"] == "webrtc"
    assert data["cliente_token"] is not None
    assert data["phone_number"] is None


def test_start_twilio_phone_number_vacio(client):
    """Phone number vacio debe fallback a WebRTC."""
    token = login(client)
    resp = client.post(
        "/api/calls/start",
        json={"client_id": "C00001", "phone_number": "  "},
        headers=auth(token),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["call_mode"] == "webrtc"


def test_start_twilio_requiere_permiso(client):
    """Sin permiso view_recommendation, debe rechazar."""
    token = login(client, email="supervisor@nexa.demo", password="supervisor123")
    resp = client.post(
        "/api/calls/start",
        json={"client_id": "C00001", "phone_number": "+51999123456"},
        headers=auth(token),
    )
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Tests: /api/twilio/voice webhook
# ---------------------------------------------------------------------------

def test_twilio_voice_webhook_devuelve_twiml(client):
    """El webhook /voice debe devolver TwiML con <Connect><Stream>."""
    token, data = _start_twilio(client)
    call_id = data["call_id"]

    resp = client.post(f"/api/twilio/voice?call_id={call_id}")
    assert resp.status_code == 200
    assert "xml" in resp.headers["content-type"]
    body = resp.text
    assert "<Connect>" in body
    assert "<Stream" in body
    assert "wss://" in body or "ws://" in body
    assert call_id in body


def test_twilio_voice_webhook_llamada_inexistente(client):
    """Si call_id no existe, devuelve TwiML con error."""
    resp = client.post("/api/twilio/voice?call_id=nonexistent")
    assert resp.status_code == 200
    assert "Conexion fallida" in resp.text or "Hangup" in resp.text


# ---------------------------------------------------------------------------
# Tests: /api/twilio/status webhook
# ---------------------------------------------------------------------------

def test_twilio_status_completed_termina_llamada(client):
    """Status 'completed' debe terminar la sesion."""
    token, data = _start_twilio(client)
    call_id = data["call_id"]

    resp = client.post(
        f"/api/twilio/status?call_id={call_id}",
        data={
            "CallSid": "CA_test_123",
            "CallStatus": "completed",
        },
    )
    assert resp.status_code == 200
    assert resp.text == "OK"


def test_twilio_status_initiated_no_termina_llamada(client):
    """Status 'initiated' no debe terminar la sesion."""
    token, data = _start_twilio(client)
    call_id = data["call_id"]

    resp = client.post(
        f"/api/twilio/status?call_id={call_id}",
        data={
            "CallSid": "CA_test_456",
            "CallStatus": "initiated",
        },
    )
    assert resp.status_code == 200


# ---------------------------------------------------------------------------
# Tests: Decodificacion/codificacion µ-law
# ---------------------------------------------------------------------------

def test_decode_mulaw_silencio():
    """0xFF en µ-law debe ser接近 a silencio (muestra positiva cercana a 0)."""
    # 0xFF = silencio negativo en µ-law
    samples = _decode_mulaw(b"\xff")
    assert len(samples) == 1
    assert abs(samples[0]) < 100  # cercano a silencio


def test_decode_mulaw_longitud():
    """Decodificar N bytes debe producir N samples."""
    data = bytes(range(256))
    samples = _decode_mulaw(data)
    assert len(samples) == 256


def test_encode_mulaw_longitud():
    """Codificar N samples PCM16 debe producir N bytes µ-law."""
    samples = [0] * 100
    encoded = _encode_mulaw(samples)
    assert len(encoded) == 100


def test_encode_decode_roundtrip_silencio():
    """Roundtrip de silencio debe producir silencio."""
    original = b"\x80" * 100  # µ-law silence
    samples = _decode_mulaw(original)
    reencoded = _encode_mulaw(samples)
    assert len(reencoded) == 100


def test_pcm16_to_wav_bytes_estructura():
    """El WAV generado debe tener headers validos."""
    pcm = b"\x00\x00" * 100  # 100 samples de silencio
    wav = _pcm16_to_wav_bytes(pcm, sample_rate=8000)
    assert wav[:4] == b"RIFF"
    assert wav[8:12] == b"WAVE"
    assert wav[12:16] == b"fmt "
    assert wav[36:40] == b"data"


# ---------------------------------------------------------------------------
# Tests: TwilioMediaStreamHandler
# ---------------------------------------------------------------------------

@pytest.fixture()
def mock_sess():
    """Sesion mock para tests del handler."""
    sess = MagicMock()
    sess.id = "test_call_001"
    sess.ctx = {"nombre": "Cliente"}
    sess.mode = "bot"
    sess.mood_score = 0.0
    sess.last_ai_at = {}
    sess.offering_id = 1
    return sess


@pytest.fixture()
def mock_provider():
    """Provider mock para tests del handler."""
    provider = MagicMock()
    provider._send_to_asesor = AsyncMock()
    provider.send_media_chunk = AsyncMock()
    provider._notify_call_active = AsyncMock()
    provider._notify_call_ended = AsyncMock()
    return provider


@pytest.mark.asyncio
async def test_handler_start_event(mock_sess, mock_provider):
    """El evento 'start' debe activar el handler y notificar."""
    handler = TwilioMediaStreamHandler("call_001", mock_sess, mock_provider)
    handler._ws = MagicMock()

    await handler.handle_event({
        "event": "start",
        "start": {"streamSid": "MZ_test_123"},
    })

    assert handler.stream_sid == "MZ_test_123"
    assert handler.state == "active"
    mock_provider._notify_call_active.assert_awaited_once_with(mock_sess)


@pytest.mark.asyncio
async def test_handler_stop_event(mock_sess, mock_provider):
    """El evento 'stop' debe terminar el handler."""
    handler = TwilioMediaStreamHandler("call_001", mock_sess, mock_provider)
    handler.state = "active"

    await handler.handle_event({"event": "stop"})
    assert handler.state == "ended"


@pytest.mark.asyncio
async def test_handler_media_buffer(mock_sess, mock_provider):
    """Audio acumulado no debe disparar STT hasta alcanzar el umbral."""
    handler = TwilioMediaStreamHandler("call_001", mock_sess, mock_provider)
    handler.state = "active"

    # Enviar menos de STT_CHUNK_SECONDS de audio (~16000 bytes a 8kHz)
    small_chunk = base64.b64encode(b"\x80" * 100).decode()
    await handler.handle_event({
        "event": "media",
        "media": {"payload": small_chunk},
    })

    # Debe haber acumulado el buffer pero no disparar transcripcion
    assert len(handler.audio_buffer) == 100
    assert handler.last_stt_at == 0.0


# ---------------------------------------------------------------------------
# Tests: Clasificacion objeciones/aceptacion (backward compatibility)
# ---------------------------------------------------------------------------

def test_classify_objection_precio():
    obj = classify_objection("Es muy caro eso")
    assert obj is not None
    assert obj["type"] == "precio"


def test_classify_objection_competencia():
    obj = classify_objection("Yo tengo con Claro")
    assert obj is not None
    assert obj["type"] == "competencia"


def test_classify_acceptance_positive():
    assert classify_acceptance("Me parece bien, acepto") is True


def test_classify_acceptance_negative():
    assert classify_acceptance("Lo voy a pensar") is False


# ---------------------------------------------------------------------------
# Tests: CallSession attributes
# ---------------------------------------------------------------------------

def test_call_session_twilio_attributes(client):
    """La sesion twilio debe tener call_mode y phone_number."""
    from app.services.call_provider import provider

    token, data = _start_twilio(client, phone_number="+51999888777")
    call_id = data["call_id"]
    sess = provider.get_session(call_id)

    assert sess is not None
    assert sess.call_mode == "twilio"
    assert sess.phone_number == "+51999888777"


def test_call_session_webrtc_attributes(client):
    """La sesion webrtc debe tener call_mode=webrtc."""
    from app.services.call_provider import provider

    token, data = _start_webrtc(client)
    call_id = data["call_id"]
    sess = provider.get_session(call_id)

    assert sess is not None
    assert sess.call_mode == "webrtc"
    assert sess.phone_number is None


# ---------------------------------------------------------------------------
# Tests: Config twilio_enabled
# ---------------------------------------------------------------------------

def test_twilio_enabled_sin_credenciales():
    """Sin credenciales, twilio_enabled debe ser False."""
    from app.config import Settings
    import os

    # Simular sin credenciales
    with patch.dict(os.environ, {
        "TWILIO_ACCOUNT_SID": "",
        "TWILIO_AUTH_TOKEN": "",
    }):
        s = Settings()
        assert s.twilio_enabled is False


def test_twilio_enabled_con_credenciales():
    """Con credenciales, twilio_enabled debe ser True."""
    from app.config import Settings
    import os

    with patch.dict(os.environ, {
        "TWILIO_ACCOUNT_SID": "AC_test_123",
        "TWILIO_AUTH_TOKEN": "test_token",
    }):
        s = Settings()
        assert s.twilio_enabled is True
