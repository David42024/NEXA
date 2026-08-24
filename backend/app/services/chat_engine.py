"""
Nexabot: asistente comercial en tiempo real para el asesor.

Responde objeciones y sugiere speechs usando los datos reales del cliente.

Flujo de contingencia (igual que speech):
1. Groq (primario, timeout 5s)
2. Gemini (fallback)
3. Plantilla local determinista si ambos fallan
"""
import logging
import re
from typing import Dict

import httpx

from app.config import settings

logger = logging.getLogger("nexa.nexabot")


def _fmt(value, suffix=""):
    return f"{value}{suffix}" if value is not None else "n/d"


def build_context(client: Dict) -> Dict:
    """Extrae de client.profile un contexto compacto para el prompt."""
    p = client.get("profile") or {}
    servicio = p.get("servicio") or {}
    consumo = p.get("consumo") or {}
    comp = p.get("comportamiento") or {}
    fact = p.get("facturacion") or {}

    monto = fact.get("monto_facturado_prom") or fact.get("monto_promedio_6m")
    dias_datos = consumo.get("dias_agotamiento_datos_promedio")
    n_reclamos = comp.get("n_reclamos") or comp.get("reclamos_12m") or 0
    dias_mora = fact.get("dias_mora_prom") or 0
    canal = comp.get("canal_mas_usado") or comp.get("canal_principal")
    franja = consumo.get("mejor_franja_horaria_contacto") or consumo.get("horario_pico")
    hogar = p.get("hogar") or {}

    return {
        "nombre": (client.get("name") or "cliente").split()[0],
        "plan": servicio.get("plan") or "Postpago",
        "tipo_cliente": servicio.get("tipo"),
        "edad_rango": servicio.get("edad_rango"),
        "departamento": p.get("ubicacion_departamento") or p.get("distrito"),
        "antiguedad_meses": servicio.get("antiguedad_meses"),
        "datos_gb": consumo.get("datos_gb"),
        "dias_agotamiento": dias_datos,
        "voz_minutos": consumo.get("voz_minutos"),
        "sms": consumo.get("sms"),
        "app_uso": consumo.get("app_uso"),
        "monto_facturado": monto,
        "metodo_pago": fact.get("metodo_pago_frecuente"),
        "tiene_internet": hogar.get("tiene_internet"),
        "n_reclamos": n_reclamos,
        "dias_mora": dias_mora,
        "canal": canal,
        "franja": franja,
        "oferta": None,
        "precio": None,
        "ahorro_pct": None,
        "probabilidad_pct": None,
    }


def _fill_top_offer(ctx: Dict, top_offer: Dict):
    ctx["oferta"] = top_offer.get("oferta")
    ctx["precio"] = top_offer.get("precio")
    ctx["ahorro_pct"] = top_offer.get("ahorro_pct")
    ctx["probabilidad_pct"] = (
        round(top_offer["probabilidad"] * 100) if top_offer.get("probabilidad") is not None else None
    )


def _context_text(ctx: Dict) -> str:
    monto = _fmt(ctx["monto_facturado"], " soles")
    ahorro = ctx.get("monto_facturado") and ctx.get("ahorro_pct") is not None \
        and f" {ctx['monto_facturado'] * ctx['ahorro_pct']:.2f} soles de ahorro/mes" or ""
    dias = ctx.get("dias_agotamiento")
    if dias is None:
        consumo_text = f"Consumo: {_fmt(ctx['datos_gb'], ' GB de datos')}."
    elif dias >= 30:
        # Si los datos cubren el ciclo (30 dias) NO hay hambre de datos.
        consumo_text = (
            f"Consumo: {_fmt(ctx['datos_gb'], ' GB de datos')}; tiene datos para {dias} dias "
            "(cubre el ciclo, sin hambre de datos)."
        )
    else:
        consumo_text = (
            f"Consumo: {_fmt(ctx['datos_gb'], ' GB de datos')}; agotara sus datos en {dias} dias "
            "(antes del fin del ciclo)."
        )
    lines = [
        f"Cliente: {ctx['nombre']}, plan {ctx['plan']} con {_fmt(ctx['antiguedad_meses'], ' meses')} de antiguedad.",
        consumo_text,
        f"Factura promedio: {monto}{ahorro}.",
        f"Friccion: {_fmt(ctx['n_reclamos'], ' reclamos')} y {_fmt(ctx['dias_mora'], ' dias de mora')}.",
        f"Mejor contacto: canal {_fmt(ctx['canal'])} en franja {_fmt(ctx['franja'])}.",
    ]
    if ctx.get("tipo_cliente") or ctx.get("edad_rango"):
        perfil = "Perfil"
        if ctx.get("tipo_cliente"):
            perfil += f" {ctx['tipo_cliente']}"
        if ctx.get("edad_rango"):
            perfil += f", edad {ctx['edad_rango']}"
        if ctx.get("departamento"):
            perfil += f", ubicado en {ctx['departamento']}"
        if ctx.get("metodo_pago"):
            perfil += f", paga con {ctx['metodo_pago']}"
        lines.append(perfil + ".")
    if ctx.get("voz_minutos") or ctx.get("sms") is not None or ctx.get("app_uso"):
        uso = "Uso adicional"
        if ctx.get("voz_minutos"):
            uso += f" {ctx['voz_minutos']} min de voz"
        if ctx.get("sms") is not None:
            uso += f", {ctx['sms']} SMS"
        if ctx.get("app_uso"):
            uso += f", uso de app {ctx['app_uso']}"
        lines.append(uso + ".")
    if ctx.get("tiene_internet") is not None:
        lines.append(f"Hogar: {'con internet fijo' if ctx['tiene_internet'] else 'sin internet en el hogar'}.")
    if ctx.get("oferta"):
        lines.append(
            f"Oferta recomendada: {ctx['oferta']} a {_fmt(ctx['precio'], ' soles')}/mes "
            f"con {_fmt(ctx['probabilidad_pct'], '%')} de probabilidad de aceptacion "
            f"y {_fmt(ctx['ahorro_pct'] and round(ctx['ahorro_pct'] * 100), '%')} de ahorro."
        )
    return "\n".join(lines)


