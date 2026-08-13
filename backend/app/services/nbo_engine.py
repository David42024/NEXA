"""
Motor de recomendacion NBO (Next Best Offer).

En produccion esto llamaria a un endpoint externo (API del equipo estadistico)
que devuelve probabilidad + shap_values por oferta. Aqui se simula ese
contrato de forma deterministica a partir del perfil del cliente, para que
el resto del sistema (scoring comercial, alertas de baja probabilidad,
explicabilidad) funcione end-to-end sin depender de un modelo real.

Reemplazar `call_external_model()` por la llamada real cuando el equipo
de datos entregue el endpoint (mismo contrato de entrada/salida).
"""
from typing import List, Dict, Any

from app.config import settings

# Catalogo de ofertas base (coincide con seed_data.py -> tabla offers)
OFFER_CATALOG = [
    {"code": "MT_PREMIUM", "name": "Movistar Total Premium", "priority": 5, "arpu_gain": 25},
    {"code": "MT_BASICO", "name": "Movistar Total Basico", "priority": 4, "arpu_gain": 15},
    {"code": "UPGRADE_MOVIL", "name": "Upgrade Movil", "priority": 3, "arpu_gain": 12},
    {"code": "EQUIPO_NUEVO", "name": "Equipo Nuevo", "priority": 2, "arpu_gain": 8},
    {"code": "PLAN_HOGAR", "name": "Plan Hogar", "priority": 3, "arpu_gain": 18},
]


def _feature_signals(profile: Dict[str, Any]) -> Dict[str, float]:
    """Deriva señales normalizadas (0-1) del perfil para alimentar el scoring simulado."""
    consumo = profile.get("consumo", {})
    hogar = profile.get("hogar", {})
    elegibilidad = profile.get("elegibilidad", {})
    comportamiento = profile.get("comportamiento", {})
    servicio = profile.get("servicio", {})

    datos_gb = consumo.get("datos_gb", 0) or 0
    signals = {
        "elegibilidad_mt": 1.0 if elegibilidad.get("movistar_total") else 0.0,
        "consumo_datos": min(datos_gb / 100, 1.0),
        "internet_hogar": 1.0 if hogar.get("tiene_internet") else 0.0,
        "app_uso": {"Alto": 1.0, "Medio": 0.6, "Bajo": 0.3}.get(consumo.get("app_uso"), 0.3),
        "antiguedad": min((servicio.get("antiguedad_meses", 0) or 0) / 36, 1.0),
        "satisfaccion": min((comportamiento.get("nps", 5) or 5) / 10, 1.0),
        "elegibilidad_upgrade": 1.0 if elegibilidad.get("upgrade") else 0.0,
        "elegibilidad_equipo": 1.0 if elegibilidad.get("equipo") else 0.0,
        "elegibilidad_hogar": 1.0 if elegibilidad.get("plan_hogar") else 0.0,
    }
    return signals


