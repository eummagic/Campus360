# Durable local demo setup — historical setup reference

Durable local demo setup completed successfully in the earlier checkout. This
reconciled worktree is a separate copy: its `.env.demo` and dependencies have not
been provisioned, and it has not been executed. Do not automatically copy secrets
or initialize a database to configure this copy. Any configuration or dependency
setup requires separate approval.

## Exact proposed target and command

From this worktree's `compliant/` directory
(`D:\COLLEGE\Campus360-reconciliation\compliant`), the database-free plan command is:

```powershell
node scripts/setup-local-demo.js --plan
```

The one-time initialization command below is retained for historical reference.
It is not a reconciliation setup step and must not be rerun for the existing demo
resources. Fresh initialization requires separate explicit approval:

```powershell
node scripts/setup-local-demo.js --execute --database campus360_demo_20261029_4f9c2b18 --admin-email demo.admin@example.test
```

- Database: `campus360_demo_20261029_4f9c2b18`.
- Container: `campus360-demo-20261029-4f9c2b18`.
- New named volume: `campus360-demo-20261029-4f9c2b18-data` at `/data/db`.
- `/data/configdb`: tmpfs; no anonymous volume or host-directory mounts.
- Official image: `mongo:8.0.34-noble`; downloaded only if absent during execution.
- Replica set: `campus360-demo-rs`, one member at `localhost:27017` inside Docker.
- Only host binding: `127.0.0.1:27028` → container 27017.
- Resource caps: 2 GiB / 2 CPUs; restart policy `unless-stopped`.
- Application origin: `http://127.0.0.1:3001`; role scope: `demo`.

The script prompts twice for a new administrator password without echoing it.
There is no default password, password argument, password environment variable,
or plaintext password file. It calls the existing `server/auth/hash-password.js`:
random 16-byte salt encoded as hex text, scrypt N=16384/r=16/p=1, 64-byte key,
NFKC normalization, and the already verified `saltHex:keyHex` representation.
It does not change any existing hashes.

On success, it writes the ignored `compliant/.env.demo` with configuration only:

```text
MONGODB_URI=mongodb://127.0.0.1:27028/?replicaSet=campus360-demo-rs&directConnection=true
MONGODB_DB=campus360_demo_20261029_4f9c2b18
APP_ORIGIN=http://127.0.0.1:3001
ALLOW_INSECURE_LOOPBACK=true
ADMIN_SCOPE=demo
```

Then run `npm run start:demo`. This explicitly reads only `.env.demo` inside
`compliant/` and uses the existing local entry point; it performs no initialization.
No root environment file, Atlas, remote Docker endpoint or arbitrary URI is used.
This is a loopback-only demonstration configuration; use synthetic demo data.

## Exact required collections and fields

`--plan` prints all seven **complete** validators (including required arrays,
nullability, patterns and lifetime expression) and all fifteen explicit indexes.
Definitions are imported directly from the current JavaScript schema modules.
The nine collections below are exactly those required by `start:mongo`:

