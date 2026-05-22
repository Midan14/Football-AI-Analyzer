# ⚽ Football AI Analyzer

App web independiente para análisis avanzado de fútbol por país, liga y partido, con predicciones basadas en IA, tracking de historiales y validación de datos.

## 🚀 Quick Start

### 1. Instalación

```bash
npm install
```

### 2. Configuración

Copiar `.env.local.example` a `.env.local`:

```bash
cp .env.local.example .env.local
```

Ver [SETUP.md](./SETUP.md) para configuración detallada de:
- Autenticación (NextAuth.js)
- Base de datos (PostgreSQL + Prisma)
- Logging (Sentry)
- Caché (Redis)

### 3. Ejecutar

```bash
npm run dev
```

Abrir `http://localhost:3001` (puerto definido en `npm run dev`).

---

## ✨ Características

### 🔐 Autenticación & Seguridad
- ✅ Autenticación con email/password
- ✅ OAuth (GitHub, Google)
- ✅ Session management
- ✅ Control de roles (ADMIN, USER, ANALYST)
- ✅ Audit logs

### 💾 Persistencia
- ✅ Base de datos PostgreSQL + Prisma ORM
- ✅ Historial de análisis
- ✅ Watchlist personalizada
- ✅ Tracking de predicciones
- ✅ Preferencias de usuario

### ✅ Validación & Confiabilidad
- ✅ Schemas Zod para validación
- ✅ Rate limiting por usuario/endpoint
- ✅ Error handling centralizado
- ✅ Logging con Sentry
- ✅ Endpoints pesados protegidos por sesión y límites de uso

### 🚀 Performance
- ✅ Caché con Redis
- ✅ Response estructura estandarizada
- ✅ Endpoints optimizados

---

## 📡 API Endpoints

### Públicos (sin autenticación)

```
GET /api/countries                          # Lista de países
GET /api/leagues?countryId=...              # Ligas de un país
GET /api/fixtures?leagueId=...&date=...     # Partidos de una liga
GET /api/match/:fixtureId                   # Detalles de un partido
```

### Autenticación

```
POST /api/auth/register                     # Registrarse
POST /api/auth/signin                       # Login
GET  /api/auth/profile                      # Perfil del usuario
```

### Protegidos (requieren autenticación)

```
GET  /api/analyze/:fixtureId                # Análisis de partido
     ?modelMode=Conservador|Balanceado|Agresivo
     &scenario=base|lineups|rotation|weather
     &refresh=1                              # Forzar recálculo (omitir caché)
GET  /api/deep-analyze/:fixtureId           # Análisis profundo de partido
DELETE /api/analyze/:fixtureId              # Limpiar caché y recalcular análisis
POST /api/predictions                       # Crear predicción
GET  /api/predictions                       # Listar predicciones
PATCH /api/predictions/:id                  # Actualizar resultado
GET  /api/performance?groupBy=market|league # Métricas de rendimiento
GET  /api/user/watchlist                    # Obtener watchlist
POST /api/user/watchlist                    # Agregar a watchlist
DELETE /api/user/watchlist/:fixtureId       # Remover de watchlist
```

### Sistema

```
GET /api/cron/resolve-predictions           # Cron con Authorization: Bearer CRON_SECRET
GET /api/cron/ml-retrain                    # Cron con x-cron-secret o ?secret=CRON_SECRET
POST /api/ml/train                          # Entrenamiento ML, solo ADMIN
GET /api/health                             # Healthcheck de Postgres, Redis y proveedor de datos
GET /api/openapi                            # Especificación OpenAPI
```

---

## 🏗️ Arquitectura

