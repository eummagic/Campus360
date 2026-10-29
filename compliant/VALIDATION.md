# Historical local validation — October 29, 2026

This report records results from the earlier `D:\COLLEGE\Campus360` checkout,
not execution of `D:\COLLEGE\Campus360-reconciliation`. Historical counts,
commands, browser observations, resource identities and cleanup results below
apply only to that earlier test run. At import, dependencies and `.env.demo` had
not been provisioned and no tests or application execution had occurred in the
reconciled worktree. Later Stage 3B database-free verification is recorded in
ACADEMIC_MANAGEMENT.md; it does not verify a live database or browser session.
Excluded local screenshots are not included in this copy.

Subsequently, durable local demo setup completed in the earlier checkout, and
the administrator academic overview (department and BCA program), student
directory and student details were verified live. Profile editing has automated
coverage; live profile-write persistence is not claimed verified. Academic schema
preparation remains incomplete and fail-closed; no additional academic collection
provisioning is established by this report.

## Historical verified results

- Node.js v26.12.1, native driver mongodb@7.7.0, MongoDB image mongo:8.0.34-noble.
- Default `node --test`: **154 passed, 0 failed, 0 skipped**. No database required.
- Explicit essential MongoDB suite: **8 passed, 0 failed** (seven checks plus parent).
- Explicit real HTTP demo journey: **1 passed, 0 failed**.
- JavaScript syntax and the HTML registration pattern compiled successfully.
- Browser: a newly created synthetic student signed in and the actual profile UI
  rendered name, email, registration, program and status. Screenshot is retained in
  `.npm-cache/student-profile.png` as local evidence, outside version-controlled source.
- Browser sign-out was attempted after the deliberately short preview had ended;
  the page correctly reported an unavailable connection. Logout/replay passed in
  the real-driver essential suite. Administrator creation was exercised over real
  HTTP; the administrator form itself was not browser-automated.
- The existing experimental warning from the schema test's `stripTypeScriptTypes`
  oracle remains. No application runtime depends on TypeScript.

## Isolation and exact run identity

- Run label: `e6ff96f260144a62a5ec28b6444940ac`.
- Container: `campus360-test-e6ff96f2`.
- Container ID: `e087ca74dbbc68643ed20434e295dd31deb59c24e45bc8b905c18528bcbf3904`.
- Image digest: `sha256:3c64937121b9437095921c4bb2569911084c05f7b88e4a263d62a8959d2b2399`.
- Host binding: only `127.0.0.1:27028` → container port 27017.
- Replica set: `campus360-test-rs`; member `localhost:27017` inside the container.
- `/data/db` and `/data/configdb`: tmpfs only; no volumes or bind mounts.
- Databases: `campus360_test_e6ff96f260144a62a5ec28b6444940ac_essential`
  and `campus360_test_e6ff96f260144a62a5ec28b6444940ac_demo`.

The controller checked image, container ID, label, running state, port and mounts
before setup. Each test checked replica identity/primary status, database inventory,
and that its unique database did not already exist before writing fixtures. Only
synthetic users and academic fixtures were created. No existing or hosted database
was used; no environment file or real credentials were read. No seed, legacy
initialization script or migration was run.

The first setup guard failed before writes because it checked `replSetName`;
`getCmdLineOpts` reports `replSet` in this image. A read-only inspection confirmed
the intended value. One corrected setup attempt succeeded; no further setup
troubleshooting or expanded database-test matrix was performed.

## Essential behaviors verified with the real server

Native ObjectIds versus string accountId; credential/profile lookup; hashed session
persistence across service instances; expiry before TTL removal; excessive-lifetime
validator rejection; immediate role revocation on the next request; unique token
hash rejection; session insert/delete rollback when a real audit validation fails;
and logout with exactly one deletion audit and replay rejection.

The demo journey additionally verified administrator login, 201 student creation,
all linked identity/account/profile/role/academic/audit records, hashed password
verification, independent listing, useful duplicate-registration rejection,
concurrent same-registration submissions (one 201, one 409), rollback of student
provisioning after a real audit failure, student login, own-record access despite a
forged query ID, administrator denial for students, CSRF and forged-role rejection,
and delivery of the actual HTML, JavaScript and CSS.

## Commands

Image pull was time-boxed to 180 seconds:

