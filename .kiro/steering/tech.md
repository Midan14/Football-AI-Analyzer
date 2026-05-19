# Tech Stack & Build System

## Core Stack

- **Framework**: Next.js 16 (App Router) with React 19
- **Language**: TypeScript (strict mode)
- **Auth**: NextAuth.js v4 with Prisma adapter (email/password + OAuth)
- **Database**: PostgreSQL with Prisma ORM
- **Cache**: Redis
- **Validation**: Zod v4
- **State Management**: TanStack React Query v5
- **Styling**: Tailwind CSS
- **Charts**: Recharts
- **Icons**: Lucide React
- **PDF Export**: jsPDF + jspdf-autotable
- **Monitoring**: Sentry (error tracking + performance)
- **Testing**: Vitest + Testing Library + MSW (mocking)

## Path Aliases

Use `@/*` which maps to `./src/*` (configured in tsconfig.json).

## Common Commands

```bash
# Development
npm run dev              # Start dev server (Turbopack)

# Build & Production
npm run build            # Production build
npm start                # Start production server

# Quality
npm run lint             # ESLint
npm run typecheck        # TypeScript type checking (tsc --noEmit)
npm run test             # Run tests once (vitest run)
npm run test:watch       # Run tests in watch mode

# Database
npm run db:migrate       # Run Prisma migrations (dev)
npm run db:push          # Push schema changes without migration
npm run db:seed          # Seed database (tsx prisma/seed.ts)
npm run db:studio        # Open Prisma Studio
npm run db:reset         # Reset database (destructive)
```

## ESLint Configuration

- Extends: `eslint-config-next` (core-web-vitals + typescript)
- `@typescript-eslint/no-explicit-any`: off
- `prefer-const`: warn
- Flat config format (eslint.config.mjs)

## Docker

- Standalone Next.js output for smaller images
- Docker Compose available for full-stack local setup (app + postgres + redis)

## Environment Variables

- `.env` — Prisma/DB connection
- `.env.local` — App secrets (NextAuth, API keys, Redis, Sentry)
- See `.env.example` and `.env.local.example` for required variables
