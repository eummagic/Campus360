# Campus360 Phase 1

This repository contains a Next.js foundation with Supabase authentication and a protected profile vertical slice. It uses synthetic accounts and data only.

## Prerequisites

- Node.js 22 or 24
- pnpm 10
- Docker Desktop for local Supabase database and RLS tests

## Local setup

1. Install dependencies with `pnpm install`.
2. Start Supabase with `pnpm db:start` (Docker must be running).
3. Copy `.env.example` to `.env.local` and set the local values printed by Supabase.
4. Apply migrations and seed SQL with `pnpm db:reset`.
5. Seed synthetic login accounts with `pnpm db:seed:users`.
6. Start the app with `pnpm dev` and open `http://localhost:3000`.

The seed accounts use `student1@example.com`, `student2@example.com`, and `teacher1@example.com`; the seed script assigns the local-only password `password123`. Never reuse these credentials outside a disposable local database. The seed command uses Node's `--env-file` option to load `.env.local` deliberately.

## Commands

- `pnpm lint` — ESLint checks
- `pnpm typecheck` — TypeScript checks
- `pnpm test:run` — unit tests
- `pnpm test:e2e` — Playwright browser tests (Chromium may need `pnpm exec playwright install chromium`)
- `pnpm db:test` — Supabase pgTAP/RLS tests
- `pnpm db:reset` — destructive reset of the configured database; use only with the local Supabase instance

## Security boundary

The profile page requires a verified Supabase user and reads only that user's row. Display-name changes go through a server action and the database `update_my_display_name` function, which writes the audit event in the same transaction. Browser code uses only the public Supabase URL and publishable key. The service-role key is used only by the local synthetic-user seed script.

The first migration denies direct application-role profile mutations and direct audit writes. `record_audit_event` is private to the trusted database owner. Keep migrations as the source of truth for database changes.

## Environment variables

See `.env.example` for names and local placeholders. `.env.local` is ignored by Git. Do not put secrets in `NEXT_PUBLIC_*` variables or commit `.env.local`.

## Limitations

- This is a Phase 1 foundation, not a complete campus management system.
- Supabase RLS tests require Docker and a running local Supabase stack.
- Seed accounts are synthetic and intended only for local development.
- Hosted deployment, institutional privacy approval, backups, and recovery have not been configured.
