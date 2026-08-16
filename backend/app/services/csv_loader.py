"""
Carga de datos reales (CSV) a la BD de NEXA.

Acopla los 3 CSV de `backend/csvs` a las tablas existentes SIN romper el
schema ni el seed demo:

- `catalogo_ofertas_entrega_clean.csv` -> tabla `offers` (ofertas reales OFE_xxx).
- `dataset_clientes_clean.csv`        -> tabla `clients` (clientes reales CLI_xxxxx)
  con el `profile` mapeado al mismo contrato que consumen KPI/chat/speech/PDF.
- `historial_campanias_clean.csv`     -> tabla `offerings` (E2E) + `interactions` +
  `recommendations` + `funnel_daily` + `historial_campanias`/`historial_ofertas`
  en el perfil de cada cliente.
- `asesores.csv`                      -> tabla `users` (rol asesor) + reparto de la
  cartera: cada cliente queda asignado a un asesor (`clients.asesor_id`), con un
  numero acotado de clientes por asesor (ej. 100 asesores x 1,000 clientes).

Idempotente: si el primer cliente real (CLI_000001) o la primera oferta real
(OFE_001) ya existen, se omite la carga correspondiente.

Ejecucion:
    python -c "from app.services.csv_loader import seed_csv; seed_csv()"
"""
import csv
import copy
import math
from datetime import date, datetime, timedelta
from pathlib import Path

from sqlalchemy import func, inspect, update as sa_update

from app.database import engine, SessionLocal
from app import models
from app.security import hash_password

# Rutas relativas a este archivo: backend/csvs/
CSV_DIR = Path(__file__).resolve().parents[2] / "csvs"
OFFERS_CSV = CSV_DIR / "catalogo_ofertas_entrega_clean.csv"
CLIENTS_CSV = CSV_DIR / "dataset_clientes_clean.csv"
OFFERINGS_CSV = CSV_DIR / "historial_campanias_clean.csv"
ASESORES_CSV = CSV_DIR / "asesores.csv"

# Canales del CSV (legacy) -> canales de contacto reales del E2E.
CANAL_MAP = {"Digital": "App", "Tienda": "WhatsApp", "Call_In": "Llamada", "Call_Out": "Llamada"}

# Franjas del CSV (texto) -> franjas HH:MM-HH:MM que entienden _llamable_ahora y el KPI 5.
FRANJA_MAP = {
    "Manana": "08:00-12:00",
    "Tarde": "14:00-18:00",
    "Noche": "19:00-23:00",
    "Fin_de_semana": "09:00-13:00",
}

# Motivos de rechazo del CSV -> categorias del dashboard (Precio/Mal Servicio/Competencia + Otro).
RECHAZO_MAP = {
    "precio": "Precio",
    "ya_tiene_similar": "Competencia",
    "mal_momento": "Otro",
    "no_confia": "Otro",
    "otro": "Otro",
    "no_necesita": "Otro",
}

# Tipo de oferta -> prioridad estrategica (para la tabla offers).
OFFER_TIPO_PRIORITY = {
    "movistar_total": 5,
    "plan_hogar": 4,
    "plan_movil": 3,
    "upgrade": 3,
    "equipo": 2,
    "paquete_adicional": 1,
}

BATCH = 2000
HISTORIAL_MAX = 6

# Limite de ofrecimientos a cargar desde el CSV real (300k+ filas). Se acota a
# 50k para no agotar la cuota de transferencia ni la RAM de la BD gratuita.
OFFERINGS_LIMIT = 50000


def _require_schema():
    inspector = inspect(engine)
    for table in ("clients", "offers", "offerings", "funnel_daily"):
        if table not in inspector.get_table_names():
            raise RuntimeError(
                f"El esquema no esta migrado (falta {table}). Ejecute: alembic upgrade head"
            )


# ---------------------------------------------------------------- ofertas
def load_offers(db, path: Path = None) -> int:
    """Carga las ofertas reales (OFE_xxx) a la tabla offers. Idempotente."""
    path = path or OFFERS_CSV
    if not path.exists():
        print(f"[csv_loader] No existe {path.name}; se omite la carga de ofertas.")
        return 0
    if db.query(models.Offer).filter(models.Offer.code == "OFE_001").first():
        print("[csv_loader] Ofertas reales ya cargadas; se omite.")
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
            rows.append(models.Offer(
                code=r["oferta_id"],
                name=r["nombre_oferta"],
                description=f"{desc} · S/{precio:.2f}/mes · ahorro {ahorro_pct:.0f}%",
                priority=OFFER_TIPO_PRIORITY.get(r.get("tipo_oferta"), 1),
                active=True,
            ))
    db.add_all(rows)
    db.commit()
    print(f"[csv_loader] Ofertas cargadas: {len(rows)}")
    return len(rows)


