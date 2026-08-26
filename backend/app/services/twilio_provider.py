"""
Proveedor de llamadas reales via Twilio (PSTN + Media Streams).

Permite al asesor llamar a un telefono real del cliente. El flujo es:
  1. Asesor inicia llamada con numero de telefono.
  2. Backend usa Twilio SDK para marcar al numero via PSTN.
  3. Cuando el cliente contesta, Twilio conecta un Media Stream
     (WebSocket bidireccional) al backend.
  4. El backend recibe audio µ-law del cliente, lo transcribe (Whisper),
     y alimenta al copilot Nexabot.
  5. El bot genera una respuesta y la envia de vuelta como audio al
     telefono del cliente via el mismo Media Stream.

Formato de audio Twilio Media Streams:
  - Codec: µ-law (G.711), 8kHz, mono
  - Transporte: WebSocket con eventos JSON
  - Cada chunk viene en base64 dentro de un evento "media"
"""
import asyncio
import base64
import io
import logging
import struct
import time
import uuid

from app.config import settings
from app.services import chat_engine, sentiment_engine

logger = logging.getLogger("nexa.twilio")

# Umbrales y configuracion
STT_CHUNK_SECONDS = 2.0
SILENCE_THRESHOLD_RMS = 0.01
MEDIA_PAYLOAD_MAX = 1400  # Twilio limita chunks a ~1500 bytes


def _decode_mulaw(encoded: bytes) -> list[int]:
    """Decodifica µ-law (base64 de Twilio) a PCM16 samples."""
    samples = []
    for byte in encoded:
        byte = ~byte & 0xFF
        sign = 1 if byte & 0x80 else -1
        exponent = (byte >> 4) & 0x07
        mantissa = byte & 0x0F
        sample = ((mantissa << 1) + 33) << exponent
        sample -= 0x84
        samples.append(sample * sign)
    return samples


def _encode_mulaw(samples: list[int]) -> bytes:
    """Codifica PCM16 samples a µ-law."""
    result = bytearray()
    for sample in samples:
        sign = 0 if sample >= 0 else 0x80
        sample = abs(sample)
        sample = min(sample, 32767)
        exponent = 7
        for i in range(7, -1, -1):
            if sample >= (1 << i):
                exponent = i
                break
        if exponent >= 8:
            encoded = 0x7F if sign == 0 else 0xFF
        else:
            mantissa = (sample >> (exponent + 1)) & 0x0F
            encoded = ~(sign | (exponent << 4) | mantissa) & 0xFF
        result.append(encoded)
    return bytes(result)


def _pcm16_to_wav_bytes(pcm_data: bytes, sample_rate: int = 8000) -> bytes:
    """Convierte PCM16 raw a WAV en memoria (para Groq Whisper)."""
    num_samples = len(pcm_data) // 2
    data_size = len(pcm_data)
    header = struct.pack(
        "<4sI4s4sIHHIIHH4sI",
        b"RIFF", 36 + data_size, b"WAVE",
        b"fmt ", 16, 1, 1, sample_rate, sample_rate * 2, 2, 16,
        b"data", data_size,
    )
    return header + pcm_data


