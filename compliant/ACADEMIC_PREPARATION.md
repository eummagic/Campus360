# Stage 3A — additive schema preparation (not executed)

This script is prepared for a separate approval. No database connection, Docker
inspection or DDL was performed while preparing it. Tests use injected fakes only.
It imports the existing JavaScript schema, not the legacy initializer or seeds.
Application startup/readiness checks and all existing files remain unchanged.

## Future commands — do not execute without approval

From `D:\COLLEGE\Campus360\compliant`, the offline command prints schema definitions
only, without Docker, environment-file loading, driver loading or network access:

```powershell
node scripts/prepare-academic-schema.js --plan
```

The execution syntax remains below for review, **not as a ready-to-run preparation
command**. Under the current direct-creation design, any missing collection causes
the script to stop after a single create request because ownership cannot be
proved. It cannot finish creating indexes. A separately approved ownership strategy
is required before this command should be used to provision missing collections:

```powershell
node --env-file=.env.demo scripts/prepare-academic-schema.js --execute --database campus360_demo_20261029_4f9c2b18
```

No configuration is written. No password prompts or record provisioning occur.
The existing app need not be restarted because no application code changes here.

## Definitions copied directly from server/db/schema.js

All five validators require BSON object documents, reject additional properties,
and allow only ObjectId `_id` (MongoDB generates it if omitted). All fields below
are required. Nonblank text retains the source `\\S` pattern. Validation is strict
and rejects errors. `created_at` and `updated_at` below are required BSON Dates.

| Collection | Required fields and constraints |
|---|---|
| academic_terms | `name`: text 1–80; `starts_on`, `ends_on`: null or `YYYY-MM-DD` pattern string; `status`: planned/active/closed; created_at, updated_at. `$expr` allows a null boundary, otherwise starts_on ≤ ends_on. |
| subjects | `program_id`: ObjectId; `code`: text 1–32; `name`: text 1–200; `credits`: null or BSON int 0–60; `status`: active/inactive; created_at, updated_at. |
| course_offerings | `subject_id`, `term_id`: ObjectIds; `section_code`: text 1–16; `status`: active/archived; created_at, updated_at. |
| teaching_assignments | `teacher_user_id`, `offering_id`: ObjectIds; `assigned_at`: Date; `assigned_by`: ObjectId or null. |
| enrolments | `student_record_id`, `offering_id`: ObjectIds; `enrolled_at`: Date. |

The term date pattern does not prove that a date exists on the calendar. MongoDB
validators enforce BSON shapes, not foreign keys, teacher roles or scope. These
checks belong to later relationship-provisioning services, not this DDL script.

| Collection / explicit index | Ordered key | Options |
|---|---|---|
| academic_terms_name_uq | name:1 | unique:true |
| subjects_program_code_uq | program_id:1, code:1 | unique:true |
| course_offerings_subject_term_section_uq | subject_id:1, term_id:1, section_code:1 | unique:true |
| course_offerings_term_idx | term_id:1 | none |
| teaching_assignments_teacher_offering_uq | teacher_user_id:1, offering_id:1 | unique:true |
| teaching_assignments_offering_idx | offering_id:1 | none |
| enrolments_student_offering_uq | student_record_id:1, offering_id:1 | unique:true |
| enrolments_offering_idx | offering_id:1 | none |

Eight explicit indexes, five unique; each new collection also gets `_id_`.
References preserve the legacy ObjectId model: subject → program; offering →
subject/term; teaching assignment → user/offering (assigned_by → user or null);
enrolment → student_records/offering. Teacher identities and user_roles are not
created. Collection fields have no tenant scope; later services must enforce roles,
scope and membership before provisioning or reading relationships.

## Refusal and preservation rules

1. Default/--plan is offline. Execution requires the exact explicit database name.
   The configured URI must exactly match the approved loopback endpoint, replica
   set and direct-connection options. Hosted/SRV/multi-host/credential-bearing or
   altered URIs and unexpected database names are refused without connecting.
2. Read-only Docker inspection must match the previously approved container ID,
   image digest, running state, labels/nonce, loopback-only port, named volume and
   tmpfs mount. The Docker socket must be local. It never starts/stops/pulls/creates
   Docker resources. A recreated container is refused pending a fresh review.
3. The existing connection module checks the original nine-collection baseline
   and validators/indexes without writes. The script additionally checks the
   selected database identity and the exact writable local replica-set member.
4. Inspect ALL five targets before DDL. Existing collections must have exact
   validators, strict/error validation, ordered index keys, uniqueness and the
   expected index set plus `_id_`. Unexpected options, extra/missing indexes,
   views, changed validators or other discrepancies abort the entire preflight.
   Existing compatible targets are skipped; missing indexes are never repaired.
5. Only a missing collection can receive a create request, after an additional
   existence check. A successful MongoDB create reply also covers an identical
   collection created by another process. It proves neither exclusive ownership
   nor creation by this run. Even reading a UUID afterward cannot establish that
   provenance. The script therefore reports ownership as uncertain, stops, and
   **never calls createIndexes**. It never claims that successful acknowledgement
   means confirmed creation. No cleanup or validator alteration resolves this state.
6. DDL across collections is not one atomic transaction. A failed create request
   is uncertain unless it is an explicit MongoServerError rejection with code
   2/9/13/48/72/73 and no write-concern error. These rejections confirm only that
   this request did not create the collection; another process may have created
   it. Transport errors, timeouts and lost replies stay uncertain even when the
   collection was actually created. No request is retried. Later collections are
   reported as not attempted. A future read-only investigation must establish
   actual state; the script does not repair a partially prepared collection.
7. Reports distinguish `confirmedCreated`, `confirmedNotCreated`, `uncertain`,
   `skipped` (existing compatible definitions), and `notAttempted`. Every uncertain
   entry includes its collection name and whether existence was acknowledged.
   `confirmedCreated` remains empty in this conservative design; that is **not**
   a claim that no collection exists or that no request succeeded. Both
   `primaryError` and `shutdownError` are preserved with this progress, using safe
   messages rather than raw driver errors. A shutdown failure also preserves
   successful validation/skips when the primary work succeeded. These outcomes
   are returned as a structured error report with a nonzero CLI exit status.
8. No document inserts, updates, deletes, collMod, drops, bulk seeds or upserts
   exist here. Timetable, attendance, assignments and locks are outside this work.
   Existing targets are not indexed, repaired or cleaned up. Stop other schema
   writers for any future execution; the catalog checks do not eliminate races.

No term, subject, offering, teaching assignment, enrolment, account or audit record
is seeded. DDL results are reported to the terminal; the script does not append a
database audit record because this stage permits schema preparation only.

## Focused verification

```powershell
node --test tests/unit/academic-preparation.test.js
node --check scripts/prepare-academic-schema.js
node --check tests/unit/academic-preparation.test.js
git diff --check
```

The fake tests verify the complete desired plan, offline behavior, pre-write
refusal, ordered indexes/options and preservation of existing targets. Permanent
regressions model identical-namespace success, a lost acknowledgement after actual
fake creation, explicit server rejection, uncertain failures, and shutdown failures
both with a primary error and after successful validation. None permits indexing
an uncertain target. They do not prove live Docker identity, MongoDB authorization,
DDL success, disk capacity or actual current collection state. A usable ownership
strategy is still a prerequisite to full preparation. Stage 3B has not started.
