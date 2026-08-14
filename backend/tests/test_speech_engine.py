"""Tests del motor de speech (cadena de contingencia: groq -> gemini -> plantilla local)."""
from app.services import speech_engine

PAYLOAD = {
    "cliente_nombre": "Ana",
    "oferta": "Movistar Total Premium",
    "probabilidad": 72,
    "razones": ["Elegibilidad Movistar Total", "Consumo de datos"],
    "beneficio": "Ahorro",
    "canal": "Digital",
    "tono": "Consultivo",
}


async def test_camino_1_groq_ok(monkeypatch):
    fallback_called = []

    async def fake_groq(prompt):
        return "Speech generado por Groq."

    async def fake_gemini(prompt):
        fallback_called.append(prompt)
        return "No deberia llamarse."

    monkeypatch.setattr(speech_engine, "_call_groq", fake_groq)
    monkeypatch.setattr(speech_engine, "_call_gemini", fake_gemini)

    result = await speech_engine.generate_speech_variants(PAYLOAD)
    assert result["source"] == "groq"
    assert len(result["variantes"]) == 2
    assert all(v["texto"] == "Speech generado por Groq." for v in result["variantes"])
    assert fallback_called == []


async def test_camino_2_groq_falla_gemini_ok(monkeypatch):
    async def fake_groq(prompt):
        raise RuntimeError("GROQ_API_KEY no configurada")

    async def fake_gemini(prompt):
        return "Speech generado por Gemini."

    monkeypatch.setattr(speech_engine, "_call_groq", fake_groq)
    monkeypatch.setattr(speech_engine, "_call_gemini", fake_gemini)

    result = await speech_engine.generate_speech_variants(PAYLOAD)
    assert result["source"] == "gemini"
    assert all(v["texto"] == "Speech generado por Gemini." for v in result["variantes"])


async def test_camino_3_ambos_fallan_usa_plantilla_local(monkeypatch):
    async def fake_groq(prompt):
        raise RuntimeError("boom groq")

    async def fake_gemini(prompt):
        raise RuntimeError("boom gemini")

    monkeypatch.setattr(speech_engine, "_call_groq", fake_groq)
    monkeypatch.setattr(speech_engine, "_call_gemini", fake_gemini)

    result = await speech_engine.generate_speech_variants(PAYLOAD)
    assert result["source"] == "local"
    assert len(result["variantes"]) == 2
    for i, v in enumerate(result["variantes"]):
        kind = "consultiva" if i == 0 else "directa"
        expected = speech_engine._local_template(PAYLOAD, kind)
        assert v["texto"] == expected
        assert len(v["texto"].strip()) > 0


def test_local_template_genera_texto_determinista():
    consultiva = speech_engine._local_template(PAYLOAD, "consultiva")
    directa = speech_engine._local_template(PAYLOAD, "directa")
    assert "Ana" in consultiva
    assert "Ana" in directa
    assert consultiva != directa
    assert consultiva.endswith("¿Te gustaría conocer los detalles?")
    assert directa.endswith("¿Qué opinas si te explico cómo funciona?")