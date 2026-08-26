"""
Script para examinar la estructura de la base de datos original.
"""
from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import sessionmaker

# Base de datos original
ORIGINAL_DB_URL = "postgresql+psycopg2://neondb_owner:npg_ryYW1sNgGwC7@ep-wispy-recipe-aylatbwz-pooler.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require"

try:
    print("Conectando a la base de datos original...")
    engine = create_engine(ORIGINAL_DB_URL, pool_pre_ping=True)
    inspector = inspect(engine)
    
    print("\n=== TABLAS EN LA BASE DE DATOS ORIGINAL ===")
    tables = inspector.get_table_names()
    for table in sorted(tables):
        print(f"- {table}")
    
    print("\n=== ESTRUCTURA DETALLADA DE CADA TABLA ===")
    for table in sorted(tables):
        print(f"\n--- TABLA: {table} ---")
        columns = inspector.get_columns(table)
        for col in columns:
            print(f"  {col['name']}: {col['type']} (nullable={col['nullable']}, primary_key={col.get('primary_key', False)})")
        
        # Foreign keys
        foreign_keys = inspector.get_foreign_keys(table)
        if foreign_keys:
            print("  Foreign Keys:")
            for fk in foreign_keys:
                print(f"    {fk['constrained_columns']} -> {fk['referred_table']}.{fk['referred_columns']}")
    
    print("\n=== CONEXIÓN EXITOSA ===")
    
except Exception as e:
    print(f"Error al conectar: {e}")
    print("\nIntentando con la nueva base de datos...")
    
    # Base de datos nueva
    NEW_DB_URL = "postgresql+psycopg2://neondb_owner:npg_Or8dDZT5LMVY@ep-patient-fire-ay1mxqp9-pooler.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require"
    
    try:
        engine = create_engine(NEW_DB_URL, pool_pre_ping=True)
        inspector = inspect(engine)
        
        print("\n=== TABLAS EN LA NUEVA BASE DE DATOS ===")
        tables = inspector.get_table_names()
        for table in sorted(tables):
            print(f"- {table}")
        
        if not tables:
            print("  (La base de datos está vacía - no hay tablas)")
        
    except Exception as e2:
        print(f"Error al conectar a la nueva base de datos: {e2}")