class TwilioMediaStreamHandler:
    """Maneja un solo Media Stream de Twilio para una llamada."""

    def __init__(self, call_id: str, sess, provider):
        self.call_id = call_id
        self.sess = sess
        self.provider = provider
        self.stream_sid = None
        self.state = "idle"
        self.audio_buffer = bytearray()
        self.last_stt_at = 0.0
        self.stt_task = None

    async def handle_event(self, event: dict):
        """Procesa un evento del Media Stream de Twilio."""
        event_type = event.get("event")

        if event_type == "connected":
            logger.info(f"Twilio Media Stream conectado: {self.call_id}")

        elif event_type == "start":
            self.stream_sid = event.get("start", {}).get("streamSid")
            self.state = "active"
            logger.info(
                f"Twilio stream iniciado: {self.call_id}, "
                f"streamSid={self.stream_sid}"
            )
            # Avisar al asesor que la llamada esta activa
            await self.provider._notify_call_active(self.sess)

        elif event_type == "media":
            await self._handle_media(event.get("media", {}))

        elif event_type == "stop":
            self.state = "ended"
            logger.info(f"Twilio stream detenido: {self.call_id}")
            await self.provider._notify_call_ended(self.sess)

    async def _handle_media(self, media: dict):
        """Recibe un chunk de audio del cliente y lo acumula."""
        if self.state != "active":
            return

        payload_b64 = media.get("payload", "")
        if not payload_b64:
            return

        chunk = base64.b64decode(payload_b64)
        self.audio_buffer.extend(chunk)

        # Transcribir cada ~STT_CHUNK_SECONDS de audio acumulado
        chunk_bytes = STT_CHUNK_SECONDS * 8000  # 8kHz, 1 byte/sample µ-law
        now = time.time()
        if (
            len(self.audio_buffer) >= chunk_bytes
            and now - self.last_stt_at >= STT_CHUNK_SECONDS
        ):
            self.last_stt_at = now
            audio_data = bytes(self.audio_buffer)
            self.audio_buffer = bytearray()
            asyncio.create_task(self._transcribe_and_process(audio_data))

    async def _transcribe_and_process(self, audio_mulaw: bytes):
        """Decodifica audio, transcribe con Whisper y alimenta al copilot."""
        try:
            # µ-law -> PCM16
            samples = _decode_mulaw(audio_mulaw)
            pcm_data = b"".join(struct.pack("<h", s) for s in samples)

            if not pcm_data:
                return

            # VAD basico: verificar que no sea silencio total
            rms = 0
            n = len(samples)
            if n > 0:
                rms = (sum(s * s for s in samples) / n) ** 0.5
            if rms < SILENCE_THRESHOLD_RMS:
                return

            # PCM16 -> WAV para Whisper
            wav_data = _pcm16_to_wav_bytes(pcm_data, sample_rate=8000)

            # Transcribir con Groq Whisper
            from app.services import stt_engine
            text = await stt_engine.transcribe_audio(wav_data, "cliente.wav")
            if not text or not text.strip():
                return

            text = text.strip()
            logger.info(f"Twilio STT [{self.call_id}]: {text}")

            # Enviar transcripcion al panel del asesor
            await self.provider._send_to_asesor(self.sess, {
                "type": "stt",
                "speaker": "cliente",
                "text": text,
                "final": True,
            })

            # Actualizar animo del cliente
            delta = sentiment_engine.score_text(text)
            self.sess.mood_score = sentiment_engine.smooth_score(
                self.sess.mood_score, delta
            )
            mood = sentiment_engine.mood_from_score(self.sess.mood_score)
            await self.provider._send_to_asesor(self.sess, {
                "type": "mood",
                "mood": mood,
                "score": round(self.sess.mood_score, 2),
            })

            # Si el bot esta activo, generar respuesta de voz
            if self.sess.mode == "bot":
                asyncio.create_task(
                    self._bot_respond(text)
                )
            else:
                # Modo asesor: solo pasar al copilot para sugerencias
                asyncio.create_task(
                    self._copilot_suggest(text)
                )

        except Exception as e:
            logger.error(f"Twilio STT error [{self.call_id}]: {e}")

    async def _bot_respond(self, client_text: str):
        """El bot responde al cliente via TTS -> Twilio Media Stream."""
        from app.services.call_provider import classify_objection, _clean_speech

        objection = classify_objection(client_text)
        now = time.time()

        # Cooldown
        if now - self.sess.last_ai_at.get("cliente", 0) < settings.CALL_AI_COOLDOWN_SECONDS:
            return
        self.sess.last_ai_at["cliente"] = now

        nombre = self.sess.ctx.get("nombre") or "cliente"
        label = (objection or {}).get("label", "duda")
        prompt = (
            f"Eres Nexabot, agente de voz de Movistar, en llamada con {nombre}. "
            f"El cliente acaba de decir: \"{client_text}\" (objecion: {label}). "
            "Rebatelo en maximo 3 frases habladas, directo al cliente y con "
            "objetivo de vender: enfocate en el ahorro o beneficio exacto, "
            "sin presionar, y termina con una pregunta corta. "
            "Habla como persona, sin comillas ni viñetas."
        )
        try:
            result = await asyncio.wait_for(
                chat_engine.generate_nexabot_reply(self.sess.ctx, prompt),
                timeout=3.0,
            )
            speech = _clean_speech(result["reply"])
        except Exception:
            speech = None

        if not speech:
            speech = (
                f"Entiendo, {nombre}. Esta opcion te ahorra en el recibo y une "
                "tus servicios en uno solo. ¿Me dejas contarte el beneficio exacto?"
            )

        # Enviar speech del bot al asesor
        offering = None
        try:
            from app.services.call_provider import _offering_out
            from app import models
            from app.database import SessionLocal
            db = SessionLocal()
            try:
                off_row = db.query(models.Offering).filter(
                    models.Offering.id == self.sess.offering_id
                ).first()
                if off_row:
                    offering = _offering_out(off_row)
            finally:
                db.close()
        except Exception:
            pass

        await self.provider._send_to_asesor(self.sess, {
            "type": "copilot",
            "speaker": "bot",
            "objection": objection,
            "quote": client_text,
            "suggestion": speech,
            "source": "local",
            "offering": offering,
        })

        # Generar audio TTS y enviar al telefono
        await self._send_tts_to_phone(speech)

    async def _copilot_suggest(self, client_text: str):
        """Modo asesor: sugiere respuesta al asesor (sin hablar al cliente)."""
        now = time.time()
        if now - self.sess.last_ai_at.get("cliente", 0) < settings.CALL_AI_COOLDOWN_SECONDS:
            return
        self.sess.last_ai_at["cliente"] = now

        from app.services.call_provider import classify_objection, _offering_out

        objection = classify_objection(client_text)
        prompt = (
            f"El cliente acaba de decir: \"{client_text}\". Detecta su objecion "
            "y redacta una sugerencia accionable (max 4 frases) para el asesor."
        )
        try:
            result = await chat_engine.generate_nexabot_reply(
                self.sess.ctx, prompt
            )
        except Exception:
            result = {"reply": "", "source": "local"}

        offering = None
        try:
            from app import models
            from app.database import SessionLocal
            db = SessionLocal()
            try:
                off_row = db.query(models.Offering).filter(
                    models.Offering.id == self.sess.offering_id
                ).first()
                if off_row:
                    offering = _offering_out(off_row)
            finally:
                db.close()
        except Exception:
            pass

        await self.provider._send_to_asesor(self.sess, {
            "type": "copilot",
            "speaker": "cliente",
            "objection": objection,
            "quote": client_text,
            "suggestion": result["reply"],
            "source": result["source"],
            "offering": offering,
        })

    async def _send_tts_to_phone(self, text: str):
        """Genera audio TTS y lo envia al telefono via Media Stream."""
        if not self.stream_sid or self.state != "active":
            return

        try:
            import httpx
            tts_url = (
                "https://translate.google.com/translate_tts"
                f"?ie=UTF-8&tl=es&client=tw-ob&q={text[:200]}"
            )
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(tts_url)
                if resp.status_code != 200:
                    return
                mp3_data = resp.content

            # Convertir MP3 a PCM16 via ffmpeg (si disponible) o usar
            # fallback con speechSynthesis del browser del cliente
            pcm_data = await self._mp3_to_pcm(mp3_data)
            if not pcm_data:
                return

            # Codificar PCM16 -> µ-law -> base64 chunks
            samples = [struct.unpack("<h", pcm_data[i:i+2])[0]
                       for i in range(0, len(pcm_data), 2)]
            mulaw = _encode_mulaw(samples)

            # Enviar en chunks de ~20ms (~160 bytes a 8kHz)
            chunk_size = 160
            for i in range(0, len(mulaw), chunk_size):
                chunk = mulaw[i:i + chunk_size]
                payload_b64 = base64.b64encode(chunk).decode("ascii")
                await self.provider.send_media_chunk(
                    self.stream_sid, payload_b64
                )
                await asyncio.sleep(0.02)  # ~20ms entre chunks

        except Exception as e:
            logger.error(f"TTS -> Twilio error: {e}")

    async def _mp3_to_pcm(self, mp3_data: bytes) -> bytes | None:
        """Convierte MP3 a PCM16 8kHz mono usando ffmpeg."""
        try:
            proc = await asyncio.create_subprocess_exec(
                "ffmpeg", "-i", "pipe:0",
                "-f", "s16le", "-ar", "8000", "-ac", "1",
                "pipe:1",
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.DEVNULL,
            )
            stdout, _ = await asyncio.wait_for(
                proc.communicate(input=mp3_data), timeout=5.0
            )
            return stdout if stdout else None
        except (FileNotFoundError, asyncio.TimeoutError, Exception):
            logger.warning("ffmpeg no disponible para TTS conversion")
            return None