def _build_prompt(ctx: Dict, message: str, transcript=None) -> str:
    parts = [
        (
            "Eres Nexabot, asistente comercial de Movistar. Responde cualquier consulta del asesor: "
            "objeciones, argumentos de venta, planes, tarifas, cobertura, portabilidad, reclamos o dudas "
            "generales que el asesor no sepa. Responde en espanol neutro, CONCISO: 1-2 frases, directo al punto, "
            "con datos numericos si aplica. Si el asesor pide un speech, escribelo entre comillas. "
            "Contexto del cliente:\n"
            f"{_context_text(ctx)}"
        )
    ]
    if transcript:
        lines = "\n".join(str(t) for t in transcript[-30:])
        parts.append(
            "Transcripcion reciente de la llamada en curso (usala si la pregunta "
            f"se refiere a la conversacion):\n{lines}"
        )
    parts.append(f"Pregunta del asesor: \"{message}\"")
    return "\n\n".join(parts)


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
                "max_tokens": 160,
                "temperature": 0.6,
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


def _local_reply(ctx: Dict, message: str) -> str:
    """Plantilla determinista por keyword; usada si ambas APIs fallan o no hay keys."""
    msg = (message or "").lower()
    nombre = ctx["nombre"]
    monto = ctx.get("monto_facturado")
    ahorro_pct = ctx.get("ahorro_pct")
    ahorro = (monto * ahorro_pct) if monto and ahorro_pct is not None else None

    if any(w in msg for w in ("caro", "precio", "cost", "presupuesto", "no me conviene")):
        if ctx.get("oferta") and ahorro is not None and ctx.get("precio") is not None:
            return (
                f"{nombre}, hoy paga S/ {monto:.2f} y con {ctx['oferta']} pasa a S/ {ctx['precio']:.2f}: "
                f"{ahorro:.2f} soles de ahorro al mes. Pregúntale cuánto paga hoy y contrasta la diferencia."
            )
        return (
            f"Si menciona precio, {nombre}, enfócate en el ahorro mensual, no en el costo absoluto. "
            "Cierra con: '¿Qué opinas si te muestro cuánto ahorrarías?'"
        )
    if any(w in msg for w in ("otro operador", "competencia", "claro", "entel", "bitel", "otra empresa")):
        return (
            f"Destaca el beneficio acumulado, {nombre}: con esta oferta ahorra sin cambiar de operador. "
            "Pregunta qué le ofrecen y contrasta solo con datos propios."
        )
    if any(w in msg for w in ("no necesita", "no interesa", "no quiere", "molesta")):
        return (
            f"No fuerces, {nombre}: valida su situación actual y plantea la oferta como opción futura. "
            "Cierra con: '¿Qué es lo que más valora de su plan hoy?'"
        )
    if any(w in msg for w in ("reclamo", "queja", "problema", "mala señal", "atencion")):
        return (
            f"Con {ctx['n_reclamos']} reclamo(s) previo(s), {nombre}, primero reconoce el problema y "
            "agradece su permanencia. Usa la oferta como gesto comercial; nunca lo minimices."
        )
    if any(w in msg for w in ("portabilidad", "cambiar de operador", "cambio de operador", "mismo numero", "mismo número")):
        return (
            "La portabilidad conserva el número al cambiar de operador y tarda de 1 a 2 días hábiles. "
            "Para retenerlo, destaca el ahorro acumulado y el plan único en un solo recibo."
        )
    if any(w in msg for w in ("total", "plan", "tarifa", "premium", "fibra", "hogar", "gig", "gb", "incluye", "incluyen")):
        return (
            "Movistar Total une móvil, fibra y TV en un solo recibo con un precio único. "
            "Revisa el catálogo de ofertas o el plan actual del cliente para detallar beneficios."
        )
    if ctx.get("oferta") and ahorro is not None:
        return (
            f"Usa datos, {nombre}: hoy paga S/ {monto:.2f} y con {ctx['oferta']} ahorraría "
            f"S/ {ahorro:.2f} al mes. Mejor momento: {ctx['canal'] or 'el canal que prefiera'}. "
            "Termina con una pregunta corta."
        )
    return (
        f"Revisé el perfil de {nombre}: plan {ctx['plan']}, factura promedio de S/ {monto:.2f} "
        f"y {ctx['n_reclamos']} reclamo(s) previo(s). ¿Qué aspecto quieres profundizar?"
    )


