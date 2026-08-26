"""
Script para asignar clientes a asesores en la nueva base de datos.
"""
from sqlalchemy import create_engine, func, update as sa_update
from sqlalchemy.orm import sessionmaker
import math

# Nueva base de datos
NEW_DB_URL = "postgresql+psycopg2://neondb_owner:npg_Or8dDZT5LMVY@ep-patient-fire-ay1mxqp9-pooler.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require"

def assign_clients_to_advisors():
    """Asigna los clientes entre los asesores disponibles."""
    print("=== ASIGNANDO CLIENTES A ASESORES ===")
    
    engine = create_engine(NEW_DB_URL, pool_pre_ping=True)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = SessionLocal()
    
    try:
        # Obtener asesores
        from sqlalchemy import text
        asesores = db.execute(text("""
            SELECT id, email, name 
            FROM users 
            WHERE role = 'asesor' 
            ORDER BY id
        """)).fetchall()
        
        if not asesores:
            print("[assign_clients] No hay asesores disponibles. Primero ejecute create_test_users.py")
            return
        
        print(f"[assign_clients] Asesores encontrados: {len(asesores)}")
        for asesor in asesores:
            print(f"  - ID {asesor[0]}: {asesor[1]} ({asesor[2]})")
        
        # Obtener clientes sin asesor asignado
        clients_without_advisor = db.execute(text("""
            SELECT id 
            FROM clients 
            WHERE asesor_id IS NULL 
            ORDER BY id
        """)).fetchall()
        
        if not clients_without_advisor:
            print("[assign_clients] Todos los clientes ya tienen asesor asignado.")
            return
        
        print(f"[assign_clients] Clientes sin asesor: {len(clients_without_advisor)}")
        
        # Calcular cuántos clientes por asesor
        clients_per_advisor = math.ceil(len(clients_without_advisor) / len(asesores))
        print(f"[assign_clients] Clientes por asesor: {clients_per_advisor}")
        
        # Asignar clientes en bloques
        assigned_count = 0
        for i, asesor in enumerate(asesores):
            start_idx = i * clients_per_advisor
            end_idx = start_idx + clients_per_advisor
            client_chunk = clients_without_advisor[start_idx:end_idx]
            
            if not client_chunk:
                continue
            
            client_ids = [c[0] for c in client_chunk]
            
            # Actualizar clientes
            db.execute(text("""
                UPDATE clients 
                SET asesor_id = :asesor_id 
                WHERE id = ANY(:client_ids)
            """), {"asesor_id": asesor[0], "client_ids": client_ids})
            
            assigned_count += len(client_chunk)
            print(f"[assign_clients] Asesor {asesor[1]}: {len(client_chunk)} clientes asignados")
        
        db.commit()
        print(f"\n[assign_clients] Total de clientes asignados: {assigned_count}")
        
        # Verificar resultado
        verification = db.execute(text("""
            SELECT u.email, u.name, COUNT(c.id) as client_count
            FROM users u
            LEFT JOIN clients c ON u.id = c.asesor_id
            WHERE u.role = 'asesor'
            GROUP BY u.id, u.email, u.name
            ORDER BY u.id
        """)).fetchall()
        
        print("\n=== VERIFICACIÓN DE ASIGNACIÓN ===")
        for row in verification:
            print(f"  {row[0]} ({row[1]}): {row[2]} clientes")
        
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    assign_clients_to_advisors()
