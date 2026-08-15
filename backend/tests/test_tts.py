"""Tests del endpoint TTS (voz del bot), con httpx mockeado (sin red)."""

import httpx

from app.api import tts


class _FakeResp:
    def __init__(self, status_code=200, content=b"ID3FAKE"):
        self.status_code = status_code
        self.content = content


def test_tts_devuelve_audio_mp3(client, monkeypatch):
    captured = {}

    def fake_get(url, params=None, headers=None, timeout=None):
        captured["url"] = url
        captured["params"] = params
        return _FakeResp()

    monkeypatch.setattr(tts.httpx, "get", fake_get)

    resp = client.get("/api/tts", params={"text": "Hola, tengo una oferta para ti"})
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "audio/mpeg"
    assert resp.content == b"ID3FAKE"
    assert captured["url"] == "https://translate.google.com/translate_tts"
    assert captured["params"]["tl"] == "es-PE"


def test_tts_cae_a_es_si_locale_falla(client, monkeypatch):
    calls = []

    def fake_get(url, params=None, headers=None, timeout=None):
        calls.append(params["tl"])
        if params["tl"] == "es-PE":
            raise httpx.ConnectError("boom")
        return _FakeResp()

    monkeypatch.setattr(tts.httpx, "get", fake_get)

    resp = client.get("/api/tts", params={"text": "Prueba"})
    assert resp.status_code == 200
    assert resp.content == b"ID3FAKE"
    assert calls == ["es-PE", "es"]


def test_tts_502_si_todo_falla(client, monkeypatch):
    def fake_get(url, params=None, headers=None, timeout=None):
        raise httpx.ConnectError("boom")

    monkeypatch.setattr(tts.httpx, "get", fake_get)

    resp = client.get("/api/tts", params={"text": "Prueba"})
    assert resp.status_code == 502


def test_tts_rechaza_texto_vacio(client):
    resp = client.get("/api/tts")
    assert resp.status_code == 422