def call_external_model(client_id: str, profile: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Simula la respuesta del endpoint externo del equipo estadistico."""
    signals = _feature_signals(profile)
    results = []

    for offer in OFFER_CATALOG:
        if offer["code"] in ("MT_PREMIUM", "MT_BASICO") and not profile.get("elegibilidad", {}).get("movistar_total"):
            continue
        if offer["code"] == "UPGRADE_MOVIL" and not profile.get("elegibilidad", {}).get("upgrade"):
            continue
        if offer["code"] == "EQUIPO_NUEVO" and not profile.get("elegibilidad", {}).get("equipo"):
            continue
        if offer["code"] == "PLAN_HOGAR" and not profile.get("elegibilidad", {}).get("plan_hogar"):
            continue

        if offer["code"] == "MT_PREMIUM":
            prob = 0.35 + 0.32 * signals["elegibilidad_mt"] + 0.21 * signals["consumo_datos"] + 0.17 * signals["internet_hogar"] + 0.05 * signals["app_uso"]
            shap = {
                "elegibilidad_mt": round(0.32 * signals["elegibilidad_mt"], 3),
                "consumo_datos": round(0.21 * signals["consumo_datos"], 3),
                "internet_hogar": round(0.17 * signals["internet_hogar"], 3),
                "app_uso": round(0.11 * signals["app_uso"], 3),
                "antiguedad": round(0.08 * signals["antiguedad"], 3),
            }
        elif offer["code"] == "MT_BASICO":
            prob = 0.30 + 0.28 * signals["elegibilidad_mt"] + 0.15 * signals["internet_hogar"] + 0.10 * signals["antiguedad"]
            shap = {
                "elegibilidad_mt": round(0.28 * signals["elegibilidad_mt"], 3),
                "internet_hogar": round(0.15 * signals["internet_hogar"], 3),
                "antiguedad": round(0.10 * signals["antiguedad"], 3),
                "consumo_datos": round(0.09 * signals["consumo_datos"], 3),
            }
        elif offer["code"] == "UPGRADE_MOVIL":
            prob = 0.25 + 0.30 * signals["elegibilidad_upgrade"] + 0.20 * signals["consumo_datos"] + 0.10 * signals["satisfaccion"]
            shap = {
                "elegibilidad_upgrade": round(0.30 * signals["elegibilidad_upgrade"], 3),
                "consumo_datos": round(0.20 * signals["consumo_datos"], 3),
                "satisfaccion": round(0.10 * signals["satisfaccion"], 3),
            }
        elif offer["code"] == "EQUIPO_NUEVO":
            prob = 0.20 + 0.25 * signals["elegibilidad_equipo"] + 0.15 * signals["antiguedad"]
            shap = {
                "elegibilidad_equipo": round(0.25 * signals["elegibilidad_equipo"], 3),
                "antiguedad": round(0.15 * signals["antiguedad"], 3),
                "satisfaccion": round(0.08 * signals["satisfaccion"], 3),
            }
        else:  # PLAN_HOGAR
            prob = 0.25 + 0.30 * signals["elegibilidad_hogar"] + 0.15 * (1 - signals["internet_hogar"])
            shap = {
                "elegibilidad_hogar": round(0.30 * signals["elegibilidad_hogar"], 3),
                "sin_internet_hogar": round(0.15 * (1 - signals["internet_hogar"]), 3),
                "consumo_datos": round(0.10 * signals["consumo_datos"], 3),
            }

        prob = max(0.05, min(0.97, round(prob, 4)))
        results.append({
            "offer_code": offer["code"],
            "offer_name": offer["name"],
            "priority": offer["priority"],
            "arpu_gain": offer["arpu_gain"],
            "probabilidad": prob,
            "shap_values": shap,
        })

    results.sort(key=lambda r: r["probabilidad"], reverse=True)
    return results[: settings.MAX_OFFERS_EVALUATED]


def compute_commercial_score(probabilidad: float, arpu_gain: float, priority: int) -> float:
    """Score = (P_aceptacion x 0.50) + (Valor_comercial x 0.30) + (Prioridad_estrategica x 0.20)"""
    valor_comercial_norm = min(arpu_gain / 25, 1.0)
    prioridad_norm = min(priority / 5, 1.0)
    score = (probabilidad * 0.50) + (valor_comercial_norm * 0.30) + (prioridad_norm * 0.20)
    return round(score, 4)


def get_recommendations_for_client(
    client_id: str,
    profile: Dict[str, Any],
    low_threshold: float = None,
    noise_threshold: float = None,
) -> Dict[str, Any]:
    """Genera recomendaciones ordenadas por score.

    `low_threshold` y `noise_threshold` se pueden inyectar desde la configuracion
    en caliente (tabla app_config); si no se pasan, usan los valores de config.py.
    """
    low_threshold = low_threshold if low_threshold is not None else settings.LOW_PROBABILITY_THRESHOLD
    noise_threshold = noise_threshold if noise_threshold is not None else settings.NOISE_PROBABILITY_THRESHOLD

    raw = call_external_model(client_id, profile)
    eligible = len(raw) > 0

    scored = []
    for r in raw:
        if r["probabilidad"] < noise_threshold:
            continue  # no mostrar ofertas < umbral de ruido
        score = compute_commercial_score(r["probabilidad"], r["arpu_gain"], r["priority"])
        scored.append({**r, "score": score})

    scored.sort(key=lambda r: r["score"], reverse=True)

    warning = None
    if not scored:
        warning = "No hay ofertas elegibles con probabilidad suficiente para este cliente."
    elif all(r["probabilidad"] < low_threshold for r in scored):
        warning = "⚠️ Baja probabilidad de aceptación. Considere estrategia alternativa."
        scored = scored[:2]  # mostrar top 2 con alerta
    else:
        scored = scored[:2] if len(scored) > 2 else scored  # 2 ofertas suficientes para MVP

    for r in scored:
        r["low_probability"] = r["probabilidad"] < low_threshold

    return {"recomendaciones": scored, "warning": warning, "eligible": eligible}
