"""
Genera datos base realistas (clientes, ofertas, usuarios y permisos) para la demo
de NEXA. El funnel e interacciones se registran con datos reales de uso, no con
numeros sinteticos.
Cumple con la estrategia de anonimizacion (10.4): nombre + primer apellido,
documento/telefono solo ultimos 4 digitos, direccion reducida a distrito.
"""
import random
import copy
from datetime import date, timedelta, datetime
from faker import Faker

from sqlalchemy import inspect

from app.database import engine, SessionLocal
from app import models
from app.security import hash_password
from app.services.nbo_engine import OFFER_CATALOG
from app.services.config_service import ensure_default_config

fake = Faker("es_ES")
random.seed(42)

DISTRITOS = ["San Isidro", "Miraflores", "Surco", "La Molina", "San Borja",
             "Jesus Maria", "Lince", "Pueblo Libre", "Los Olivos", "San Miguel"]
ESTRATOS = ["A", "B", "C", "D"]
CANALES = ["WhatsApp", "Llamada", "App"]

# Canales legacy del primer seed (tipos) -> canales de contacto reales (medios),
# coherentes con las opciones del E2E (WhatsApp/Llamada/App).
LEGACY_CANAL_MAP = {"Digital": "App", "Call Center": "Llamada", "Tienda": "WhatsApp"}
RECHAZO_MOTIVOS = ["Precio", "Mal Servicio", "Competencia"]
RECLAMO_MOTIVOS = [
    "Facturación duplicada",
    "Cobro por servicios no contratados",
    "Fallas de cobertura en mi zona",
    "Velocidad de internet menor a la contratada",
    "Cargo por roaming no realizado",
    "Problemas para activar el equipo",
    "Promoción no aplicada en el recibo",
]


def _reclamos_for(n: int, seed=None) -> list:
    """Genera un historial de `n` reclamos con fecha, motivo y estado.

    Con `seed` fijo (ej. id del cliente) el resultado es estable entre ejecuciones,
    lo que permite el backfill idempotente de perfiles ya sembrados.
    """
    rng = random.Random(seed)
    n = max(0, min(4, n))
    out = []
    for _ in range(n):
        out.append({
            "fecha": (date.today() - timedelta(days=rng.randint(15, 360))).isoformat(),
            "motivo": rng.choice(RECLAMO_MOTIVOS),
            "estado": rng.choices(["Resuelto", "En proceso", "Abierto"], weights=[60, 25, 15])[0],
        })
    out.sort(key=lambda r: r["fecha"], reverse=True)
    return out