async def generate_nexabot_reply(ctx: Dict, message: str, transcript=None) -> Dict:
    prompt = _build_prompt(ctx, message, transcript)
    source = "groq"
    try:
        reply = await _call_groq(prompt)
    except Exception as e:
        logger.warning(f"Nexabot Groq fallo: {e}")
        source = "gemini"
        try:
            reply = await _call_gemini(prompt)
        except Exception as e2:
            logger.error(f"Nexabot Gemini tambien fallo: {e2}")
            source = "local"
            reply = _local_reply(ctx, message)
    return {"reply": reply, "source": source}


# ---------- Chat directo con el cliente (canal de mensajes) ----------
def latest_top_offer(db, client_id: str):
    """Mejor recomendacion vigente del cliente (si existe) para contextualizar al asistente."""
    from app import models
    from app.services.nbo_engine import OFFER_CATALOG

    rec = (
        db.query(models.Recommendation)
        .filter(models.Recommendation.client_id == client_id)
        .order_by(models.Recommendation.id.desc())
        .first()
    )
    if not rec or not rec.offer_id:
        return None
    offer = db.query(models.Offer).filter(models.Offer.id == rec.offer_id).first()
    if not offer:
        return None
    catalog = next((o for o in OFFER_CATALOG if o["code"] == offer.code), None)
    return {
        "oferta": offer.name,
        "precio": (catalog or {}).get("precio"),
        "ahorro_pct": (catalog or {}).get("ahorro_pct"),
        "probabilidad": rec.probability,
    }


_CLIENT_CHAT_BASE = (
    "Eres el asistente virtual de Movistar Peru conversando por mensajes de texto con un cliente "
    "(estilo WhatsApp). Objetivo: ayudarlo y ofrecerle la oferta recomendada de forma amable y breve. "
    "Reglas: responde en espanol, MAXIMO 2-3 frases cortas tipo mensaje de texto, sin repetir saludos, "
    "sin firmar, sin emojis. Usa los datos del cliente solo si aportan al mensaje. Nunca inventes "
    "precios ni beneficios que no esten en el contexto.\n"
)


def _build_client_chat_prompt(ctx: Dict, instruction: str, history=None) -> str:
    parts = [f"{_CLIENT_CHAT_BASE}Datos del cliente:\n{_context_text(ctx)}"]
    if history:
        lines = "\n".join(str(h) for h in history[-20:])
        parts.append(f"Conversacion hasta ahora:\n{lines}")
    parts.append(instruction)
    return "\n\n".join(parts)


async def generate_client_chat_opening(ctx: Dict) -> Dict:
    """Primer mensaje automatico del chat con el cliente (presenta la oferta)."""
    instruction = (
        "Escribe el PRIMER mensaje de esta conversacion: presentate brevemente como asistente de "
        "Movistar, menciona la oferta recomendada con su precio mensual y el ahorro, y cierra con una "
        "pregunta corta que invite a responder."
    )
    prompt = _build_client_chat_prompt(ctx, instruction)
    source = "groq"
    try:
        reply = await _call_groq(prompt)
    except Exception as e:
        logger.warning(f"Chat cliente Groq fallo: {e}")
        source = "gemini"
        try:
            reply = await _call_gemini(prompt)
        except Exception as e2:
            logger.error(f"Chat cliente Gemini tambien fallo: {e2}")
            source = "local"
            reply = _local_client_opening(ctx)
    return {"reply": reply, "source": source}


