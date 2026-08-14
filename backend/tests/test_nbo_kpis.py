"""Tests del contrato de datos para el Dashboard Comercial NBO.

Verifica que el perfil sembrado incluya las variables de los 5 KPIs y que
la API de recomendaciones exponga precio/ahorro_pct para el calculo de
ahorro real proyectado (KPI 2) y el comparativo de gasto (grafico).
"""
from app.services import nbo_engine
from app.services.nbo_engine import OFFER_CATALOG
from app.seed_data import build_client_profile

from conftest import login, auth


def test_catalogo_ofertas_tiene_precio_y_ahorro_pct():
    """Todo el catalogo debe traer precio mensual y descuento (hasta 50%)."""
    assert OFFER_CATALOG
    for o in OFFER_CATALOG:
        assert o["precio"] > 0, f"{o['code']} sin precio"
        assert 0 < o["ahorro_pct"] <= 0.5, f"{o['code']} con ahorro_pct invalido"


def test_engine_devuelve_precio_y_ahorro_pct():
    """El contrato del motor NBO incluye precio y ahorro_pct por oferta."""
    profile = {
        "consumo": {"datos_gb": 80, "app_uso": "Alto"},
        "hogar": {"tiene_internet": True},
        "elegibilidad": {"movistar_total": True, "upgrade": True, "equipo": True, "plan_hogar": True},
        "servicio": {"antiguedad_meses": 24},
        "comportamiento": {"nps": 8},
    }
    results = nbo_engine.call_external_model("C00001", profile)
    assert results
    for r in results:
        assert r["precio"] > 0
        assert 0 < r["ahorro_pct"] <= 0.5


def test_recomendacion_api_incluye_precio_y_ahorro_pct(client):
    token = login(client)
    headers = auth(token)
    resp = client.post("/api/recommendations/generate", json={"client_id": "C00001"}, headers=headers)
    assert resp.status_code == 200, resp.text
    recs = resp.json()["recomendaciones"]
    assert recs, "C00001 es elegible MT y deberia traer recomendaciones"
    for r in recs:
        assert "precio" in r and r["precio"] > 0, r
        assert "ahorro_pct" in r and r["ahorro_pct"] > 0, r


def test_profile_enriquecido_con_variables_del_dashboard():
    """El seed debe poblar las variables de los 5 KPIs del perfil."""
    for i in range(5):
        p = build_client_profile(i)
        f = p["facturacion"]
        c = p["consumo"]
        b = p["comportamiento"]

        # KPI 2
        assert f["monto_facturado_prom"] > 0
        # KPI 3
        assert 1 <= c["dias_agotamiento_datos_promedio"] <= 45
        # KPI 4
        assert b["n_reclamos"] >= 0
        assert f["dias_mora_prom"] >= 0
        # KPI 5
        assert b["canal_mas_usado"]
        assert c["mejor_franja_horaria_contacto"]
        # Timeline (grafico de campanias)
        campanias = p["historial_campanias"]
        assert isinstance(campanias, list) and len(campanias) >= 2
        for camp in campanias:
            assert camp["fecha"] and camp["etapa"] and camp["canal"]
            assert camp["oferta"]