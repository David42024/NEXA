"""Tests del cargador de CSV reales (acople de la BD sin romper el schema)."""
import csv
import io
from datetime import date

from app import models
from app.services import csv_loader

OFFERS_SAMPLE = """oferta_id,nombre_oferta,tipo_oferta,segmento_objetivo,es_movistar_total,precio_mensual,ahorro_pct,gb_incluidos,cluster_hogar,descripcion_bundle,descripcion_corta,es_gigas_ilimitados
OFE_001,Plan Movil Premium 1,plan_movil,movil,False,69.9,0,9999,no_aplica,sin_bundle,Plan Movil Premium 1 - 9999GB - S/69.9,True
OFE_011,Movistar Total Premium 11,movistar_total,ambos,True,149.9,30,9999,trio,Internet + TV + Fijo + Movil,Movistar Total Premium 11 - 9999GB - S/149.9,True
"""

CLIENTS_SAMPLE = """cliente_id,tipo_cliente,antiguedad_meses,tiene_movil,tiene_hogar,oferta_hogar_id,tiene_internet_hogar,es_movistar_total,elegible_mt,plan_actual_id,monto_facturado_prom,edad_rango,ubicacion_departamento,es_usuario_app,consumo_datos_gb_prom,consumo_voz_min_prom,consumo_sms_prom,uso_app_movistar_prom,monto_facturado_prom_6m,dias_mora_prom,meses_moroso,n_reclamos,n_actividad_canal,canal_mas_usado,mejor_franja_horaria_contacto,dias_agotamiento_datos_promedio,metodo_pago_frecuente
CLI_000001,postpago,80,True,False,sin_servicio_hogar,False,False,False,OFE_001,152.98,36-45,La Libertad,False,64.12,14.43,1.94,7.25,120.09,7.57,2,4,48,Tienda,Fin_de_semana,24,Debito_Automatico
CLI_000002,prepago,86,True,False,sin_servicio_hogar,False,False,False,OFE_001,55.55,65+,Lima,False,13.13,308.75,36.88,12.71,281.67,10.32,0,3,20,Call_Out,Noche,28,App_MiMovistar
CLI_000003,no_aplica,105,False,True,OFE_016,True,False,False,OFE_009,285.71,18-25,La Libertad,True,0.0,0.0,0.0,0.0,157.24,2.63,5,0,36,Call_Out,Fin_de_semana,-1,App_MiMovistar
"""

OFFERINGS_SAMPLE = """ofrecimiento_id,cliente_id,oferta_id,fecha,canal,resultado,motivo_rechazo,es_rebate,contactabilidad,medio_probatorio,tipo_cliente,antiguedad_meses,elegible_mt,es_movistar_total,nombre_oferta,tipo_oferta,oferta_es_mt,duracion_interaccion_segundos
OFR_0000001,CLI_000001,OFE_004,2026-01-03,Call_In,rechazada,ya_tiene_similar,False,contactado,audio_llamada,postpago,108,True,False,Plan Movil Premium 4,plan_movil,False,105
OFR_0000002,CLI_000002,OFE_013,2026-02-21,Digital,rechazada,mal_momento,False,contactado,chat_log,prepago,107,False,False,Movistar Total Premium 13,movistar_total,True,58
OFR_0000003,CLI_000003,OFE_004,2026-02-16,Tienda,aceptada,no_aplica,False,contactado,audio_llamada,postpago,94,True,False,Plan Movil Premium 4,plan_movil,False,143
"""

ASESORES_SAMPLE = """asesor_id,nombre,email,telefono,zona
A001,Ana Torres,asesor001@nexa.demo,943321819,Lima Centro
A002,Carmen Ruiz,asesor002@nexa.demo,933890838,Lima Sur
A003,Jorge Poma,asesor003@nexa.demo,940265423,Callao
"""


def _write_tmp(path, content):
    path.write_text(content, encoding="utf-8")


def test_load_offers(tmp_path, session):
    _write_tmp(tmp_path / "offers.csv", OFFERS_SAMPLE)
    n = csv_loader.load_offers(session, tmp_path / "offers.csv")
    assert n == 2
    codes = {o.code for o in session.query(models.Offer).all()}
    assert {"OFE_001", "OFE_011"} <= codes
    # Idempotente
    assert csv_loader.load_offers(session, tmp_path / "offers.csv") == 0


def test_load_clients_mapea_perfil(tmp_path, session):
    csv_loader.load_offers(session, _write_offers(tmp_path))
    n = csv_loader.load_clients(session, _write_clients(tmp_path))
    assert n == 3
    c1 = session.query(models.Client).filter(models.Client.id == "CLI_000001").first()
    assert c1 is not None
    p = c1.profile
    # Mapeos clave del contrato del perfil
    assert p["servicio"]["tipo"] == "Postpago"
    assert p["servicio"]["antiguedad_meses"] == 80
    assert p["consumo"]["datos_gb"] == 64.12
    assert p["consumo"]["dias_agotamiento_datos_promedio"] == 24
    assert p["consumo"]["app_uso"] == "Medio"
    # El cliente sin movil (dias_agotamiento -1) -> None (KPI muted)
    c3 = session.query(models.Client).filter(models.Client.id == "CLI_000003").first()
    assert c3.profile["consumo"]["dias_agotamiento_datos_promedio"] is None
    assert c3.profile["hogar"]["tiene_internet"] is True
    # Idempotente
    assert csv_loader.load_clients(session, _write_clients(tmp_path)) == 0


