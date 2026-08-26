"""
Script para verificar los KPIs del supervisor.
"""
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

# Nueva base de datos
NEW_DB_URL = "postgresql+psycopg2://neondb_owner:npg_Or8dDZT5LMVY@ep-patient-fire-ay1mxqp9-pooler.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require"

try:
    print("=== VERIFICANDO KPIS DEL SUPERVISOR ===")
    
    engine = create_engine(NEW_DB_URL, pool_pre_ping=True)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = SessionLocal()
    
    # Total de clientes
    total_clients = db.execute(text("SELECT COUNT(*) FROM clients")).scalar()
    print(f"Total clientes en BD: {total_clients}")
    
    # Clientes por asesor
    print("\n--- CLIENTES POR ASESOR ---")
    clients_by_advisor = db.execute(text("""
        SELECT u.email, u.name, COUNT(c.id) as client_count
        FROM users u
        LEFT JOIN clients c ON u.id = c.asesor_id
        WHERE u.role = 'asesor'
        GROUP BY u.id, u.email, u.name
        ORDER BY u.id
    """)).fetchall()
    
    for row in clients_by_advisor:
        print(f"{row[0]} ({row[1]}): {row[2]} clientes")
    
    # Clientes sin asesor
    orphan_clients = db.execute(text("""
        SELECT COUNT(*) FROM clients WHERE asesor_id IS NULL
    """)).scalar()
    print(f"\nClientes sin asesor: {orphan_clients}")
    
    # Elegibles MT totales
    elegibles_mt = db.execute(text("""
        SELECT COUNT(*) FROM clients 
        WHERE (profile -> 'elegibilidad' ->> 'movistar_total') = 'true'
    """)).scalar()
    print(f"Elegibles MT totales: {elegibles_mt}")
    
    db.close()
    print("\n=== VERIFICACIÓN COMPLETADA ===")
    
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
