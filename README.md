# Campus360

Campus portal (attendance, timetable, assignments, student records) built with Next.js 16, **MongoDB Atlas** and **Better Auth**. It uses synthetic accounts and data only.

> Migrated from Supabase (Postgres + RLS) to MongoDB in October 2026. The last Supabase version is preserved at git tag `checkpoint/pre-mongodb-migration`.

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16.4.3 (App Router, Server Components, Server Actions) |
| Database | MongoDB Atlas (free cluster), database `campus360`, driver `mongodb` 7.7.0 |
| Auth | Better Auth 1.7.13 (email + password, sessions stored in MongoDB; public sign-up disabled) |
| Validation | zod |

## Prerequisites

- Node.js 22 or 24, pnpm 10
- A MongoDB Atlas cluster with two database users:
  - `campus360_app` — **readWrite@campus360** (used by the app)
  - `campus360_admin` — **dbAdmin@campus360 + readWrite@campus360** (used only by the setup scripts)
- Your current IP address added in Atlas → Database & Network Access → IP Access List

## Local setup

1. `pnpm install`
2. Copy `.env.example` to `.env.local` and fill in `MONGODB_URI`, `MONGODB_ADMIN_URI`, `MONGODB_DB=campus360`. Never commit `.env.local`.
3. `node --import tsx scripts/mongo/ensure-auth-env.ts` — adds a random `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` to `.env.local` (values are not printed).
4. `pnpm db:mongo:init` — creates collections, schema validators and indexes (safe to re-run; never drops anything).
5. `pnpm db:mongo:verify` — checks validators, indexes and transactions.
6. `pnpm db:mongo:seed-demo` — creates the demo accounts and academic data (safe to re-run; never overwrites).
7. `pnpm dev` and open http://localhost:3000

### Demo accounts

| Account | Password | Notes |
|---|---|---|
| `admin1@example.com` | `password123` | Admin |
| `adminstudent1@example.com` | `password123` | Admin + student |
| `teacher1@example.com` | `password123` | Teaches CS101/CS102 section A |
| `teacher2@example.com` | `password123` | Unassigned teacher |
| `student1@example.com`, `student2@example.com` | `password123` | Section A students |
| `student3@example.com`, `student4@example.com` | `password123` | Not yet linked to a student record (for the "Create student record" flow) |
| `campus360-demo-s5-a-001@example.test` … `-d-030@example.test` | `CAMPUS360_SYNTHETIC_TEST_PASSWORD` or `password123` | 120 S5 students |
| `campus360-demo-s5-teacher-a@example.test` … `-teacher-d@example.test` | same | S5 section teachers |

Attendance history is generated for the 8 weeks up to the day you run the seed.

## Commands

- `pnpm lint`, `pnpm typecheck`, `pnpm test:run` — static checks and unit tests
- `pnpm db:mongo:init` / `pnpm db:mongo:verify` — schema setup and verification
- `pnpm db:mongo:seed-auth` — only the 8 original accounts
- `pnpm db:mongo:seed-demo` — all demo data
- `pnpm db:mongo:verify-auth` — login checks (needs `pnpm dev` running)
- `pnpm db:mongo:verify-app` — data + permission checks per role (needs `pnpm dev` running)
- `pnpm test:e2e` — Playwright browser tests

## Architecture

- `scripts/mongo/schema.ts` — single source of truth for collections, `$jsonSchema` validators (with `additionalProperties: false`) and unique indexes. Change the schema here and re-run `pnpm db:mongo:init`.
- `src/lib/data/core.ts` — Mongo access helpers and the **access scope** (`getAccess`) that replaces Postgres RLS: every query filters by the signed-in user's roles, taught offerings, enrolled offerings and own student record.
- `src/lib/data/campus.ts`, `src/lib/academics.ts` — all reads and writes used by pages and Server Actions. Pages and actions never query MongoDB directly.
- Writes that must be atomic (attendance marking, timetable entries, student records, profile updates, assignments) run in **MongoDB transactions** and write an `audit_events` row in the same transaction.
- Timetable conflict checks are serialized through the `locks/timetable` document (replaces the Postgres advisory lock).
- Unique indexes prevent duplicate attendance sessions/marks, enrolments, teaching assignments and registration numbers even under concurrent requests.

## Security boundary

See [docs/security.md](docs/security.md) for the role/data matrix. Authorization is enforced **server-side** in the data layer, not in the browser. The browser only talks to Next.js; it never receives database credentials. Public sign-up is disabled; accounts are created by the seed scripts (or a future admin screen).

## Limitations

- Local MVP, not a complete campus management system.
- Marks/results, submissions, CSV import/export, account management screens, payments, transport and analytics are not implemented.
- Hosted deployment, backups and institutional privacy approval are not configured.
