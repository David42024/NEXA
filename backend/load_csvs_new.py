"""
Carga de datos de csvs_new a la nueva base de datos PostgreSQL.

Este script es una versión modificada de csv_loader.py que:
1. Usa los CSV de backend/csvs_new
2. Se conecta a la nueva base de datos Neon
3. Carga la estructura sin datos de la original
4. Inserta los datos de los CSV nuevos
"""
import csv
import copy
import math
import os
from datetime import date, datetime, timedelta
from pathlib import Path

from sqlalchemy import create_engine, func, inspect, update as sa_update, Column, Integer, String, Text, Boolean, DECIMAL, TIMESTAMP, ForeignKey, Date, JSON
from sqlalchemy.orm import sessionmaker, declarative_base

# Nueva base de datos
NEW_DB_URL = "postgresql+psycopg2://neondb_owner:npg_Or8dDZT5LMVY@ep-patient-fire-ay1mxqp9-pooler.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require"

# Rutas a los CSV nuevos
CSV_DIR = Path(__file__).resolve().parents[0] / "csvs_new"
OFFERS_CSV = CSV_DIR / "catalogo_ofertas_entrega_clean.csv"
CLIENTS_CSV = CSV_DIR / "muestra_clientes_error_1pct.csv"
OFFERINGS_CSV = CSV_DIR / "historial_campanias_muestra.csv"

# Mapeos (igual que csv_loader.py)
CANAL_MAP = {"Digital": "App", "Tienda": "WhatsApp", "Call_In": "Llamada", "Call_Out": "Llamada"}
FRANJA_MAP = {
    "Manana": "08:00-12:00",
    "Tarde": "14:00-18:00",
    "Noche": "19:00-23:00",
    "Fin_de_semana": "09:00-13:00",
}
RECHAZO_MAP = {
    "precio": "Precio",
    "ya_tiene_similar": "Competencia",
    "mal_momento": "Otro",
    "no_confia": "Otro",
    "otro": "Otro",
    "no_necesita": "Otro",
}
OFFER_TIPO_PRIORITY = {
    "movistar_total": 5,
    "plan_hogar": 4,
    "plan_movil": 3,
    "upgrade": 3,
    "equipo": 2,
    "paquete_adicional": 1,
}

BATCH = 500  # Reducido para commits más frecuentes
HISTORIAL_MAX = 6
OFFERINGS_LIMIT = 50000

# Definición de modelos (simplificada para este script)
Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(100), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(50), nullable=False)
    name = Column(String(100))
    created_at = Column(TIMESTAMP, server_default=func.now())

class Client(Base):
    __tablename__ = "clients"
    id = Column(String(10), primary_key=True)
    name = Column(String(100))
    document_last4 = Column(String(4))
    phone_last4 = Column(String(4))
    district = Column(String(50))
    profile = Column(JSON, nullable=False)
    asesor_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())

class Offer(Base):
    __tablename__ = "offers"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    code = Column(String(20), unique=True, nullable=False)
    description = Column(Text)
    priority = Column(Integer, default=0)
    active = Column(Boolean, default=True)

class Recommendation(Base):
    __tablename__ = "recommendations"
    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(String(10), ForeignKey("clients.id"))
    offer_id = Column(Integer, ForeignKey("offers.id"))
    probability = Column(DECIMAL(5, 4))
    shap_values = Column(JSON)
    score = Column(DECIMAL(5, 4))
    created_at = Column(TIMESTAMP, server_default=func.now())

class Interaction(Base):
    __tablename__ = "interactions"
    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(String(10), ForeignKey("clients.id"))
    recommendation_id = Column(Integer, ForeignKey("recommendations.id"))
    asesor_id = Column(Integer, ForeignKey("users.id"))
    channel = Column(String(20))
    result = Column(String(20))
    rejection_reason = Column(String(50))
    speech_generated = Column(Text)
    speech_used = Column(Text)
    feedback = Column(Text)
    created_at = Column(TIMESTAMP, server_default=func.now())

