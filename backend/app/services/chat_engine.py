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

    return {
        "nombre": (client.get("name") or "cliente").split()[0],
        "plan": servicio.get("plan") or "Postpago",
        "antiguedad_meses": servicio.get("antiguedad_meses"),
        "datos_gb": consumo.get("datos_gb"),
        "dias_agotamiento": dias_datos,
        "monto_facturado": monto,
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
    if ctx.get("oferta"):
        lines.append(
            f"Oferta recomendada: {ctx['oferta']} a {_fmt(ctx['precio'], ' soles')}/mes "
            f"con {_fmt(ctx['probabilidad_pct'], '%')} de probabilidad de aceptacion "
            f"y {_fmt(ctx['ahorro_pct'] and round(ctx['ahorro_pct'] * 100), '%')} de ahorro."
        )
    return "\n".join(lines)


def _build_prompt(ctx: Dict, message: str) -> str:
    return (
        "Eres Nexabot, asistente comercial de Movistar. Responde cualquier consulta del asesor: "
        "objeciones, argumentos de venta, planes, tarifas, cobertura, portabilidad, reclamos o dudas "
        "generales que el asesor no sepa. Responde en espanol neutro, CONCISO: 1-2 frases, directo al punto, "
        "con datos numericos si aplica. Si el asesor pide un speech, escribelo entre comillas. "
        "Contexto del cliente:\n"
        f"{_context_text(ctx)}\n"
        f"Pregunta del asesor: \"{message}\""
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


async def generate_nexabot_reply(ctx: Dict, message: str) -> Dict:
    prompt = _build_prompt(ctx, message)
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