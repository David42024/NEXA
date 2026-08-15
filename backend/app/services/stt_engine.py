"""
Transcripcion de voz a texto (STT) en el servidor.

Usa Whisper de Groq (misma API key que el chat), asi la llamada puede "oír" al
cliente desde cualquier navegador, sin depender de la Web Speech API de Chrome.
Si no hay key o falla, devuelve texto vacio y la conversacion sigue igual.
"""
import logging

import httpx

from app.config import settings

logger = logging.getLogger("nexa.stt")


async def transcribe_audio(data: bytes, filename: str = "audio.webm") -> str:
    """Convierte un clip de audio a texto en espanol. '' si no fue posible."""
    if not data or not settings.GROQ_API_KEY:
        return ""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                settings.GROQ_STT_URL,
                headers={"Authorization": f"Bearer {settings.GROQ_API_KEY}"},
                files={"file": (filename, data, "application/octet-stream")},
                data={"model": settings.GROQ_STT_MODEL, "language": "es"},
            )
            resp.raise_for_status()
            return (resp.json().get("text") or "").strip()
    except Exception as e:
        logger.warning(f"Groq STT fallo: {e}")
        return ""
