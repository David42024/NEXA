"""
Script para asignar offerings a asesores basándose en la asignación de clientes.
"""
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

# Nueva base de datos
NEW_DB_URL = "postgresql+psycopg2://neondb_owner:npg_Or8dDZT5LMVY@ep-patient-fire-ay1mxqp9-pooler.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require"

def assign_offerings_to_advisors():
    """Asigna offerings a asesores basándose en el asesor del cliente asociado."""
    print("=== ASIGNANDO OFFERINGS A ASESORES ===")
    
    engine = create_engine(NEW_DB_URL, pool_pre_ping=True)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = SessionLocal()
    
    try:
        # Verificar offerings sin asesor
        orphan_offerings = db.execute(text("""
            SELECT COUNT(*) FROM offerings WHERE asesor_id IS NULL
        """)).scalar()
        
        print(f"Offerings sin asesor: {orphan_offerings}")
        
        if orphan_offerings == 0:
            print("Todos los offerings ya tienen asesor asignado.")
            return
        
        # Asignar offerings al mismo asesor que el cliente
        print("Asignando offerings al asesor del cliente asociado...")
        
        result = db.execute(text("""
            UPDATE offerings o
            SET asesor_id = c.asesor_id
            FROM clients c
            WHERE o.client_id = c.id
            AND o.asesor_id IS NULL
            AND c.asesor_id IS NOT NULL
        """))
        
        assigned_count = result.rowcount
        db.commit()
        
        print(f"Offerings asignados: {assigned_count}")
        
        # Verificar resultado
        print("\n--- VERIFICACIÓN DE ASIGNACIÓN ---")
        distribution = db.execute(text("""
            SELECT u.email, u.name, COUNT(o.id) as offering_count
            FROM users u
            LEFT JOIN offerings o ON u.id = o.asesor_id
            WHERE u.role = 'asesor'
            GROUP BY u.id, u.email, u.name
            ORDER BY u.id
        """)).fetchall()
        
        for row in distribution:
            print(f"{row[0]} ({row[1]}): {row[2]} offerings")
        
        # Verificar offerings sin asesor después de la asignación
        remaining_orphans = db.execute(text("""
            SELECT COUNT(*) FROM offerings WHERE asesor_id IS NULL
        """)).scalar()
        
        print(f"\nOfferings sin asesor después de la asignación: {remaining_orphans}")
        
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    assign_offerings_to_advisors()
