from pydantic import BaseModel, EmailStr
from typing import Optional, List, Dict, Any


# ---------- Auth ----------
class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class LoginResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: Dict[str, Any]


class RefreshRequest(BaseModel):
    refresh_token: str


class RefreshResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class UserMe(BaseModel):
    id: int
    email: str
    name: Optional[str]
    role: str
    permissions: List[str]


# ---------- Clientes ----------
class ClientSummary(BaseModel):
    id: str
    name: str
    district: Optional[str]
    segmento: Optional[str] = None
    elegible: bool = False
    score: int = 0
    top_offer: Optional[str] = None
    motivo: Optional[str] = None
    plan_actual: Optional[str] = None


class ClientListResponse(BaseModel):
    total: int
    page: int
    page_size: int
    results: List[ClientSummary]


class ClientSearchResult(BaseModel):
    results: List[ClientSummary]
    # Distinguir "match exacto por ID" de "sugerencias" (spec 10.5)
    exact_match: bool = False
    is_id_query: bool = False


class ClientProfileResponse(BaseModel):
    id: str
    name: str
    district: Optional[str]
    document_last4: Optional[str]
    phone_last4: Optional[str]
    profile: Dict[str, Any]
    data_completeness_warning: bool = False


# ---------- Recomendaciones ----------
class RecommendationRequest(BaseModel):
    client_id: str


class OfferRecommendation(BaseModel):
    oferta: str
    offer_id: int
    probabilidad: float
    score: float
    shap_values: Dict[str, float]
    low_probability: bool = False
    precio: Optional[float] = None
    ahorro_pct: Optional[float] = None


class RecommendationResponse(BaseModel):
    recommendation_ids: List[int]
    cliente_id: str
    recomendaciones: List[OfferRecommendation]
    warning: Optional[str] = None


# ---------- Speech ----------
class SpeechRequest(BaseModel):
    client_id: str
    offer: str
    probabilidad: float
    razones: List[str]
    beneficio: Optional[str] = None
    tono: Optional[str] = "Consultivo"
    canal: Optional[str] = "Digital"


class SpeechVariant(BaseModel):
    variante: str
    texto: str


class SpeechResponse(BaseModel):
    client_id: str
    variantes: List[SpeechVariant]
    source: str  # groq | gemini | local


# ---------- Nexabot (asistente comercial) ----------
class NexabotRequest(BaseModel):
    client_id: str
    message: str


class NexabotResponse(BaseModel):
    reply: str
    source: str  # groq | gemini | local


# ---------- Interacciones ----------
class InteractionRegister(BaseModel):
    client_id: str
    recommendation_id: Optional[int] = None
    offer_id: Optional[int] = None
    channel: Optional[str] = "Digital"
    result: str  # accepted | rejected
    rejection_reason: Optional[str] = None
    speech_used: Optional[str] = None
    speech_generated: Optional[str] = None


# ---------- Feedback ----------
class FeedbackSubmit(BaseModel):
    interaction_id: Optional[int] = None
    recommendation_id: Optional[int] = None
    feedback_type: str
    comments: Optional[str] = None


# ---------- Funnel ----------
class FunnelStage(BaseModel):
    label: str
    value: int


class FunnelResponse(BaseModel):
    stages: List[FunnelStage]
    conversion_rate: float


# ---------- Funnel E2E (seguimiento del ofrecimiento) ----------
class OfferingCreate(BaseModel):
    client_id: str
    offer_id: Optional[int] = None
    channel: Optional[str] = None
    message_text: Optional[str] = None


class OfferingUpdate(BaseModel):
    stage: Optional[str] = None
    channel: Optional[str] = None
    message_text: Optional[str] = None
    contact_status: Optional[str] = None
    objection_handled: Optional[bool] = None
    speech_rebate: Optional[str] = None
    evidence_type: Optional[str] = None
    evidence_ref: Optional[str] = None
    result: Optional[str] = None
    rejection_reason: Optional[str] = None


class OfferingOut(BaseModel):
    id: int
    client_id: str
    offer_id: Optional[int] = None
    offer_name: Optional[str] = None
    asesor_id: Optional[int] = None
    channel: Optional[str] = None
    message_text: Optional[str] = None
    stage: str
    contact_status: Optional[str] = None
    objection_handled: bool = False
    speech_rebate: Optional[str] = None
    evidence_type: Optional[str] = None
    evidence_ref: Optional[str] = None
    result: Optional[str] = None
    rejection_reason: Optional[str] = None
    created_at: Optional[str] = None


class E2EStage(BaseModel):
    key: str
    label: str
    value: int
    pct_of_previous: Optional[float] = None


class E2EBreakdown(BaseModel):
    label: str
    value: int


class FunnelE2EReport(BaseModel):
    stages: List[E2EStage]
    total: int
    channels: List[E2EBreakdown]
    contact_status: List[E2EBreakdown]
    objections: Dict[str, int]
    evidence_types: List[E2EBreakdown]
    results: List[E2EBreakdown]
    rejection_reasons: List[E2EBreakdown]


# ---------- Solicitud de datos faltantes (10.3) ----------
class DataRequestSubmit(BaseModel):
    campos_solicitados: str
    notas: Optional[str] = None


class DataRequestResponse(BaseModel):
    detail: str
    request_id: int


# ---------- Admin ----------
class PermissionsUpdate(BaseModel):
    permissions: List[str]


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    role: str
    name: Optional[str] = None


class UserOut(BaseModel):
    id: int
    email: str
    role: str
    name: Optional[str] = None
    created_at: Optional[str] = None


class ThresholdsUpdate(BaseModel):
    low_probability: Optional[float] = None
    noise_probability: Optional[float] = None


class SystemLogOut(BaseModel):
    id: int
    event_type: str
    user_id: Optional[int] = None
    detail: Optional[str] = None
    created_at: Optional[str] = None