def _ofrece_plan(nombre_oferta: str) -> str:
    """'Plan Movil Premium 1' -> 'Movistar Total' / 'Plan Hogar' / 'Plan Movil'..."""
    nombre = (nombre_oferta or "").lower()
    if "movistar total" in nombre:
        return "Movistar Total"
    if "hogar" in nombre:
        return "Plan Hogar"
    if "upgrade" in nombre:
        return "Upgrade"
    if "equipo" in nombre:
        return "Equipo"
    return "Plan Movil"


# ---------------------------------------------------------------- clientes
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
    """Mapea una fila de dataset_clientes_clean.csv al contrato `profile`."""
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

    # dias_agotamiento_datos_promedio: -1 = sin movil/datos -> None (KPI muted).
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


def load_clients(db, path: Path = None) -> int:
    """Carga los clientes reales (CLI_xxxxx) a la tabla clients. Idempotente."""
    path = path or CLIENTS_CSV
    if not path.exists():
        print(f"[csv_loader] No existe {path.name}; se omite la carga de clientes.")
        return 0
    if db.query(models.Client).filter(models.Client.id == "CLI_000001").first():
        print("[csv_loader] Clientes reales ya cargados; se omite.")
        return 0

    # Nombre de oferta por code (para resolver plan_actual_id -> nombre real).
    offer_name_by_code = {o.code: o.name for o in db.query(models.Offer).all()}

    count = 0
    with open(path, encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            profile = build_client_profile(row, offer_name_by_code)
            client = models.Client(
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
                print(f"[csv_loader] Clientes: {count}")
    db.commit()
    print(f"[csv_loader] Clientes cargados: {count}")
    return count


# ---------------------------------------------------------------- asesores + cartera
# Contrasena por defecto para los asesores del CSV (demo). El admin puede cambiarla.
ASESOR_DEFAULT_PASSWORD = "asesor123"


def load_asesores(db, path: Path = None, password: str = ASESOR_DEFAULT_PASSWORD) -> int:
    """Carga los asesores reales (asesores.csv) a la tabla users. Idempotente.

    Cada fila crea un usuario con rol `asesor`; el id externo del CSV (A001...)
    no tiene columna propia en users, pero el email `asesor###@nexa.demo` es la
    clave de idempotencia.
    """
    path = path or ASESORES_CSV
    if not path.exists():
        print(f"[csv_loader] No existe {path.name}; se omite la carga de asesores.")
        return 0
    if db.query(models.User).filter(models.User.email == "asesor001@nexa.demo").first():
        print("[csv_loader] Asesores del CSV ya cargados; se omite.")
        return 0

    rows = []
    seen = set()
    with open(path, encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            email = (r.get("email") or "").strip().lower()
            if not email or email in seen:
                continue
            seen.add(email)
            rows.append(models.User(
                email=email,
                password_hash=hash_password(password),
                role="asesor",
                name=(r.get("nombre") or "").strip() or email.split("@")[0],
            ))
    db.add_all(rows)
    db.commit()
    print(f"[csv_loader] Asesores cargados: {len(rows)}")
    return len(rows)


def assign_cartera(db, clientes_por_asesor: int = None) -> int:
    """Reparte los clientes entre los asesores (cartera). Idempotente y reanudable.

    Se asigna de a rangos contiguos ordenando por id: con 100.000 clientes y
    100 asesores quedan ~1.000 clientes por asesor. Si `clientes_por_asesor` se
    omite, se reparte equilibrado (ceil(total / n_asesores)).

    Usa un UPDATE masivo por asesor (IN con el rango de ids) y solo toca los
    clientes que siguen sin `asesor_id`: una corrida interrumpida a mitad se
    completa en la siguiente ejecucion sin reescribir lo ya asignado.
    """
    asesores = db.query(models.User).filter(models.User.role == "asesor").order_by(models.User.id).all()
    n = len(asesores)
    if n == 0:
        print("[csv_loader] No hay asesores; se omite el reparto de cartera.")
        return 0

    ids = [r[0] for r in db.query(models.Client.id).order_by(models.Client.id).all()]
    if not ids:
        print("[csv_loader] No hay clientes; se omite el reparto de cartera.")
        return 0

    total = len(ids)
    per = int(clientes_por_asesor) if clientes_por_asesor else max(1, math.ceil(total / n))

    assigned = 0
    for i in range(0, total, per):
        chunk = ids[i:i + per]
        aid = asesores[min(i // per, n - 1)].id
        result = db.execute(
            sa_update(models.Client)
            .where(models.Client.id.in_(chunk), models.Client.asesor_id.is_(None))
            .values(asesor_id=aid)
        )
        assigned += result.rowcount or 0
        if assigned % 20000 == 0:
            db.commit()
            print(f"[csv_loader] Cartera asignada: {assigned}/{total}")
    db.commit()
    print(f"[csv_loader] Cartera asignada: {assigned} clientes en {n} asesores (~{per} c/u).")
    return assigned


# ---------------------------------------------------------------- ofrecimientos
def _offering_fields(row: dict, offer_id_by_code: dict):
    """Traduce una fila de historial_campanias_clean.csv a los campos del Offering."""
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
    """Carga el historial de campanias a offerings + interactions + funnel_daily.

    Tambien actualiza `historial_campanias`/`historial_ofertas` del perfil de cada
    cliente real para que el timeline y el motor NBO usen datos reales.
    """
    path = path or OFFERINGS_CSV
    stats = {"offerings": 0, "interactions": 0, "funnel_dates": 0, "profiles": 0}
    if not path.exists():
        print(f"[csv_loader] No existe {path.name}; se omite la carga de ofrecimientos.")
        return stats

    # Reanudable: ids de ofrecimiento externos (OFR_*) ya insertados, guardados en
    # evidence_ref. Permite retomar una carga interrumpida sin duplicar filas ni funnel.
    existing = {
        r[0]
        for r in db.query(models.Offering.evidence_ref)
        .filter(models.Offering.client_id.like("CLI%"))
        .filter(models.Offering.evidence_ref.isnot(None))
        .all()
    }
    if existing:
        print(f"[csv_loader] Retomando carga de ofrecimientos: {len(existing)} ya insertados.")

    offer_id_by_code = {o.code: o.id for o in db.query(models.Offer).all()}

    # Acumuladores por dia (funnel_daily) y por cliente (historial en el profile).
    funnel_daily = {}
    historial_campanias = {}
    historial_ofertas = {}

    count = 0
    pending_accept = []  # (rec, campos de interaction) -> flush por lote
    with open(path, encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            if count >= OFFERINGS_LIMIT:
                print(f"[csv_loader] Limite de ofrecimientos alcanzado: {OFFERINGS_LIMIT}.")
                break
            ext_id = row.get("ofrecimiento_id", "")
            if ext_id and ext_id in existing:
                continue

            fields = _offering_fields(row, offer_id_by_code)
            offering = models.Offering(**fields)
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

            # Interaction + Recommendation (para el breakdown del dashboard).
            # Se encolan para flush por lote: los ids se asignan al hacer flush una
            # vez por BATCH (evita un round-trip a Postgres por cada aceptada).
            if fields["result"] == "accepted":
                rec = models.Recommendation(
                    client_id=cid, offer_id=fields["offer_id"],
                    probability=0.6, score=0.6, created_at=fields["created_at"],
                )
                db.add(rec)
                pending_accept.append((rec, fields))
                stats["interactions"] += 1
            elif fields["result"] == "rejected":
                db.add(models.Interaction(
                    client_id=cid, recommendation_id=None, channel=fields["channel"],
                    result="rejected", rejection_reason=fields["rejection_reason"],
                    created_at=fields["created_at"],
                ))
                stats["interactions"] += 1

            if count % BATCH == 0:
                if pending_accept:
                    db.flush()  # asigna rec.id a todas las aceptadas del lote
                    for rec, flds in pending_accept:
                        db.add(models.Interaction(
                            client_id=flds["client_id"], recommendation_id=rec.id,
                            channel=flds["channel"], result="accepted",
                            created_at=flds["created_at"],
                        ))
                    pending_accept = []
                db.commit()
                print(f"[csv_loader] Ofrecimientos: {count}")

    if pending_accept:
        db.flush()
        for rec, flds in pending_accept:
            db.add(models.Interaction(
                client_id=flds["client_id"], recommendation_id=rec.id,
                channel=flds["channel"], result="accepted",
                created_at=flds["created_at"],
            ))
    db.commit()
    stats["offerings"] = count

    # --- FunnelDaily: upsert por dia (suma a filas existentes del seed). ---
    for day, acc in funnel_daily.items():
        row = db.query(models.FunnelDaily).filter(models.FunnelDaily.date == day).first()
        if not row:
            row = models.FunnelDaily(date=day, analyzed=0, prioritized=0, contacted=0,
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

    # --- Actualizar el profile de los clientes reales (historial real). ---
    ids = sorted(set(historial_campanias) | set(historial_ofertas))
    CHUNK = 1000
    for i in range(0, len(ids), CHUNK):
        chunk = ids[i:i + CHUNK]
        for client in db.query(models.Client).filter(models.Client.id.in_(chunk)).all():
            profile = copy.deepcopy(client.profile or {})
            profile["historial_campanias"] = historial_campanias.get(client.id, [])[:HISTORIAL_MAX]
            profile["historial_ofertas"] = historial_ofertas.get(client.id, [])[:HISTORIAL_MAX]
            client.profile = profile
            stats["profiles"] += 1
        db.commit()
    db.commit()

    print(
        f"[csv_loader] Ofrecimientos: {count} · interacciones: {stats['interactions']} · "
        f"funnel diario: {stats['funnel_dates']} dias · perfiles con historial: {stats['profiles']}"
    )
    return stats


def seed_csv(db=None):
    """Orquesta la carga de los CSV. Idempotente."""
    _require_schema()
    own_session = db is None
    if own_session:
        db = SessionLocal()
    try:
        load_offers(db)
        load_clients(db)
        load_offerings(db)
        load_asesores(db)
        assign_cartera(db)
    finally:
        if own_session:
            db.close()


if __name__ == "__main__":
    seed_csv()