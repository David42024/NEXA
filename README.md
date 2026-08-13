# NEXA · Next Experience & Offer AI

Sistema inteligente para asesores comerciales de Movistar que recomienda la
oferta correcta para cada cliente (motor NBO), explica el motivo (SHAP),
genera un speech adaptativo con IA generativa, y permite seguimiento
end-to-end del ofrecimiento hasta la venta.

Este repositorio contiene el **sistema base (MVP)** completo y funcional:
backend, frontend, base de datos y datos sintéticos de demo.

## Stack

- **Frontend:** React 18 + Vite + Tailwind CSS + React Router + Recharts
- **Backend:** FastAPI (Python) + SQLAlchemy + JWT
- **Base de datos:** PostgreSQL en producción (SQLite por defecto en local, sin configuración extra)
- **IA generativa (speech):** Grok API (primary) → Gemini/HuggingFace (fallback) → plantilla local (contingencia final)
- **Infraestructura sugerida:** Vercel (frontend) + cualquier host compatible con FastAPI/Postgres para el backend (Render, Railway, Fly.io, etc.)

## Estructura

```
nexa/
├── backend/          # API FastAPI (auth, clientes, recomendaciones, speech, funnel, admin)
│   └── app/
│       ├── api/          # Routers por dominio
│       ├── services/     # Motor NBO + motor de speech
│       ├── models.py     # Modelos SQLAlchemy (reflejan database/schema.sql)
│       ├── seed_data.py  # Generador de datos sintéticos (60 clientes, usuarios demo, funnel)
│       └── main.py       # Entry point
│   └── alembic/          # Migraciones de esquema (versionado con Alembic)
├── frontend/         # React + Tailwind
│   └── src/
│       ├── pages/        # Login, Dashboard, ClientSearch, ClientProfile, Funnel, Admin
│       ├── components/   # Layout, ShapExplainability, ProbabilityRing, etc.
│       └── context/      # AuthContext (JWT + permisos)
├── database/
│   └── schema.sql    # Esquema PostgreSQL de referencia (documentación / setup manual)
└── docker/           # docker-compose + Dockerfiles para levantar todo con un comando
```

## Puesta en marcha rápida (local, sin Docker)

### 1. Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate   # En Windows: venv\Scripts\activate
pip install -r requirements.txt --break-system-packages   # o sin la flag fuera de este entorno

cp .env.example .env       # usa SQLite por defecto, no requiere Postgres para probar

alembic upgrade head       # aplica las migraciones (crea/actualiza el esquema)

python -c "from app.seed_data import seed; seed()"   # crea los datos sintéticos

uvicorn app.main:app --reload --port 8000
```

La API queda disponible en `http://localhost:8000`. Documentación interactiva
(Swagger) en `http://localhost:8000/docs`.

### 2. Frontend

```bash
cd frontend
npm install
cp .env.example .env        # apunta a http://localhost:8000 por defecto
npm run dev
```

La app queda disponible en `http://localhost:5173`.

### Credenciales de demo (creadas por el seed)

| Rol        | Email                   | Contraseña      |
|------------|--------------------------|-----------------|
| Asesor     | asesor@nexa.demo         | asesor123       |
| Supervisor | supervisor@nexa.demo     | supervisor123   |
| Admin      | admin@nexa.demo          | admin123        |

## Puesta en marcha con Docker

```bash
cd docker
docker compose up --build
```

Esto levanta PostgreSQL, el backend (aplicando las migraciones con Alembic y
el seed automático al iniciar) y el frontend servido por nginx. Frontend en
`http://localhost:5173`, API en `http://localhost:8000`.

## Uso de PostgreSQL en local (sin Docker)

Si prefieres usar Postgres en vez de SQLite localmente:

```bash
createdb nexa
cd backend && alembic upgrade head
```

Y en `backend/.env`:

```
DATABASE_URL=postgresql://usuario:password@localhost:5432/nexa
```

## Flujo funcional del asesor (implementado)

1. Login (JWT, roles: asesor / supervisor / admin)
2. Dashboard con KPIs y clientes priorizados
3. Búsqueda de cliente por ID, nombre o DNI (con validación de "no encontrado")
4. Perfil detallado del cliente (servicio, consumo, hogar, facturación, comportamiento, elegibilidad, historial)
5. Generación de recomendación NBO → probabilidad + score comercial + top 3 razones (SHAP)
6. Alerta automática si todas las ofertas tienen probabilidad < 50%
7. Generación de 2 variantes de speech (consultiva / directa), con botón de copiar y regenerar
8. Registro de aceptación o rechazo (con motivo)
9. Botón "Reportar problema" → feedback guardado para mejora continua del modelo
10. Funnel de 5 etapas con vistas diaria / semanal / mensual (supervisor)
11. Panel de administración de roles y permisos, editable en tiempo real sin reiniciar el sistema

## Sobre el motor NBO y el motor de speech

- **Motor NBO** (`backend/app/services/nbo_engine.py`): simula el contrato de
  un endpoint externo del equipo estadístico (probabilidad + shap_values por
  oferta). Está aislado detrás de `call_external_model()`: cuando el equipo
  de datos entregue el endpoint real, basta con reemplazar esa función
  manteniendo el mismo contrato de entrada/salida — el resto del sistema
  (scoring comercial, alertas, explicabilidad) no cambia.
- **Motor de speech** (`backend/app/services/speech_engine.py`): implementa
  la cadena de contingencia completa (10.1): Grok → fallback (Gemini) →
  plantilla local determinista. Sin las API keys configuradas, el sistema
  funciona igual usando la plantilla local (útil para demo sin costos).

## Seguridad y privacidad (demo)

- Datos 100% sintéticos (Faker), sin información real de clientes
- Anonimización aplicada: nombre + primer apellido, documento/teléfono solo
  últimos 4 dígitos, dirección reducida a distrito
- JWT con expiración configurable (8h por defecto)
- Rate limiting (50 req/min por IP) vía middleware
- Permisos validados en cada endpoint según el rol

## Próximos pasos sugeridos (fuera del MVP)

- Conectar el endpoint real del modelo NBO del equipo estadístico
- Configurar `GROK_API_KEY` / `FALLBACK_API_KEY` para speech con IA real
- Migrar a PostgreSQL gestionado (Neon, Supabase, RDS) para producción
- Añadir tests automatizados (pytest + testing-library)
- Encriptación AES-256 de campos sensibles en producción