async def generate_client_chat_reply(ctx: Dict, message: str, history=None) -> Dict:
    """Respuesta automatica del bot a un mensaje del cliente."""
    instruction = f'Mensaje del cliente: "{message}"\nResponde como Movistar:'
    prompt = _build_client_chat_prompt(ctx, instruction, history=history)
    source = "groq"
    try:
        reply = await _call_groq(prompt)
    except Exception as e:
        logger.warning(f"Chat cliente Groq fallo: {e}")
        source = "gemini"
        try:
            reply = await _call_gemini(prompt)
        except Exception as e2:
            logger.error(f"Chat cliente Gemini tambien fallo: {e2}")
            source = "local"
            reply = _local_client_reply(ctx, message)
    return {"reply": reply, "source": source}


def _local_client_opening(ctx: Dict) -> str:
    nombre = ctx["nombre"]
    if ctx.get("oferta") and ctx.get("precio") is not None:
        ahorro = ""
        if ctx.get("ahorro_pct"):
            ahorro = f" Ahorrarias cerca de {round(ctx['ahorro_pct'] * 100)}% en tu recibo."
        return (
            f"Hola {nombre}, te escribe el asistente de Movistar. Vimos tu plan actual y tenemos para ti "
            f"{ctx['oferta']} por solo S/ {ctx['precio']:.2f} al mes.{ahorro} "
            "Te cuento mas detalles?"
        )
    return (
        f"Hola {nombre}, te escribe el asistente de Movistar. Queremos ofrecerte beneficios exclusivos "
        "para tu linea. Te interesa conocerlos?"
    )


def _local_client_reply(ctx: Dict, message: str) -> str:
    """Plantilla determinista orientada AL CLIENTE (fallback sin APIs)."""
    msg = (message or "").lower()
    nombre = ctx["nombre"]

    if any(w in msg for w in ("hola", "buenas", "buenos dias", "buenas tardes", "buenas noches")):
        return f"Hola {nombre}, un gusto. En que te puedo ayudar con tu linea Movistar?"

    if any(w in msg for w in ("precio", "cuanto", "costo", "cost", "caro", "tarifa", "pago")):
        if ctx.get("oferta") and ctx.get("precio") is not None:
            monto = ctx.get("monto_facturado")
            base = f"La oferta {ctx['oferta']} cuesta S/ {ctx['precio']:.2f} al mes"
            if monto and ctx.get("ahorro_pct"):
                base += (
                    f"; hoy pagas S/ {monto:.2f}, asi que ahorrarias "
                    f"S/ {monto * ctx['ahorro_pct']:.2f} cada mes"
                )
            return base + ". Quieres que te la active?"
        return "Con gusto te comparto el detalle de precios. Podrias confirmarme a que oferta te refieres?"

    if any(w in msg for w in ("datos", "gigas", " gb", "internet", "naveg")):
        if ctx.get("oferta"):
            return (
                f"{ctx['oferta']} incluye mas gigas para que no te quedes sin datos antes de fin de mes. "
                "Te paso todos los beneficios?"
            )
        return "Tenemos planes con mas gigas al mismo precio. Quieres que te cuente las opciones?"

    if any(w in msg for w in ("claro", "entel", "bitel", "portabil", "cambiar de operador", "competencia", "otro operador")):
        return (
            "Puedes portarte a Movistar conservando tu numero y manteniendo tus beneficios actuales. "
            "Te explico lo rapido que es el proceso?"
        )

    if any(w in msg for w in ("no interesa", "no gracias", "no me interesa", "molesta", "luego", "despues")):
        return (
            f"Sin problema, {nombre}. Te dejo el dato y cuando lo necesites aqui estare. "
            "Puedo hacer algo mas por ti hoy?"
        )

    if any(w in msg for w in ("reclamo", "problema", "queja", "senal", "señal", "ayuda", "soporte")):
        return (
            "Lamento lo que estas pasando, vamos a resolverlo. Un asesor humano revisara tu caso y te "
            "contactara a la brevedad. Me puedes dar mas detalles?"
        )

    if any(w in msg for w in ("gracias", "ok", "perfecto", "dale", "si quiero", "si")):
        return f"Perfecto, {nombre}. Queda registrada tu solicitud y un asesor confirmara los detalles. Algo mas?"

    return (
        "Gracias por escribir. Para ayudarte mejor: quieres conocer la oferta para tu linea o tienes "
        "una consulta sobre tu servicio?"
    )