def build_client_profile(idx: int):
    nombre_completo = fake.name()
    nombre_mostrado = " ".join(nombre_completo.split()[:2])  # nombre + primer apellido
    tiene_internet = random.random() < 0.55
    movil_solo = not tiene_internet
    antiguedad_dias = random.randint(15, 2000)
    antiguedad_meses = antiguedad_dias // 30
    datos_gb = round(random.uniform(1, 120), 1)
    app_uso = random.choice(["Alto", "Medio", "Bajo"])
    horario_pico = random.choice(["19:00-23:00", "08:00-12:00", "12:00-18:00"])
    canal_principal = random.choice(CANALES)
    # Dias hasta agotar los datos segun el uso diario estimado (1-45, urgente si es bajo).
    datos_uso_diario = {"Alto": 3.5, "Medio": 2.5, "Bajo": 1.5}[app_uso]
    dias_agotamiento_datos = int(max(1, min(45, datos_gb / (datos_uso_diario * random.uniform(0.7, 1.3)))))

    elegibilidad_mt = tiene_internet and random.random() < 0.7
    elegibilidad_upgrade = random.random() < 0.5
    elegibilidad_equipo = random.random() < 0.35
    elegibilidad_hogar = (not tiene_internet) and random.random() < 0.6

    # Factura promedio: si tiene internet (convergencia), la factura total es mayor.
    monto_actual = round(random.uniform(29, 150), 2)
    monto_facturado_prom = round(monto_actual + (random.uniform(45, 80) if tiene_internet else random.uniform(0, 5)), 2)
    estado_pago = random.choices(["Pagado", "Pendiente"], weights=[85, 15])[0]
    dias_mora_prom = random.randint(6, 25) if estado_pago == "Pendiente" else random.randint(0, 3)

    # Historial de reclamos consistente con el contador de friccion.
    n_reclamos = random.randint(0, 4)
    reclamos = _reclamos_for(n_reclamos)
    reclamos_abiertos = sum(1 for r in reclamos if r["estado"] != "Resuelto")

    profile = {
        "id": f"C{idx:05d}",
        "nombre": nombre_mostrado,
        "tipo_documento": "DNI",
        "documento": fake.numerify("########"),
        "email": f"{nombre_mostrado.lower().replace(' ', '.')}@cliente.com",
        "telefono": fake.numerify("9########"),
        "direccion": random.choice(DISTRITOS),
        "distrito": random.choice(DISTRITOS),
        "estrato": random.choice(ESTRATOS),
        "servicio": {
            "tipo": random.choice(["Postpago", "Prepago"]),
            "plan": f"Plan {random.choice([49, 69, 89, 109, 129])}",
            "antiguedad_dias": antiguedad_dias,
            "antiguedad_meses": antiguedad_meses,
            "fecha_activacion": (date.today() - timedelta(days=antiguedad_dias)).isoformat(),
        },
        "consumo": {
            "datos_gb": datos_gb,
            "datos_promedio_3m": round(datos_gb * random.uniform(0.85, 1.1), 1),
            "dias_agotamiento_datos_promedio": dias_agotamiento_datos,
            "voz_minutos": random.randint(20, 500),
            "voz_promedio_3m": random.randint(20, 500),
            "sms": random.randint(0, 40),
            "app_uso": app_uso,
            "horario_pico": horario_pico,
            "mejor_franja_horaria_contacto": horario_pico,
            "navegacion_web": random.random() < 0.8,
            "streaming": random.random() < 0.6,
        },
        "hogar": {
            "tiene_internet": tiene_internet,
            "tiene_tv": random.random() < 0.3,
            "tiene_telefonia": random.random() < 0.4,
            "proveedor_internet": "Movistar" if tiene_internet else None,
            "velocidad_internet": random.choice(["50 Mbps", "100 Mbps", "200 Mbps"]) if tiene_internet else None,
        },
        "facturacion": {
            "monto_actual": monto_actual,
            "monto_facturado_prom": monto_facturado_prom,
            "monto_promedio_6m": round(random.uniform(29, 150), 2),
            "monto_maximo": round(random.uniform(100, 180), 2),
            "monto_minimo": round(random.uniform(20, 60), 2),
            "ultimo_pago": (date.today() - timedelta(days=random.randint(0, 20))).isoformat(),
            "estado_pago": estado_pago,
            "dias_mora_prom": dias_mora_prom,
        },
        "comportamiento": {
            "canal_principal": canal_principal,
            "canal_mas_usado": canal_principal,
            "canal_secundario": random.choice(CANALES),
            "frecuencia_interaccion": random.choice(["Alta", "Media", "Baja"]),
            "app_downloads": random.random() < 0.6,
            "app_login_frecuencia": random.choice(["Diario", "Semanal", "Rara vez"]),
            "uso_web": random.random() < 0.7,
            "reclamos_12m": n_reclamos,
            "n_reclamos": n_reclamos,
            "reclamos_abiertos": reclamos_abiertos,
            "reclamos": reclamos,
            "nps": random.randint(0, 10),
            "satisfaccion": random.choice(["Alta", "Media-Alta", "Media", "Baja"]),
        },
        "elegibilidad": {
            "movistar_total": elegibilidad_mt,
            "upgrade": elegibilidad_upgrade,
            "equipo": elegibilidad_equipo,
            "plan_hogar": elegibilidad_hogar,
            "plan_premium": random.random() < 0.2,
        },
        "historial_ofertas": [],
    }

    # Historial de 0-3 ofertas previas
    for _ in range(random.randint(0, 3)):
        resultado = random.choice(["Aceptado", "Rechazado"])
        entry = {
            "fecha": (date.today() - timedelta(days=random.randint(10, 300))).isoformat(),
            "oferta": random.choice(OFFER_CATALOG)["name"],
            "resultado": resultado,
        }
        if resultado == "Rechazado":
            entry["motivo"] = random.choice(RECHAZO_MOTIVOS)
        profile["historial_ofertas"].append(entry)

    # Historial de campanas previas (timeline de etapas hasta la recomendacion actual).
    # Cada campana incluye el plan/oferta que intentaba vender.
    campania_pool = [
        {"campaña": "Masiva Fibra", "canal": "WhatsApp", "oferta": "Plan Hogar"},
        {"campaña": "Retención Fin de Año", "canal": "Llamada", "oferta": "Movistar Total Premium"},
        {"campaña": "Fidelización Q1", "canal": "App", "oferta": "Movistar Total Premium"},
        {"campaña": "Upgrade Equipos", "canal": "Llamada", "oferta": "Upgrade Móvil"},
        {"campaña": "Campaña Hogar", "canal": "WhatsApp", "oferta": "Plan Hogar"},
    ]
    historial_campanias = []
    for i in range(random.randint(2, 4)):
        c = random.choice(campania_pool)
        historial_campanias.append({
            "campaña": c["campaña"],
            "fecha": (date.today() - timedelta(days=20 + i * random.randint(30, 60))).isoformat(),
            "etapa": random.choice(["Analizado", "Contactado", "Oferta"]),
            "canal": c["canal"],
            "resultado": random.choice(["Sin respuesta", "Sin interés", "Pendiente"]),
            "oferta": c["oferta"],
        })
    historial_campanias.sort(key=lambda e: e["fecha"])
    profile["historial_campanias"] = historial_campanias

    # Simular algunos campos faltantes (estrategia 2.2 -> flags _missing)
    if random.random() < 0.08:
        profile["consumo"]["datos_gb"] = None
        profile["consumo"]["datos_gb_missing"] = True

    return profile


