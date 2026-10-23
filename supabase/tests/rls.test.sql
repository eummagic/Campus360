begin;
select plan(10);

-- Helper: create test users in auth schema for RLS checks.
insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000001', 'rls-student1@example.com', crypt('password123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000002', 'rls-student2@example.com', crypt('password123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

insert into public.profiles (id, display_name, contact_email)
values
  ('00000000-0000-0000-0000-000000000001', 'RLS Student One', 'rls-student1@example.com'),
  ('00000000-0000-0000-0000-000000000002', 'RLS Student Two', 'rls-student2@example.com');

insert into public.user_roles (user_id, role, scope)
values
  ('00000000-0000-0000-0000-000000000001', 'student', 'demo'),
  ('00000000-0000-0000-0000-000000000002', 'student', 'demo');

-- Anonymous cannot read profiles.
set local role anon;
select is_empty('select * from public.profiles', 'anon cannot read profiles');
reset role;

-- Student 1 can read own profile.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select results_eq(
  'select display_name from public.profiles where id = ''00000000-0000-0000-0000-000000000001''',
  ARRAY['RLS Student One'],
  'student1 can read own profile'
);
reset role;

-- Student 1 cannot read student 2 profile.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select is_empty(
  'select * from public.profiles where id = ''00000000-0000-0000-0000-000000000002''',
  'student1 cannot read student2 profile'
);
reset role;

-- Student 1 can update own profile through RPC.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $$select public.update_my_display_name('Updated Name')$$,
  'student1 can update own display name'
);
reset role;

-- Update persisted and audit event exists.
select results_eq(
  'select display_name from public.profiles where id = ''00000000-0000-0000-0000-000000000001''',
  ARRAY['Updated Name'],
  'display name updated'
);

select results_eq(
  'select action from public.audit_events where actor_id = ''00000000-0000-0000-0000-000000000001'' order by created_at desc limit 1',
  ARRAY['profile.display_name.updated'],
  'audit event recorded'
);

-- Authenticated cannot directly update audit events.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$update public.audit_events set action = 'tampered'$$,
  '42501',
  null,
  'authenticated cannot update audit events'
);
reset role;

-- Authenticated cannot directly delete audit events.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$delete from public.audit_events$$,
  '42501',
  null,
  'authenticated cannot delete audit events'
);

select throws_ok(
  $$select public.record_audit_event('forged', 'profile', null, '{}'::jsonb)$$,
  '42501',
  null,
  'authenticated cannot call internal audit writer'
);

select throws_ok(
  $$update public.profiles set display_name = 'Bypass' where id = '00000000-0000-0000-0000-000000000001'$$,
  '42501',
  null,
  'authenticated cannot bypass the profile RPC'
);

select throws_ok(
  $$select public.update_my_display_name(repeat('x', 121))$$,
  'P0001',
  'profile RPC rejects names over 120 characters'
);
reset role;

select * from finish();
rollback;
