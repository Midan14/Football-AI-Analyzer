# Project Structure

```
src/
├── app/                        # Next.js App Router (pages + API routes)
│   ├── api/                    # REST API endpoints (route handlers)
│   │   ├── auth/               # Authentication (NextAuth, register, profile, password reset)
│   │   ├── analyze/[fixtureId] # Match analysis endpoint
│   │   ├── deep-analyze/[fixtureId] # Deep analysis endpoint
│   │   ├── countries/          # Country listing
│   │   ├── leagues/            # League listing
│   │   ├── fixtures/           # Fixture listing
│   │   ├── match/[fixtureId]   # Match details
│   │   ├── predictions/        # CRUD predictions + resolve
│   │   ├── performance/        # Performance metrics
│   │   ├── user/watchlist/     # Watchlist management
│   │   ├── alerts/             # Alert management
│   │   ├── live/               # Live match data
│   │   ├── health/             # System healthcheck
│   │   ├── cron/               # Scheduled jobs (prediction resolution)
│   │   └── openapi/            # OpenAPI spec endpoint
│   ├── auth/                   # Auth pages
│   ├── dashboard/              # Dashboard pages
│   ├── layout.tsx              # Root layout
│   └── page.tsx                # Landing page
│
├── backend/                    # Server-side business logic
│   ├── lib/
│   │   ├── analysis/           # Analysis engine (probability models, scoring)
│   │   └── providers/          # Data providers (Sportmonks, API-Football, demo)
│   └── server/
│       └── football/           # Football domain services
│
├── frontend/                   # Client-side code
│   ├── components/             # Shared React components (error boundary, providers, toast)
│   ├── features/               # Feature modules (dashboard)
│   ├── hooks/                  # Custom React hooks (use-analysis, use-fixtures, etc.)
│   └── lib/                    # Client utilities (API response handling, export, query client)
│
├── lib/                        # Shared utilities (used by both client and server)
│   ├── schemas/                # Zod validation schemas
│   ├── api-utils.ts            # API response helpers, error handling wrapper
│   ├── cache.ts                # Redis cache layer
│   ├── db.ts                   # Prisma client singleton
│   ├── email.ts                # Email utilities
│   ├── rate-limit.ts           # Rate limiting
│   └── sentry.ts               # Sentry integration
│
├── shared/                     # Shared domain types
│   └── domain.ts               # Core domain type definitions
│
├── types/                      # TypeScript type augmentations
│   └── next-auth.d.ts          # NextAuth session type extensions
│
├── auth.ts                     # NextAuth configuration
└── proxy.ts                    # Proxy utilities

prisma/
├── schema.prisma               # Database schema
├── migrations/                 # Migration history
└── seed.ts                     # Database seeding script
```

## Conventions

- **API routes** use Next.js App Router file-based routing (`route.ts` files)
- **API handlers** are wrapped with `withErrorHandling()` from `@/lib/api-utils`
- **Responses** follow a standard `ApiResponse<T>` format with `success`, `data`, `error`, and `meta` fields
- **Validation** uses Zod schemas defined in `src/lib/schemas/`
- **Frontend hooks** follow the `use-{resource}` naming pattern and use TanStack Query
- **Backend services** live in `src/backend/server/` and are consumed by API routes
- **Data providers** are abstracted behind a provider interface in `src/backend/lib/providers/`
- **Tests** are co-located with source files (`.test.ts` suffix)