class TwilioProvider:
    """Proveedor principal de llamadas via Twilio."""

    def __init__(self):
        self._handlers = {}  # call_id -> TwilioMediaStreamHandler
        self._sessions = {}  # call_id -> CallSession (compatibilidad con provider)

    def get_handler(self, call_id: str) -> TwilioMediaStreamHandler | None:
        return self._handlers.get(call_id)

    async def dial(self, call_id: str, phone_number: str, ctx: dict,
                   offering_id: int = None, user_id: int = None):
        """Marca al numero real del cliente via Twilio."""
        if not settings.twilio_enabled:
            logger.warning("Twilio no configurado, no se puede marcar")
            return

        try:
            from twilio.rest import Client as TwilioClient
        except ImportError:
            logger.error("twilio SDK no instalado: pip install twilio")
            return

        client = TwilioClient(
            settings.TWILIO_ACCOUNT_SID,
            settings.TWILIO_AUTH_TOKEN,
        )

        voice_url = settings.TWILIO_VOICE_URL
        if "?" in voice_url:
            voice_url += f"&call_id={call_id}"
        else:
            voice_url += f"?call_id={call_id}"

        status_url = settings.TWILIO_STATUS_URL
        if status_url:
            if "?" in status_url:
                status_url += f"&call_id={call_id}"
            else:
                status_url += f"?call_id={call_id}"

        try:
            # TODO: en produccion usar phone_number real del cliente
            call = client.calls.create(
                to="+51920611224",
                from_=settings.TWILIO_PHONE_NUMBER,
                url=voice_url,
                status_callback=status_url,
                status_callback_event=[
                    "initiated", "ringing", "answered", "completed"
                ],
                status_method="POST",
                timeout=30,
            )
            logger.info(
                f"Twilio llamada iniciada: {call.sid} -> {phone_number}"
            )
        except Exception as e:
            logger.error(f"Twilio dial error: {e}")

    def register_handler(self, call_id: str, handler: TwilioMediaStreamHandler):
        self._handlers[call_id] = handler

    def unregister_handler(self, call_id: str):
        self._handlers.pop(call_id, None)

    async def send_media_chunk(self, stream_sid: str, payload_b64: str):
        """Envia un chunk de audio µ-law al Media Stream de Twilio."""
        # Este metodo es llamado por el handler; el WS real esta en twilio.py
        # La referencia al websocket se guarda en el handler
        pass  # Se implementa en twilio.py con el WS real

    async def _notify_call_active(self, sess):
        """Avisa al asesor que la llamada Twilio esta activa."""
        # Buscar el WS del asesor en el provider principal
        from app.services.call_provider import provider as main_provider
        main_sess = main_provider.get_session(sess.id)
        if main_sess and main_sess.asesor_ws:
            from app.services.call_provider import _offering_out
            offering = None
            try:
                from app import models
                from app.database import SessionLocal
                db = SessionLocal()
                try:
                    off_row = db.query(models.Offering).filter(
                        models.Offering.id == sess.offering_id
                    ).first()
                    if off_row and off_row.stage in ("classified", "planned"):
                        off_row.stage = "contacted"
                        off_row.contact_status = "answered"
                        db.commit()
                        db.refresh(off_row)
                    offering = _offering_out(off_row)
                finally:
                    db.close()
            except Exception:
                pass
            await main_provider._send(main_sess.asesor_ws, {
                "type": "status",
                "state": "active",
                "offering": offering,
            })

    async def _notify_call_ended(self, sess):
        """Avisa al asesor que la llamada Twilio termino."""
        from app.services.call_provider import provider as main_provider
        main_sess = main_provider.get_session(sess.id)
        if main_sess:
            duration = round(max(
                time.time() - (main_sess.started_at or time.time()), 0
            ))
            await main_provider._send(main_sess.asesor_ws, {
                "type": "ended",
                "reason": "completed",
                "duration": duration,
                "offering": None,
            })

    async def _send_to_asesor(self, sess, msg: dict):
        """Envia un mensaje al WS del asesor via el provider principal."""
        from app.services.call_provider import provider as main_provider
        main_sess = main_provider.get_session(sess.id)
        if main_sess and main_sess.asesor_ws:
            await main_provider._send(main_sess.asesor_ws, msg)


twilio_provider = TwilioProvider()
