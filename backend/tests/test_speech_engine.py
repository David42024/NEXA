"""Tests del motor de speech (cadena de contingencia: grok -> fallback -> plantilla)."""
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


async def test_camino_1_grok_ok(monkeypatch):
    fallback_called = []

    async def fake_grok(prompt):
        return "Speech generado por Grok."

    async def fake_fallback(prompt):
        fallback_called.append(prompt)
        return "No deberia llamarse."

    monkeypatch.setattr(speech_engine, "_call_grok", fake_grok)
    monkeypatch.setattr(speech_engine, "_call_fallback", fake_fallback)

    result = await speech_engine.generate_speech_variants(PAYLOAD)
    assert result["source"] == "grok"
    assert len(result["variantes"]) == 2
    assert all(v["texto"] == "Speech generado por Grok." for v in result["variantes"])
    assert fallback_called == []


async def test_camino_2_grok_falla_fallback_ok(monkeypatch):
    async def fake_grok(prompt):
        raise RuntimeError("GROK_API_KEY no configurada")

    async def fake_fallback(prompt):
        return "Speech generado por el fallback."

    monkeypatch.setattr(speech_engine, "_call_grok", fake_grok)
    monkeypatch.setattr(speech_engine, "_call_fallback", fake_fallback)

    result = await speech_engine.generate_speech_variants(PAYLOAD)
    assert result["source"] == "fallback"
    assert all(v["texto"] == "Speech generado por el fallback." for v in result["variantes"])


async def test_camino_3_ambos_fallan_usa_plantilla_local(monkeypatch):
    async def fake_grok(prompt):
        raise RuntimeError("boom grok")

    async def fake_fallback(prompt):
        raise RuntimeError("boom fallback")

    monkeypatch.setattr(speech_engine, "_call_grok", fake_grok)
    monkeypatch.setattr(speech_engine, "_call_fallback", fake_fallback)

    result = await speech_engine.generate_speech_variants(PAYLOAD)
    assert result["source"] == "generic"
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