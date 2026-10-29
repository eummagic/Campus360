# Campus360 compliant local application

Plain HTML/CSS/browser JavaScript, Express, Node.js and MongoDB's native driver.
No frontend build step, Next.js, React, TypeScript, Mongoose or authentication framework.

## Read-only academic overview

After starting the updated application with `npm run start:demo` (or `start:mongo`),
sign in as an administrator in the configured `ADMIN_SCOPE` and follow **Academic
overview**, or open `/pages/academics.html`. An already-running process must be
restarted to load the new server routes; no database setup is needed.

`GET /api/admin/academics/overview` requires a verified session and the same exact
administrator scope policy as student administration. It reads departments and
programs, including inactive reference records, and reports whether other academic
collections exist. Existing collections are not evidence that their features are
migrated. Missing required collections return a generic 503; absent optional
collections are explicitly marked “Not provisioned.” Nothing initializes or repairs
schema, indexes, accounts or records. Reference collections have no scope field;
they are shared application data, not tenant-isolated datasets.

The overview is limited to 500 departments and 500 programs; exceeding this limit
returns unavailable rather than silently omitting records. The public HTML shell
contains no academic records; protected data comes only from the authenticated API.
Focused tests use synthetic repositories/fake collections and do not establish
live-database behavior:

```powershell
node --test tests/unit/academic.test.js tests/integration/academics.test.js
```

## Local startup

### Directory, student details, and display-name editing

After restarting the **application process** with the updated code, administrators
can follow **Student directory** in the portal (`/pages/directory.html`). Search
matches literal substrings of display names or registration numbers, case
insensitively. Status and program filters combine with search. Results are ordered
by registration number, 50 per page, with offsets capped at 1000. The directory
includes only student-role records in the configured administrator scope; a teacher
role alone does not grant access. Program choices use the existing academic API.

Click a directory name for `/pages/student.html?id=RECORD_ID`. Students use
**My academic details and enrolments** to open their own record. Detail reads require
the configured student scope or administrator scope, and students cannot open other
records. Missing enrolment/offering/subject/term collections are reported explicitly;
the page never initializes them. At most 100 enrolments are supported per detail
view; larger or inconsistent datasets return unavailable rather than partial data.

Every signed-in user can follow **Edit my display name** (`/pages/profile.html`).
Only `displayName` is accepted: trimmed, 1–120 characters, without control characters.
`PATCH /api/profile` requires the current session, exact origin, JSON and its CSRF
token. The signed-in user's profile and an audit event containing the previous/new
name commit together in a sequential transaction. An unchanged name is a no-op.
Email, user name in legacy identity documents, roles and academic identifiers are
not changed. The profile display name is authoritative for the compliant UI.

APIs added: `GET /api/directory`, `GET /api/directory/:recordId`,
`GET /api/profile`, `PATCH /api/profile`. Query fields other than the documented
directory filters (`q`, `status`, `programId`, `offset`) are rejected. No detail or
profile API accepts a browser-supplied identity or scope.

Focused Stage 2 checks (no database connection):

```powershell
node --test tests/unit/records.test.js tests/integration/records.test.js
```

The fake database verifies query intent, mapping and transaction control flow,
including rollback after an audit failure. It does not prove actual MongoDB
atomicity or aggregation behavior. Subsequently, the live demo verified administrator
access to the academic overview (department and BCA program), the student directory,
and student details. Profile editing has automated coverage; live profile-write
persistence has not been verified.

For the one-time durable local setup, see [LOCAL_DEMO_SETUP.md](LOCAL_DEMO_SETUP.md).
`npm run setup:demo` prints a dry-run plan only. Persistent setup requires the
explicit `--execute --database ...` command documented there. Durable local MongoDB
demo setup completed successfully.
After approved setup, `npm run start:demo` reads only the ignored `.env.demo` inside
`compliant/`. No default startup performs initialization.

Academic schema preparation remains incomplete and fail-closed; it has not
provisioned additional academic collections.

`npm start` serves the database-free foundation. Authentication is unavailable in that mode.

`npm run start:mongo` explicitly enables the real MongoDB repositories. It requires an
already prepared **local** replica set, application validators/indexes, an administrator
identity/account/profile/role, and at least one active department/program. It never seeds,
initializes or migrates a database, loads the root `.env.local`, or repairs existing records.

Configure the process explicitly (or use Node's `--env-file` with a file inside `compliant/`):

```powershell
$env:MONGODB_URI = 'mongodb://127.0.0.1:27028/?replicaSet=campus360-test-rs&directConnection=true'
$env:MONGODB_DB = 'YOUR_PREPARED_LOCAL_DATABASE'
$env:APP_ORIGIN = 'http://127.0.0.1:3001'
$env:ALLOW_INSECURE_LOOPBACK = 'true'
$env:ADMIN_SCOPE = 'demo'
npm run start:mongo
```

Those are configuration examples, not an existing database or credentials. Bind only to
loopback. `ADMIN_SCOPE` must match the intended administrator and student roles exactly;
omit it for global `null` scope. The eight original demo accounts use `demo` scope.
This entry point serves local HTTP only; HTTPS termination is outside this stage.

Sign in as an administrator, choose an active program, and create a student with an
initial password of 8–128 characters. The page confirms the committed account and
refreshes the persisted listing. Sign out, then sign in with the new student's email
and initial password to view their own registration and program.

Registration numbers are trimmed and uppercased. New accounts always have student
authority only. Email verification/delivery, password reset/change and account recovery
are not implemented. Initial passwords must be shared directly and securely. Existing
hashes are not rewritten. All student creation writes and its audit event share one
transaction; the database unique indexes arbitrate competing submissions.

## Checks

```powershell
node --test
```

The default suite requires no MongoDB and never discovers `tests/mongo/*.mongo.js`.
The schema-parity test uses Node's built-in TypeScript stripping only to read the
unchanged legacy schema as a test oracle. This development check is separate from
the plain-JavaScript application runtime and requires no TypeScript compiler.
The explicit real-driver scripts below require the separately verified disposable
container, `127.0.0.1:27028`, replica set `campus360-test-rs`, and its 32-hex-digit
`CAMPUS360_TEST_RUN` label. They refuse other database configuration and create only
uniquely named synthetic fixture databases after checking isolation. Never point them
at application or hosted data.

```powershell
node --test tests/mongo/essential.mongo.js
node --test tests/mongo/demo.mongo.js
```

The essential suite checks mapping, persisted sessions, expiry, revocation, uniqueness,
rollback and audit consistency. The demo suite checks the real HTTP creation/login
journey. `CAMPUS360_TEST_PREVIEW=true` keeps that suite's synthetic app available for
60 seconds for browser inspection, then closes the HTTP and database clients.

Listing is capped at the newest 50 students among the first 501 scoped student role
records; full pagination and large-campus administration are deferred. Account creation
does not enroll students in course offerings or generate attendance/academic history.

## Academic term and subject management

Stage 3B adds scoped administrator list/create forms through the academic overview.
See [ACADEMIC_MANAGEMENT.md](ACADEMIC_MANAGEMENT.md) for fields, security, API and
verification limits. Live use requires separately approved compatible schema;
academic preparation remains incomplete and fail-closed. No provisioning occurs
through these endpoints.