def _require_schema_migrated():
    """Verifica que el esquema este versionado por Alembic antes de sembrar.

    El seed ya no crea tablas con create_all; el esquema se gestiona con
    migraciones (`alembic upgrade head`).
    """
    inspector = inspect(engine)
    if "alembic_version" not in inspector.get_table_names():
        raise RuntimeError(
            "El esquema no esta migrado. Ejecute primero: alembic upgrade head"
        )


def seed():
    _require_schema_migrated()
    db = SessionLocal()
    try:
        if db.query(models.User).count() > 0:
            print("La base de datos ya tiene datos. Omitiendo seed.")
            return

        ensure_default_config(db)

        # --- Permisos ---
        role_permissions = {
            "asesor": {
                "permissions": [
                    "view_dashboard", "search_client", "view_client_profile",
                    "view_recommendation", "view_speech", "register_acceptance",
                    "register_rejection", "copy_speech",
                ],
                "description": "Asesor comercial de call center",
            },
            "supervisor": {
                "permissions": [
                    "view_dashboard", "view_funnel", "view_trends", "view_all_clients",
                    "view_team_performance", "export_reports",
                ],
                "description": "Supervisor de equipo comercial",
            },
            "admin": {
                "permissions": [
                    "all_permissions", "manage_users", "manage_roles",
                    "view_system_logs", "configure_thresholds",
                ],
                "description": "Administrador del sistema",
            },
        }
        for role, data in role_permissions.items():
            db.add(models.Permission(role=role, permissions=data))

        # --- Usuarios demo ---
        users = [
            {"email": "asesor@nexa.demo", "password": "asesor123", "role": "asesor", "name": "Ana Torres"},
            {"email": "supervisor@nexa.demo", "password": "supervisor123", "role": "supervisor", "name": "Luis Ramirez"},
            {"email": "admin@nexa.demo", "password": "admin123", "role": "admin", "name": "Admin NEXA"},
        ]
        db_users = []
        for u in users:
            user = models.User(email=u["email"], password_hash=hash_password(u["password"]),
                                role=u["role"], name=u["name"])
            db.add(user)
            db_users.append(user)
        db.flush()

        # --- Ofertas ---
        offers = []
        for o in OFFER_CATALOG:
            offer = models.Offer(name=o["name"], code=o["code"],
                                  description=f"Oferta {o['name']} priorizada segun estrategia comercial.",
                                  priority=o["priority"], active=True)
            db.add(offer)
            offers.append(offer)
        db.flush()

        # --- Clientes sinteticos ---
        N_CLIENTS = 60
        clients = []
        for i in range(1, N_CLIENTS + 1):
            profile = build_client_profile(i)
            client = models.Client(
                id=profile["id"],
                name=profile["nombre"],
                document_last4=profile["documento"][-4:],
                phone_last4=profile["telefono"][-4:],
                district=profile["distrito"],
                profile=profile,
            )
            db.add(client)
            clients.append(client)
        db.flush()

        # El funnel (funnel_daily) y las interacciones se siembran aparte con
        # volumen demo modesto y coherente: ver seed_demo_activity() abajo.
        # En produccion estos datos se registran con uso real.

        db.commit()
        print(f"Seed completo: {len(db_users)} usuarios, {len(offers)} ofertas, {len(clients)} clientes.")
        print("Credenciales demo:")
        for u in users:
            print(f"  {u['role']:10s} -> {u['email']} / {u['password']}")
    finally:
        db.close()


