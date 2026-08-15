"""TTS de la voz del agente Nexabot.

Genera el audio de cada mensaje del bot como MP3 (Google Translate TTS, sin
API key). El cliente lo reproduce por <audio> y lo enruta por WebRTC hacia el
asesor, de modo que la grabacion de la llamada SI captura la voz del bot.
"""

import httpx
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response

router = APIRouter(prefix="/api/tts", tags=["tts"])

_TTS_URL = "https://translate.google.com/translate_tts"
_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)


@router.get("")
def tts(text: str = Query(..., min_length=1, max_length=400)):
    """Devuelve el audio MP3 en es-PE. Si el locale falla, cae a es."""
    for lang in ("es-PE", "es"):
        try:
            r = httpx.get(
                _TTS_URL,
                params={"ie": "UTF-8", "client": "tw-ob", "tl": lang, "q": text},
                headers={"User-Agent": _UA},
                timeout=12,
            )
            if r.status_code == 200 and r.content:
                return Response(content=r.content, media_type="audio/mpeg")
        except Exception:
            continue
    raise HTTPException(status_code=502, detail="TTS no disponible en este momento")