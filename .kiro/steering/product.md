# Product Overview

Football AI Analyzer is a standalone web application for advanced football (soccer) analytics. It provides match analysis by country, league, and fixture, with AI-powered predictions, historical tracking, and data validation.

## Core Capabilities

- **Match Analysis**: Statistical analysis of fixtures with probability calculations for various markets (1X2, over/under, BTTS, etc.)
- **Predictions & Tracking**: Users create predictions, track outcomes, and measure ROI over time
- **Watchlist**: Personalized fixture watchlists with notes
- **Performance Metrics**: Aggregated prediction performance grouped by market or league
- **Alerts**: Configurable notifications for value detection, odds movement, lineup changes, etc.
- **Multi-provider Data**: Supports Sportmonks, API-Football, and a demo fallback for local development

## User Roles

- **USER**: Standard access to analysis, predictions, and watchlist
- **ANALYST**: Extended analysis capabilities
- **ADMIN**: Full system access including audit logs

## Key Constraints

- Predictions are statistical analysis, never presented as guaranteed outcomes
- Confidence scores include penalties for incomplete data
- Stake suggestions are based on confidence levels
- The app is primarily in Spanish (UI copy, README)
- Demo data provider is for local/test only; production requires a real provider
