-- ============================================================
-- NEXA (Next Experience & Offer AI) - Esquema de base de datos
-- PostgreSQL. Este esquema es la referencia de produccion.
-- El backend (SQLAlchemy) lo crea automaticamente via
-- Base.metadata.create_all(), pero este archivo sirve como
-- documentacion y para setups manuales / migraciones.
-- ============================================================

-- Usuarios y autenticacion
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL,
    name VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Permisos (JSON configurable, editable sin reiniciar el sistema)
CREATE TABLE IF NOT EXISTS permissions (
    role VARCHAR(50) PRIMARY KEY,
    permissions JSON NOT NULL
);

-- Clientes (datos anonimizados para demo)
CREATE TABLE IF NOT EXISTS clients (
    id VARCHAR(10) PRIMARY KEY,
    name VARCHAR(100),
    document_last4 VARCHAR(4),
    phone_last4 VARCHAR(4),
    district VARCHAR(50),
    profile JSON NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Ofertas disponibles (catalogo, editable via admin)
CREATE TABLE IF NOT EXISTS offers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    code VARCHAR(20) UNIQUE NOT NULL,
    description TEXT,
    priority INTEGER DEFAULT 0,
    active BOOLEAN DEFAULT true
);

-- Recomendaciones (historico del motor NBO)
CREATE TABLE IF NOT EXISTS recommendations (
    id SERIAL PRIMARY KEY,
    client_id VARCHAR(10) REFERENCES clients(id),
    offer_id INTEGER REFERENCES offers(id),
    probability DECIMAL(5,4),
    shap_values JSON,
    score DECIMAL(5,4),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Interacciones (seguimiento del ofrecimiento hasta la venta)
CREATE TABLE IF NOT EXISTS interactions (
    id SERIAL PRIMARY KEY,
    client_id VARCHAR(10) REFERENCES clients(id),
    recommendation_id INTEGER REFERENCES recommendations(id),
    asesor_id INTEGER REFERENCES users(id),
    channel VARCHAR(20),
    result VARCHAR(20), -- 'accepted', 'rejected'
    rejection_reason VARCHAR(50),
    speech_generated TEXT,
    speech_used TEXT,
    feedback TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Feedback del asesor sobre las recomendaciones del modelo
CREATE TABLE IF NOT EXISTS model_feedback (
    id SERIAL PRIMARY KEY,
    interaction_id INTEGER REFERENCES interactions(id),
    feedback_type VARCHAR(50),
    comments TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Funnel (resumen diario, 5 etapas)
CREATE TABLE IF NOT EXISTS funnel_daily (
    date DATE PRIMARY KEY,
    analyzed INTEGER DEFAULT 0,
    prioritized INTEGER DEFAULT 0,
    contacted INTEGER DEFAULT 0,
    offered INTEGER DEFAULT 0,
    accepted INTEGER DEFAULT 0,
    conversion_rate DECIMAL(5,2)
);

-- Indices utiles
CREATE INDEX IF NOT EXISTS idx_clients_district ON clients(district);
CREATE INDEX IF NOT EXISTS idx_recommendations_client ON recommendations(client_id);
CREATE INDEX IF NOT EXISTS idx_interactions_client ON interactions(client_id);
CREATE INDEX IF NOT EXISTS idx_interactions_result ON interactions(result);
CREATE INDEX IF NOT EXISTS idx_interactions_created_at ON interactions(created_at);

-- Datos de permisos iniciales (roles base del sistema)
INSERT INTO permissions (role, permissions) VALUES
('asesor', '{"permissions": ["view_dashboard","search_client","view_client_profile","view_recommendation","view_speech","register_acceptance","register_rejection","copy_speech"], "description": "Asesor comercial de call center"}'),
('supervisor', '{"permissions": ["view_dashboard","view_funnel","view_trends","view_all_clients","view_team_performance","export_reports"], "description": "Supervisor de equipo comercial"}'),
('admin', '{"permissions": ["all_permissions","manage_users","manage_roles","view_system_logs","configure_thresholds"], "description": "Administrador del sistema"}')
ON CONFLICT (role) DO NOTHING;
