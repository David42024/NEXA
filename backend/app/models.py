from sqlalchemy import (
    Column, Integer, String, Text, Boolean, DECIMAL, TIMESTAMP, ForeignKey, Date, JSON
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(100), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(50), nullable=False)  # asesor | supervisor | admin
    name = Column(String(100))
    created_at = Column(TIMESTAMP, server_default=func.now())


class Permission(Base):
    __tablename__ = "permissions"
    role = Column(String(50), primary_key=True)
    permissions = Column(JSON, nullable=False)


class Client(Base):
    __tablename__ = "clients"
    id = Column(String(10), primary_key=True)  # C00125
    name = Column(String(100))
    document_last4 = Column(String(4))
    phone_last4 = Column(String(4))
    district = Column(String(50))
    profile = Column(JSON, nullable=False)  # todo el detalle: consumo, hogar, facturacion, etc.
    # Cartera comercial: asesor asignado a este cliente (via csv_loader -> asesores.csv).
    asesor_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())

    recommendations = relationship("Recommendation", back_populates="client")
    interactions = relationship("Interaction", back_populates="client")


class Offer(Base):
    __tablename__ = "offers"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    code = Column(String(20), unique=True, nullable=False)
    description = Column(Text)
    priority = Column(Integer, default=0)
    active = Column(Boolean, default=True)


class Recommendation(Base):
    __tablename__ = "recommendations"
    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(String(10), ForeignKey("clients.id"))
    offer_id = Column(Integer, ForeignKey("offers.id"))
    probability = Column(DECIMAL(5, 4))
    shap_values = Column(JSON)
    score = Column(DECIMAL(5, 4))
    created_at = Column(TIMESTAMP, server_default=func.now())

    client = relationship("Client", back_populates="recommendations")
    offer = relationship("Offer")


class Interaction(Base):
    __tablename__ = "interactions"
    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(String(10), ForeignKey("clients.id"))
    recommendation_id = Column(Integer, ForeignKey("recommendations.id"))
    asesor_id = Column(Integer, ForeignKey("users.id"))
    channel = Column(String(20))
    result = Column(String(20))  # accepted | rejected
    rejection_reason = Column(String(50))
    speech_generated = Column(Text)
    speech_used = Column(Text)
    feedback = Column(Text)
    created_at = Column(TIMESTAMP, server_default=func.now())

    client = relationship("Client", back_populates="interactions")


class ModelFeedback(Base):
    __tablename__ = "model_feedback"
    id = Column(Integer, primary_key=True, index=True)
    interaction_id = Column(Integer, ForeignKey("interactions.id"))
    feedback_type = Column(String(50))
    comments = Column(Text)
    created_at = Column(TIMESTAMP, server_default=func.now())


class FunnelDaily(Base):
    __tablename__ = "funnel_daily"
    date = Column(Date, primary_key=True)
    analyzed = Column(Integer, default=0)
    prioritized = Column(Integer, default=0)
    contacted = Column(Integer, default=0)
    offered = Column(Integer, default=0)
    accepted = Column(Integer, default=0)
    conversion_rate = Column(DECIMAL(5, 2))


class DataRequest(Base):
    """Solicitudes de datos faltantes del cliente (spec 10.3)."""
    __tablename__ = "data_requests"
    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(String(10), ForeignKey("clients.id"))
    asesor_id = Column(Integer, ForeignKey("users.id"))
    campos_solicitados = Column(String(255), nullable=False)
    notas = Column(Text)
    created_at = Column(TIMESTAMP, server_default=func.now())


class SystemLog(Base):
    """Bitacora de eventos relevantes (logins, cambios de permisos, fallos de IA)."""
    __tablename__ = "system_logs"
    id = Column(Integer, primary_key=True, index=True)
    event_type = Column(String(50), nullable=False, index=True)  # login | permission_change | ai_generative_failure | ...
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    detail = Column(Text)
    created_at = Column(TIMESTAMP, server_default=func.now())


