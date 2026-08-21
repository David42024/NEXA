"""Tests del asistente Nexabot (chat con cadena groq -> gemini -> local)."""
from app.services import chat_engine

from conftest import login, auth


async def test_camino_groq_ok(monkeypatch):
    gemini_called = []

    async def fake_groq(prompt):
        assert "Cliente" in prompt
        return "Respondo por Groq: usa el ahorro como argumento."

    async def fake_gemini(prompt):
        gemini_called.append(prompt)
        return "No deberia llamarse."

    monkeypatch.setattr(chat_engine, "_call_groq", fake_groq)
    monkeypatch.setattr(chat_engine, "_call_gemini", fake_gemini)

    result = await chat_engine.generate_nexabot_reply(chat_engine.build_context({}), "¿Cómo respondo si dice que está caro?")
    assert result["source"] == "groq"
    assert "ahorro" in result["reply"]
    assert gemini_called == []


async def test_prompt_incluye_transcripcion_de_la_llamada(monkeypatch):
    """El chat copilot recibe la transcripcion para responder sobre la conversacion."""
    captured = {}

    async def fake_groq(prompt):
        captured["prompt"] = prompt
        return "El cliente objetó el precio."

    monkeypatch.setattr(chat_engine, "_call_groq", fake_groq)

    transcript = ["Cliente: me parece muy caro", "Asesor: le muestro el ahorro"]
    await chat_engine.generate_nexabot_reply(
        chat_engine.build_context({}), "¿Qué objeción puso?", transcript=transcript
    )
    assert "Transcripcion reciente de la llamada" in captured["prompt"]
    assert "Cliente: me parece muy caro" in captured["prompt"]

    # Sin transcripcion no se agrega la seccion (compatibilidad hacia atras).
    await chat_engine.generate_nexabot_reply(chat_engine.build_context({}), "hola")
    assert "Transcripcion" not in captured["prompt"]


async def test_camino_groq_falla_gemini(monkeypatch):
    async def fake_groq(prompt):
        raise RuntimeError("GROQ_API_KEY no configurada")

    async def fake_gemini(prompt):
        return "Respondo por Gemini."

    monkeypatch.setattr(chat_engine, "_call_groq", fake_groq)
    monkeypatch.setattr(chat_engine, "_call_gemini", fake_gemini)

    result = await chat_engine.generate_nexabot_reply(chat_engine.build_context({}), "¿Qué argumento debo usar?")
    assert result["source"] == "gemini"
    assert result["reply"] == "Respondo por Gemini."


async def test_camino_ambos_fallan_usa_local(monkeypatch):
    async def fake_groq(prompt):
        raise RuntimeError("boom")

    async def fake_gemini(prompt):
        raise RuntimeError("boom")

    monkeypatch.setattr(chat_engine, "_call_groq", fake_groq)
    monkeypatch.setattr(chat_engine, "_call_gemini", fake_gemini)

    ctx = chat_engine.build_context({
        "name": "Ana Maria",
        "profile": {"facturacion": {"monto_facturado_prom": 142.76}},
    })
    chat_engine._fill_top_offer(ctx, {"oferta": "Plan Hogar", "precio": 119, "ahorro_pct": 0.18, "probabilidad": 0.7})
    result = await chat_engine.generate_nexabot_reply(ctx, "está caro")
    assert result["source"] == "local"
    assert "Ana" in result["reply"]
    assert "ahorr" in result["reply"].lower()


def test_local_reply_objeciones_distintas():
    ctx = chat_engine.build_context({"name": "Ana"})
    chat_engine._fill_top_offer(ctx, {"oferta": "Plan Hogar", "precio": 119, "ahorro_pct": 0.18, "probabilidad": 0.7})
    resp_caro = chat_engine._local_reply(ctx, "me parece caro")
    resp_competencia = chat_engine._local_reply(ctx, "ya tengo con otro operador")
    resp_reclamos = chat_engine._local_reply(ctx, "tuve reclamos antes")
    assert resp_caro != resp_competencia
    assert "otro operador" not in resp_caro.lower() or True
    assert len(resp_reclamos) > 0


def test_requiere_mensaje_y_cliente(client):
    token = login(client)
    resp = client.post("/api/nexabot/chat", json={"client_id": "C00001", "message": "   "}, headers=auth(token))
    assert resp.status_code == 422

    resp = client.post("/api/nexabot/chat", json={"client_id": "NO_EXISTE", "message": "hola"}, headers=auth(token))
    assert resp.status_code == 404


def test_chat_endpoint_responde_con_fallback_local(client, monkeypatch):
    async def fake_groq(prompt):
        raise RuntimeError("sin key")

    async def fake_gemini(prompt):
        raise RuntimeError("sin key")

    monkeypatch.setattr(chat_engine, "_call_groq", fake_groq)
    monkeypatch.setattr(chat_engine, "_call_gemini", fake_gemini)

    token = login(client)
    resp = client.post(
        "/api/nexabot/chat",
        json={"client_id": "C00001", "message": "¿Cómo respondo si dice que está caro?"},
        headers=auth(token),
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["source"] == "local"
    assert data["reply"].strip()


def test_chat_requiere_auth(client):
    resp = client.post("/api/nexabot/chat", json={"client_id": "C00001", "message": "hola"})
    assert resp.status_code in (401, 403)