def test_load_offerings_crea_e2e_interacciones_y_funnel(tmp_path, session):
    csv_loader.load_offers(session, _write_offers(tmp_path))
    csv_loader.load_clients(session, _write_clients(tmp_path))
    stats = csv_loader.load_offerings(session, _write_offerings(tmp_path))
    assert stats["offerings"] == 3
    assert stats["interactions"] == 3  # 2 rechazadas + 1 aceptada

    ofr = session.query(models.Offering).filter(models.Offering.client_id == "CLI_000001").first()
    assert ofr.stage == "result"
    assert ofr.result == "rejected"
    assert ofr.rejection_reason == "Competencia"  # ya_tiene_similar -> Competencia
    assert ofr.channel == "Llamada"  # Call_In
    assert ofr.evidence_ref == "OFR_0000001"  # id externo para reanudar carga

    ofr3 = session.query(models.Offering).filter(models.Offering.client_id == "CLI_000003").first()
    assert ofr3.result == "accepted"
    assert ofr3.evidence_type == "call_audio"

    # FunnelDaily por fecha
    fd = session.query(models.FunnelDaily).filter(models.FunnelDaily.date == date(2026, 1, 3)).first()
    assert fd is not None
    assert fd.analyzed == 1
    assert fd.accepted == 0

    fd2 = session.query(models.FunnelDaily).filter(models.FunnelDaily.date == date(2026, 2, 16)).first()
    assert fd2.accepted == 1

    # El perfil del cliente tiene historial real de campanias
    c1 = session.query(models.Client).filter(models.Client.id == "CLI_000001").first()
    assert c1.profile["historial_campanias"]
    assert c1.profile["historial_ofertas"]
    assert c1.profile["historial_ofertas"][0]["resultado"] == "Rechazado"

    # Idempotente
    assert csv_loader.load_offerings(session, _write_offerings(tmp_path))["offerings"] == 0


def test_build_context_incluye_datos_reales(tmp_path, session):
    from app.services import chat_engine
    csv_loader.load_offers(session, _write_offers(tmp_path))
    csv_loader.load_clients(session, _write_clients(tmp_path))
    c = session.query(models.Client).filter(models.Client.id == "CLI_000001").first()
    ctx = chat_engine.build_context({"name": c.name, "profile": c.profile})
    assert ctx["departamento"] == "La Libertad"
    assert ctx["edad_rango"] == "36-45"
    assert ctx["metodo_pago"] == "Debito_Automatico"
    assert ctx["tipo_cliente"] == "Postpago"


def test_load_asesores_crea_usuarios_y_es_idempotente(tmp_path, session):
    p = _write_asesores(tmp_path)
    n = csv_loader.load_asesores(session, p)
    assert n == 3
    emails = {u.email for u in session.query(models.User).filter(models.User.role == "asesor").all()}
    assert {"asesor001@nexa.demo", "asesor002@nexa.demo", "asesor003@nexa.demo"} <= emails
    a1 = session.query(models.User).filter(models.User.email == "asesor001@nexa.demo").first()
    assert a1 is not None
    assert a1.role == "asesor"
    assert a1.name == "Ana Torres"
    # Idempotente
    assert csv_loader.load_asesores(session, p) == 0


def test_load_asesores_con_palabras_clave_no_duplica(tmp_path, session):
    p = _write_asesores(tmp_path)
    assert csv_loader.load_asesores(session, p) == 3
    assert csv_loader.load_asesores(session, p) == 0
    total = session.query(models.User).filter(models.User.email.like("asesor00%@nexa.demo")).count()
    assert total == 3


def test_assign_cartera_asigna_todos_los_clientes_y_es_idempotente(tmp_path, session):
    csv_loader.load_offers(session, _write_offers(tmp_path))
    csv_loader.load_clients(session, _write_clients(tmp_path))
    csv_loader.load_asesores(session, _write_asesores(tmp_path))
    # conftest siembra 3 clientes demo (C*) + 3 CLI del CSV = 6 en total.
    total_clientes = session.query(models.Client).count()
    assert total_clientes == 6

    assigned = csv_loader.assign_cartera(session, clientes_por_asesor=1)
    assert assigned == total_clientes
    assert session.query(models.Client).filter(models.Client.asesor_id.is_(None)).count() == 0
    assert session.query(models.Client).filter(models.Client.asesor_id.isnot(None)).count() == total_clientes
    # El primer cliente cayo en un asesor real (A001 o el demo, el de menor id).
    c1 = session.query(models.Client).filter(models.Client.id == "CLI_000001").first()
    assert c1.asesor_id is not None
    # Idempotente
    assert csv_loader.assign_cartera(session, clientes_por_asesor=1) == 0


def test_assign_cartera_respeta_tamano_por_asesor(tmp_path, session):
    csv_loader.load_offers(session, _write_offers(tmp_path))
    csv_loader.load_clients(session, _write_clients(tmp_path))
    csv_loader.load_asesores(session, _write_asesores(tmp_path))
    # 6 clientes / 2 por asesor -> ningun asesor supera el tope.
    csv_loader.assign_cartera(session, clientes_por_asesor=2)
    counts = {}
    for (aid,) in session.query(models.Client.asesor_id).all():
        counts[aid] = counts.get(aid, 0) + 1
    assert sum(counts.values()) == 6
    assert max(counts.values()) <= 2


def _write_offers(tmp_path):
    p = tmp_path / "offers.csv"
    _write_tmp(p, OFFERS_SAMPLE)
    return p


def _write_clients(tmp_path):
    p = tmp_path / "clients.csv"
    _write_tmp(p, CLIENTS_SAMPLE)
    return p


def _write_offerings(tmp_path):
    p = tmp_path / "offerings.csv"
    _write_tmp(p, OFFERINGS_SAMPLE)
    return p


def _write_asesores(tmp_path):
    p = tmp_path / "asesores.csv"
    _write_tmp(p, ASESORES_SAMPLE)
    return p