```powershell
docker pull mongo:8.0.34-noble
docker run --detach --pull=never --name campus360-test-e6ff96f2 --label io.campus360.test-run=e6ff96f260144a62a5ec28b6444940ac --publish 127.0.0.1:27028:27017 --memory 2g --cpus 2 --mount type=tmpfs,destination=/data/db,tmpfs-size=1073741824 --mount type=tmpfs,destination=/data/configdb,tmpfs-size=33554432 mongo:8.0.34-noble mongod --replSet campus360-test-rs --bind_ip_all --wiredTigerCacheSizeGB 0.25 --oplogSize 64
```

After ownership inspection, `docker exec` ran mongosh only in that container:

```javascript
const options = db.adminCommand({ getCmdLineOpts: 1 });
if (options.parsed.replication.replSet !== "campus360-test-rs") throw new Error("Unexpected replica-set configuration");
const result = rs.initiate({ _id: "campus360-test-rs", members: [{ _id: 0, host: "localhost:27017" }] });
if (result.ok !== 1) throw new Error("Replica-set initialization failed");
let ready = false;
for (let i = 0; i < 30; i++) { if (db.hello().isWritablePrimary) { ready = true; break; } sleep(500); }
if (!ready) throw new Error("Replica-set election exceeded 15 seconds");
```

From `D:\COLLEGE\Campus360\compliant`:

```powershell
$env:CAMPUS360_TEST_RUN = 'e6ff96f260144a62a5ec28b6444940ac'
node --test tests/mongo/essential.mongo.js
node --test
$env:CAMPUS360_TEST_PREVIEW = 'true'
node --test tests/mongo/demo.mongo.js
```

All JavaScript files under server/, tests/ and public/js/ were checked with
`node --check`. The browser visited the test's printed loopback origin and used
only a synthetic student fixture. The preview and clients closed after 60 seconds.

## Changed files

Modified: `package.json`, `public/index.html`, `public/css/app.css`, `server/app.js`,
`server/db/connection.js`, `tests/fixtures/mongo.js`.

Added: `README.md`, `VALIDATION.md`, `public/js/app.js`,
`server/auth/hash-password.js`, `server/db/student-repository.js`,
`server/routes/students.js`, `server/start-mongo.js`, `server/students/service.js`,
`tests/mongo/essential.mongo.js`, `tests/mongo/demo.mongo.js`,
`tests/unit/student-service.test.js`.

Existing collection/index definitions, legacy files, lockfile and root working
changes were preserved. The connection readiness check now also checks the
department/program/student collections and their indexes; it performs no DDL.

## Limits and setup requirement at that historical checkpoint

This is the verified compliant login/student demo slice, not a migration of every
legacy feature. Tests used disposable synthetic data. A durable local demonstration
at that time still needed an explicitly approved prepared local database,
administrator and academic fixtures; `start:mongo` deliberately never bootstraps those automatically.
Password change/reset, email delivery, exhaustive browser testing, full pagination,
and optional academic features are outside this slice. Real project data and older
manually created records were not inspected or claimed compatible.

## Cleanup completed

After recording the results, ownership was rechecked against the exact container
ID and run label. Only this run's container was stopped and removed. The image tag
was removed only after confirming its exact image ID and that no other container
referenced it. Both tmpfs databases disappeared with the container. No volumes,
host database directories, other containers or unrelated images were removed.

```powershell
docker stop --time 15 e087ca74dbbc68643ed20434e295dd31deb59c24e45bc8b905c18528bcbf3904
docker rm e087ca74dbbc68643ed20434e295dd31deb59c24e45bc8b905c18528bcbf3904
docker image rm mongo:8.0.34-noble
docker ps -a --filter label=io.campus360.test-run=e6ff96f260144a62a5ec28b6444940ac --format '{{.ID}} {{.Names}}'
```

All commands succeeded and the final label query returned no containers. Docker
warned that `--time` is deprecated in favor of `--timeout`; cleanup still succeeded.
At the end of that run, the test HTTP server and clients were closed and Docker
Desktop remained running; this is not a current environment-status check.
`server/start-mongo.js` was syntax checked; the real demo journey exercised the same
app/repository composition directly rather than launching that entry point as a
separate process. No durable local application database had been provisioned at
that historical checkpoint; the later successful setup is noted above.

## Historical setup preparation, before later execution

Before its later approved execution, the local setup script was prepared but not
executed. `node --check scripts/setup-local-demo.js`, its `--plan` mode, and five focused tests in
`tests/unit/demo-setup.test.js` passed without Docker or a database. No additional
full test campaign was run. See LOCAL_DEMO_SETUP.md for the guarded approval
command and required schema/index definitions. Neither these historical results
nor the later setup verify execution of the reconciled worktree.
