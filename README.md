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
- **Infraestructura:** Vercel (frontend) + Render (backend, WebSockets para la llamada en vivo) + Neon (PostgreSQL)

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

# OPCIONAL: acopla los CSV reales de backend/csvs (ofertas, ~100k clientes,
# ~300k ofrecimientos) a la BD. Es idempotente: si OFE_001/CLI_000001 ya existen,
# se omite. El agente (Nexabot y generador de speech) usa esos datos reales.
python -c "from app.services.csv_loader import seed_csv; seed_csv()"

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

## Despliegue en producción (Vercel + Render + Neon)

La llamada WebRTC y el copilot en vivo usan WebSockets, por lo que el backend
NO puede vivir en Vercel (funciones serverless sin WebSocket en Python). El
backend va en **Render** (soporta WebSockets), el frontend en **Vercel** y la
base de datos en **Neon** (PostgreSQL serverless).

### 1. Base de datos (Neon)

1. Crea un proyecto en [neon.tech](https://neon.tech) (plan gratis es suficiente).
2. En el dashboard copia la **connection string** (usuario + password + host
   `*.neon.tech`, base `neondb`). Ejemplo:
   ```
   postgresql://user:password@ep-xxxx-yyyy-zzzz.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```
3. Guarda esa URL; se usará como `DATABASE_URL`. El código la normaliza
   automáticamente a `postgresql+psycopg2://`. Si tu plan usa **pooling**,
   puedes usar el host `-pooler` (mismo formato), pero para un solo web
   service la conexión directa es suficiente.

### 2. Backend (Render)

1. Sube el repo a GitHub.
2. En Render crea un **Blueprint** desde `render.yaml` (raíz del repo), o un
   **Web Service** manual con `Root Directory = backend`:
   - Build: `pip install -r requirements.txt`
   - Start: `alembic upgrade head && python -c "from app.seed_data import seed; seed()" && uvicorn app.main:app --host 0.0.0.0 --port $PORT`
3. Variables de entorno:
   | Variable | Valor |
   |----------|-------|
   | `DATABASE_URL` | URL de Neon (paso 1) |
   | `JWT_SECRET` | clave fuerte (p.ej. `openssl rand -hex 32`) |
   | `CORS_ALLOWED_ORIGINS` | dominio del frontend en Vercel (sin `*`) |
   | `ENVIRONMENT` | `production` |
   | `GROK_API_KEY` / `FALLBACK_API_KEY` | (opcional) para speech con IA real |
4. El health check usa `/health`.
   > Nota: las instancias free de Render duermen tras 15 min de inactividad y el
   > despertar tarda ~50 s. Para llamadas siempre disponibles usa un plan con
   > auto-sleep desactivado.

### 3. Frontend (Vercel)

1. Importa la carpeta `frontend` (o el repo) en Vercel. `vercel.json` ya define
   el build de Vite y los rewrites SPA para que el enlace público de la llamada
   (`/llamada/:callId`) funcione como deep link.
2. Variable de entorno `VITE_API_URL` = URL del backend en Render (sin barra
   final), p.ej. `https://nexa-api.onrender.com`.
3. Despliega. El enlace de llamada que genera el asesor (`/llamada/:callId`)
   apunta al propio frontend, así que cualquier persona que lo abra desde su
   dispositivo puede **recepcionar la llamada** sin registrarse.
   > Nota: el audio viaja P2P (WebRTC con STUN público). Si ambos lados están
   > detrás de NAT estricto la conexión puede fallar; en producción conviene
   > agregar un **TURN** (p.ej. Twilio/Metered) en `ICE_SERVERS` de
   > `frontend/src/hooks/useCall.js`.

### 4. Voz de ambos lados (copilot)

El navegador de cada participante transcribe su propia voz (Web Speech API) y la
etiqueta por hablante: el copilot escucha al **cliente** (detecta objeciones y
sugiere cómo responder) y al **asesor** (revisa si aplicó bien el pitch y sugiere
mejorar). La transcripción en vivo de ambos aparece en el panel Nexabot.
> La Web Speech API funciona en Chrome/Edge (desktop y Android). En iOS/Safari
> la llamada funciona normal pero sin transcripción automática.

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
- Encriptación AES-256 de campos sensibles en producción
