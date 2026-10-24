# Campus360 security matrix — Phase 2A

The authoritative access rules are in `supabase/migrations/0001_initial.sql` and `supabase/migrations/0002_academic_foundation.sql`. Server pages and actions repeat authorization checks; RLS and database grants enforce access if a request bypasses the UI.

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

The reference-data tables are readable by authenticated users by design. Student PII is present only in the scoped student directory and profile rows, where RLS still applies. The directory view uses `security_invoker = true` and therefore does not bypass underlying policies.

All authorization helper functions use `SECURITY DEFINER` with an empty `search_path`, qualify database objects, revoke default `PUBLIC`/`anon` execution, and grant only the execution needed by authenticated RLS evaluation. The candidate RPC repeats an admin check internally. Academic-table triggers write audit rows with the authenticated actor (or null for trusted service-role seed writes), without copying row contents into audit metadata.

The service-role key is used only by local development seed scripts. It is not referenced by browser code, Server Components, or Server Actions. Keep it out of `NEXT_PUBLIC_*` variables and never commit it.