def seed_demo_activity(db=None):
    """Siembra actividad demo COHERENTE entre el funnel clásico y el E2E.

    Fuente unica: por cada dia se crean `analyzed` ofrecimientos E2E (rampa
    1->4/dia durante 90 dias) y el funnel_daily se calcula a partir de esos
    mismos ofrecimientos (prioritized=planned, contacted, offered=objection,
    accepted=aceptados). Asi el total del periodo coincide en ambos funnels
    (Diario ~= 32, Semanal ~= 102, Mensual = 225) y cada cliente analizado
    equivale a 1 ofrecimiento rastreado.

    En produccion estos datos se registran con uso real; esto es solo para la demo.
    """
    from app.database import SessionLocal
    from app import models

    own_session = db is None
    if own_session:
        db = SessionLocal()
    try:
        # Idempotencia: limpia actividad demo previa antes de re-sembrar.
        db.query(models.FunnelDaily).delete()
        db.query(models.Offering).delete()
        db.query(models.Recommendation).delete()
        db.query(models.Interaction).delete()

        # Asegura 3 asesores demo (el supervisor ve su desempeño).
        DEMO_ASESORES = [
            {"email": "asesor@nexa.demo", "name": "Miguel Angel"},
            {"email": "asesor2@nexa.demo", "name": "Jose Manuel"},
            {"email": "asesor3@nexa.demo", "name": "Carmen Ruiz"},
        ]
        asesores = []
        for d in DEMO_ASESORES:
            u = db.query(models.User).filter(models.User.email == d["email"]).first()
            if not u:
                u = models.User(email=d["email"], password_hash=hash_password("asesor123"),
                                role="asesor", name=d["name"])
                db.add(u)
                db.flush()
            asesores.append(u)
        offers = db.query(models.Offer).all()
        clients = db.query(models.Client).all()
        if not asesores or not offers or not clients:
            print("Seed de actividad omitido: faltan usuarios/ofertas/clientes.")
            return

        # Sesgo de aceptacion por asesor (demo: niveles de cumplimiento distintos
        # para que el panel de supervisión muestre cumple / en curso / bajo).
        bias = {a.id: [0.75, 0.55, 0.30][i % 3] for i, a in enumerate(asesores)}

        rnd = random.Random(7)
        DAYS_FUNNEL = 90
        now = datetime.utcnow()
        total_offerings = 0
        for offset in range(DAYS_FUNNEL):
            frac = 1 - offset / (DAYS_FUNNEL - 1)  # 1 hoy, decrece hacia atras
            analyzed = max(1, round(1 + 3 * frac))  # 1 .. 4
            day = date.today() - timedelta(days=offset)

            planned_n = int(round(analyzed * 0.85))
            contacted_n = int(round(analyzed * 0.70))
            objection_n = int(round(analyzed * 0.50))
            evidence_n = int(round(analyzed * 0.40))
            result_n = int(round(analyzed * 0.20))
            accepted_n = 0

            for idx in range(analyzed):
                client = rnd.choice(clients)
                offer = rnd.choice(offers)
                asesor = rnd.choice(asesores)
                channel = rnd.choice(["WhatsApp", "Llamada", "App"])
                created = datetime(day.year, day.month, day.day, rnd.randint(8, 20), rnd.randint(0, 59))
                o = models.Offering(
                    client_id=client.id,
                    offer_id=offer.id,
                    asesor_id=asesor.id,
                    channel=channel,
                    message_text="Ofrecimiento demo: oferta NEXA para el cliente.",
                    created_at=created,
                )
                if idx < result_n:
                    o.stage = "result"
                    o.contact_status = "answered"
                    o.objection_handled = rnd.random() < 0.45
                    o.evidence_type = rnd.choice(["platform_register", "call_audio", "call_audio"])
                    o.result = "accepted" if rnd.random() < bias[o.asesor_id] else "rejected"
                    if o.result == "accepted":
                        accepted_n += 1
                    else:
                        o.rejection_reason = rnd.choice(RECHAZO_MOTIVOS)
                    rec = None
                    if o.result == "accepted":
                        rec = models.Recommendation(
                            client_id=client.id, offer_id=offer.id,
                            probability=round(rnd.uniform(0.5, 0.95), 4),
                            score=round(rnd.uniform(0.5, 0.95), 4),
                            created_at=created,
                        )
                        db.add(rec)
                        db.flush()
                    db.add(models.Interaction(
                        client_id=client.id,
                        recommendation_id=rec.id if rec else None,
                        asesor_id=o.asesor_id,
                        channel=channel,
                        result=o.result,
                        rejection_reason=o.rejection_reason,
                        speech_used=rnd.choice(["Variante 1 (Consultiva)", "Variante 2 (Directa)"]),
                        created_at=created,
                    ))
                elif idx < evidence_n:
                    o.stage = "evidence"
                    o.contact_status = "answered"
                    o.objection_handled = rnd.random() < 0.5
                    o.evidence_type = rnd.choice(["platform_register", "call_audio", "call_audio"])
                elif idx < objection_n:
                    o.stage = "objection"
                    o.contact_status = "answered"
                    o.objection_handled = rnd.random() < 0.4
                elif idx < contacted_n:
                    o.stage = "contacted"
                    o.contact_status = rnd.choice(["answered", "read", "read", "unanswered"])
                elif idx < planned_n:
                    o.stage = "planned"
                db.add(o)
                total_offerings += 1

            conversion = round((accepted_n / analyzed) * 100, 2) if analyzed else 0
            db.add(models.FunnelDaily(
                date=day,
                analyzed=analyzed,
                prioritized=planned_n,
                contacted=contacted_n,
                offered=objection_n,
                accepted=accepted_n,
                conversion_rate=conversion,
            ))

        db.commit()
        print(f"Seed de actividad demo listo: {total_offerings} ofrecimientos E2E alineados a {DAYS_FUNNEL} dias de funnel_daily.")
    finally:
        if own_session:
            db.close()