| Collection | Fields supplied or required |
| --- | --- |
| user | No existing database validator. ObjectId `_id`; strings `name`, normalized `email`; boolean `emailVerified:false`; Dates `createdAt`, `updatedAt`. |
| account | No existing database validator. ObjectId `_id`, `userId`; strings `accountId` (user hex ID), `providerId:"credential"`, hashed `password`; Dates `createdAt`, `updatedAt`. |
| profiles | ObjectId `_id` equals user ID; required `display_name` string 1–120, `contact_email` string 3–320 or null, Dates `created_at`, `updated_at`. |
| user_roles | ObjectId `_id`; required ObjectId `user_id`, role enum student/teacher/admin/driver/finance, string 1–64 or null `scope`, Date `assigned_at`, ObjectId or null `assigned_by`. Bootstrap: admin/demo/null assigned_by. |
| audit_events | ObjectId `_id`; required ObjectId or null `actor_id`, string `action` 1–120, string `entity_type` 1–64, ObjectId or null `entity_id`, object `metadata`, Date `created_at`. |
| departments | ObjectId `_id`; required nonblank `code` string 1–16, `name` string 1–200, status active/inactive, Dates `created_at`, `updated_at`. |
| programs | ObjectId `_id`; required ObjectId `department_id`, nonblank `code` string 1–32, `name` string 1–200, status active/inactive, Dates `created_at`, `updated_at`. |
| student_records | ObjectId `_id`; required ObjectId `user_id`, nonblank `registration_number` string 1–40, ObjectId `program_id`, status active/inactive/graduated, Dates `created_at`, `updated_at`. Initially empty. |
| app_sessions | All six fields required: ObjectId `_id`, `user_id`; lowercase 64-hex `token_hash`; canonical 43-character base64url `csrf_token`; Dates `created_at`, `expires_at`. Positive lifetime at most 28,800,000 ms. Initially empty. |

All seven application/session validators reject additional properties; nonblank
patterns and BSON types are preserved exactly. No new validator is invented for
user/account. The unused Better Auth session/verification collections and other
academic collections are not needed for this demo. All 16 original application
definitions remain unchanged; only their required subset is created in the new DB.

### All fifteen explicit indexes

Each collection also receives MongoDB's normal unique `_id_` index.

| Collection / index | Ordered keys | Options |
| --- | --- | --- |
| user / auth_user_email_uq | email:1 | unique:true |
| account / auth_account_user_idx | userId:1 | none |
| account / auth_account_provider_uq | providerId:1, accountId:1 | unique:true |
| user_roles / user_roles_user_role_scope_uq | user_id:1, role:1, scope:1 | unique:true |
| audit_events / audit_events_actor_idx | actor_id:1, created_at:-1 | none |
| audit_events / audit_events_entity_idx | entity_type:1, entity_id:1, created_at:-1 | none |
| departments / departments_code_uq | code:1 | unique:true |
| programs / programs_department_code_uq | department_id:1, code:1 | unique:true |
| student_records / student_records_user_uq | user_id:1 | unique:true |
| student_records / student_records_registration_uq | registration_number:1 | unique:true |
| student_records / student_records_program_idx | program_id:1 | none |
| student_records / student_records_status_idx | status:1 | none |
| app_sessions / app_sessions_token_hash_uq | token_hash:1 | unique:true |
| app_sessions / app_sessions_user_idx | user_id:1 | none |
| app_sessions / app_sessions_expires_ttl | expires_at:1 | expireAfterSeconds:0 |

## Refusal rules and initial records

Before creating storage, execution checks a local Docker socket/Linux engine,
unused exact container/volume names, free loopback port, and no `.env.demo` file.
A fresh nonce labels the new volume and container. Image/volume ownership, exact
container ID, loopback binding and both mount types are verified before bootstrap.
Replica-set bootstrap touches only this newly created owned volume. Before any
application DDL or records, the server must be the intended primary, contain no
non-system databases, and have no target database or target collections.

DDL is create-only: no collMod, update, upsert, delete, drop or legacy script.
Seven initial records are inserted sequentially in one transaction: one user,
credential account, profile, admin role in scope demo, active Computer Science
department, active BCA/Computer Applications program, and one demo.initialized audit
event. No students, sessions or unrelated records are preloaded.

Existing resources/databases/configuration cause refusal, never overwrite or
repair. Partial failures preserve resources for inspection; there is no automatic
destructive cleanup or retry. Do not rerun against a partially prepared target.

Before the earlier setup execution, syntax, dry-run and five focused database-free
guard checks passed. Setup subsequently completed successfully in the earlier
checkout; this is not verification of the reconciled worktree. Academic schema
preparation remains incomplete and fail-closed; this document does not establish
that the additional academic collections have been provisioned.
