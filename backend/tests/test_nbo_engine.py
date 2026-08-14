"""Tests del motor NBO (scoring comercial y recomendaciones)."""
import pytest

from app.services import nbo_engine
from app.services.nbo_engine import compute_commercial_score, get_recommendations_for_client


# ---------- compute_commercial_score ----------

def test_score_con_probabilidad_cero():
    # P=0 -> solo aportan valor_comercial y prioridad
    assert compute_commercial_score(0, 25, 5) == pytest.approx(0.5)
    assert compute_commercial_score(0, 0, 0) == 0
    assert compute_commercial_score(0, 12.5, 5) == pytest.approx(0.35)


def test_score_con_probabilidad_uno():
    assert compute_commercial_score(1, 25, 5) == 1.0
    assert compute_commercial_score(1, 0, 0) == pytest.approx(0.5)


def test_score_con_arpu_gain_cero():
    assert compute_commercial_score(0.5, 0, 0) == pytest.approx(0.25)
    # arpu_gain no debe inflar mas alla de 1.0
    assert compute_commercial_score(0.5, 999, 999) == pytest.approx(0.25 + 0.3 + 0.2)


def test_score_redondeo_4_decimales():
    assert len(str(compute_commercial_score(0.3333, 17, 3)).split(".")[1]) <= 4


# ---------- get_recommendations_for_client ----------

def _make_offer(code, name, prob, arpu=20, priority=3, shap=None):
    return {
        "offer_code": code, "offer_name": name, "priority": priority,
        "arpu_gain": arpu, "probabilidad": prob,
        "shap_values": shap or {"feature": 0.3},
    }


def test_filtra_ofertas_ruido_menor_20pct(monkeypatch):
    """Las ofertas con probabilidad < 20% (ruido) no deben mostrarse."""
    monkeypatch.setattr(
        nbo_engine, "call_external_model",
        lambda cid, profile: [
            _make_offer("A", "Oferta A", 0.10),
            _make_offer("B", "Oferta B", 0.35),
            _make_offer("C", "Oferta C", 0.60),
        ],
    )
    result = get_recommendations_for_client("C00001", {})
    recs = result["recomendaciones"]
    names = [r["offer_name"] for r in recs]
    assert "Oferta A" not in names
    assert result["warning"] is None


def test_warning_y_top2_cuando_todas_menores_50pct(monkeypatch):
    monkeypatch.setattr(
        nbo_engine, "call_external_model",
        lambda cid, profile: [
            _make_offer("A", "Oferta A", 0.30, arpu=10, priority=1),
            _make_offer("B", "Oferta B", 0.40, arpu=15, priority=2),
            _make_offer("C", "Oferta C", 0.45, arpu=20, priority=3),
        ],
    )
    result = get_recommendations_for_client("C00001", {})
    assert result["warning"] is not None
    assert len(result["recomendaciones"]) == 2
    # El warning indica baja probabilidad
    assert "Baja probabilidad" in result["warning"]


def test_sin_ofertas_elegibles_siempre_recomienda_fallback(monkeypatch):
    """Sin ofertas elegibles el motor devuelve una oferta de respaldo (nunca vacío)."""
    monkeypatch.setattr(
        nbo_engine, "call_external_model",
        lambda cid, profile: [],
    )
    result = get_recommendations_for_client("C00001", {})
    assert len(result["recomendaciones"]) == 1
    assert result["recomendaciones"][0]["low_probability"] is True
    assert result["warning"] is not None


def test_fallback_reusa_oferta_de_campana():
    """El fallback aprovecha la oferta de la campaña de retención más reciente."""
    profile = {"historial_campanias": [{"campaña": "Retención Fin de Año", "oferta": "Movistar Total Premium"}]}
    result = get_recommendations_for_client("C00001", profile)
    assert len(result["recomendaciones"]) == 1
    assert result["recomendaciones"][0]["offer_name"] == "Movistar Total Premium"
    assert 0.05 <= result["recomendaciones"][0]["probabilidad"] <= 0.20


def test_orden_final_por_score_descendente(monkeypatch):
    """El orden debe ser por score, no por probabilidad (score pondera arpu/prioridad)."""
    # Oferta A: prob alta pero arpu/prioridad bajos; Oferta B: prob menor pero arpu/prioridad altos.
    monkeypatch.setattr(
        nbo_engine, "call_external_model",
        lambda cid, profile: [
            _make_offer("A", "Oferta A", 0.70, arpu=2, priority=1),
            _make_offer("B", "Oferta B", 0.55, arpu=25, priority=5),
            _make_offer("C", "Oferta C", 0.60, arpu=10, priority=2),
        ],
    )
    result = get_recommendations_for_client("C00001", {})
    recs = result["recomendaciones"]
    assert len(recs) >= 2
    scores = [r["score"] for r in recs]
    assert scores == sorted(scores, reverse=True), "El orden debe ser por score descendente"
    # B debe quedar primero aunque su probabilidad sea menor que A
    assert recs[0]["offer_name"] == "Oferta B"


def test_marca_low_probability_en_cada_oferta(monkeypatch):
    monkeypatch.setattr(
        nbo_engine, "call_external_model",
        lambda cid, profile: [
            _make_offer("A", "Oferta A", 0.45),
            _make_offer("B", "Oferta B", 0.80),
        ],
    )
    result = get_recommendations_for_client("C00001", {})
    by_name = {r["offer_name"]: r for r in result["recomendaciones"]}
    assert by_name["Oferta A"]["low_probability"] is True
    assert by_name["Oferta B"]["low_probability"] is False


def test_con_modelo_real_cliente_elegible():
    """Smoke test: con un cliente elegible el motor devuelve ofertas ordenadas."""
    profile = {
        "consumo": {"datos_gb": 80, "app_uso": "Alto"},
        "hogar": {"tiene_internet": True},
        "servicio": {"antiguedad_meses": 36},
        "comportamiento": {"nps": 9},
        "elegibilidad": {"movistar_total": True, "upgrade": True, "equipo": True, "plan_hogar": False},
    }
    result = get_recommendations_for_client("C00001", profile)
    assert result["recomendaciones"]
    scores = [r["score"] for r in result["recomendaciones"]]
    assert scores == sorted(scores, reverse=True)
    # Sin warning porque hay ofertas con probabilidad alta
    assert result["warning"] is None or "Baja probabilidad" not in result["warning"]
