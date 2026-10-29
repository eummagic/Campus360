# Timetable integration handoff — October 29, 2026

Status: source-inspected contract at published Stage 3B a00a15b, with local
cleanup/browser-safety fixes pending review. No timetable API was added. No live
MongoDB, browser, Docker or environment-file inspection was performed.

## Existing endpoints the UI may actually use

| Endpoint | Response (relevant fields) | Access / limitations |
|---|---|---|
| GET /api/auth/session | {user:{id,email,displayName},roles:[{role,scope}],expiresAt,csrfToken} | Verified session; 401 expired/anonymous; 503 missing auth/repository. Never print tokens. |
| GET /api/portal | {canManageStudents,canViewStudent} | Authenticated; only registered with auth + student service. Not a timetable authorization grant. |
| GET /api/admin/academics/overview | {departments:[{id,code,name,status}],programs:[{id,departmentId,code,name,status}],otherCollections:[{name,status}]} | Exact configured administrator scope. otherCollections status is not_provisioned or not_included; the latter means presence only, not readiness or timetable availability. |
| GET /api/admin/academics/terms?offset=0 | {records:[{id,name,starts_on,ends_on,status}],offset,hasMore} | Same scoped admin policy; 50 rows/page, offset 0–1000; missing/incompatible schema is 503. |
| GET /api/admin/academics/subjects?offset=0 | {records:[{id,program_id,code,name,credits,status}],offset,hasMore} | Same policy/limits. No offering/schedule join. |
| GET /api/directory/:recordId | {student,enrolments,enrolmentStatus,missingCollections} | Scoped admin or own student only; teacher denied. Enrolments contain id,offeringId,section,subjectCode,subjectName,credits,term,enrolledAt. They do NOT contain timetable slots. Missing academic collections yield enrolmentStatus:not_provisioned, not a real empty timetable. |
| GET /api/student/me | {student} | Own student profile in configured scope; no schedule data. |

Terms/subjects also have protected POST operations, but a read-only calendar UI
must not call them as a data bootstrap. Their existing forms remain separate.
Public HTML shells never authorize API reads. Every future timetable API must
obtain identity, roles, scope and memberships from verified server-side state.

## What does not exist in compliant/

No timetable/calendar route, timetable repository/service/access policy, offering
listing, teaching-assignment listing or enrolment-management endpoint is registered.
Legacy Next.js pages/Server Actions/data functions are references, not HTTP APIs
available to the compliant UI. No general calendar-event collection is defined in
the 16 application definitions; recurring schedules are not dated event records.

A request to a nonexistent /api/timetable route may receive 401 through the
existing /api authentication router before reaching 404; an authenticated unknown
route reaches 404. Never interpret either result as an empty schedule. A 403 from
admin overview is not evidence of missing timetable data for a student/teacher.

Safe UI now: implement layout/date navigation and an explicitly unavailable data
adapter. Keep synthetic rendering fixtures in tests only. Do not fabricate a
production endpoint or use student enrolments as recurring timetable slots.

## Exact existing data model and dependencies

Timetable records require offering_id, term_id, weekday (BSON int 1–7), start_minute
(int 0–1439), end_minute (int 1–1440), nullable location/location_key (1–100),
created_by/updated_by ObjectIds and created_at/updated_at Dates. Validator requires
end_minute > start_minute and rejects additional fields. Legacy weekday convention
is Monday=1 through Sunday=7; times are recurring local wall-clock minutes, not UTC
instants. Preserve 1440 as end-of-day. Campus timezone and date-boundary rules must
be explicitly agreed before dated-event integration; no timezone field exists here.

Required timetable indexes (none unique):

- timetable_entries_term_day_time_idx: term_id,weekday,start_minute,end_minute (all 1).
- timetable_entries_offering_idx: offering_id:1.
- timetable_entries_term_day_location_idx: term_id,weekday,location_key (all 1).

References: timetable_entries -> course_offerings -> subjects/programs and
academic_terms; entry.term_id must agree with offering.term_id. Student visibility
requires enrolments -> student_records -> authenticated user; teacher visibility
requires teaching_assignments -> authenticated user. Legacy intent is admin all,
teacher assigned offerings, student enrolled offerings, active terms. This is NOT
an implemented compliant timetable policy. Adapt it to exact configured scopes,
fresh role/membership checks, strict ObjectIds and bounded queries; never infer
permission from client-supplied user/offering IDs or role names alone.

Stage 3A includes five academic collections but does NOT include timetable_entries.
Those five collections, their indexes and linked records must be reviewed first;
then timetable provisioning needs its own approval. No collection existence or data
completeness was established in this task. Existing unique indexes do not prevent
room/teacher/offering time overlaps. Legacy timetable writes used a locks document
and transaction conflict checks; write support requires a separate concurrency,
audit and attendance-dependency design. It is outside the first read-only endpoint.

## Future API/state agreement — proposal only, not implemented

Agree a bounded, authenticated read-only weekly endpoint and allowlisted DTO
including slot ID, weekday/minutes, location, offering/subject/section and term
bounds. Enforce audience membership BEFORE selecting records, validate linked
references, and never silently skip broken links. Reuse the native driver only.

- ready + records: authorized linked slots returned.
- ready + empty array: schema validated and the authorized date range queried;
  only then show a real empty state.
- not provisioned/incompatible schema: safe non-success response with a distinct
  documented state; show unavailable, never silently convert to [].
- 401: sign in; 403: access denied; 5xx/network/malformed response: unavailable.

Before integration: authorize isolated MongoDB fixtures; test visibility, term
bounds, bad references, schema refusal and empty-vs-unconfigured behavior. Agree
DTO/status codes with the other PC before it binds a production fetch call.
