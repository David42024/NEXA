"""
Script para verificar la estructura de la nueva base de datos.
"""
from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import sessionmaker

# Base de datos nueva
NEW_DB_URL = "postgresql+psycopg2://neondb_owner:npg_Or8dDZT5LMVY@ep-patient-fire-ay1mxqp9-pooler.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require"

try:
    print("Conectando a la nueva base de datos...")
    engine = create_engine(NEW_DB_URL, pool_pre_ping=True)
    inspector = inspect(engine)
    
    print("\n=== TABLAS EN LA NUEVA BASE DE DATOS ===")
    tables = inspector.get_table_names()
    for table in sorted(tables):
        print(f"- {table}")
    
    if not tables:
        print("  (La base de datos está vacía - no hay tablas)")
    else:
        print(f"\nTotal de tablas: {len(tables)}")
    
    print("\n=== CONEXIÓN EXITOSA ===")
    
except Exception as e:
    print(f"Error al conectar a la nueva base de datos: {e}")
