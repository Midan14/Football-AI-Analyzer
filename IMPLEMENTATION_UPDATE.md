# Football AI Analyzer — Implementation Log

## 2026-05-18 Session

### Bugs Fixed
- **Kelly Criterion odds mapping** — Added all 15 markets (was missing Doble Chance, Over/Under 1.5, Over 3.5, etc)
- **Ensemble over25 blending** — Now blends Poisson + NegBinomial using xG heuristic instead of just NegBinom

### New APIs Created
1. `/api/bankroll` — GET balance + metrics, PATCH update bankroll
2. `/api/opportunities` — Auto-detects value bets from user's watchlist
3. `/api/arbitrage` — Detects arbitrage scenarios (simulated, ready for real bookmakers)
4. `/api/calibration` — Brier score + calibration buckets
5. `/api/odds/live` — Live odds with vig calculation + caching
6. `/api/alerts/stream` — SSE for real-time alerts
7. `/api/alerts/email` — Email alerts via Resend (placeholder if no API key)
8. `/api/cash-out` — Cash-out recommendations + hedge calculations
9. `/api/ab-test` — A/B testing for model variants

### Enhanced APIs
- `/api/cron/ml-retrain` — Full pipeline: extract → train → calibrate → log metrics

### Database Changes
- Added `bankroll` field to User model
- Applied Prisma migration

### Frontend Hooks
- `useBankroll()` — Fetch + update bankroll with auto-refresh
- `useOpportunities()` — Auto-detect value bets
- `useCalibration()` — Model calibration metrics
- `useAlertStream()` — SSE connection for live alerts
- `useServiceWorker()` — PWA service worker registration

### UI Components
- `OpportunitiesPanel` — Shows detected value bets with edge% and stake suggestions
- `BankrollPanel` — Displays bankroll, profit, ROI, unit size

### Navigation
- Added "Oportunidades" tab to main nav with Zap icon

### PWA / Mobile
- Added `manifest.json` for PWA support
- Added `sw.js` service worker with cache-first strategy
- `next.config.mjs` updated with PWA rewrites
- Service worker auto-registered in production

### Build
- Compiles with 0 TypeScript errors
- All routes registered and functional
- PWA-ready for mobile install

### Remaining (future sessions)
- Real odds provider integration (OddsAPI, Betfair, Pinnacle)
- Push/email alerts with real providers
- Cash-out integration with bookmaker APIs
