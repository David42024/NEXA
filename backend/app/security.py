from datetime import datetime, timedelta
from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app import models

pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)


def create_token(data: dict, expires_hours: int) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(hours=expires_hours)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def create_access_token(data: dict) -> str:
    return create_token(data, settings.JWT_EXPIRATION_HOURS)


def create_refresh_token(data: dict) -> str:
    # El refresh token expira mucho mas tarde que el access token
    return create_token(data, settings.JWT_REFRESH_EXPIRATION_HOURS)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token invalido o expirado",
            headers={"WWW-Authenticate": "Bearer"},
        )


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> models.User:
    payload = decode_token(token)
    user_id = payload.get("sub")
    user = db.query(models.User).filter(models.User.id == int(user_id)).first()
    if not user:
        raise HTTPException(status_code=401, detail="Usuario no encontrado")
    return user


def get_user_permissions(db: Session, role: str) -> list:
    perm = db.query(models.Permission).filter(models.Permission.role == role).first()
    if not perm:
        return []
    data = perm.permissions
    perms = data.get("permissions", [])
    if "all_permissions" in perms:
        return ["all_permissions"]
    return perms


def require_permission(permission: str):
    def checker(
        current_user: models.User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ):
        perms = get_user_permissions(db, current_user.role)
        if "all_permissions" in perms or permission in perms:
            return current_user
        raise HTTPException(status_code=403, detail=f"Permiso requerido: {permission}")
    return checker


def require_any_permission(*permissions: str):
    """Exige que el usuario tenga al menos uno de los permisos indicados."""
    def checker(
        current_user: models.User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ):
        perms = get_user_permissions(db, current_user.role)
        if "all_permissions" in perms or any(p in perms for p in permissions):
            return current_user
        raise HTTPException(
            status_code=403,
            detail=f"Permiso requerido: {', '.join(permissions)}",
        )
    return checker
