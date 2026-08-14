"""
Generador de speech con IA generativa.

Flujo de contingencia (10.1):
1. Primary: Groq API (timeout 5s)
2. Fallback: Gemini Free (HuggingFace/Google)
3. Si ambos fallan: speech generico predefinido + log del fallo
"""
import logging
import httpx
from typing import List, Dict

from app.config import settings

logger = logging.getLogger("nexa.speech")

GENERIC_SPEECH = (
    "Tenemos una oferta especialmente diseñada para ti que se ajusta a tu perfil "
    "de consumo. ¿Te gustaría conocerla?"
)

# Traduce las claves internas de "razones" (SHAP) a frases naturales para el discurso.
REASON_TEXT = {
    "elegibilidad_mt": "eres elegible para Movistar Total",
    "consumo_datos": "tienes un buen consumo de datos",
    "internet_hogar": "ya cuentas con internet en el hogar",
    "app_uso": "utilizas frecuentemente la app",
    "antiguedad": "llevas tiempo como cliente",
    "satisfaccion": "tienes buena satisfacción con el servicio",
    "elegibilidad_upgrade": "eres elegible para mejorar tu plan móvil",
    "elegibilidad_equipo": "eres elegible para un equipo nuevo",
    "elegibilidad_hogar": "eres elegible para el plan hogar",
    "sin_internet_hogar": "no tienes internet en el hogar",
}


def _reason_text(reason: str) -> str:
    return REASON_TEXT.get(reason, reason.replace("_", " "))


def _build_prompt(payload: Dict, variant: str) -> str:
    tono = "consultivo, cercano, hace una pregunta abierta al final" if variant == "consultiva" \
        else "directo, va al grano, resalta el beneficio numerico y cierra con una pregunta corta"
    razones = "; ".join(_reason_text(r) for r in payload.get("razones", []))
    return (
        f"Eres un asistente que redacta speechs breves (max 3 frases) en español neutro "
        f"para asesores de Movistar. Cliente: {payload.get('cliente_nombre')}. "
        f"Oferta a ofrecer: {payload.get('oferta')} (probabilidad de aceptacion {payload.get('probabilidad')}%). "
        f"Razones: {razones}. Beneficio clave: {payload.get('beneficio', 'N/A')}. "
        f"Canal: {payload.get('canal', 'App')}. Tono: {tono}. "
        f"Responde SOLO con el texto del speech, sin comillas ni explicaciones."
    )


async def _call_groq(prompt: str) -> str:
    if not settings.GROQ_API_KEY:
        raise RuntimeError("GROQ_API_KEY no configurada")
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.post(
            settings.GROQ_API_URL,
            headers={"Authorization": f"Bearer {settings.GROQ_API_KEY}"},
            json={
                "model": settings.GROQ_MODEL,
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": 200,
            },
        )
        resp.raise_for_status()
        data = resp.json()
        return data["choices"][0]["message"]["content"].strip()


async def _call_gemini(prompt: str) -> str:
    if not settings.FALLBACK_API_KEY:
        raise RuntimeError("FALLBACK_API_KEY no configurada")
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.post(
            f"{settings.GEMINI_API_URL}?key={settings.FALLBACK_API_KEY}",
            json={"contents": [{"parts": [{"text": prompt}]}]},
        )
        resp.raise_for_status()
        data = resp.json()
        return data["candidates"][0]["content"]["parts"][0]["text"].strip()


async def generate_speech_variants(payload: Dict) -> Dict:
    variants_cfg = [("Variante 1 (Consultiva)", "consultiva"), ("Variante 2 (Directa)", "directa")]
    variantes = []
    source = "groq"

    for label, kind in variants_cfg:
        prompt = _build_prompt(payload, kind)
        text = None
        try:
            text = await _call_groq(prompt)
        except Exception as e:
            logger.warning(f"Groq fallo: {e}")
            source = "gemini"
            try:
                text = await _call_gemini(prompt)
            except Exception as e2:
                logger.error(f"Gemini tambien fallo: {e2}")
                source = "local"
                text = _local_template(payload, kind)
        variantes.append({"variante": label, "texto": text})

    return {"variantes": variantes, "source": source}


def _local_template(payload: Dict, kind: str) -> str:
    """Plantilla local determinista, usada si ambas APIs de IA fallan (o no hay keys configuradas en demo)."""
    nombre = payload.get("cliente_nombre", "estimado cliente")
    oferta = payload.get("oferta", "esta oferta")
    beneficio = payload.get("beneficio")
    if beneficio:
        beneficio = "con " + beneficio[:1].lower() + beneficio[1:]
    razones = payload.get("razones", [])
    razon_txt = _reason_text(razones[0]) if razones else "tu perfil encaja con esta oferta"

    if kind == "consultiva":
        base = f"{nombre}, al revisar tu perfil veo que {razon_txt}. "
        base += f"Tenemos {oferta}, una opción pensada para ti"
        base += f", {beneficio}. " if beneficio else ". "
        base += "¿Te gustaría conocer los detalles?"
    else:
        base = f"{nombre}, como {razon_txt}, {oferta} es una opción que te conviene"
        base += f" {beneficio}. " if beneficio else ". "
        base += "¿Qué opinas si te explico cómo funciona?"
    return base


def generic_speech_fallback() -> str:
    return GENERIC_SPEECH
