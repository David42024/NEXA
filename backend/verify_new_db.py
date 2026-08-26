"""
Script para verificar el estado de la nueva base de datos después de la carga.
"""
from sqlalchemy import create_engine, func, inspect
from sqlalchemy.orm import sessionmaker

# Nueva base de datos
NEW_DB_URL = "postgresql+psycopg2://neondb_owner:npg_Or8dDZT5LMVY@ep-patient-fire-ay1mxqp9-pooler.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require"

try:
    print("Conectando a la nueva base de datos...")
    engine = create_engine(NEW_DB_URL, pool_pre_ping=True)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = SessionLocal()
    
    print("\n=== ESTADO DE LA BASE DE DATOS ===")
    
    # Contar registros en cada tabla principal
    from sqlalchemy import text
    
    tables_to_check = [
        "users",
        "offers", 
        "clients",
        "offerings",
        "recommendations",
        "interactions",
        "funnel_daily"
    ]
    
    for table in tables_to_check:
        try:
            result = db.execute(text(f"SELECT COUNT(*) FROM {table}"))
            count = result.scalar()
            print(f"{table:20s}: {count:,} registros")
        except Exception as e:
            print(f"{table:20s}: Error - {e}")
    
    # Verificar ofertas específicas
    print("\n=== MUESTRA DE OFERTAS ===")
    offers = db.execute(text("SELECT code, name, active FROM offers LIMIT 5")).fetchall()
    for offer in offers:
        print(f"  {offer[0]}: {offer[1]} (active={offer[2]})")
    
    # Verificar clientes específicos
    print("\n=== MUESTRA DE CLIENTES ===")
    clients = db.execute(text("SELECT id, name, district FROM clients LIMIT 5")).fetchall()
    for client in clients:
        print(f"  {client[0]}: {client[1]} ({client[2]})")
    
    # Verificar ofrecimientos
    print("\n=== MUESTRA DE OFRECIMIENTOS ===")
    offerings = db.execute(text("""
        SELECT o.id, o.client_id, o.stage, o.result, o.created_at 
        FROM offerings o 
        ORDER BY o.created_at DESC 
        LIMIT 5
    """)).fetchall()
    for offering in offerings:
        print(f"  ID {offering[0]}: Cliente {offering[1]}, Stage {offering[2]}, Result {offering[3]}, Fecha {offering[4]}")
    
    # Verificar funnel_daily
    print("\n=== FUNNEL DIARIO (últimos 5 días) ===")
    funnel = db.execute(text("""
        SELECT date, analyzed, contacted, offered, accepted, conversion_rate 
        FROM funnel_daily 
        ORDER BY date DESC 
        LIMIT 5
    """)).fetchall()
    for row in funnel:
        print(f"  {row[0]}: Analyzed={row[1]}, Contacted={row[2]}, Offered={row[3]}, Accepted={row[4]}, Conv={row[5]}%")
    
    db.close()
    print("\n=== VERIFICACIÓN COMPLETADA ===")
    
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