class FunnelDaily(Base):
    __tablename__ = "funnel_daily"
    date = Column(Date, primary_key=True)
    analyzed = Column(Integer, default=0)
    prioritized = Column(Integer, default=0)
    contacted = Column(Integer, default=0)
    offered = Column(Integer, default=0)
    accepted = Column(Integer, default=0)
    conversion_rate = Column(DECIMAL(5, 2))

class Offering(Base):
    __tablename__ = "offerings"
    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(String(10), ForeignKey("clients.id"), nullable=False, index=True)
    offer_id = Column(Integer, ForeignKey("offers.id"), nullable=True)
    asesor_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    channel = Column(String(20))
    message_text = Column(Text)
    stage = Column(String(20), nullable=False, default="classified")
    contact_status = Column(String(20))
    objection_status = Column(String(20))
    speech_rebate = Column(Text)
    evidence_type = Column(String(60))
    evidence_ref = Column(String(100))
    result = Column(String(20))
    rejection_reason = Column(String(50))
    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())



def _require_schema(engine):
    """Verifica si las tablas existen, si no, las crea."""
    inspector = inspect(engine)
    existing_tables = inspector.get_table_names()
    
    required_tables = ["clients", "offers", "offerings", "funnel_daily", "users", "recommendations", "interactions"]
    missing_tables = [t for t in required_tables if t not in existing_tables]
    
    if missing_tables:
        print(f"[load_csvs_new] Tablas faltantes: {missing_tables}")
        print("[load_csvs_new] Creando tablas...")
        Base.metadata.create_all(bind=engine)
        print("[load_csvs_new] Tablas creadas exitosamente.")
    else:
        print("[load_csvs_new] Todas las tablas requeridas existen.")


def _parse_float(v, default=0.0):
    try:
        return float(v) if v not in ("", None) else default
    except (TypeError, ValueError):
        return default


def _parse_int(v, default=0):
    try:
        return int(float(v)) if v not in ("", None) else default
    except (TypeError, ValueError):
        return default


def _app_uso(uso_movistar_prom: float) -> str:
    if uso_movistar_prom >= 8:
        return "Alto"
    if uso_movistar_prom >= 3:
        return "Medio"
    return "Bajo"


def _frecuencia(n_actividad: int) -> str:
    if n_actividad >= 50:
        return "Alta"
    if n_actividad >= 20:
        return "Media"
    return "Baja"


