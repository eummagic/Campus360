# Stage 3B — terms and subjects

This increment adds list/create services, native-driver repository operations,
Express routes and a plain HTML/browser JavaScript page. It preserves the existing
academic overview. No edit/delete, offerings, assignments or enrolment provisioning
is included. No database or Docker operations were performed during development.

## Access and request flow

Open the academic overview from the portal, then **Manage academic terms and
subjects** (/pages/academic-management.html). Sign in through the existing portal.
All four API operations require a verified session and the exact configured admin
scope; teacher/student roles, forged roles and other scopes are denied. The
repository independently rechecks the user and scoped role; creates recheck inside
the transaction. Academic reference data remains application-wide, as in the
existing overview: scope is an access gate, not a department ownership field.

- GET /api/admin/academics/terms and /subjects accept only offset (0–1000),
  returning at most 50 records plus hasMore. Sorting includes the ID tiebreaker.
- POST on those paths accepts only the existing schema's data fields. It requires
  same-origin JSON, session-bound CSRF and an 8 KiB body limit; no query fields.
- Term fields: name (1–80), starts_on/ends_on (nullable real YYYY-MM-DD dates,
  nondecreasing when both supplied), status (planned/active/closed).
- Subject fields: program_id (canonical ObjectId hex for an active program), code
  (1–32), name (1–200), credits (null or integer 0–60), status (active/inactive).
- Names/codes are NFKC-normalized and trimmed; control characters are rejected.
  Existing case-sensitive unique indexes enforce term name uniqueness and subject
  code uniqueness within a program. Case variants are not promised duplicates;
  existing records are never rewritten to normalize them.
- Only a matching resource unique-key error becomes 409. Audit/ID collisions or
  infrastructure failures remain generic 503; invalid input is 400.
- A create inserts the resource and its audit event sequentially in one native
  driver transaction, with snapshot reads and majority writes. IDs/timestamps are
  stable across driver-managed transaction retries. Audit entity IDs link to the
  resource; actions are academic.term.created / academic.subject.created.
  There is no application-level retry or compensating deletion. After an ambiguous
  network failure, inspect the list before submitting again; no idempotency key is
  implemented.

## Blocking dependency: academic schema readiness

**Academic schema preparation remains incomplete and fail-closed.** Do not run its
--execute mode. No academic collections/indexes/validators have been provisioned
by this increment. Opening the page or starting the app does not provision them.

Before a list/create, metadata reads require the target collection to exist, use
its exact current JavaScript validator with strict/error validation, and contain
exactly its required unique index plus the normal _id_ index. Unexpected collection
options/indexes cause refusal. Creates also verify audit_events' existing schema
and indexes. There is no cached assumption of readiness and no implicit repair.
Read-only checks cannot prevent concurrent privileged DDL; operation assumes no
external process drops/alters schema during use. Only trusted operators may hold
DDL privileges. Existing baseline startup checks remain unchanged.

Missing/unexpected schema produces a useful 503 and disabled create controls.
Subject creation additionally stays disabled without active program choices.
The original demo database was not inspected; do not assume these collections exist.

Proposed unblock sequence (separate approval required): finish the reviewed Stage
3A ownership strategy; review its additive provisioning plan; prove schema and
rollback/duplicate behavior in an explicitly isolated transaction-capable test
database; then approve any persistent demo provisioning and a live rehearsal.
No setup initializer, seed, migration or preparation command is authorized here.

## Verification scope

Focused and default tests use synthetic HTTP repositories or fake MongoDB
collections/transactions. A driver BSON serialization assertion verifies integer
credit encoding without connecting. Fake rollback and duplicate tests establish
control flow, not actual MongoDB isolation/atomicity or concurrent unique-index
guarantees. Real MongoDB and interactive browser behavior remain unverified.

Verified in the reconciled worktree on October 29, 2026:

- node --test tests/unit/academic-management.test.js tests/integration/academic-management.test.js: 19 passed.
- node --test (default database-free suite): 216 passed, 0 failed/skipped/cancelled.
- node --check across all 67 authored JavaScript files: passed.
- git diff --check: passed.

No setup/preparation execution, MongoDB integration suite, application startup,
or interactive browser rehearsal was run.
