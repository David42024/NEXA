"""Deteccion del animo del cliente durante la llamada (heuristica, sin LLM).

Cada transcripcion final del cliente ajusta un puntaje continuo de animo
(-1 enojado ... +1 entusiasmado) con suavizado exponencial. El panel del asesor
lo usa para actualizar en vivo los KPIs (probabilidad de cierre) y mostrar el
estado emocional del cliente.
"""

NEGATIVE = [
    "molesto", "enojad", "fastidiad", "disgustad", "furios", "indignad",
    "queja", "quejar", "mal servicio", "terrible", "horrible", "inaceptable",
    "pesimo", "estafa", "robo", "mentira", "mentiroso", "trampa", "estafaron",
    "no me interesa", "no me importa", "no quiero", "callate", "basta",
    "me arrepiento", "incapaz", "caro", "cuesta mucho", "mucho dinero",
]

POSITIVE = [
    "me interesa", "me gusta", "suena bien", "me conviene", "esta bien",
    "de acuerdo", "genial", "excelente", "me sirve", "acepto", "adelante",
    "me interesaria", "cuanto cuesta", "que incluye", "me encantaria",
    "perfecto", "aprovecho", "quiero", "me llama la atencion", "buena oferta",
    "buena promocion", "si, quiero",
]

NEUTRAL = [
    "no se", "depende", "lo pensare", "quizas", "tal vez", "no estoy seguro",
    "mas o menos", "aun no",
]


def score_text(text: str) -> float:
    """Delta [-1, 1] que aporta esta frase al animo de la llamada."""
    t = (text or "").lower()
    score = 0.0
    for w in NEGATIVE:
        if w in t:
            score -= 0.35
    for w in POSITIVE:
        if w in t:
            score += 0.35
    for w in NEUTRAL:
        if w in t:
            score *= 0.5  # la indecision modera el extremo
    return max(-1.0, min(1.0, score))


def mood_from_score(score: float) -> dict:
    """Etiqueta, tono (para colores) y nivel (-2..2) segun el puntaje acumulado."""
    if score <= -0.5:
        return {"label": "Enojado", "tone": "bad", "level": -2}
    if score <= -0.15:
        return {"label": "Molesto", "tone": "warn", "level": -1}
    if score < 0.15:
        return {"label": "Indeciso", "tone": "muted", "level": 0}
    if score < 0.5:
        return {"label": "Receptivo", "tone": "good", "level": 1}
    return {"label": "Entusiasmado", "tone": "good", "level": 2}


def smooth_score(current: float, delta: float) -> float:
    """Suavizado exponencial: una frase no mueve el animo de golpe."""
    return max(-1.0, min(1.0, current * 0.7 + delta * 0.3))