def build_client_profile(row: dict, offer_name_by_code: dict) -> dict:
    """Mapea una fila de muestra_clientes_error_1pct.csv al contrato `profile`."""
    tipo_csv = row.get("tipo_cliente", "postpago")
    tipo = "Postpago" if tipo_csv == "postpago" else "Prepago" if tipo_csv == "prepago" else None
    ant_meses = _parse_int(row.get("antiguedad_meses"))
    ant_dias = ant_meses * 30
    tiene_movil = str(row.get("tiene_movil", "True")).lower() == "true"
    tiene_hogar = str(row.get("tiene_hogar", "False")).lower() == "true"
    tiene_internet = str(row.get("tiene_internet_hogar", "False")).lower() == "true"
    es_mt = str(row.get("es_movistar_total", "False")).lower() == "true" or \
        str(row.get("elegible_mt", "False")).lower() == "true"
    es_app = str(row.get("es_usuario_app", "False")).lower() == "true"

    plan_id = row.get("plan_actual_id") or ""
    plan_name = offer_name_by_code.get(plan_id, plan_id)

    monto_prom = _parse_float(row.get("monto_facturado_prom"))
    monto_6m = _parse_float(row.get("monto_facturado_prom_6m"))
    dias_mora = _parse_int(row.get("dias_mora_prom"))
    n_reclamos = _parse_int(row.get("n_reclamos"))

    dias_datos = _parse_int(row.get("dias_agotamiento_datos_promedio"), default=-1)
    dias_datos = None if dias_datos < 0 or not tiene_movil else dias_datos

    canal_csv = row.get("canal_mas_usado", "")
    canal = CANAL_MAP.get(canal_csv, "WhatsApp")
    franja_csv = row.get("mejor_franja_horaria_contacto", "")
    franja = FRANJA_MAP.get(franja_csv, "08:00-12:00")

    datos_gb = _parse_float(row.get("consumo_datos_gb_prom"))

    return {
        "id": row["cliente_id"],
        "nombre": f"Cliente {row['cliente_id']}",
        "tipo_documento": "DNI",
        "documento": "".join(ch for ch in row["cliente_id"] if ch.isdigit())[:8].ljust(8, "0"),
        "telefono": "9" + "".join(ch for ch in row["cliente_id"] if ch.isdigit())[-7:].ljust(7, "0"),
        "direccion": row.get("ubicacion_departamento", ""),
        "distrito": row.get("ubicacion_departamento", ""),
        "ubicacion_departamento": row.get("ubicacion_departamento", ""),
        "servicio": {
            "tipo": tipo,
            "plan": plan_name,
            "plan_actual_id": plan_id,
            "antiguedad_dias": ant_dias,
            "antiguedad_meses": ant_meses,
            "fecha_activacion": (date.today() - timedelta(days=ant_dias)).isoformat(),
            "tiene_movil": tiene_movil,
            "edad_rango": row.get("edad_rango", ""),
        },
        "consumo": {
            "datos_gb": datos_gb,
            "datos_promedio_3m": round(datos_gb, 1),
            "dias_agotamiento_datos_promedio": dias_datos,
            "voz_minutos": _parse_int(row.get("consumo_voz_min_prom")),
            "voz_promedio_3m": _parse_int(row.get("consumo_voz_min_prom")),
            "sms": _parse_int(row.get("consumo_sms_prom")),
            "app_uso": _app_uso(_parse_float(row.get("uso_app_movistar_prom"))),
            "horario_pico": franja,
            "mejor_franja_horaria_contacto": franja,
            "franja_original": franja_csv,
            "navegacion_web": es_app or datos_gb > 0,
            "streaming": datos_gb >= 20,
        },
        "hogar": {
            "tiene_internet": tiene_internet,
            "tiene_tv": tiene_hogar,
            "tiene_telefonia": tiene_hogar,
            "proveedor_internet": "Movistar" if tiene_internet else None,
            "velocidad_internet": "100 Mbps" if tiene_internet else None,
            "oferta_id": row.get("oferta_hogar_id"),
        },
        "facturacion": {
            "monto_actual": round(monto_prom, 2),
            "monto_facturado_prom": round(monto_prom, 2),
            "monto_promedio_6m": round(monto_6m, 2),
            "monto_maximo": round(max(monto_prom, monto_6m), 2),
            "monto_minimo": round(min(monto_prom, monto_6m), 2),
            "ultimo_pago": (date.today() - timedelta(days=max(dias_mora, 1))).isoformat(),
            "estado_pago": "Pendiente" if dias_mora >= 5 else "Pagado",
            "dias_mora_prom": dias_mora,
            "meses_moroso": _parse_int(row.get("meses_moroso")),
            "metodo_pago_frecuente": row.get("metodo_pago_frecuente", ""),
        },
        "comportamiento": {
            "canal_principal": canal,
            "canal_mas_usado": canal,
            "canal_secundario": "App" if canal != "App" else "WhatsApp",
            "frecuencia_interaccion": _frecuencia(_parse_int(row.get("n_actividad_canal"))),
            "app_downloads": es_app,
            "app_login_frecuencia": "Diario" if es_app else "Rara vez",
            "uso_web": es_app,
            "reclamos_12m": n_reclamos,
            "n_reclamos": n_reclamos,
            "reclamos_abiertos": n_reclamos,
            "reclamos": [],
            "nps": max(0, min(10, 10 - n_reclamos - (1 if dias_mora >= 15 else 0))),
            "satisfaccion": "Media",
            "n_actividad_canal": _parse_int(row.get("n_actividad_canal")),
        },
        "elegibilidad": {
            "movistar_total": es_mt,
            "upgrade": tiene_movil and ant_meses >= 6,
            "equipo": tiene_movil and ant_meses >= 12,
            "plan_hogar": tiene_hogar or not tiene_internet,
            "plan_premium": False,
        },
        "historial_ofertas": [],
        "historial_campanias": [],
    }