def backfill_reclamos(db) -> int:
    """Backfill idempotente: agrega el historial de reclamos a perfiles ya sembrados.

    Los clientes antiguos no tienen el array `reclamos`; se genera uno consistente
    con su contador `n_reclamos` (estable por cliente via seed=id). No toca a los
    que ya lo tienen.
    """
    clients = db.query(models.Client).all()
    updated = 0
    for c in clients:
        # deepcopy: si no, SQLAlchemy JSON no detecta el cambio en dicts anidados
        # y el UPDATE nunca llega a la BD.
        profile = copy.deepcopy(c.profile or {})
        comp = profile.setdefault("comportamiento", {})
        if not isinstance(comp, dict):
            comp = {}
            profile["comportamiento"] = comp
        if isinstance(comp.get("reclamos"), list):
            continue
        n = comp.get("n_reclamos") or comp.get("reclamos_12m") or 0
        comp["reclamos"] = _reclamos_for(n, seed=c.id)
        comp["reclamos_abiertos"] = sum(1 for r in comp["reclamos"] if r["estado"] != "Resuelto")
        c.profile = profile
        updated += 1
    if updated:
        db.commit()
    return updated


def backfill_canales(db) -> int:
    """Backfill idempotente: normaliza los canales legacy (Digital/Call Center/Tienda)
    a los canales de contacto reales (WhatsApp/Llamada/App) para que el chip
    "Canal preferido" sea coherente con las opciones del E2E.
    """
    clients = db.query(models.Client).all()
    updated = 0
    for c in clients:
        profile = copy.deepcopy(c.profile or {})
        comp = profile.get("comportamiento") or {}
        if not isinstance(comp, dict):
            comp = {}
            profile["comportamiento"] = comp
        changed = False
        for field in ("canal_principal", "canal_mas_usado", "canal_secundario"):
            val = comp.get(field)
            if val in LEGACY_CANAL_MAP:
                comp[field] = LEGACY_CANAL_MAP[val]
                changed = True
        if changed:
            c.profile = profile
            updated += 1
    if updated:
        db.commit()
    return updated


# Oferta objetivo de cada campana del pool (estable, para backfill idempotente).
CAMPANIA_PLAN = {
    "Masiva Fibra": "Plan Hogar",
    "Retención Fin de Año": "Movistar Total Premium",
    "Fidelización Q1": "Movistar Total Premium",
    "Upgrade Equipos": "Upgrade Móvil",
    "Campaña Hogar": "Plan Hogar",
}


def backfill_campania_ofertas(db) -> int:
    """Backfill idempotente: agrega el plan/oferta objetivo a las campanas del
    timeline de clientes ya sembrados (antes de que ese campo existiera).
    """
    clients = db.query(models.Client).all()
    updated = 0
    for c in clients:
        profile = copy.deepcopy(c.profile or {})
        hc = profile.get("historial_campanias")
        if not isinstance(hc, list):
            continue
        changed = False
        for entry in hc:
            if isinstance(entry, dict) and "oferta" not in entry:
                entry["oferta"] = CAMPANIA_PLAN.get(entry.get("campaña"))
                changed = True
        if changed:
            c.profile = profile
            updated += 1
    if updated:
        db.commit()
    return updated
    seed()
    seed_demo_activity()
