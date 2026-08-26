"""
Script para probar el endpoint de KPIs completo como supervisor.
"""
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy import func

# Nueva base de datos
NEW_DB_URL = "postgresql+psycopg2://neondb_owner:npg_Or8dDZT5LMVY@ep-patient-fire-ay1mxqp9-pooler.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require"

engine = create_engine(NEW_DB_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
db = SessionLocal()

try:
    print("=== PROBANDO ENDPOINT KPIS COMPLETO ===")
    
    # Importar modelos
    import sys
    sys.path.insert(0, 'c:\\Users\\USERJSSV\\Downloads\\nexa\\backend')
    from app import models
    
    # Simular supervisor (no asesor) - código del endpoint
    is_asesor = False
    
    if is_asesor:
        base = db.query(models.Client).filter(models.Client.asesor_id == 1)
        total_clients = base.count()
    else:
        total_clients = db.query(func.count(models.Client.id)).scalar() or 0
    
    print(f"Total clientes (según endpoint): {total_clients}")
    
    # Verificar elegibles MT
    def _count_elegibles_mt(db, asesor_id=None):
        try:
            if asesor_id is not None:
                q = text(
                    "SELECT count(*) FROM clients "
                    "WHERE (profile -> 'elegibilidad' ->> 'movistar_total') = 'true' "
                    "AND asesor_id = :asesor_id"
                ).bindparams(asesor_id=asesor_id)
            else:
                q = text(
                    "SELECT count(*) FROM clients "
                    "WHERE (profile -> 'elegibilidad' ->> 'movistar_total') = 'true'"
                )
            return db.execute(q).scalar() or 0
        except Exception:
            return 0
    
    elegibles_mt = _count_elegibles_mt(db)
    print(f"Elegibles MT: {elegibles_mt}")
    
    # Verificar interacciones
    accepted = db.query(func.count(models.Interaction.id)).filter(models.Interaction.result == "accepted").scalar() or 0
    total_interactions = db.query(func.count(models.Interaction.id)).scalar() or 0
    print(f"Interacciones aceptadas: {accepted}")
    print(f"Total interacciones: {total_interactions}")
    
    conversion = round((accepted / total_interactions) * 100, 1) if total_interactions else 0
    print(f"Conversión: {conversion}%")
    
    print(f"\nRespuesta completa del endpoint:")
    print({
        "total_clientes": total_clients,
        "elegibles_mt": elegibles_mt,
        "conversion_pct": conversion,
        "valor_potencial_soles": round(elegibles_mt * 22.3, 2),
        "aceptadas": accepted,
        "total_interacciones": total_interactions,
    })
    
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
finally:
    db.close()