def load_offers(db, path: Path = None) -> int:
    """Carga las ofertas reales (OFE_xxx) a la tabla offers. Idempotente."""
    path = path or OFFERS_CSV
    if not path.exists():
        print(f"[load_csvs_new] No existe {path.name}; se omite la carga de ofertas.")
        return 0
    # Verificar si ya existen ofertas
    if db.query(Offer).filter(Offer.code == "OFE_001").first():
        print("[load_csvs_new] Ofertas ya cargadas; se omite.")
        return 0

    rows = []
    with open(path, encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            try:
                precio = float(r.get("precio_mensual") or 0)
                ahorro_pct = float(r.get("ahorro_pct") or 0)
            except ValueError:
                precio, ahorro_pct = 0, 0
            desc = r.get("descripcion_corta") or r.get("descripcion_bundle") or ""
            rows.append(Offer(
                code=r["oferta_id"],
                name=r["nombre_oferta"],
                description=f"{desc} · S/{precio:.2f}/mes · ahorro {ahorro_pct:.0f}%",
                priority=OFFER_TIPO_PRIORITY.get(r.get("tipo_oferta"), 1),
                active=True,
            ))
    db.add_all(rows)
    db.commit()
    print(f"[load_csvs_new] Ofertas cargadas: {len(rows)}")
    return len(rows)


def load_clients(db, path: Path = None) -> int:
    """Carga los clientes reales (CLI_xxxxx) a la tabla clients. Idempotente."""
    path = path or CLIENTS_CSV
    if not path.exists():
        print(f"[load_csvs_new] No existe {path.name}; se omite la carga de clientes.")
        return 0
    # Verificar si ya existen clientes
    first_client_id = None
    with open(path, encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        first_row = next(reader, None)
        if first_row:
            first_client_id = first_row.get("cliente_id")
    
    if first_client_id and db.query(Client).filter(Client.id == first_client_id).first():
        print("[load_csvs_new] Clientes ya cargados; se omite.")
        return 0

    # Nombre de oferta por code (para resolver plan_actual_id -> nombre real).
    offer_name_by_code = {o.code: o.name for o in db.query(Offer).all()}

    count = 0
    with open(path, encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            profile = build_client_profile(row, offer_name_by_code)
            client = Client(
                id=profile["id"],
                name=profile["nombre"],
                document_last4=profile["documento"][-4:],
                phone_last4=profile["telefono"][-4:],
                district=profile["distrito"],
                profile=profile,
            )
            db.add(client)
            count += 1
            if count % BATCH == 0:
                db.commit()
                print(f"[load_csvs_new] Clientes: {count}")
    db.commit()
    print(f"[load_csvs_new] Clientes cargados: {count}")
    return count


def _offering_fields(row: dict, offer_id_by_code: dict):
    """Traduce una fila de historial_campanias_muestra.csv a los campos del Offering."""
    resultado = row.get("resultado", "pendiente")
    contactado = row.get("contactabilidad", "") == "contactado"
    rebate = str(row.get("es_rebate", "False")).lower() == "true"
    medio = row.get("medio_probatorio", "")

    if resultado == "aceptada":
        stage, result = "result", "accepted"
    elif resultado == "rechazada":
        stage, result = "result", "rejected"
    else:
        stage = "objection" if (contactado and rebate) else ("contacted" if contactado else "planned")
        result = None

    evidence = {
        "audio_llamada": "call_audio",
        "chat_log": "platform_register",
        "registro_plataforma": "platform_register",
        "sin_contacto": None,
    }.get(medio)

    fecha = datetime(2026, 1, 1, 12, 0)
    try:
        fecha = datetime.strptime(row.get("fecha", "")[:10], "%Y-%m-%d")
    except (ValueError, TypeError):
        pass

    return {
        "client_id": row["cliente_id"],
        "offer_id": offer_id_by_code.get(row.get("oferta_id", "")),
        "channel": CANAL_MAP.get(row.get("canal", ""), "WhatsApp"),
        "message_text": row.get("nombre_oferta", ""),
        "stage": stage,
        "contact_status": "answered" if contactado else "unanswered",
        "objection_status": "rebate" if rebate else "none",
        "evidence_type": evidence,
        "evidence_ref": row.get("ofrecimiento_id", ""),
        "result": result,
        "rejection_reason": RECHAZO_MAP.get(row.get("motivo_rechazo", "")),
        "created_at": fecha,
    }


def _funnel_row(fields: dict):
    """Cuenta (analyzed/prioritized/contacted/offered/accepted) de un ofrecimiento."""
    stage = fields["stage"]
    return {
        "analyzed": 1,
        "prioritized": 1 if stage in ("planned", "contacted", "objection", "result") else 0,
        "contacted": 1 if stage in ("contacted", "objection", "result") else 0,
        "offered": 1 if stage in ("objection", "result") else 0,
        "accepted": 1 if fields["result"] == "accepted" else 0,
    }


def _campana_entry(fields: dict) -> dict:
    etapa = {
        "planned": "Analizado",
        "contacted": "Contactado",
        "objection": "Oferta",
        "result": "Resultado",
    }.get(fields["stage"], fields["stage"])
    if fields["result"] == "accepted":
        res = "Aceptado"
    elif fields["result"] == "rejected":
        res = "Rechazado"
    elif fields["contact_status"] == "answered":
        res = "Pendiente"
    else:
        res = "Sin respuesta"
    return {
        "campaña": fields["message_text"] or "Campaña NEXA",
        "fecha": fields["created_at"].strftime("%Y-%m-%d"),
        "etapa": etapa,
        "canal": fields["channel"],
        "resultado": res,
        "oferta": fields["message_text"],
    }


def load_offerings(db, path: Path = None) -> dict:
    """Carga el historial de campanias a offerings + interactions + funnel_daily."""
    path = path or OFFERINGS_CSV
    stats = {"offerings": 0, "interactions": 0, "funnel_dates": 0, "profiles": 0}
    if not path.exists():
        print(f"[load_csvs_new] No existe {path.name}; se omite la carga de ofrecimientos.")
        return stats

    # Reanudable: ids de ofrecimiento externos (OFR_*) ya insertados
    existing = {
        r[0]
        for r in db.query(Offering.evidence_ref)
        .filter(Offering.client_id.like("CLI%"))
        .filter(Offering.evidence_ref.isnot(None))
        .all()
    }
    if existing:
        print(f"[load_csvs_new] Retomando carga de ofrecimientos: {len(existing)} ya insertados.")

    offer_id_by_code = {o.code: o.id for o in db.query(Offer).all()}

    funnel_daily = {}
    historial_campanias = {}
    historial_ofertas = {}

    count = 0
    pending_accept = []
    
    try:
        with open(path, encoding="utf-8") as fh:
            for row in csv.DictReader(fh):
                if count >= OFFERINGS_LIMIT:
                    print(f"[load_csvs_new] Limite de ofrecimientos alcanzado: {OFFERINGS_LIMIT}.")
                    break
                ext_id = row.get("ofrecimiento_id", "")
                if ext_id and ext_id in existing:
                    continue

                fields = _offering_fields(row, offer_id_by_code)
                offering = Offering(**fields)
                db.add(offering)
                count += 1

                f = _funnel_row(fields)
                day = fields["created_at"].date()
                acc = funnel_daily.setdefault(day, {"analyzed": 0, "prioritized": 0, "contacted": 0,
                                                    "offered": 0, "accepted": 0})
                for k in f:
                    acc[k] += f[k]

                cid = fields["client_id"]
                hc = historial_campanias.setdefault(cid, [])
                if len(hc) < HISTORIAL_MAX:
                    hc.append(_campana_entry(fields))

                if fields["result"] in ("accepted", "rejected"):
                    ho = historial_ofertas.setdefault(cid, [])
                    entry = {
                        "fecha": fields["created_at"].strftime("%Y-%m-%d"),
                        "oferta": fields["message_text"],
                        "resultado": "Aceptado" if fields["result"] == "accepted" else "Rechazado",
                    }
                    if fields["rejection_reason"]:
                        entry["motivo"] = fields["rejection_reason"]
                    ho.append(entry)

                if fields["result"] == "accepted":
                    rec = Recommendation(
                        client_id=cid, offer_id=fields["offer_id"],
                        probability=0.6, score=0.6, created_at=fields["created_at"],
                    )
                    db.add(rec)
                    pending_accept.append((rec, fields))
                    stats["interactions"] += 1
                elif fields["result"] == "rejected":
                    db.add(Interaction(
                        client_id=cid, recommendation_id=None, channel=fields["channel"],
                        result="rejected", rejection_reason=fields["rejection_reason"],
                        created_at=fields["created_at"],
                    ))
                    stats["interactions"] += 1

                if count % BATCH == 0:
                    if pending_accept:
                        db.flush()
                        for rec, flds in pending_accept:
                            db.add(Interaction(
                                client_id=flds["client_id"], recommendation_id=rec.id,
                                channel=flds["channel"], result="accepted",
                                created_at=flds["created_at"],
                            ))
                        pending_accept = []
                    db.commit()
                    print(f"[load_csvs_new] Ofrecimientos: {count}")

    except KeyboardInterrupt:
        print(f"\n[load_csvs_new] Interrupción por usuario. Guardando progreso hasta {count} registros...")
        db.commit()
        print(f"[load_csvs_new] Progreso guardado. Puedes reanudar ejecutando el script nuevamente.")
        return stats

    if pending_accept:
        db.flush()
        for rec, flds in pending_accept:
            db.add(Interaction(
                client_id=flds["client_id"], recommendation_id=rec.id,
                channel=flds["channel"], result="accepted",
                created_at=flds["created_at"],
            ))
    db.commit()
    stats["offerings"] = count

    # FunnelDaily
    for day, acc in funnel_daily.items():
        row = db.query(FunnelDaily).filter(FunnelDaily.date == day).first()
        if not row:
            row = FunnelDaily(date=day, analyzed=0, prioritized=0, contacted=0,
                                     offered=0, accepted=0, conversion_rate=0)
            db.add(row)
        row.analyzed += acc["analyzed"]
        row.prioritized += acc["prioritized"]
        row.contacted += acc["contacted"]
        row.offered += acc["offered"]
        row.accepted += acc["accepted"]
        row.conversion_rate = round((row.accepted / row.analyzed) * 100, 2) if row.analyzed else 0
        stats["funnel_dates"] += 1
    db.commit()

    # Actualizar profiles
    ids = sorted(set(historial_campanias) | set(historial_ofertas))
    CHUNK = 1000
    for i in range(0, len(ids), CHUNK):
        chunk = ids[i:i + CHUNK]
        for client in db.query(Client).filter(Client.id.in_(chunk)).all():
            profile = copy.deepcopy(client.profile or {})
            profile["historial_campanias"] = historial_campanias.get(client.id, [])[:HISTORIAL_MAX]
            profile["historial_ofertas"] = historial_ofertas.get(client.id, [])[:HISTORIAL_MAX]
            client.profile = profile
            stats["profiles"] += 1
        db.commit()
    db.commit()

    print(
        f"[load_csvs_new] Ofrecimientos: {count} · interacciones: {stats['interactions']} · "
        f"funnel diario: {stats['funnel_dates']} dias · perfiles con historial: {stats['profiles']}"
    )
    return stats


def main():
    """Orquesta la carga de los CSV de csvs_new."""
    print("=== CARGANDO DATOS DE CSVS_NEW A NUEVA BASE DE DATOS ===")
    print(f"Base de datos: {NEW_DB_URL}")
    print(f"Directorio CSV: {CSV_DIR}")
    
    # Crear engine y sesión
    engine = create_engine(NEW_DB_URL, pool_pre_ping=True)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = SessionLocal()
    
    try:
        # Verificar schema
        _require_schema(engine)
        
        # Cargar datos
        load_offers(db)
        load_clients(db)
        load_offerings(db)
        
        print("\n=== CARGA COMPLETADA ===")
        
    except Exception as e:
        print(f"\nError durante la carga: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()


if __name__ == "__main__":
    main()
