begin;
select plan(32);

insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('80000000-0000-0000-0000-000000000001', 'stagec-admin@example.test', crypt('test', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('80000000-0000-0000-0000-000000000002', 'stagec-teacher@example.test', crypt('test', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('80000000-0000-0000-0000-000000000003', 'stagec-teacher2@example.test', crypt('test', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('80000000-0000-0000-0000-000000000004', 'stagec-student@example.test', crypt('test', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('80000000-0000-0000-0000-000000000005', 'stagec-student2@example.test', crypt('test', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

insert into public.profiles (id, display_name, contact_email) values
  ('80000000-0000-0000-0000-000000000001', 'Stage C Admin', 'stagec-admin@example.test'),
  ('80000000-0000-0000-0000-000000000002', 'Stage C Teacher', 'stagec-teacher@example.test'),
  ('80000000-0000-0000-0000-000000000003', 'Stage C Teacher Two', 'stagec-teacher2@example.test'),
  ('80000000-0000-0000-0000-000000000004', 'Stage C Student', 'stagec-student@example.test'),
  ('80000000-0000-0000-0000-000000000005', 'Stage C Student Two', 'stagec-student2@example.test');

insert into public.user_roles (user_id, role, scope) values
  ('80000000-0000-0000-0000-000000000001', 'admin', 'test'),
  ('80000000-0000-0000-0000-000000000002', 'teacher', 'test'),
  ('80000000-0000-0000-0000-000000000003', 'teacher', 'test'),
  ('80000000-0000-0000-0000-000000000004', 'student', 'test'),
  ('80000000-0000-0000-0000-000000000005', 'student', 'test');

insert into public.departments (id, code, name) values ('81000000-0000-0000-0000-000000000001', 'STAGEC', 'Stage C Test Department');
insert into public.programs (id, department_id, code, name) values ('82000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000001', 'STAGEC', 'Stage C Test Program');
insert into public.academic_terms (id, name, starts_on, ends_on, status) values ('83000000-0000-0000-0000-000000000001', 'Stage C Test Term', '2026-08-01', '2026-08-31', 'active');
insert into public.subjects (id, program_id, code, name) values
  ('84000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000001', 'STC101', 'Stage C One'),
  ('84000000-0000-0000-0000-000000000002', '82000000-0000-0000-0000-000000000001', 'STC102', 'Stage C Two'),
  ('84000000-0000-0000-0000-000000000003', '82000000-0000-0000-0000-000000000001', 'STC103', 'Stage C Three');
insert into public.course_offerings (id, subject_id, term_id, section_code) values
  ('85000000-0000-0000-0000-000000000001', '84000000-0000-0000-0000-000000000001', '83000000-0000-0000-0000-000000000001', 'A'),
  ('85000000-0000-0000-0000-000000000002', '84000000-0000-0000-0000-000000000002', '83000000-0000-0000-0000-000000000001', 'A'),
  ('85000000-0000-0000-0000-000000000003', '84000000-0000-0000-0000-000000000003', '83000000-0000-0000-0000-000000000001', 'A');
insert into public.teaching_assignments (teacher_user_id, offering_id) values
  ('80000000-0000-0000-0000-000000000002', '85000000-0000-0000-0000-000000000001'),
  ('80000000-0000-0000-0000-000000000003', '85000000-0000-0000-0000-000000000002');
insert into public.student_records (id, user_id, registration_number, program_id) values
  ('86000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000004', 'STAGEC001', '82000000-0000-0000-0000-000000000001'),
  ('86000000-0000-0000-0000-000000000002', '80000000-0000-0000-0000-000000000005', 'STAGEC002', '82000000-0000-0000-0000-000000000001');
insert into public.enrolments (student_record_id, offering_id) values
  ('86000000-0000-0000-0000-000000000001', '85000000-0000-0000-0000-000000000001'),
  ('86000000-0000-0000-0000-000000000002', '85000000-0000-0000-0000-000000000001');
insert into public.timetable_entries (id, offering_id, term_id, weekday, start_time, end_time, location, created_by, updated_by) values
  ('87000000-0000-0000-0000-000000000001', '85000000-0000-0000-0000-000000000001', '83000000-0000-0000-0000-000000000001', 1, '09:00', '10:00', 'Room A', '80000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000001'),
  ('87000000-0000-0000-0000-000000000002', '85000000-0000-0000-0000-000000000002', '83000000-0000-0000-0000-000000000001', 1, '09:00', '10:00', 'Room B', '80000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000001');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"80000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok($$insert into public.timetable_entries (offering_id, term_id, weekday, start_time, end_time, location, created_by, updated_by) values ('85000000-0000-0000-0000-000000000003', '83000000-0000-0000-0000-000000000001', 1, '09:30', '10:30', 'room a', auth.uid(), auth.uid())$$, '23P01', null, 'database prevents overlapping room schedules');
select throws_ok($$insert into public.teaching_assignments (teacher_user_id, offering_id) values ('80000000-0000-0000-0000-000000000002', '85000000-0000-0000-0000-000000000002')$$, '23P01', null, 'database prevents a teacher overlap across offerings');
select throws_ok($$insert into public.assignments (offering_id, title, due_at, created_by) values ('85000000-0000-0000-0000-000000000001', 'Admin-created', '2026-08-04T12:00:00Z', auth.uid())$$, '42501', null, 'admin has no assignment mutation permission');
select throws_ok($$insert into public.timetable_entries (offering_id, term_id, weekday, start_time, end_time, created_by, updated_by) values ('85000000-0000-0000-0000-000000000003', '83000000-0000-0000-0000-000000000001', 1, '10:00', '10:00', auth.uid(), auth.uid())$$, '23514', null, 'database rejects a zero-length class');
reset role;

set local role anon;
select throws_ok('select * from public.timetable_entries', '42501', null, 'anonymous cannot read timetable');
select ok(not has_function_privilege('anon', 'public.mark_attendance_for_session(uuid,date,jsonb)', 'EXECUTE'), 'anonymous cannot execute attendance RPC');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"80000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select results_eq('select count(*)::int from public.timetable_entries', ARRAY[1], 'teacher sees only assigned timetable entries');
select lives_ok($$insert into public.assignments (offering_id, title, due_at, status, created_by) values ('85000000-0000-0000-0000-000000000001', 'Published Test', '2026-08-04T12:00:00Z', 'published', auth.uid())$$, 'assigned teacher can create an assignment');
select lives_ok($$insert into public.assignments (offering_id, title, due_at, status, created_by) values ('85000000-0000-0000-0000-000000000001', 'Draft Test', '2026-08-05T12:00:00Z', 'draft', auth.uid())$$, 'assigned teacher can save an assignment draft');
select throws_ok($$insert into public.assignments (offering_id, title, due_at, status, created_by) values ('85000000-0000-0000-0000-000000000002', 'Other class', '2026-08-05T12:00:00Z', 'draft', auth.uid())$$, '42501', null, 'teacher cannot create an assignment for an unassigned offering');
select throws_ok($$select public.mark_attendance_for_session('87000000-0000-0000-0000-000000000001', '2026-08-04', '[{"student_record_id":"86000000-0000-0000-0000-000000000001","status":"present"}]'::jsonb)$$, '23514', null, 'attendance session date must match the scheduled weekday');
select throws_ok($$select public.mark_attendance_for_session('87000000-0000-0000-0000-000000000002', '2026-08-03', '[{"student_record_id":"86000000-0000-0000-0000-000000000001","status":"present"}]'::jsonb)$$, '42501', null, 'teacher cannot mark attendance for an unassigned offering');
select lives_ok($$select public.mark_attendance_for_session('87000000-0000-0000-0000-000000000001', '2026-08-03', '[{"student_record_id":"86000000-0000-0000-0000-000000000001","status":"present"},{"student_record_id":"86000000-0000-0000-0000-000000000002","status":"absent"}]'::jsonb)$$, 'assigned teacher can atomically mark the enrolled roster');
select lives_ok($$select public.mark_attendance_for_session('87000000-0000-0000-0000-000000000001', '2026-08-03', '[{"student_record_id":"86000000-0000-0000-0000-000000000001","status":"late"},{"student_record_id":"86000000-0000-0000-0000-000000000002","status":"absent"}]'::jsonb)$$, 'repeated marking updates existing attendance rows');
select results_eq('select count(*)::int from public.attendance_sessions', ARRAY[1], 'repeated marking reuses the same class session');
select results_eq('select count(*)::int from public.attendance_records', ARRAY[2], 'one attendance row exists per enrolled student and session');
select throws_ok($$update public.attendance_records set student_record_id = '86000000-0000-0000-0000-000000000002' where student_record_id = '86000000-0000-0000-0000-000000000001'$$, '42501', null, 'teacher cannot reassign an attendance row to another student');
select throws_ok($$select public.mark_attendance_for_session('87000000-0000-0000-0000-000000000001', '2026-08-03', '[{"student_record_id":"86000000-0000-0000-0000-000000000001","status":"present"},{"student_record_id":"86000000-0000-0000-0000-000000000003","status":"present"}]'::jsonb)$$, '22023', null, 'teacher cannot mark a student outside the roster');
select results_eq('select count(*)::int from public.attendance_records', ARRAY[2], 'invalid roster submission rolls back without partial marks');
select throws_ok($$insert into public.timetable_entries (offering_id, term_id, weekday, start_time, end_time, created_by, updated_by) values ('85000000-0000-0000-0000-000000000001', '83000000-0000-0000-0000-000000000001', 2, '09:00', '10:00', auth.uid(), auth.uid())$$, '42501', null, 'teacher cannot manage institution timetable');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"80000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select results_eq('select count(*)::int from public.timetable_entries', ARRAY[1], 'student sees only an enrolled offering timetable');
select results_eq('select count(*)::int from public.attendance_records', ARRAY[1], 'student sees own attendance marks only');
select results_eq('select status from public.attendance_records', ARRAY['late'], 'student sees the latest saved mark');
select results_eq('select count(*)::int from public.my_attendance_summary()', ARRAY[1], 'student summary reports only own recorded attendance');
select results_eq('select status from public.my_attendance_history(50, 0)', ARRAY['late'], 'student history is scoped and ordered by saved session date');
select is_empty($$select * from public.assignments where status = 'draft'$$, 'student cannot see draft assignments');
select results_eq($$select title from public.assignments where status = 'published'$$, ARRAY['Published Test'], 'student sees published assignments for enrolled offerings');
select throws_ok($$select public.mark_attendance_for_session('87000000-0000-0000-0000-000000000001', '2026-08-03', '[{"student_record_id":"86000000-0000-0000-0000-000000000001","status":"absent"}]'::jsonb)$$, '42501', null, 'student cannot mark attendance');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"80000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select results_eq('select count(*)::int from public.scoped_attendance_summary() where offering_id = ''85000000-0000-0000-0000-000000000001''', ARRAY[1], 'admin sees the test offering in institution-level summaries');
select results_eq('select count(*)::int from public.offering_attendance_by_student(''85000000-0000-0000-0000-000000000001'')', ARRAY[2], 'admin can view offering roster attendance counts');
select lives_ok($$update public.attendance_records set status = 'present' where student_record_id = '86000000-0000-0000-0000-000000000001'$$, 'admin attendance update statement is safely scoped by RLS');
select results_eq('select status from public.attendance_records where student_record_id = ''86000000-0000-0000-0000-000000000001''', ARRAY['late'], 'admin report access does not grant attendance mutation');
reset role;

select * from finish();
rollback;
