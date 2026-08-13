"""
Genera datos sinteticos realistas (clientes, ofertas, usuarios, permisos,
interacciones historicas y funnel) para la demo de NEXA.
Cumple con la estrategia de anonimizacion (10.4): nombre + primer apellido,
documento/telefono solo ultimos 4 digitos, direccion reducida a distrito.
"""
import random
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
CANALES = ["Digital", "Call Center", "Tienda"]
RECHAZO_MOTIVOS = ["Precio", "No necesita", "Ya tiene con otro operador", "Quiere pensarlo", "Mal momento"]


def build_client_profile(idx: int):
    nombre_completo = fake.name()
    nombre_mostrado = " ".join(nombre_completo.split()[:2])  # nombre + primer apellido
    tiene_internet = random.random() < 0.55
    movil_solo = not tiene_internet
    antiguedad_dias = random.randint(15, 2000)
    antiguedad_meses = antiguedad_dias // 30
    datos_gb = round(random.uniform(1, 120), 1)

    elegibilidad_mt = tiene_internet and random.random() < 0.7
    elegibilidad_upgrade = random.random() < 0.5
    elegibilidad_equipo = random.random() < 0.35
    elegibilidad_hogar = (not tiene_internet) and random.random() < 0.6

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
            "voz_minutos": random.randint(20, 500),
            "voz_promedio_3m": random.randint(20, 500),
            "sms": random.randint(0, 40),
            "app_uso": random.choice(["Alto", "Medio", "Bajo"]),
            "horario_pico": random.choice(["19:00-23:00", "08:00-12:00", "12:00-18:00"]),
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
            "monto_actual": round(random.uniform(29, 150), 2),
            "monto_promedio_6m": round(random.uniform(29, 150), 2),
            "monto_maximo": round(random.uniform(100, 180), 2),
            "monto_minimo": round(random.uniform(20, 60), 2),
            "ultimo_pago": (date.today() - timedelta(days=random.randint(0, 20))).isoformat(),
            "estado_pago": random.choices(["Pagado", "Pendiente"], weights=[85, 15])[0],
        },
        "comportamiento": {
            "canal_principal": random.choice(CANALES),
            "canal_secundario": random.choice(CANALES),
            "frecuencia_interaccion": random.choice(["Alta", "Media", "Baja"]),
            "app_downloads": random.random() < 0.6,
            "app_login_frecuencia": random.choice(["Diario", "Semanal", "Rara vez"]),
            "uso_web": random.random() < 0.7,
            "reclamos_12m": random.randint(0, 4),
            "reclamos_abiertos": random.randint(0, 1),
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

        # --- Interacciones historicas (para funnel y KPIs) ---
        for _ in range(120):
            client = random.choice(clients)
            offer = random.choice(offers)
            result = random.choices(["accepted", "rejected"], weights=[44, 56])[0]
            asesor = random.choice([u for u in db_users if u.role == "asesor"])
            interaction = models.Interaction(
                client_id=client.id,
                asesor_id=asesor.id,
                channel=random.choice(CANALES),
                result=result,
                rejection_reason=random.choice(RECHAZO_MOTIVOS) if result == "rejected" else None,
                speech_used=random.choice(["Variante 1 (Consultiva)", "Variante 2 (Directa)"]),
                created_at=datetime.utcnow() - timedelta(days=random.randint(0, 180)),
            )
            db.add(interaction)

        # --- Funnel diario (ultimos 30 dias) ---
        for d in range(30):
            day = date.today() - timedelta(days=d)
            analyzed = random.randint(300, 500)
            prioritized = int(analyzed * random.uniform(0.6, 0.7))
            contacted = int(prioritized * random.uniform(0.7, 0.8))
            offered = int(contacted * random.uniform(0.75, 0.85))
            accepted = int(offered * random.uniform(0.38, 0.48))
            conversion = round((accepted / analyzed) * 100, 2) if analyzed else 0
            db.add(models.FunnelDaily(
                date=day, analyzed=analyzed, prioritized=prioritized, contacted=contacted,
                offered=offered, accepted=accepted, conversion_rate=conversion,
            ))

        db.commit()
        print(f"Seed completo: {len(db_users)} usuarios, {len(offers)} ofertas, {len(clients)} clientes.")
        print("Credenciales demo:")
        for u in users:
            print(f"  {u['role']:10s} -> {u['email']} / {u['password']}")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
