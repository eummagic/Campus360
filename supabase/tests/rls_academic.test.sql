begin;
select plan(33);

insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('10000000-0000-0000-0000-000000000001', 'p2a-admin@example.com', crypt('password123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('10000000-0000-0000-0000-000000000002', 'p2a-teacher@example.com', crypt('password123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('10000000-0000-0000-0000-000000000003', 'p2a-teacher2@example.com', crypt('password123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('10000000-0000-0000-0000-000000000004', 'p2a-student1@example.com', crypt('password123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('10000000-0000-0000-0000-000000000005', 'p2a-student2@example.com', crypt('password123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('10000000-0000-0000-0000-000000000006', 'p2a-driver@example.com', crypt('password123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('10000000-0000-0000-0000-000000000007', 'p2a-multi@example.com', crypt('password123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('10000000-0000-0000-0000-000000000008', 'p2a-student3@example.com', crypt('password123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

insert into public.profiles (id, display_name, contact_email) values
  ('10000000-0000-0000-0000-000000000001', 'Admin', 'p2a-admin@example.com'),
  ('10000000-0000-0000-0000-000000000002', 'Teacher One', 'p2a-teacher@example.com'),
  ('10000000-0000-0000-0000-000000000003', 'Teacher Two', 'p2a-teacher2@example.com'),
  ('10000000-0000-0000-0000-000000000004', 'Student One', 'p2a-student1@example.com'),
  ('10000000-0000-0000-0000-000000000005', 'Student Two', 'p2a-student2@example.com'),
  ('10000000-0000-0000-0000-000000000006', 'Driver', 'p2a-driver@example.com'),
  ('10000000-0000-0000-0000-000000000007', 'Admin Student', 'p2a-multi@example.com'),
  ('10000000-0000-0000-0000-000000000008', 'Unlinked Student', 'p2a-student3@example.com');

insert into public.user_roles (user_id, role, scope) values
  ('10000000-0000-0000-0000-000000000001', 'admin', 'demo'),
  ('10000000-0000-0000-0000-000000000002', 'teacher', 'demo'),
  ('10000000-0000-0000-0000-000000000003', 'teacher', 'demo'),
  ('10000000-0000-0000-0000-000000000004', 'student', 'demo'),
  ('10000000-0000-0000-0000-000000000005', 'student', 'demo'),
  ('10000000-0000-0000-0000-000000000006', 'driver', 'demo'),
  ('10000000-0000-0000-0000-000000000007', 'admin', 'demo'),
  ('10000000-0000-0000-0000-000000000007', 'student', 'demo'),
  ('10000000-0000-0000-0000-000000000008', 'student', 'demo');

insert into public.departments (id, code, name) values
  ('20000000-0000-0000-0000-000000000001', 'RLS_CSE', 'RLS Computer Science');
insert into public.programs (id, department_id, code, name) values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'RLS_BTECH_CSE', 'RLS B.Tech CSE');
insert into public.academic_terms (id, name, status) values
  ('40000000-0000-0000-0000-000000000001', 'RLS 2026 Fall', 'active');
insert into public.subjects (id, program_id, code, name, credits) values
  ('50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'RLS_CS101', 'Data Structures', 4),
  ('50000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', 'RLS_CS102', 'Algorithms', 4);
insert into public.course_offerings (id, subject_id, term_id, section_code) values
  ('60000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'A'),
  ('60000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', 'A');
insert into public.teaching_assignments (teacher_user_id, offering_id) values
  ('10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000001');
insert into public.student_records (id, user_id, registration_number, program_id) values
  ('70000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004', 'RLS_CSE2023001', '30000000-0000-0000-0000-000000000001'),
  ('70000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000005', 'RLS_CSE2023002', '30000000-0000-0000-0000-000000000001'),
  ('70000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000007', 'RLS_CSE2023099', '30000000-0000-0000-0000-000000000001');
insert into public.enrolments (student_record_id, offering_id) values
  ('70000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001'),
  ('70000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000001'),
  ('70000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-000000000002');

set local role anon;
select throws_ok('select * from public.departments', '42501', null, 'anon cannot read reference data');
select throws_ok('select public.is_admin()', '42501', null, 'anon cannot execute authorization helper');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000006","role":"authenticated"}', true);
select is_empty('select * from public.student_records', 'driver cannot read student records');
select is_empty('select * from public.enrolments', 'driver cannot read enrolments');
select results_eq('select code from public.departments where code = ''RLS_CSE''', ARRAY['RLS_CSE'], 'authenticated driver may read reference data');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select results_eq('select registration_number from public.student_records', ARRAY['RLS_CSE2023001'], 'student sees own record');
select results_eq('select count(*)::int from public.enrolments', ARRAY[1], 'student sees own enrolment only');
select is_empty($$select * from public.profiles where id = '10000000-0000-0000-0000-000000000005'$$, 'student cannot read another student profile');
select results_eq('select count(*)::int from public.student_directory', ARRAY[1], 'student directory view exposes own record only');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select results_eq('select registration_number from public.student_records order by registration_number', ARRAY['RLS_CSE2023001', 'RLS_CSE2023002'], 'assigned teacher sees assigned students only');
select results_eq('select display_name from public.profiles where id in (''10000000-0000-0000-0000-000000000004'', ''10000000-0000-0000-0000-000000000005'') order by display_name', ARRAY['Student One', 'Student Two'], 'assigned teacher sees profiles of assigned students');
select results_eq('select count(*)::int from public.enrolments', ARRAY[2], 'assigned teacher sees enrolments for own offering');
select results_eq('select count(*)::int from public.student_directory', ARRAY[2], 'assigned teacher directory view contains assigned students');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select is_empty('select * from public.student_records', 'unassigned teacher sees no student records');
select is_empty('select * from public.enrolments', 'unassigned teacher sees no enrolments');
select results_eq('select count(*)::int from public.student_directory', ARRAY[0], 'unassigned teacher sees empty directory view');
select is_empty('select * from public.list_unlinked_student_users()', 'unassigned teacher receives no candidate PII');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select results_eq('select count(*)::int from public.student_records where registration_number like ''RLS_%''', ARRAY[3], 'admin sees all fixture student records');
select results_eq('select count(*)::int from public.enrolments e join public.student_records sr on sr.id=e.student_record_id where sr.registration_number like ''RLS_%''', ARRAY[3], 'admin sees all fixture enrolments');
select results_eq('select user_id from public.list_unlinked_student_users() where user_id = ''10000000-0000-0000-0000-000000000008''', ARRAY['10000000-0000-0000-0000-000000000008'::uuid], 'admin candidate RPC includes intended unlinked student');
select lives_ok($$update public.departments set name = 'RLS Computer Science and Engineering' where code = 'RLS_CSE'$$, 'admin may update reference data');
select is((select actor_id::text from public.audit_events where action = 'departments.updated' and entity_id = '20000000-0000-0000-0000-000000000001'), null::text, 'academic audit allows null actor for trusted postgres execution');
select lives_ok($$insert into public.student_records (id, user_id, registration_number, program_id) values ('70000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000008', 'RLS_CSE2023003', '30000000-0000-0000-0000-000000000001')$$, 'admin may create a student record');
delete from public.student_records where user_id = '10000000-0000-0000-0000-000000000008';
reset role;
select is((select actor_id::text from public.audit_events where action = 'student_records.created' and entity_id = '70000000-0000-0000-0000-000000000004'), '10000000-0000-0000-0000-000000000001', 'student record audit records admin actor');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select lives_ok($$update public.student_records set status = 'graduated' where id = '70000000-0000-0000-0000-000000000001'$$, 'teacher update statement executes only against scoped records');
select results_eq('select status from public.student_records where id = ''70000000-0000-0000-0000-000000000001''', ARRAY['active'], 'teacher update does not change student record');
select throws_ok($$insert into public.student_records (user_id, registration_number, program_id) values ('10000000-0000-0000-0000-000000000008', 'HACK', '30000000-0000-0000-0000-000000000001')$$, '42501', null, 'teacher cannot insert student records');
select throws_ok($$insert into public.teaching_assignments (teacher_user_id, offering_id) values ('10000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-000000000001')$$, '42501', null, 'teacher cannot create teaching assignments');
select throws_ok($$insert into public.audit_events (actor_id, action, entity_type) values ('10000000-0000-0000-0000-000000000002', 'forged', 'student_records')$$, '42501', null, 'teacher cannot forge audit events');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000007","role":"authenticated"}', true);
select results_eq('select count(*)::int from public.student_records where registration_number like ''RLS_%''', ARRAY[3], 'multi-role admin can read admin-scoped data');
select results_eq('select registration_number from public.student_directory where user_id = auth.uid()', ARRAY['RLS_CSE2023099'], 'multi-role student still has an own-record row');
reset role;

select ok(not has_function_privilege('anon', 'public.list_unlinked_student_users()', 'EXECUTE'), 'anon does not have execute permission for candidate RPC');
select ok(has_function_privilege('authenticated', 'public.list_unlinked_student_users()', 'EXECUTE'), 'authenticated role can invoke internally guarded candidate RPC');

select * from finish();
rollback;
