# Repository Guide

## Project layout

- `app/`: Next.js App Router pages, route handlers, and server actions.
- `src/components/`: shared interface components; `src/lib/`: authentication, validation, storage, and date helpers; `src/services/`: database-backed application logic.
- `prisma/`: schema, committed migrations, and seed script.
- `supabase/`: storage setup SQL and Edge Functions.
- `tests/`: Vitest tests using a dedicated local Postgres database.
- `plan/`: product decisions, epics, and verification notes.

## Local development

Use Node.js 22+, pnpm, and Docker. Copy `.env.example` to `.env`, then run:

```sh
pnpm install
pnpm dev:db:up
pnpm db:migrate
pnpm db:seed
pnpm dev
```

The app uses `DATABASE_URL` at runtime and `DIRECT_URL` for migrations. Local Postgres uses port `55432`. See `README.md` for Supabase setup and required environment variables.

## Checks

- `pnpm typecheck`
- `pnpm lint`
- `pnpm build`
- `pnpm test` (requires the isolated test database started with `pnpm test:db:up`)

Run `pnpm test:db:down` after database tests. The test scripts validate that test connections target the dedicated local `eevents_test` database.

## Implementation conventions

Keep server components and server actions as the default. Use client components for the established React Hook Form validation flow, viewer-timezone presentation, and administrator QR camera scanning. Keep styles in plain CSS and CSS modules. Preserve the existing authorization checks, input validation, database constraints, and row-level security when changing data flows.

Add schema changes as Prisma migrations. Keep service-role credentials and real `.env` files out of Git; use the server-only Supabase storage helpers. Event media and legacy certificates use private buckets.

## Changes and commits

Use small Conventional Commit subjects, such as `feat(check-in): add QR attendance scanning`. Keep a feature's implementation, tests, and migration together. Report the checks actually run; do not claim unperformed hosted verification.
