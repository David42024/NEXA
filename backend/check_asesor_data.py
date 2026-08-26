"""
Script para verificar si los asesores tienen clientes y offerings asignados.
"""
from sqlalchemy import create_engine, func, text
from sqlalchemy.orm import sessionmaker

# Nueva base de datos
NEW_DB_URL = "postgresql+psycopg2://neondb_owner:npg_Or8dDZT5LMVY@ep-patient-fire-ay1mxqp9-pooler.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require"

try:
    print("=== VERIFICANDO ASIGNACIÓN DE CLIENTES Y OFFERINGS ===")
    
    engine = create_engine(NEW_DB_URL, pool_pre_ping=True)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = SessionLocal()
    
    # Verificar usuarios
    print("\n--- USUARIOS ---")
    users = db.execute(text("""
        SELECT id, email, role, name 
        FROM users 
        ORDER BY id
    """)).fetchall()
    
    for user in users:
        print(f"ID {user[0]}: {user[1]} ({user[2]}) - {user[3]}")
        
        # Contar clientes asignados a este asesor
        client_count = db.execute(text("""
            SELECT COUNT(*) FROM clients WHERE asesor_id = :asesor_id
        """), {"asesor_id": user[0]}).scalar()
        
        print(f"  Clientes asignados: {client_count}")
        
        # Contar offerings de este asesor
        offering_count = db.execute(text("""
            SELECT COUNT(*) FROM offerings WHERE asesor_id = :asesor_id
        """), {"asesor_id": user[0]}).scalar()
        
        print(f"  Offerings: {offering_count}")
        
        # Contar ventas aceptadas de este asesor
        sales_count = db.execute(text("""
            SELECT COUNT(*) FROM offerings 
            WHERE asesor_id = :asesor_id 
            AND stage = 'result' 
            AND result = 'accepted'
        """), {"asesor_id": user[0]}).scalar()
        
        print(f"  Ventas aceptadas: {sales_count}")
    
    # Verificar distribución de clientes
    print("\n--- DISTRIBUCIÓN DE CLIENTES POR ASESOR ---")
    distribution = db.execute(text("""
        SELECT u.email, u.name, COUNT(c.id) as client_count
        FROM users u
        LEFT JOIN clients c ON u.id = c.asesor_id
        WHERE u.role = 'asesor'
        GROUP BY u.id, u.email, u.name
        ORDER BY u.id
    """)).fetchall()
    
    for row in distribution:
        print(f"{row[0]} ({row[1]}): {row[2]} clientes")
    
    # Verificar offerings sin asesor
    print("\n--- OFFERINGS SIN ASESOR ---")
    orphan_offerings = db.execute(text("""
        SELECT COUNT(*) FROM offerings WHERE asesor_id IS NULL
    """)).scalar()
    print(f"Offerings sin asesor: {orphan_offerings}")
    
    # Verificar clientes sin asesor
    print("\n--- CLIENTES SIN ASESOR ---")
    orphan_clients = db.execute(text("""
        SELECT COUNT(*) FROM clients WHERE asesor_id IS NULL
    """)).scalar()
    print(f"Clientes sin asesor: {orphan_clients}")
    
    db.close()
    print("\n=== VERIFICACIÓN COMPLETADA ===")
    
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
