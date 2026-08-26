"""
Webhooks y Media Streams de Twilio.

Flujo:
  1. Twilio llama a POST /api/twilio/voice cuando el cliente contesta.
  2. Devuelve TwiML con <Connect><Stream> para Media Streams bidireccionales.
  3. POST /api/twilio/status recibe actualizaciones de estado de la llamada.
  4. WS /api/twilio/stream/{call_id} es el Media Stream WebSocket:
     - Recibe audio µ-law del cliente (base64).
     - Envía audio del bot/asesor al telefono.
     - Alimenta al copilot Nexabot en tiempo real.
"""
import asyncio
import json
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Request
from fastapi.responses import PlainTextResponse

from app.config import settings
from app.services.call_provider import provider
from app.services.twilio_provider import (
    TwilioMediaStreamHandler,
    twilio_provider,
)

logger = logging.getLogger("nexa.twilio")

router = APIRouter(prefix="/api/twilio", tags=["twilio"])


@router.post("/voice")
async def twilio_voice_webhook(request: Request):
    """Twilio llama a esta URL cuando el cliente contesta la llamada.

    Devuelve TwiML con <Connect><Stream> para iniciar un Media Stream
    bidireccional entre Twilio y nuestro backend.
    """
    call_id = request.query_params.get("call_id", "")

    # Validar que la llamada existe
    sess = provider.get_session(call_id)
    if not sess:
        logger.warning(f"Twilio voice webhook: llamada {call_id} no encontrada")
        return PlainTextResponse(
            '<?xml version="1.0" encoding="UTF-8"?><Response><Say>Conexion fallida</Say><Hangup/></Response>',
            media_type="application/xml",
        )

    # Construir URL del Media Stream WebSocket
    base_url = settings.TWILIO_VOICE_URL.rsplit("/api/twilio/voice", 1)[0]
    if base_url.startswith("https://"):
        ws_url = base_url.replace("https://", "wss://")
    elif base_url.startswith("http://"):
        ws_url = base_url.replace("http://", "ws://")
    else:
        ws_url = f"wss://{base_url}"

    stream_url = f"{ws_url}/api/twilio/stream/{call_id}"

    twiml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Miguel">Conectando con el asistente de Movistar.</Say>
  <Connect>
    <Stream url="{stream_url}">
      <Parameter name="call_id" value="{call_id}" />
    </Stream>
  </Connect>
</Response>"""

    logger.info(f"Twilio TwiML para {call_id}: conectando Media Stream")
    return PlainTextResponse(twiml, media_type="application/xml")


@router.post("/status")
async def twilio_status_webhook(request: Request):
    """Webhook de estado de la llamada de Twilio.

    Recibe actualizaciones: initiated, ringing, answered, completed.
    """
    form = await request.form()
    call_sid = form.get("CallSid", "")
    call_status = form.get("CallStatus", "")
    call_id = request.query_params.get("call_id", "")

    logger.info(
        f"Twilio status: {call_sid} -> {call_status} (call_id={call_id})"
    )

    if call_status == "completed" or call_status == "failed":
        sess = provider.get_session(call_id)
        if sess and sess.state != "ended":
            from app.services.call_provider import provider as main_provider
            await main_provider.end(sess, reason=call_status)

    return PlainTextResponse("OK")


@router.websocket("/stream/{call_id}")
async def twilio_media_stream(websocket: WebSocket, call_id: str):
    """Media Stream WebSocket bidireccional con Twilio.

    Recibe audio del cliente (µ-law base64) y envia audio del bot/asesor.
    """
    # Validar que la llamada existe
    sess = provider.get_session(call_id)
    if not sess:
        await websocket.close(code=1008)
        return

    await websocket.accept()
    logger.info(f"Twilio Media Stream WS conectado: {call_id}")

    handler = TwilioMediaStreamHandler(call_id, sess, twilio_provider)
    twilio_provider.register_handler(call_id, handler)

    # Guardar referencia al WS para enviar audio de vuelta
    handler._ws = websocket

    # Monkey-patch send_media_chunk para usar el WS real
    async def send_chunk(stream_sid, payload_b64):
        try:
            await websocket.send_json({
                "event": "media",
                "streamSid": stream_sid,
                "media": {"payload": payload_b64},
            })
        except Exception as e:
            logger.error(f"Error enviando audio a Twilio: {e}")

    twilio_provider.send_media_chunk = send_chunk

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                event = json.loads(raw)
            except json.JSONDecodeError:
                continue

            await handler.handle_event(event)

    except WebSocketDisconnect:
        logger.info(f"Twilio Media Stream WS desconectado: {call_id}")
    except Exception as e:
        logger.error(f"Twilio Media Stream WS error: {e}")
    finally:
        twilio_provider.unregister_handler(call_id)
        if sess.state != "ended":
            from app.services.call_provider import provider as main_provider
            await main_provider.end(sess, reason="twilio_disconnected")
