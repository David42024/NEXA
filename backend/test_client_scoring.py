"""
Script para verificar el scoring y segmentación de clientes en la base de datos.
"""
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
import json

# Nueva base de datos
NEW_DB_URL = "postgresql+psycopg2://neondb_owner:npg_Or8dDZT5LMVY@ep-patient-fire-ay1mxqp9-pooler.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require"

def test_client_scoring():
    """Verifica el scoring y segmentación de clientes."""
    print("=== VERIFICANDO SCORING Y SEGMENTACIÓN DE CLIENTES ===")
    
    engine = create_engine(NEW_DB_URL, pool_pre_ping=True)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = SessionLocal()
    
    try:
        # Verificar clientes de un asesor específico
        asesor_id = 2  # asesor001
        print(f"\n--- CLIENTES DEL ASESOR {asesor_id} ---")
        
        clients = db.execute(text("""
            SELECT id, name, district, profile 
            FROM clients 
            WHERE asesor_id = :asesor_id 
            LIMIT 5
        """), {"asesor_id": asesor_id}).fetchall()
        
        print(f"Total clientes: {len(clients)} (muestra de 5)")
        
        for client in clients:
            print(f"\nCliente {client[0]}: {client[1]} - {client[2]}")
            profile = client[3]
            if profile:
                print(f"Profile: {json.dumps(profile, indent=2)[:500]}...")
                
                # Verificar elegibilidad
                elegibilidad = profile.get("elegibilidad", {})
                movistar_total = elegibilidad.get("movistar_total", False)
                print(f"Elegible Movistar Total: {movistar_total}")
                
                # Verificar consumo
                consumo = profile.get("consumo", {})
                if consumo:
                    datos_mb = consumo.get("datos_mb", 0)
                    print(f"Consumo datos: {datos_mb} MB")
        
        # Contar clientes elegibles MT
        print("\n--- ELEGIBILIDAD MOVISTAR TOTAL ---")
        elegibles_mt = db.execute(text("""
            SELECT COUNT(*) 
            FROM clients 
            WHERE asesor_id = :asesor_id
            AND profile->'elegibilidad'->>'movistar_total' = 'true'
        """), {"asesor_id": asesor_id}).scalar()
        
        print(f"Clientes elegibles MT: {elegibles_mt}")
        
        # Verificar estructura del profile
        print("\n--- ESTRUCTURA DEL PROFILE ---")
        sample_profile = db.execute(text("""
            SELECT profile 
            FROM clients 
            WHERE asesor_id = :asesor_id 
            AND profile IS NOT NULL
            LIMIT 1
        """), {"asesor_id": asesor_id}).fetchone()
        
        if sample_profile:
            profile = sample_profile[0]
            print("Keys del profile:")
            if isinstance(profile, dict):
                for key in profile.keys():
                    print(f"  - {key}")
                    if isinstance(profile[key], dict):
                        for subkey in profile[key].keys():
                            print(f"    - {subkey}")
        
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    test_client_scoring()
