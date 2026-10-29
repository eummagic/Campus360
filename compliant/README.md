# Campus360 compliant local application

Plain HTML/CSS/browser JavaScript, Express, Node.js and MongoDB's native driver.
No frontend build step, Next.js, React, TypeScript, Mongoose or authentication framework.

## Local startup

For the proposed one-time durable local setup, see [LOCAL_DEMO_SETUP.md](LOCAL_DEMO_SETUP.md).
`npm run setup:demo` prints a dry-run plan only. Persistent setup requires the
explicit `--execute --database ...` command documented there; it has not been run.
After approved setup, `npm run start:demo` reads only the ignored `.env.demo` inside
`compliant/`. No default startup performs initialization.

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