```
src/
├── app/                          # Next.js app (páginas y API routes)
│   ├── api/                     # API routes
│   │   ├── auth/               # Autenticación
│   │   ├── analyze/            # Análisis de partidos
│   │   ├── predictions/        # Predicciones
│   │   └── user/               # Usuario (watchlist, etc)
│   ├── layout.tsx              # Root layout
│   └── page.tsx                # Home page
├── backend/                      # Lógica de negocio
│   ├── lib/
│   │   ├── analysis/           # Motor de análisis
│   │   └── providers/          # Proveedores de datos
│   └── server/                 # Servicios
├── frontend/                     # Componentes React
│   ├── components/
│   ├── features/               # Características (dashboard, etc)
│   └── hooks/                  # Custom hooks
├── lib/                         # Utilidades compartidas
│   ├── schemas/                # Validación Zod
│   ├── api-utils.ts            # Helpers de API
│   ├── db.ts                   # Cliente Prisma
│   ├── sentry.ts               # Logging
│   ├── cache.ts                # Caché Redis
│   └── rate-limit.ts           # Rate limiting
├── shared/                      # Tipos compartidos
└── proxy.ts                     # Protección de rutas (auth JWT en edge)
```

---

## 📋 Configuración Detallada

Para instrucciones completas de setup, ver [SETUP.md](./SETUP.md):

- Configuración de PostgreSQL
- Setup de Sentry
- Redis para caché
- Variables de ambiente
- Testing
- Deployment

---

## 🧪 Testing

```bash
# Ejecutar tests
npm run test

# Typecheck
npm run typecheck

# Lint
npm run lint

# Watch mode
npm run test:watch

# E2E (Playwright): login → partido → análisis → ajustes modo/escenario
# Requiere Postgres con usuario semilla: npm run db:seed
npm run test:e2e:install
npm run test:e2e
```

Variables opcionales E2E: `E2E_USER_EMAIL`, `E2E_USER_PASSWORD`, `E2E_FIXTURE_ID`, `E2E_BASE_URL`, `E2E_SKIP_WEB_SERVER`.

En CI (GitHub Actions), el job `e2e` levanta Postgres, aplica schema, ejecuta seed y corre Playwright con `DATA_PROVIDER=demo`.

---

## 📦 Build & Deployment

```bash
# Build
npm run build

# Start (producción)
npm start

# Lint
npm run lint
```

Ver [SETUP.md](./SETUP.md#-deployment) para deployment.

### Producción real

Para producción usa un proveedor real:

- `DATA_PROVIDER=sportmonks` + `SPORTMONKS_API_TOKEN`
- `DATA_PROVIDER=api-football` + `API_FOOTBALL_KEY`

El fallback automático a datos demo queda deshabilitado en producción para no
ocultar fallos del proveedor real. Mantén `DATA_PROVIDER=demo` solo en local,
tests o demos controladas.

El tablero de fixtures **precarga cuotas 1X2** desde API-Football por defecto
(paginación amplia + fallback por partido). Para desactivarlo:
`API_FOOTBALL_PREFETCH_FIXTURE_ODDS=false`. El Match Center sigue consultando
cuotas exactas bajo demanda si faltan en el listado.

---

## 🔒 Seguridad de Apuestas

La app **NO presenta apuestas como seguras**. El motor reporta:
- Menor varianza relativa
- Score de confianza
- Penalizaciones por datos incompletos
- Stake sugerido basado en confianza

**Uso responsable**: Las predicciones son análisis estadísticos, no garantías.

---

## 🛠️ Tech Stack

- **Framework**: Next.js 16 + React 19

## 🤖 Alcance de IA

La capa predictiva actual es estadística/ML: ensemble TypeScript, modelos de
probabilidad y entrenamiento Python (CatBoost, XGBoost, LightGBM). No hay una
integración LLM/OpenAI activa por defecto; una futura capa LLM puede añadirse
para explicaciones tácticas, scouting textual o reportes narrativos sin reemplazar
el motor predictivo.
- **Auth**: NextAuth.js v4 (Credentials + OAuth)
- **Base de datos**: PostgreSQL + Prisma ORM
- **Validación**: Zod
- **Styling**: Tailwind CSS
- **Componentes**: Lucide React
- **Gráficos**: Recharts
- **Logging**: Sentry
- **Caché**: Redis
- **Testing**: Vitest + Testing Library

---

## 📄 Licencia

MIT

---

## 🆘 Support

Para issues, preguntas o contribuciones, revisar la documentación:
- [SETUP.md](./SETUP.md) - Guía de configuración
- [NextAuth.js Docs](https://next-auth.js.org)
- [Prisma Docs](https://www.prisma.io/docs)
- [Sentry Docs](https://docs.sentry.io)