class Incident(Base):
    """Incidencia operativa: problema reportado por un usuario y gestionado por admin.

    Categorias: sistema | llamada | datos | cliente | otro
    Severidad : baja | media | alta | critica
    Estado    : abierta | resuelta
    """
    __tablename__ = "incidents"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(150), nullable=False)
    description = Column(Text)
    category = Column(String(30), nullable=False, default="otro", index=True)
    severity = Column(String(20), nullable=False, default="media", index=True)
    status = Column(String(20), nullable=False, default="abierta", index=True)
    client_id = Column(String(10), ForeignKey("clients.id"), nullable=True)
    reported_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(TIMESTAMP, server_default=func.now())
    resolved_at = Column(TIMESTAMP, nullable=True)
    resolved_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    resolution_note = Column(Text)


class ChatMessage(Base):
    """Mensaje del canal de contacto por chat con el cliente (link publico).

    sender: cliente | asesor | bot (bot = Nexabot responde automaticamente).
    chat_id actua como token de capacidad: quien lo tiene puede leer/escribir,
    igual que /llamada/:callId para la llamada WebRTC.
    """
    __tablename__ = "chat_messages"
    id = Column(Integer, primary_key=True, index=True)
    chat_id = Column(String(32), nullable=False, index=True)
    client_id = Column(String(10), ForeignKey("clients.id"), nullable=False)
    asesor_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    sender = Column(String(20), nullable=False)
    body = Column(Text, nullable=False)
    created_at = Column(TIMESTAMP, server_default=func.now())


class AppConfig(Base):
    """Configuracion en caliente persistida (ej. umbrales del motor NBO)."""
    __tablename__ = "app_config"
    key = Column(String(50), primary_key=True)
    value = Column(String(255))
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())


class ClientDailyActivity(Base):
    """Registro de actividad diaria por cliente para el tracking real del funnel.

    Evita contar dos veces la misma etapa (contacted/prioritized) para un mismo
    cliente en el mismo dia.
    """
    __tablename__ = "client_daily_activity"
    date = Column(Date, primary_key=True)
    client_id = Column(String(10), ForeignKey("clients.id"), primary_key=True)
    contacted = Column(Boolean, default=False)
    prioritized = Column(Boolean, default=False)


class LoginAttempt(Base):
    """Intentos de login (para bloqueo temporal de cuenta tras fallos repetidos)."""
    __tablename__ = "login_attempts"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(100), index=True)
    ip = Column(String(45), nullable=True)
    success = Column(Boolean, default=False)
    attempted_at = Column(TIMESTAMP, server_default=func.now())


class Offering(Base):
    """Seguimiento E2E del ofrecimiento: el viaje completo de una oferta por etapas.

    Etapas (stage): classified -> planned -> contacted -> objection -> evidence -> result
      - classified  : cliente clasificado y oferta recomendada
      - planned     : canal de contacto y mensaje definidos (medio de contacto + speech)
      - contacted   : contactabilidad real (respondio, leyo, no respondio)
      - objection   : manejo de objeciones / speech de rebate
      - evidence    : medios probatorios (audio de llamada, registro en plataforma)
      - result      : resultado de venta final (accepted | rejected)
    """
    __tablename__ = "offerings"
    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(String(10), ForeignKey("clients.id"), nullable=False, index=True)
    offer_id = Column(Integer, ForeignKey("offers.id"), nullable=True)
    asesor_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    channel = Column(String(20))  # WhatsApp | Llamada | App
    message_text = Column(Text)  # que decir exactamente (speech)
    stage = Column(String(20), nullable=False, default="classified")
    contact_status = Column(String(20))  # answered | read | unanswered
    objection_status = Column(String(20))  # none (no fue necesario) | rebate (usé speech)
    speech_rebate = Column(Text)  # argumento de rebate usado ante la objecion
    evidence_type = Column(String(60))  # call_audio | platform_register | ambos (separados por coma)
    evidence_ref = Column(String(100))  # id/grabacion/registro
    result = Column(String(20))  # accepted | rejected
    rejection_reason = Column(String(50))
    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())

    client = relationship("Client")
    offer = relationship("Offer")
