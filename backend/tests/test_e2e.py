"""Tests del seguimiento E2E del ofrecimiento (/api/e2e)."""
from tests.conftest import login, auth


def test_flujo_e2e_completo_hasta_resultado(client):
    token = login(client)  # asesor
    headers = auth(token)

    # 1) Clasificacion + planificacion (canal y mensaje definidos)
    created = client.post("/api/e2e/offerings", headers=headers, json={
        "client_id": "C00002",
        "offer_id": 5,  # PLAN_HOGAR
        "channel": "WhatsApp",
        "message_text": "Miguel, al revisar tu perfil veo que eres elegible para el plan hogar...",
    })
    assert created.status_code == 200, created.text
    oid = created.json()["id"]
    assert created.json()["stage"] == "planned"

    # 2) Contactabilidad real
    r = client.patch(f"/api/e2e/offerings/{oid}", headers=headers, json={
        "stage": "contacted", "contact_status": "answered",
    })
    assert r.status_code == 200, r.text
    assert r.json()["contact_status"] == "answered"

    # 3) Manejo de objeciones (speech de rebate)
    r = client.patch(f"/api/e2e/offerings/{oid}", headers=headers, json={
        "stage": "objection", "objection_status": "rebate",
        "speech_rebate": "El plan incluye ahorro los primeros 6 meses.",
    })
    assert r.status_code == 200, r.text
    assert r.json()["objection_status"] == "rebate"

    # 4) Medios probatorios (metadata: ya no es una etapa del pipeline)
    r = client.patch(f"/api/e2e/offerings/{oid}", headers=headers, json={
        "evidence_type": "call_audio", "evidence_ref": "grab-001",
    })
    assert r.status_code == 200, r.text
    assert r.json()["evidence_type"] == "call_audio"
    assert r.json()["stage"] == "objection"  # la etapa no se mueve al registrar evidencia

    # 4b) Se permiten ambos medios probatorios (multi-select, separados por coma)
    r = client.patch(f"/api/e2e/offerings/{oid}", headers=headers, json={
        "evidence_type": "call_audio,platform_register",
    })
    assert r.status_code == 200, r.text
    assert r.json()["evidence_type"] == "call_audio,platform_register"

    # 5) Resultado de venta
    r = client.patch(f"/api/e2e/offerings/{oid}", headers=headers, json={"result": "accepted"})
    assert r.status_code == 200, r.text
    assert r.json()["stage"] == "result"
    assert r.json()["result"] == "accepted"

    # Historial del cliente incluye el ofrecimiento
    hist = client.get("/api/e2e/offerings", params={"client_id": "C00002"}, headers=headers)
    assert hist.status_code == 200
    assert any(o["id"] == oid for o in hist.json())

    # PDF del flujo E2E
    pdf = client.get(f"/api/e2e/offerings/{oid}/pdf", headers=headers)
    assert pdf.status_code == 200
    assert pdf.headers["content-type"] == "application/pdf"
    assert pdf.content[:5] == b"%PDF-"


def test_pdf_reporte_de_ofrecimiento(client):
    token = login(client)
    headers = auth(token)
    created = client.post("/api/e2e/offerings", headers=headers, json={
        "client_id": "C00001",
        "offer_id": 1,
        "channel": "Llamada",
    })
    oid = created.json()["id"]
    client.patch(f"/api/e2e/offerings/{oid}", headers=headers, json={"stage": "contacted", "contact_status": "answered"})
    client.patch(f"/api/e2e/offerings/{oid}", headers=headers, json={"stage": "objection", "objection_status": "rebate"})
    client.patch(f"/api/e2e/offerings/{oid}", headers=headers, json={"result": "rejected", "rejection_reason": "precio"})

    pdf = client.get(f"/api/e2e/offerings/{oid}/pdf", headers=headers)
    assert pdf.status_code == 200, pdf.text
    assert pdf.headers["content-type"] == "application/pdf"
    assert pdf.content.startswith(b"%PDF-1.4")
    assert pdf.content.endswith(b"%%EOF")


def test_report_e2e_solo_para_supervisor(client):
    # El asesor no puede ver el reporte E2E (permiso view_funnel)
    r = client.get("/api/e2e/report", headers=auth(login(client)))
    assert r.status_code == 403

    sup = auth(login(client, "supervisor@nexa.demo", "supervisor123"))
    # Sin ofrecimientos -> todas las etapas en cero
    r = client.get("/api/e2e/report", headers=sup)
    assert r.status_code == 200, r.text
    body = r.json()
    assert [s["key"] for s in body["stages"]] == [
        "classified", "planned", "contacted", "objection", "result",
    ]
    assert all(s["value"] == 0 for s in body["stages"])
    assert body["total"] == 0

    # Tras un ofrecimiento que llego a "contacted", el reporte refleja el embudo
    asesor = auth(login(client))
    o = client.post("/api/e2e/offerings", headers=asesor, json={
        "client_id": "C00002", "offer_id": 5, "channel": "Llamada",
    }).json()
    client.patch(f"/api/e2e/offerings/{o['id']}", headers=asesor, json={
        "stage": "contacted", "contact_status": "unanswered",
    })
    r = client.get("/api/e2e/report", headers=sup)
    body = r.json()
    by_key = {s["key"]: s["value"] for s in body["stages"]}
    assert by_key["classified"] == 1
    assert by_key["planned"] == 1
    assert by_key["contacted"] == 1
    assert by_key["objection"] == 0
    assert by_key["result"] == 0
    assert body["contact_status"][0]["label"] == "unanswered"


def test_resultado_requiere_permiso_registro(client):
    # El asesor SI tiene register_acceptance
    asesor = auth(login(client))
    o = client.post("/api/e2e/offerings", headers=asesor, json={
        "client_id": "C00002", "offer_id": 5,
    }).json()
    r = client.patch(f"/api/e2e/offerings/{o['id']}", headers=asesor, json={"result": "rejected", "rejection_reason": "Precio"})
    assert r.status_code == 200
    assert r.json()["rejection_reason"] == "Precio"

    # El supervisor NO tiene register_acceptance/rejection (ni crea ofrecimientos)
    sup = auth(login(client, "supervisor@nexa.demo", "supervisor123"))
    r = client.patch(f"/api/e2e/offerings/{o['id']}", headers=sup, json={"result": "accepted"})
    assert r.status_code == 403


def test_register_interaction_cierra_el_ofrecimiento(client):
    """Al registrar una aceptacion/rechazo, el ofrecimiento E2E en curso se cierra."""
    asesor = auth(login(client))
    o = client.post("/api/e2e/offerings", headers=asesor, json={
        "client_id": "C00002", "offer_id": 5, "channel": "App",
    }).json()

    r = client.post("/api/interactions/register", headers=asesor, json={
        "client_id": "C00002", "offer_id": 5, "channel": "App", "result": "accepted",
    })
    assert r.status_code == 200, r.text

    hist = client.get("/api/e2e/offerings", params={"client_id": "C00002"}, headers=asesor).json()
    updated = next(x for x in hist if x["id"] == o["id"])
    assert updated["stage"] == "result"
    assert updated["result"] == "accepted"