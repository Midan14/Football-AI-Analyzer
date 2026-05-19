# Football AI Analyzer — Configuración y Testing

## Estado Actual (2026-05-18)

### ✅ Completado
- 9 APIs nuevas implementadas
- Frontend hooks y UI components
- PWA configurado
- Bugs corregidos (Kelly + Ensemble)
- Base de datos con bankroll

### ⚙️ Configuración Email (Resend)

Para activar alertas por email reales:

1. **Crear cuenta en Resend**
   - Ve a https://resend.com
   - Regístrate (gratis hasta 3000 emails/mes)

2. **Obtener API Key**
   - En el dashboard, ve a "API Keys"
   - Genera una nueva key
   - Copia el valor (empieza con `re_`)

3. **Configurar .env.local**
   ```bash
   RESEND_API_KEY=re_tu_key_aqui
   EMAIL_FROM=Football AI <noreply@tu-dominio.com>
   ```

4. **Verificar dominio** (opcional pero recomendado)
   - En Resend, ve a "Domains"
   - Agrega tu dominio y verifica DNS
   - Sin verificación, los emails pueden ir a spam

### 🧪 Testing con Datos Reales

**1. Iniciar servidor**
```bash
npm run dev
```

**2. Probar APIs públicas (sin auth)**
```bash
# Health check
curl http://localhost:3000/api/health

# Listar países
curl http://localhost:3000/api/countries

# Ver partidos de hoy
curl "http://localhost:3000/api/fixtures?date=2026-05-18"
```

**3. Probar APIs protegidas (requieren login)**
```bash
# Primero iniciar sesión vía web: http://localhost:3000/auth/signin
# Luego copiar la cookie de sesión

# Ver bankroll
curl -H "Cookie: next-auth.session-token=TU_TOKEN" http://localhost:3000/api/bankroll

# Ver oportunidades
curl -H "Cookie: next-auth.session-token=TU_TOKEN" http://localhost:3000/api/opportunities?minEdge=5

# Ver calibración
curl -H "Cookie: next-auth.session-token=TU_TOKEN" http://localhost:3000/api/calibration
```

**4. Probar análisis de partido**
```bash
# Reemplazar 1534043 con ID de fixture real
curl -H "Cookie: next-auth.session-token=TU_TOKEN" http://localhost:3000/api/analyze/1534043
```

**5. Probar alertas SSE**
```javascript
// En el navegador console:
const es = new EventSource('/api/alerts/stream');
es.onmessage = (e) => console.log(JSON.parse(e.data));
```

### 📊 APIs Disponibles

| Endpoint | Descripción | Auth |
|----------|-------------|------|
| `/api/health` | Estado del sistema | No |
| `/api/countries` | Lista países | No |
| `/api/fixtures` | Partidos por fecha | No |
| `/api/analyze/:id` | Análisis de partido | Sí |
| `/api/bankroll` | Bankroll + métricas | Sí |
| `/api/opportunities` | Value bets detectados | Sí |
| `/api/calibration` | Calibración del modelo | Sí |
| `/api/arbitrage` | Arbitraje | Sí |
| `/api/cash-out` | Cash-out + hedge | Sí |
| `/api/alerts/stream` | SSE alertas live | Sí |
| `/api/odds/live` | Odds en tiempo real | Sí |
| `/api/ab-test` | A/B testing | Sí |

### 🚀 Próximos Pasos Sugeridos

1. **Configurar Resend** para emails reales
2. **Crear usuario** vía `/auth/register`
3. **Agregar partidos a watchlist** para detectar oportunidades
4. **Revisar dashboard** en `/dashboard`
5. **Instalar PWA** en móvil (Chrome → Add to Home Screen)

### ⚠️ Limitaciones Actuales

- Las alertas SSE son simuladas (mock data cada 60s)
- Cash-out usa valores simulados (75% del stake)
- Arbitrage detecta oportunidades teóricas, no reales entre bookmakers
- Para producción real, considerar integrar OddsAPI o Betfair Exchange

### 🆘 Soporte

Si algo no funciona:
1. Verificar `.env.local` tiene todas las variables
2. Revisar logs: `npm run dev` muestra errores en consola
3. Health check: `curl http://localhost:3000/api/health`
