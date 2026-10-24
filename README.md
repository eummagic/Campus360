# Campus360 Phase 2A

This repository contains the Phase 1 authentication/profile foundation and the Phase 2A relational academic foundation. It uses synthetic accounts and data only.

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

The seed accounts use `admin1@example.com`, `student1@example.com`, `student2@example.com`, `student3@example.com`, `adminstudent1@example.com`, `teacher1@example.com`, and `teacher2@example.com`; each has the local-only password `password123`. `student3` has no student record for the admin create flow, `teacher2` is unassigned, and `adminstudent1` has admin plus student roles to exercise multi-role behavior. Never reuse these credentials outside a disposable local database. The seed command uses Node's `--env-file` option to load `.env.local` deliberately.

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

- This is a Phase 2A foundation, not a complete campus management system.
- Academic reference tables are read-only in the UI; admin create/edit forms for departments, programs, terms, subjects, offerings, and assignments are deferred.
- Attendance, notes/uploads, assignments/submissions, quizzes, marks/results, CSV import/export, account invitations, payments, transport/GPS, chat/marketplace, predictive analytics, and AI are out of scope.
- Supabase RLS tests require Docker and a running local Supabase stack.
- Seed accounts are synthetic and intended only for local development.
- Hosted deployment, institutional privacy approval, backups, and recovery have not been configured.

## Phase 2A academic foundation

### Local seed order

1. `pnpm db:reset` applies the migrations and `supabase/seed.sql` (currently empty).
2. `pnpm db:seed:users` creates the synthetic auth users, roles, academic structure, teaching assignments, student records, and enrolments.

The domain seed runs after auth users exist because its foreign keys reference those users. Both steps are for the disposable local database only.

### Routes

- `/dashboard` — role-aware student record/enrolments, teacher-assigned offerings, and admin totals.
- `/directory` — staff-only, RLS-scoped student search and filters.
- `/directory/[id]` — a scoped student record detail view.
- `/admin/academics` — read-only academic structure view.
- `/admin/students/new` — admin-only form to link an existing unlinked student account to a record.

RLS remains the data boundary. Server pages and actions also check the verified user and required role. See [docs/security.md](docs/security.md) for the role/data matrix.
