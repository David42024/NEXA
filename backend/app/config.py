import os
from dotenv import load_dotenv

load_dotenv()


class Settings:
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./nexa.db")
    JWT_SECRET: str = os.getenv("JWT_SECRET", "change_this_secret_in_production")
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRATION_HOURS: int = int(os.getenv("JWT_EXPIRATION_HOURS", 8))
    JWT_REFRESH_EXPIRATION_HOURS: int = int(os.getenv("JWT_REFRESH_EXPIRATION_HOURS", 168))

    GROK_API_KEY: str = os.getenv("GROK_API_KEY", "")
    GROK_API_URL: str = os.getenv("GROK_API_URL", "https://api.x.ai/v1/chat/completions")
    # Proveedor primario de IA: Groq (OpenAI-compatible). GROQ_* es la fuente de
    # verdad; GROK_* se lee como compatibilidad hacia atras (la clave gsk_ es de Groq).
    GROQ_API_KEY: str = os.getenv("GROQ_API_KEY") or os.getenv("GROK_API_KEY", "")
    GROQ_API_URL: str = os.getenv(
        "GROQ_API_URL",
        os.getenv("GROK_API_URL", "https://api.groq.com/openai/v1/chat/completions"),
    )
    GROQ_MODEL: str = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
    FALLBACK_API_KEY: str = os.getenv("FALLBACK_API_KEY", "")
    FALLBACK_PROVIDER: str = os.getenv("FALLBACK_PROVIDER", "gemini")
    GEMINI_API_URL: str = os.getenv(
        "GEMINI_API_URL",
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent",
    )

    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "demo")
    RATE_LIMIT_PER_MINUTE: int = int(os.getenv("RATE_LIMIT_PER_MINUTE", 300))
    # Nota: el limite se aplica por (IP + ruta), no por IP global.

    # Llamada en vivo: tiempo entre respuestas del cliente simulado (SSE/WebSocket).
    # En tests se baja para que la suite no tarde.
    LIVE_STEP_DELAY_SECONDS: float = float(os.getenv("LIVE_STEP_DELAY_SECONDS", 2.5))

    # Llamada WebRTC: cooldown entre detecciones de objecion del copilot (seg).
    # Evita bombardear la IA si el cliente habla seguido; en tests se fija a 0.
    CALL_AI_COOLDOWN_SECONDS: float = float(os.getenv("CALL_AI_COOLDOWN_SECONDS", 3.5))

    # CORS: lista de origenes permitidos (comma-separated en CORS_ALLOWED_ORIGINS)
    CORS_ALLOWED_ORIGINS: list = [
        o.strip() for o in os.getenv("CORS_ALLOWED_ORIGINS", "*").split(",") if o.strip()
    ]

    # Bloqueo temporal de cuenta tras intentos fallidos de login
    LOGIN_MAX_FAILED_ATTEMPTS: int = int(os.getenv("LOGIN_MAX_FAILED_ATTEMPTS", 5))
    LOGIN_LOCKOUT_MINUTES: int = int(os.getenv("LOGIN_LOCKOUT_MINUTES", 10))

    # Reglas de negocio NEXA
    MAX_OFFERS_EVALUATED: int = 10
    LOW_PROBABILITY_THRESHOLD: float = 0.50
    NOISE_PROBABILITY_THRESHOLD: float = 0.20
    ANTIGUO_MESES_THRESHOLD: int = 6


settings = Settings()
