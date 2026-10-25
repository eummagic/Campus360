-- Tighten the Phase 2A boundary discovered by local RLS tests.
-- Student records are read by students/assigned teachers, but only admins
-- receive write policies. Split commands to avoid permissive FOR ALL overlap.
drop policy if exists student_records_admin_write on public.student_records;
drop policy if exists student_records_admin_insert on public.student_records;
drop policy if exists student_records_admin_update on public.student_records;
drop policy if exists student_records_admin_delete on public.student_records;
create policy student_records_admin_insert on public.student_records
  for insert to authenticated with check (public.is_admin());
create policy student_records_admin_update on public.student_records
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy student_records_admin_delete on public.student_records
  for delete to authenticated using (public.is_admin());

-- Update authorization must not reveal whether a row matched. Require the
-- admin predicate in both USING and WITH CHECK; scoped SELECT policies remain
-- the only read path for teachers/students.
revoke update on public.student_records from authenticated;
grant update (registration_number, program_id, status) on public.student_records to authenticated;
drop policy if exists student_records_admin_update on public.student_records;
create policy student_records_admin_update on public.student_records
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Security-definer SQL functions inherit the caller's row-security context
-- for nested invoker functions on some PostgreSQL plans. Keep the internal
-- candidate query owner-scoped so the RPC can read profiles/roles/records
-- after its explicit admin check. PUBLIC/anon still cannot execute it.
alter function public.list_unlinked_student_users() owner to postgres;

-- Trigger functions require EXECUTE for the table owner that runs the trigger.
grant execute on function public.audit_academic_change() to postgres;

-- The admin check is scalar and independent of candidate row visibility.
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
