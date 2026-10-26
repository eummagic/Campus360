# Campus360 security matrix

Since the MongoDB migration, the authoritative access rules are in `src/lib/data/core.ts` (`getAccess`, `readableOfferingIds`, `readableStudentRecordIds`) and the query functions in `src/lib/data/campus.ts` and `src/lib/academics.ts`. MongoDB has no row-level security, so every read and write goes through this server-only data layer; pages and Server Actions also check the verified Better Auth session and required role. `pnpm db:mongo:verify-app` checks the matrix below against the running app.

| Data | Student | Assigned teacher | Unassigned teacher | Admin | Driver/finance | Anonymous |
|---|---|---|---|---|---|---|
| Departments, programs, terms, subjects, course offerings | Read | Read | Read | Read/write | Read | No access |
| Teaching assignments | Own enrolled offerings | Own assignments | No rows | Read/write | No rows | No access |
| Student records and directory view | Own record | Students enrolled in own offerings | No rows | All records | No rows | No access |
| Enrolments | Own | Own assigned offerings | No rows | All | No rows | No access |
| Timetable entries | Enrolled offerings | Assigned offerings | No rows | All | No rows | No access |
| Attendance records | Own marks only | Assigned offering roster | No rows | Institution summaries | No rows | No access |
| Assignments | Published enrolled offerings | Assignments the teacher created for assigned offerings | No rows | Institution read | No rows | No access |
| Profiles | Own | Profiles of assigned students | Own only | All profiles | Own only | No access |
| Academic audit writes | No direct access | No direct access | No direct access | Triggered atomically by table changes | No direct access | No access |
| `list_unlinked_student_users()` | Empty result | Empty result | Empty result | Unlinked student accounts only | Empty result | No execute access |

Reference data (departments, programs, terms, subjects, offerings) is readable by any signed-in user by design. Student PII is returned only through the scoped directory and profile functions.

Writes run inside MongoDB transactions and append an `audit_events` row (actor, action, entity) in the same transaction; audit rows are never updated or deleted by the app. Collection-level `$jsonSchema` validators reject malformed or unexpected fields, and unique indexes block duplicates.

Database credentials live only in `.env.local` (never committed). The app uses the `campus360_app` user (readWrite on `campus360` only); the `campus360_admin` user is used only by the setup scripts. Neither is ever exposed to the browser or put in `NEXT_PUBLIC_*` variables.
