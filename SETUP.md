# 🚀 Football AI Analyzer - Setup Guide

Este documento detalla la implementación de todas las características críticas para producción.

## 📋 Tabla de Contenidos

1. [Autenticación & Autorización](#autenticación--autorización)
2. [Base de Datos Persistente](#base-de-datos-persistente)
3. [Logging & Monitoreo](#logging--monitoreo)
4. [Validación de Datos](#validación-de-datos)
5. [Documentación API](#documentación-api)

---

## 🔐 Autenticación & Autorización

### ✅ Implementado

- **NextAuth.js v5** con soporte para:
  - Email/Password (credenciales locales)
  - OAuth (GitHub, Google)
  - Session management
  - JWT tokens

- **Ubicación**: `src/auth.ts`

### Configuración

1. Copiar `.env.local.example` a `.env.local`:

```bash
cp .env.local.example .env.local
```

2. Configurar variables de autenticación:

```env
NEXTAUTH_SECRET="tu-clave-secreta-minimo-32-caracteres"
NEXTAUTH_URL="http://localhost:3000"

# OAuth (opcional)
GITHUB_ID="tu-github-app-id"
GITHUB_SECRET="tu-github-app-secret"
GOOGLE_ID="tu-google-client-id"
GOOGLE_SECRET="tu-google-client-secret"
```

### Endpoints

- `POST /api/auth/register` - Registrar nuevo usuario
- `GET /api/auth/profile` - Obtener perfil del usuario autenticado
- `POST /api/auth/signin` - Login con credenciales
- `GET /api/auth/signout` - Logout

---

## 💾 Base de Datos Persistente

### ✅ Implementado

- **Prisma ORM** con PostgreSQL
- **Modelos incluyen**:
  - `User` con roles (ADMIN, USER, ANALYST)
  - `Account`, `Session` (NextAuth)
  - `WatchlistItem` - Partidos guardados
  - `Analysis` - Historial de análisis
  - `Prediction` - Predicciones y tracking
  - `Alert` - Alertas personalizadas
  - `AuditLog` - Logs de auditoría
  - `RateLimit` - Control de rate limiting
  - `SystemMetric` - Métricas del sistema

### Configuración

1. Instalar PostgreSQL localmente o usar servicio en la nube:

```bash
# Opción 1: Render (recomendado)
# https://render.com/docs/postgresql

# Opción 2: Railway
# https://railway.app/new/postgres

# Opción 3: Docker (local)
docker run --name postgres-football \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_USER=user \
  -e POSTGRES_DB=football_ai \
  -p 5432:5432 \
  -d postgres:16
```

2. Configurar `DATABASE_URL` en `.env.local`:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/football_ai"
```

3. Ejecutar migraciones:

```bash
# Generar cliente Prisma
npx prisma generate

# Crear tablas
npx prisma migrate dev --name init

# (Opcional) Abrir Prisma Studio para inspeccionar datos
npx prisma studio
```

### Verificar conexión

```bash
npx prisma db push
```

---

## 📊 Logging & Monitoreo

### ✅ Implementado

- **Sentry** para error tracking
- **Breadcrumbs** para rastrear acciones
- **Custom logging** en servicios

### Configuración

1. Crear cuenta en [sentry.io](https://sentry.io)

2. Copiar DSN en `.env.local`:

```env
NEXT_PUBLIC_SENTRY_DSN="https://xxxxx@xxxxx.ingest.sentry.io/xxxxx"
SENTRY_AUTH_TOKEN="tu-auth-token"
SENTRY_ORG="tu-org"
SENTRY_PROJECT="tu-proyecto"
```

3. Las migraciones automáticas son capturadas en `src/lib/sentry.ts`

### Uso en código

```typescript
import { captureException, addBreadcrumb } from "@/lib/sentry";

try {
  // Tu código
} catch (error) {
  captureException(error, { context: "info" });
  addBreadcrumb("Action failed", "feature", "error");
}
```

---

## ✅ Validación de Datos

### ✅ Implementado

- **Zod schemas** para validación
- **Ubicación**: `src/lib/schemas/`

### Schemas disponibles

- `auth.ts` - Register, Login, Profile
- `fixtures.ts` - Fixture, Team Stats, Market Odds
- `analysis.ts` - Analysis requests/responses
- `predictions.ts` - Prediction creation/updates
- `watchlist.ts` - Watchlist items

### Uso

```typescript
import { LoginSchema } from "@/lib/schemas/auth";

const validation = LoginSchema.safeParse(body);
if (!validation.success) {
  return errorResponse(Errors.VALIDATION_ERROR(validation.error.flatten()), 400);
}

const { email, password } = validation.data;
```

---

## 🔒 Rate Limiting

### ✅ Implementado

- Almacenado en base de datos
- Límites configurables por endpoint
- Headers de response: `X-RateLimit-Remaining`, `X-RateLimit-Reset`

### Configuración

```typescript
const rateLimit = await checkRateLimit(
  userId,
  endpoint,
  limit = 100,  // requests
  windowMinutes = 15
);

if (!rateLimit.allowed) {
  return errorResponse("Too many requests", 429);
}
```

---

## 💾 Caching con Redis (Opcional)

### Setup

1. Instalar Redis:

```bash
# Opción 1: Redis Cloud
# https://redis.com/try-free/

# Opción 2: Docker
docker run -d -p 6379:6379 redis:7
```

2. Configurar en `.env.local`:

```env
REDIS_URL="redis://localhost:6379"
```

3. Usar cache en endpoints:

```typescript
import { cache, cacheKeys } from "@/lib/cache";

// Get from cache
const cached = await cache.get(cacheKeys.countries());

// Set cache
await cache.set(cacheKeys.countries(), data, 3600); // 1 hour

// Delete cache
await cache.delete(cacheKeys.countries());
```

---

## 🔒 Middlewares & Protección

### ✅ Implementado

- `src/middleware.ts` - Rutas públicas vs protegidas
- `src/lib/middleware.ts` - Funciones auxiliares

### Rutas públicas

```
/auth/signin
/auth/register
/api/countries
/api/leagues
/api/fixtures
/api/match/*
/api/openapi
/api/health
```

### Rutas protegidas

```
/api/analyze/*
/api/deep-analyze/*
/api/user/*
/api/predictions/*
/api/alerts/*
/dashboard/*
```

---

## 📝 Error Handling

### ✅ Implementado

Respuestas estándar con estructura:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input",
    "details": {}
  }
}
```

### Uso

```typescript
import { successResponse, errorResponse, Errors } from "@/lib/api-utils";

return successResponse(data, 200);
return errorResponse(Errors.UNAUTHORIZED);
return errorResponse(Errors.BAD_REQUEST("mensaje custom"), 400);
```

---

## 🚀 Deployment

### Checklist pre-producción

- [ ] Base de datos configurada
- [ ] Sentry setup completado
- [ ] Variables de env configuradas
- [ ] `DATA_PROVIDER=sportmonks` y `SPORTMONKS_API_TOKEN` configurados
- [ ] `ALLOW_DEMO_FALLBACK=false` en producción
- [ ] `CRON_SECRET`, `NEXTAUTH_SECRET`, `DATABASE_URL` y `REDIS_URL` definidos con valores reales
- [ ] Migraciones aplicadas: `npx prisma migrate deploy`
- [ ] Tests pasados: `npm run test`
- [ ] Typecheck pasado: `npm run typecheck`
- [ ] Lint pasado: `npm run lint`
- [ ] Build sin errores: `npm run build`
- [ ] `/api/health` reporta Postgres healthy y dataProvider healthy
- [ ] `/api/analyze/*` y `/api/deep-analyze/*` devuelven `401` sin sesión
- [ ] `/api/cron/resolve-predictions` devuelve `401` sin `Authorization: Bearer <CRON_SECRET>`

### Deploy a Vercel (recomendado)

```bash
# Instalar CLI
npm i -g vercel

# Deploy
vercel

# O conectar GitHub
# https://vercel.com/new
```

### Variables de env en Vercel

1. Dashboard > Settings > Environment Variables
2. Agregar todas las variables de `.env.local`
3. Migrar BD: `npx prisma migrate deploy`

---

## 🧪 Testing

### Tests incluidos

```bash
# Unit tests
npm run test

# TypeScript
npm run typecheck

# ESLint
npm run lint

# Watch mode
npm run test:watch
```

---

## 📚 Próximos Pasos

1. **Fase 2 - UX & Performance**
   - [ ] Internacionalización (i18n)
   - [ ] Dark mode
   - [ ] PWA (offline)
   - [ ] Code splitting

2. **Fase 3 - Escalabilidad**
   - [ ] WebSockets para datos en vivo
   - [ ] Notificaciones push/email
   - [ ] Analytics
   - [ ] CI/CD automatizado

---

## 🆘 Troubleshooting

### "Cannot find module '@/lib/db'"

```bash
# Regenerar tipos de Prisma
npx prisma generate
```

### "Sentry not capturing errors"

```bash
# Verificar DSN
echo $NEXT_PUBLIC_SENTRY_DSN

# Verificar NODE_ENV
echo $NODE_ENV  # Debe ser "production" para Sentry
```

### "Rate limit errors in development"

```bash
# Redis no conectando, usar fallback:
# Rate limiting automáticamente usa memoria si Redis no está disponible
```

---

## 📞 Contacto & Soporte

Para issues o preguntas, revisar:
- Documentación de [NextAuth.js](https://next-auth.js.org)
- Documentación de [Prisma](https://www.prisma.io/docs)
- Documentación de [Zod](https://zod.dev)
- Documentación de [Sentry](https://docs.sentry.io)
