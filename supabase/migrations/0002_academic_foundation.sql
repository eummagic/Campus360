-- Phase 2A academic structure. Forward-only; preserve 0001_initial.sql.

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (char_length(btrim(code)) between 1 and 16),
  name text not null check (char_length(btrim(name)) between 1 and 200),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.programs (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete restrict,
  code text not null check (char_length(btrim(code)) between 1 and 32),
  name text not null check (char_length(btrim(name)) between 1 and 200),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (department_id, code)
);

create table public.academic_terms (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(btrim(name)) between 1 and 80),
  starts_on date,
  ends_on date,
  status text not null default 'planned' check (status in ('planned', 'active', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (starts_on is null or ends_on is null or starts_on <= ends_on)
);

create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete restrict,
  code text not null check (char_length(btrim(code)) between 1 and 32),
  name text not null check (char_length(btrim(name)) between 1 and 200),
  credits integer check (credits is null or credits between 0 and 60),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (program_id, code)
);

create table public.course_offerings (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects(id) on delete restrict,
  term_id uuid not null references public.academic_terms(id) on delete restrict,
  section_code text not null check (char_length(btrim(section_code)) between 1 and 16),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (subject_id, term_id, section_code)
);

create table public.teaching_assignments (
  id uuid primary key default gen_random_uuid(),
  teacher_user_id uuid not null references auth.users(id) on delete cascade,
  offering_id uuid not null references public.course_offerings(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references auth.users(id) on delete set null,
  unique (teacher_user_id, offering_id)
);

create table public.student_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  registration_number text not null unique
    check (char_length(btrim(registration_number)) between 1 and 40),
  program_id uuid not null references public.programs(id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'inactive', 'graduated')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.enrolments (
  id uuid primary key default gen_random_uuid(),
  student_record_id uuid not null references public.student_records(id) on delete cascade,
  offering_id uuid not null references public.course_offerings(id) on delete cascade,
  enrolled_at timestamptz not null default now(),
  unique (student_record_id, offering_id)
);

create index programs_department_idx on public.programs (department_id);
create index subjects_program_idx on public.subjects (program_id);
create index course_offerings_subject_idx on public.course_offerings (subject_id);
create index course_offerings_term_idx on public.course_offerings (term_id);
create index teaching_assignments_teacher_idx on public.teaching_assignments (teacher_user_id);
create index teaching_assignments_offering_idx on public.teaching_assignments (offering_id);
create index student_records_program_idx on public.student_records (program_id);
create index student_records_status_idx on public.student_records (status);
create index enrolments_student_idx on public.enrolments (student_record_id);
create index enrolments_offering_idx on public.enrolments (offering_id);

-- Explicit table grants; RLS policies below remain the row-level boundary.
revoke all on public.departments, public.programs, public.academic_terms,
  public.subjects, public.course_offerings, public.teaching_assignments,
  public.student_records, public.enrolments from public, anon;
grant select, insert, update, delete on public.departments, public.programs,
  public.academic_terms, public.subjects, public.course_offerings,
  public.teaching_assignments, public.student_records, public.enrolments
  to authenticated;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;

create trigger set_updated_at_departments before update on public.departments
  for each row execute function public.set_updated_at();
create trigger set_updated_at_programs before update on public.programs
  for each row execute function public.set_updated_at();
create trigger set_updated_at_academic_terms before update on public.academic_terms
  for each row execute function public.set_updated_at();
create trigger set_updated_at_subjects before update on public.subjects
  for each row execute function public.set_updated_at();
create trigger set_updated_at_course_offerings before update on public.course_offerings
  for each row execute function public.set_updated_at();
create trigger set_updated_at_student_records before update on public.student_records
  for each row execute function public.set_updated_at();
revoke all on function public.set_updated_at() from public, anon, authenticated;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.is_teacher_of_offering(p_offering_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.teaching_assignments
    where offering_id = p_offering_id and teacher_user_id = auth.uid()
  );
$$;

create or replace function public.is_teacher_of_student(p_student_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.student_records sr
    join public.enrolments e on e.student_record_id = sr.id
    join public.teaching_assignments ta on ta.offering_id = e.offering_id
    where sr.user_id = p_student_user_id and ta.teacher_user_id = auth.uid()
  );
$$;

create or replace function public.is_student_in_offering(p_offering_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.enrolments e
    join public.student_records sr on sr.id = e.student_record_id
    where e.offering_id = p_offering_id and sr.user_id = auth.uid()
  );
$$;

revoke all on function public.is_admin() from public, anon;
revoke all on function public.is_teacher_of_offering(uuid) from public, anon;
revoke all on function public.is_teacher_of_student(uuid) from public, anon;
revoke all on function public.is_student_in_offering(uuid) from public, anon;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_teacher_of_offering(uuid) to authenticated;
grant execute on function public.is_teacher_of_student(uuid) to authenticated;
grant execute on function public.is_student_in_offering(uuid) to authenticated;

alter table public.departments enable row level security;
alter table public.programs enable row level security;
alter table public.academic_terms enable row level security;
alter table public.subjects enable row level security;
alter table public.course_offerings enable row level security;
alter table public.teaching_assignments enable row level security;
alter table public.student_records enable row level security;
alter table public.enrolments enable row level security;

-- Authenticated users may read reference data; RLS restricts writes to admins.
create policy departments_select_authenticated on public.departments
  for select to authenticated using (true);
create policy departments_admin_write on public.departments
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy programs_select_authenticated on public.programs
  for select to authenticated using (true);
create policy programs_admin_write on public.programs
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy academic_terms_select_authenticated on public.academic_terms
  for select to authenticated using (true);
create policy academic_terms_admin_write on public.academic_terms
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy subjects_select_authenticated on public.subjects
  for select to authenticated using (true);
create policy subjects_admin_write on public.subjects
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy course_offerings_select_authenticated on public.course_offerings
  for select to authenticated using (true);
create policy course_offerings_admin_write on public.course_offerings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy teaching_assignments_select_own_teacher on public.teaching_assignments
  for select to authenticated using (teacher_user_id = auth.uid());
create policy teaching_assignments_select_student on public.teaching_assignments
  for select to authenticated using (public.is_student_in_offering(offering_id));
create policy teaching_assignments_select_admin on public.teaching_assignments
  for select to authenticated using (public.is_admin());
create policy teaching_assignments_admin_write on public.teaching_assignments
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy student_records_select_self on public.student_records
  for select to authenticated using (user_id = auth.uid());
create policy student_records_select_teacher on public.student_records
  for select to authenticated using (public.is_teacher_of_student(user_id));
create policy student_records_select_admin on public.student_records
  for select to authenticated using (public.is_admin());
create policy student_records_admin_insert on public.student_records
  for insert to authenticated with check (public.is_admin());
create policy student_records_admin_update on public.student_records
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy student_records_admin_delete on public.student_records
  for delete to authenticated using (public.is_admin());

create policy enrolments_select_self on public.enrolments
  for select to authenticated using (
    exists (
      select 1 from public.student_records sr
      where sr.id = student_record_id and sr.user_id = auth.uid()
    )
  );
create policy enrolments_select_teacher on public.enrolments
  for select to authenticated using (public.is_teacher_of_offering(offering_id));
create policy enrolments_select_admin on public.enrolments
  for select to authenticated using (public.is_admin());
create policy enrolments_admin_write on public.enrolments
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Additive policies preserve Phase 1 self-read and write restrictions.
create policy profiles_select_teacher on public.profiles
  for select to authenticated using (public.is_teacher_of_student(id));
create policy profiles_select_admin on public.profiles
  for select to authenticated using (public.is_admin());

create or replace function public.audit_academic_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_action text;
  v_entity_id uuid;
begin
  if tg_op = 'INSERT' then
    v_action := tg_table_name || '.created';
    v_entity_id := new.id;
  elsif tg_op = 'UPDATE' then
    v_action := tg_table_name || '.updated';
    v_entity_id := new.id;
  else
    v_action := tg_table_name || '.deleted';
    v_entity_id := old.id;
  end if;

  insert into public.audit_events (actor_id, action, entity_type, entity_id, metadata)
  values (v_actor, v_action, tg_table_name, v_entity_id, '{}'::jsonb);

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger audit_departments after insert or update or delete on public.departments
  for each row execute function public.audit_academic_change();
create trigger audit_programs after insert or update or delete on public.programs
  for each row execute function public.audit_academic_change();
create trigger audit_academic_terms after insert or update or delete on public.academic_terms
  for each row execute function public.audit_academic_change();
create trigger audit_subjects after insert or update or delete on public.subjects
  for each row execute function public.audit_academic_change();
create trigger audit_course_offerings after insert or update or delete on public.course_offerings
  for each row execute function public.audit_academic_change();
create trigger audit_teaching_assignments after insert or update or delete on public.teaching_assignments
  for each row execute function public.audit_academic_change();
create trigger audit_student_records after insert or update or delete on public.student_records
  for each row execute function public.audit_academic_change();
create trigger audit_enrolments after insert or update or delete on public.enrolments
  for each row execute function public.audit_academic_change();
revoke all on function public.audit_academic_change() from public, anon, authenticated;
grant execute on function public.audit_academic_change() to postgres;

create view public.student_directory
with (security_invoker = true)
as
select
  sr.id as student_record_id,
  sr.user_id,
  sr.registration_number,
  sr.status as record_status,
  p.display_name,
  p.contact_email,
  prog.id as program_id,
  prog.code as program_code,
  prog.name as program_name,
  d.id as department_id,
  d.code as department_code,
  d.name as department_name
from public.student_records sr
join public.profiles p on p.id = sr.user_id
join public.programs prog on prog.id = sr.program_id
join public.departments d on d.id = prog.department_id;
revoke all on public.student_directory from public, anon;
grant select on public.student_directory to authenticated;

create or replace function public.list_unlinked_student_users()
returns table (user_id uuid, display_name text, contact_email text)
language sql
stable
security definer
set search_path = ''
as $$
  with admin_check as materialized (
    select public.is_admin() as allowed
  )
  select p.id, p.display_name, p.contact_email
  from public.profiles p
  cross join admin_check
  where admin_check.allowed
    and exists (
      select 1 from public.user_roles ur
      where ur.user_id = p.id and ur.role = 'student'
    )
    and not exists (
      select 1 from public.student_records sr where sr.user_id = p.id
    )
  order by p.display_name;
$$;
revoke all on function public.list_unlinked_student_users() from public, anon;
grant execute on function public.list_unlinked_student_users() to authenticated;
