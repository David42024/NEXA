"""
Script para crear usuarios de prueba en la nueva base de datos.
"""
from sqlalchemy import create_engine, func
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy import Column, Integer, String, TIMESTAMP
from datetime import datetime
import hashlib

# Nueva base de datos
NEW_DB_URL = "postgresql+psycopg2://neondb_owner:npg_Or8dDZT5LMVY@ep-patient-fire-ay1mxqp9-pooler.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require"

Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(100), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(50), nullable=False)
    name = Column(String(100))
    created_at = Column(TIMESTAMP, server_default=func.now())

def hash_password(password: str) -> str:
    """Hash simple para contraseñas (en producción usar bcrypt/argon2)"""
    return hashlib.sha256(password.encode()).hexdigest()

def create_test_users():
    """Crea usuarios de prueba para el sistema."""
    print("=== CREANDO USUARIOS DE PRUEBA ===")
    
    engine = create_engine(NEW_DB_URL, pool_pre_ping=True)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = SessionLocal()
    
    try:
        # Verificar si ya existen usuarios
        existing_count = db.query(User).count()
        if existing_count > 0:
            print(f"[create_test_users] Ya existen {existing_count} usuarios. Se omitirá la creación.")
            return
        
        # Usuarios a crear
        users_to_create = [
            {
                "email": "admin@nexa.demo",
                "password": "admin123",
                "role": "admin",
                "name": "Administrador del Sistema"
            },
            {
                "email": "asesor001@nexa.demo",
                "password": "asesor123",
                "role": "asesor",
                "name": "Asesor 001"
            },
            {
                "email": "asesor002@nexa.demo",
                "password": "asesor123",
                "role": "asesor",
                "name": "Asesor 002"
            },
            {
                "email": "asesor003@nexa.demo",
                "password": "asesor123",
                "role": "asesor",
                "name": "Asesor 003"
            },
            {
                "email": "supervisor@nexa.demo",
                "password": "supervisor123",
                "role": "supervisor",
                "name": "Supervisor de Ventas"
            }
        ]
        
        for user_data in users_to_create:
            user = User(
                email=user_data["email"],
                password_hash=hash_password(user_data["password"]),
                role=user_data["role"],
                name=user_data["name"]
            )
            db.add(user)
            print(f"[create_test_users] Usuario creado: {user_data['email']} ({user_data['role']})")
        
        db.commit()
        print(f"\n[create_test_users] Total de usuarios creados: {len(users_to_create)}")
        
        # Mostrar usuarios creados
        print("\n=== USUARIOS CREADOS ===")
        users = db.query(User).all()
        for user in users:
            print(f"  ID {user.id}: {user.email} - {user.name} ({user.role})")
        
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    create_test_users()
