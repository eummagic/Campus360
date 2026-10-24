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
4. On a fresh, disposable local database only, apply migrations and seed SQL with `pnpm db:reset`. Never use this command on a database whose local data you need to keep.
5. Seed synthetic login accounts with `pnpm db:seed:users`.
6. Start the app with `pnpm dev` and open `http://localhost:3000`.

The original seed accounts use `admin1@example.com`, `student1@example.com`, `student2@example.com`, `student3@example.com`, `student4@example.com`, `adminstudent1@example.com`, `teacher1@example.com`, and `teacher2@example.com`; a newly created account gets the local-only password `password123`. `student1`, `student2`, and `adminstudent1` receive the original Section A classes, historical attendance, and assignments. `student3` and `student4` are unlinked-account candidates on a fresh seed; existing student records are preserved on reruns. `teacher2` remains unassigned, and `adminstudent1` has both admin and student roles. Never reuse these credentials outside a disposable local database. The seed command uses Node's `--env-file` option to load `.env.local` deliberately and refuses non-local API URLs.

The synthetic Stage C generator creates 120 students (`campus360-demo-s5-a-001@example.test` through section D) and four section teachers (`campus360-demo-s5-teacher-a@example.test` through D). At first creation, generated accounts share the local-only password configured in `CAMPUS360_SYNTHETIC_TEST_PASSWORD`; the generator never prints or stores that password in application rows, and reruns do not change it. Set `CAMPUS360_ADMIN_PASSWORD` to the existing local admin password and `CAMPUS360_SYNTHETIC_TEST_PASSWORD` to a chosen local-only fixture password in `.env.local` before running `pnpm db:seed:synthetic`. Keep `.env.local` untracked and never use these accounts outside local development. Existing tagged accounts are reused; the generator does not change their passwords or delete accounts.

Use those generated student and section-teacher accounts to demonstrate the Stage C timetable and attendance workflow. The older `student1`/`student2` and `teacher1` fixtures belong to the legacy `A` offering structure, while generated schedules and attendance belong to `S5-A` through `S5-D`; the generator intentionally does not link or rewrite the legacy fixtures.

## Commands

- `pnpm lint` — ESLint checks
- `pnpm typecheck` — TypeScript checks
- `pnpm test:run` — unit tests
- `pnpm test:e2e` — Playwright browser tests (Chromium may need `pnpm exec playwright install chromium`)
- `pnpm db:test` — Supabase pgTAP/RLS tests
- `pnpm db:reset` — destructive reset of the configured database; use only with the local Supabase instance

## Security boundary

The profile page requires a verified Supabase user and reads only that user's row. Display-name changes go through a server action and the database `update_my_display_name` function, which writes the audit event in the same transaction. Browser code uses only the public Supabase URL and publishable key. The service-role key is used only by local demo seed scripts. Seed reruns add missing fixture rows and verify deterministic rows; they do not update or delete existing rows or reset account passwords.

The first migration denies direct application-role profile mutations and direct audit writes. `record_audit_event` is private to the trusted database owner. Keep migrations as the source of truth for database changes.

## Environment variables

See `.env.example` for names and local placeholders. `.env.local` is ignored by Git. Do not put secrets in `NEXT_PUBLIC_*` variables or commit `.env.local`.

## Limitations

- This remains a local MVP, not a complete campus management system.
- Academic reference tables are read-only in the UI; admin create/edit forms for departments, programs, terms, subjects, offerings, and assignments are deferred.
- Assignment submission tracking, quizzes, marks/results, CSV import/export, account deactivation and password reset management, payments, transport/GPS, chat/marketplace, predictive analytics, and Gemini integration are not implemented. The signed-in shell has a deterministic, predefined Campus360 help guide.
- Supabase RLS tests require Docker and a running local Supabase stack.
- Seed accounts are synthetic and intended only for local development.
- Hosted deployment, institutional privacy approval, backups, and recovery have not been configured.

## Phase 2A academic foundation

### Local seed order

1. `pnpm db:reset` applies the migrations and `supabase/seed.sql` (currently empty).
2. `pnpm db:seed:users` creates or verifies the original auth users, roles, academic structure, teaching assignments, student records, enrolments, a two-course timetable, historical attendance, and published/draft assignments. Existing fixture conflicts stop the script instead of being overwritten.

The domain seed runs after auth users exist because its foreign keys reference those users. Both steps are for the disposable local database only.

### Routes

- `/dashboard` — role-aware student record/enrolments, teacher-assigned offerings, and admin totals.
- `/directory` — staff-only, RLS-scoped student search and filters.
- `/directory/[id]` — a scoped student record detail view.
- `/admin/academics` — read-only academic structure view.
- `/admin/students/new` — admin-only form to link an existing unlinked student account to a record.
- `/timetable`, `/attendance`, `/assignments`, `/calendar`, and `/subjects/[offeringId]` — role-scoped Stage C timetable, attendance, coursework, calendar, and offering views.

RLS remains the data boundary. Server pages and actions also check the verified user and required role. See [docs/security.md](docs/security.md) for the role/data matrix.
