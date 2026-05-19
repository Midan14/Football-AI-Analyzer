# Football AI Analyzer - Resultados de Testing

## Fecha: 2026-05-18

### ✅ APIs Públicas (Funcionan sin auth)

| API | Estado | Detalle |
|-----|--------|---------|
| `/api/health` | ✅ OK | Postgres + Redis + API-Football conectados |
| `/api/countries` | ✅ OK | 160+ países disponibles |
| `/api/fixtures` | ✅ OK | Partidos por fecha funcionando |

### ✅ APIs Protegidas (Rechazan sin auth - correcto)

| API | Estado | Comportamiento |
|-----|--------|----------------|
| `/api/bankroll` | ✅ OK | Rechaza con UNAUTHORIZED |
| `/api/opportunities` | ✅ OK | Rechaza con UNAUTHORIZED |
| `/api/calibration` | ✅ OK | Rechaza con UNAUTHORIZED |
| `/api/odds/live` | ✅ OK | Rechaza con UNAUTHORIZED |
| `/api/arbitrage` | ✅ OK | Rechaza con UNAUTHORIZED |

### 🔧 Para probar con autenticación

**Opción 1: Crear usuario vía web**
1. `npm run dev`
2. Ir a http://localhost:3000/auth/register
3. Crear cuenta con email/password
4. Ir al dashboard: http://localhost:3000/dashboard

**Opción 2: API directa (después de crear usuario)**
```bash
# Login
curl -X POST http://localhost:3000/api/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"email":"tu-email@ejemplo.com","password":"tu-password"}'

# Obtener cookie de sesión y usarla:
curl -H "Cookie: next-auth.session-token=TOKEN_AQUI" \
  http://localhost:3000/api/bankroll
```

### 📊 Próximos Tests (requieren auth)

- [ ] Crear predicción via `/api/predictions` (POST)
- [ ] Ver oportunidades de value bets
- [ ] Analizar partido específico
- [ ] Probar cash-out con predicción activa
- [ ] Probar alertas SSE en navegador
- [ ] Verificar bankroll updates
- [ ] Probar calibration con histórico

### 🎯 Estado General

- ✅ Build: 0 errores TypeScript
- ✅ APIs públicas: Funcionando
- ✅ Auth: Protegiendo correctamente
- ✅ API-Football: Conectado (7500 req/día, plan Pro)
- ✅ PostgreSQL: Conectado
- ✅ Redis: Conectado
- ⚠️ Sesiones: Requieren crear usuario manualmente

### 🚀 Para empezar a usar

```bash
# 1. Iniciar servidor
cd ~/Desktop/Football-AI-Analyzer
npm run dev

# 2. En otra terminal, correr tests
bash scripts/test-apis.sh

# 3. Abrir navegador y crear cuenta
open http://localhost:3000/auth/register

# 4. Ir al dashboard
open http://localhost:3000/dashboard
```
