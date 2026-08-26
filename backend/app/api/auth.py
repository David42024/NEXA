from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app import models, schemas
from app.security import (
    verify_password,
    create_access_token,
    create_refresh_token,
    get_current_user,
    get_user_permissions,
)
from app.services.config_service import log_event

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=schemas.LoginResponse)
def login(payload: schemas.LoginRequest, request: Request, db: Session = Depends(get_db)):
    email = payload.email
    ip = request.client.host if request.client else None

    # Bloqueo temporal de cuenta: 5 intentos fallidos en 10 minutos
    since = datetime.utcnow() - timedelta(minutes=settings.LOGIN_LOCKOUT_MINUTES)
    recent_failures = (
        db.query(models.LoginAttempt)
        .filter(
            models.LoginAttempt.email == email,
            models.LoginAttempt.success.is_(False),
            models.LoginAttempt.attempted_at >= since,
        )
        .count()
    )
    if recent_failures >= settings.LOGIN_MAX_FAILED_ATTEMPTS:
        log_event(db, "login_locked", f"Cuenta bloqueada temporalmente por intentos fallidos: {email}")
        db.commit()
        raise HTTPException(
            status_code=429,
            detail="Demasiados intentos fallidos. La cuenta está bloqueada temporalmente, intente en unos minutos.",
        )

    user = db.query(models.User).filter(models.User.email == email).first()
    if not user or not verify_password(payload.password, user.password_hash):
        db.add(models.LoginAttempt(email=email, ip=ip, success=False))
        log_event(db, "login_failed", f"Intento de login fallido: {email}")
        db.commit()
        raise HTTPException(status_code=401, detail="Credenciales invalidas")

    # Exito: registrar intento y limpiar los fallos previos
    db.add(models.LoginAttempt(email=email, ip=ip, success=True))
    db.query(models.LoginAttempt).filter(models.LoginAttempt.email == email).delete(
        synchronize_session=False
    )
    db.flush()

    access_token = create_access_token({"sub": str(user.id), "role": user.role})
    refresh_token = create_refresh_token({"sub": str(user.id), "role": user.role})
    perms = get_user_permissions(db, user.role)
    log_event(db, "login", f"Login exitoso: {user.email}", user.id)
    db.commit()
    return schemas.LoginResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user={"id": user.id, "email": user.email, "name": user.name, "role": user.role, "permissions": perms},
    )


@router.post("/refresh", response_model=schemas.RefreshResponse)
def refresh(payload: schemas.RefreshRequest, db: Session = Depends(get_db)):
    """Emite un nuevo access token a partir de un refresh token (expira mas tarde)."""
    try:
        decoded = jwt.decode(
            payload.refresh_token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM]
        )
    except JWTError:
        raise HTTPException(status_code=401, detail="Token de refresco invalido o expirado")

    user_id = decoded.get("sub")
    user = db.query(models.User).filter(models.User.id == int(user_id)).first() if user_id else None
    if not user:
        raise HTTPException(status_code=401, detail="Usuario no encontrado")

    access_token = create_access_token({"sub": str(user.id), "role": user.role})
    return schemas.RefreshResponse(
        access_token=access_token,
        refresh_token=payload.refresh_token,
    )


@router.post("/logout")
def logout():
    # Stateless JWT: el logout real ocurre en el cliente eliminando el token.
    return {"detail": "Sesion cerrada"}


@router.get("/me", response_model=schemas.UserMe)
def me(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    perms = get_user_permissions(db, current_user.role)
    return schemas.UserMe(
        id=current_user.id, email=current_user.email, name=current_user.name,
        role=current_user.role, permissions=perms,
    )


@router.get("/demo-users")
def get_demo_users(db: Session = Depends(get_db)):
    """Obtiene usuarios de demostración desde la base de datos para el login."""
    users = db.query(models.User).filter(
        models.User.role.in_(["admin", "supervisor", "asesor"])
    ).all()
    
    demo_users = []
    for user in users:
        # Contraseñas según las creadas en create_test_users.py
        password = "admin123" if user.role == "admin" else \
                   "supervisor123" if user.role == "supervisor" else \
                   "asesor123"  # para asesores
        
        demo_users.append({
            "role": user.role.capitalize(),
            "email": user.email,
            "password": password
        })
    
    return {"users": demo_users}
