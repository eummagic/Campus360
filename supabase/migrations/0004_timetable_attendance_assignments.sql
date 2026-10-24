-- Stage C: timetable, attendance, and assignment tracking.
-- All date/time values use the academic institution's local wall clock for
-- recurring classes, and UTC instants (timestamptz) for assignment deadlines.

alter table public.course_offerings
  add constraint course_offerings_id_term_unique unique (id, term_id);

create table public.timetable_entries (
  id uuid primary key default gen_random_uuid(),
  offering_id uuid not null,
  term_id uuid not null,
  weekday smallint not null check (weekday between 1 and 7), -- ISO: Monday = 1
  start_time time without time zone not null,
  end_time time without time zone not null,
  location text check (location is null or char_length(btrim(location)) between 1 and 100),
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  updated_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint timetable_entry_time_order check (end_time > start_time),
  constraint timetable_entry_offering_term_fk foreign key (offering_id, term_id)
    references public.course_offerings(id, term_id) on delete restrict
);

create index timetable_entries_term_day_time_idx
  on public.timetable_entries (term_id, weekday, start_time, end_time);
create index timetable_entries_offering_idx on public.timetable_entries (offering_id);
alter table public.timetable_entries
  add constraint timetable_entries_id_offering_unique unique (id, offering_id);

create table public.attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  timetable_entry_id uuid not null,
  offering_id uuid not null references public.course_offerings(id) on delete restrict,
  session_date date not null,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (timetable_entry_id, session_date),
  unique (id, offering_id),
  foreign key (timetable_entry_id, offering_id)
    references public.timetable_entries(id, offering_id) on delete restrict
);

create index attendance_sessions_offering_date_idx
  on public.attendance_sessions (offering_id, session_date desc);

create table public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  offering_id uuid not null,
  student_record_id uuid not null references public.student_records(id) on delete cascade,
  status text not null check (status in ('present', 'absent', 'late')),
  marked_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, student_record_id),
  foreign key (session_id, offering_id)
    references public.attendance_sessions(id, offering_id) on delete cascade
);

create index attendance_records_student_idx on public.attendance_records (student_record_id, created_at desc);
create index attendance_records_offering_idx on public.attendance_records (offering_id, session_id);

create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  offering_id uuid not null references public.course_offerings(id) on delete restrict,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  instructions text not null default '' check (char_length(instructions) <= 10000),
  due_at timestamptz not null,
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index assignments_offering_due_idx on public.assignments (offering_id, due_at);
create index assignments_status_due_idx on public.assignments (status, due_at);

-- Serialize schedule and teacher-assignment changes before checking conflicts.
-- This intentionally uses one transaction-scoped key: campus schedules are
-- small, and a single lock closes races between schedule and assignment writes.
create or replace function public.guard_timetable_entry_conflicts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(741223);
  if tg_op = 'UPDATE' then
    if new.id <> old.id or new.created_by <> old.created_by then
      raise exception using errcode = '42501', message = 'Timetable entry identity cannot be changed.';
    end if;
  end if;

  if exists (
    select 1
    from public.timetable_entries other_entry
    where other_entry.id <> new.id
      and other_entry.term_id = new.term_id
      and other_entry.weekday = new.weekday
      and new.start_time < other_entry.end_time
      and other_entry.start_time < new.end_time
      and (
        other_entry.offering_id = new.offering_id
        or (
          new.location is not null
          and other_entry.location is not null
          and pg_catalog.lower(pg_catalog.btrim(other_entry.location)) = pg_catalog.lower(pg_catalog.btrim(new.location))
        )
        or exists (
          select 1
          from public.teaching_assignments old_teacher
          join public.teaching_assignments new_teacher
            on new_teacher.teacher_user_id = old_teacher.teacher_user_id
          where old_teacher.offering_id = other_entry.offering_id
            and new_teacher.offering_id = new.offering_id
        )
      )
  ) then
    raise exception using errcode = '23P01', message = 'Timetable entry conflicts with an existing class.';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_timetable_entry_conflicts() from public, anon, authenticated;
grant execute on function public.guard_timetable_entry_conflicts() to postgres;
create trigger guard_timetable_entry_conflicts
  before insert or update on public.timetable_entries
  for each row execute function public.guard_timetable_entry_conflicts();

create or replace function public.guard_teacher_assignment_conflicts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(741223);
  if exists (
    select 1
    from public.timetable_entries new_entry
    join public.timetable_entries other_entry
      on other_entry.term_id = new_entry.term_id
      and other_entry.weekday = new_entry.weekday
      and new_entry.start_time < other_entry.end_time
      and other_entry.start_time < new_entry.end_time
      and other_entry.offering_id <> new_entry.offering_id
    join public.teaching_assignments other_teacher
      on other_teacher.offering_id = other_entry.offering_id
      and other_teacher.teacher_user_id = new.teacher_user_id
    where new_entry.offering_id = new.offering_id
  ) then
    raise exception using errcode = '23P01', message = 'Teacher assignment conflicts with the existing timetable.';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_teacher_assignment_conflicts() from public, anon, authenticated;
grant execute on function public.guard_teacher_assignment_conflicts() to postgres;
create trigger guard_teacher_assignment_conflicts
  before insert or update on public.teaching_assignments
  for each row execute function public.guard_teacher_assignment_conflicts();

create or replace function public.guard_attendance_record_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.id <> old.id
    or new.session_id <> old.session_id
    or new.offering_id <> old.offering_id
    or new.student_record_id <> old.student_record_id
    or new.created_at <> old.created_at then
    raise exception using errcode = '42501', message = 'Attendance record identity cannot be changed.';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_attendance_record_identity() from public, anon, authenticated;
grant execute on function public.guard_attendance_record_identity() to postgres;
create trigger guard_attendance_record_identity
  before update on public.attendance_records
  for each row execute function public.guard_attendance_record_identity();

create or replace function public.validate_attendance_session()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_weekday smallint;
  v_start date;
  v_end date;
begin
  select te.weekday, term.starts_on, term.ends_on
    into v_weekday, v_start, v_end
  from public.timetable_entries te
  join public.academic_terms term on term.id = te.term_id
  where te.id = new.timetable_entry_id and te.offering_id = new.offering_id;

  if not found
    or extract(isodow from new.session_date)::smallint <> v_weekday
    or (v_start is not null and new.session_date < v_start)
    or (v_end is not null and new.session_date > v_end) then
    raise exception using errcode = '23514', message = 'Attendance date must match the scheduled class and academic term.';
  end if;
  return new;
end;
$$;

revoke all on function public.validate_attendance_session() from public, anon, authenticated;
grant execute on function public.validate_attendance_session() to postgres;
create trigger validate_attendance_session
  before insert on public.attendance_sessions
  for each row execute function public.validate_attendance_session();

create or replace function public.mark_attendance_for_session(
  p_timetable_entry_id uuid,
  p_session_date date,
  p_records jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_offering_id uuid;
  v_session_id uuid;
  v_row record;
begin
  if v_user_id is null or not public.is_teacher_of_offering((
    select te.offering_id from public.timetable_entries te where te.id = p_timetable_entry_id
  )) then
    raise exception using errcode = '42501', message = 'Not authorized to mark attendance for this class.';
  end if;
  if p_records is null then
    raise exception using errcode = '22023', message = 'Attendance list is invalid.';
  end if;
  if pg_catalog.jsonb_typeof(p_records) is distinct from 'array' then
    raise exception using errcode = '22023', message = 'Attendance list is invalid.';
  end if;
  if pg_catalog.jsonb_array_length(p_records) < 1 or pg_catalog.jsonb_array_length(p_records) > 200 then
    raise exception using errcode = '22023', message = 'Attendance list is invalid.';
  end if;
  if exists (
    select 1 from pg_catalog.jsonb_to_recordset(p_records) as item(student_record_id uuid, status text)
    group by item.student_record_id having pg_catalog.count(*) > 1
  ) then
    raise exception using errcode = '22023', message = 'Attendance list contains duplicate students.';
  end if;

  select te.offering_id into v_offering_id
  from public.timetable_entries te where te.id = p_timetable_entry_id;

  insert into public.attendance_sessions (timetable_entry_id, offering_id, session_date)
  values (p_timetable_entry_id, v_offering_id, p_session_date)
  on conflict (timetable_entry_id, session_date) do nothing;

  select session.id into v_session_id
  from public.attendance_sessions session
  where session.timetable_entry_id = p_timetable_entry_id and session.session_date = p_session_date;

  for v_row in
    select item.student_record_id, item.status
    from pg_catalog.jsonb_to_recordset(p_records) as item(student_record_id uuid, status text)
  loop
    if v_row.status is null or v_row.status not in ('present', 'absent', 'late') or not exists (
      select 1 from public.enrolments e
      where e.student_record_id = v_row.student_record_id and e.offering_id = v_offering_id
    ) then
      raise exception using errcode = '22023', message = 'Attendance contains an invalid student or status.';
    end if;

    insert into public.attendance_records (session_id, offering_id, student_record_id, status, marked_by)
    values (v_session_id, v_offering_id, v_row.student_record_id, v_row.status, v_user_id)
    on conflict (session_id, student_record_id) do update
      set status = excluded.status, marked_by = excluded.marked_by, updated_at = pg_catalog.now();
  end loop;
  return v_session_id;
end;
$$;

revoke all on function public.mark_attendance_for_session(uuid, date, jsonb) from public, anon;
grant execute on function public.mark_attendance_for_session(uuid, date, jsonb) to authenticated;

create trigger set_updated_at_timetable_entries before update on public.timetable_entries
  for each row execute function public.set_updated_at();
create trigger set_updated_at_attendance_records before update on public.attendance_records
  for each row execute function public.set_updated_at();
create trigger set_updated_at_assignments before update on public.assignments
  for each row execute function public.set_updated_at();

create trigger audit_timetable_entries after insert or update or delete on public.timetable_entries
  for each row execute function public.audit_academic_change();
create trigger audit_attendance_sessions after insert or update or delete on public.attendance_sessions
  for each row execute function public.audit_academic_change();
create trigger audit_attendance_records after insert or update or delete on public.attendance_records
  for each row execute function public.audit_academic_change();
create trigger audit_assignments after insert or update or delete on public.assignments
  for each row execute function public.audit_academic_change();

alter table public.timetable_entries enable row level security;
alter table public.attendance_sessions enable row level security;
alter table public.attendance_records enable row level security;
alter table public.assignments enable row level security;

revoke all on public.timetable_entries, public.attendance_sessions, public.attendance_records, public.assignments from public, anon;
grant select, insert, update, delete on public.timetable_entries to authenticated;
grant select, insert on public.attendance_sessions to authenticated;
grant select, insert, update on public.attendance_records to authenticated;
grant select, insert, update, delete on public.assignments to authenticated;

create policy timetable_entries_select_scoped on public.timetable_entries
  for select to authenticated using (
    public.is_admin() or public.is_teacher_of_offering(offering_id) or public.is_student_in_offering(offering_id)
  );
create policy timetable_entries_admin_insert on public.timetable_entries
  for insert to authenticated with check (public.is_admin() and created_by = auth.uid() and updated_by = auth.uid());
create policy timetable_entries_admin_update on public.timetable_entries
  for update to authenticated using (public.is_admin())
  with check (public.is_admin() and updated_by = auth.uid());
create policy timetable_entries_admin_delete on public.timetable_entries
  for delete to authenticated using (public.is_admin());

create policy attendance_sessions_select_scoped on public.attendance_sessions
  for select to authenticated using (
    public.is_admin()
    or public.is_teacher_of_offering(offering_id)
    or exists (
      select 1 from public.enrolments e
      join public.student_records sr on sr.id = e.student_record_id
      where e.offering_id = attendance_sessions.offering_id
        and sr.user_id = auth.uid()
    )
  );
create policy attendance_sessions_teacher_insert on public.attendance_sessions
  for insert to authenticated with check (
    created_by = auth.uid() and public.is_teacher_of_offering(offering_id)
  );

create policy attendance_records_select_scoped on public.attendance_records
  for select to authenticated using (
    public.is_admin()
    or public.is_teacher_of_offering(offering_id)
    or exists (
      select 1 from public.student_records sr
      where sr.id = attendance_records.student_record_id and sr.user_id = auth.uid()
    )
  );
create policy attendance_records_teacher_insert on public.attendance_records
  for insert to authenticated with check (
    marked_by = auth.uid()
    and public.is_teacher_of_offering(offering_id)
    and exists (
      select 1 from public.enrolments e
      where e.student_record_id = attendance_records.student_record_id
        and e.offering_id = attendance_records.offering_id
    )
  );
create policy attendance_records_teacher_update on public.attendance_records
  for update to authenticated using (
    public.is_teacher_of_offering(offering_id)
  ) with check (
    marked_by = auth.uid()
    and public.is_teacher_of_offering(offering_id)
    and exists (
      select 1 from public.enrolments e
      where e.student_record_id = attendance_records.student_record_id
        and e.offering_id = attendance_records.offering_id
    )
  );

create policy assignments_select_admin on public.assignments
  for select to authenticated using (public.is_admin());
create policy assignments_select_teacher on public.assignments
  for select to authenticated using (created_by = auth.uid() and public.is_teacher_of_offering(offering_id));
create policy assignments_select_student on public.assignments
  for select to authenticated using (
    status = 'published' and public.is_student_in_offering(offering_id)
  );
create policy assignments_teacher_insert on public.assignments
  for insert to authenticated with check (
    created_by = auth.uid() and public.is_teacher_of_offering(offering_id)
  );
create policy assignments_teacher_update on public.assignments
  for update to authenticated using (
    created_by = auth.uid() and public.is_teacher_of_offering(offering_id)
  ) with check (
    created_by = auth.uid() and public.is_teacher_of_offering(offering_id)
  );
create policy assignments_teacher_delete on public.assignments
  for delete to authenticated using (
    created_by = auth.uid() and public.is_teacher_of_offering(offering_id)
  );

-- Aggregates execute as the caller and inherit all underlying RLS policies.
create or replace function public.my_attendance_summary()
returns table (
  offering_id uuid,
  subject_code text,
  subject_name text,
  section_code text,
  recorded_sessions bigint,
  present_count bigint,
  absent_count bigint,
  late_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select ar.offering_id, subject.code, subject.name, offering.section_code,
    pg_catalog.count(*) as recorded_sessions,
    pg_catalog.count(*) filter (where ar.status = 'present') as present_count,
    pg_catalog.count(*) filter (where ar.status = 'absent') as absent_count,
    pg_catalog.count(*) filter (where ar.status = 'late') as late_count
  from public.attendance_records ar
  join public.attendance_sessions session on session.id = ar.session_id
  join public.student_records sr on sr.id = ar.student_record_id
  join public.course_offerings offering on offering.id = ar.offering_id
  join public.subjects subject on subject.id = offering.subject_id
  where sr.user_id = auth.uid()
  group by ar.offering_id, subject.code, subject.name, offering.section_code
  order by subject.code, offering.section_code;
$$;

create or replace function public.scoped_attendance_summary()
returns table (
  offering_id uuid,
  subject_code text,
  subject_name text,
  section_code text,
  recorded_marks bigint,
  present_count bigint,
  absent_count bigint,
  late_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select ar.offering_id, subject.code, subject.name, offering.section_code,
    pg_catalog.count(*) as recorded_marks,
    pg_catalog.count(*) filter (where ar.status = 'present') as present_count,
    pg_catalog.count(*) filter (where ar.status = 'absent') as absent_count,
    pg_catalog.count(*) filter (where ar.status = 'late') as late_count
  from public.attendance_records ar
  join public.course_offerings offering on offering.id = ar.offering_id
  join public.subjects subject on subject.id = offering.subject_id
  group by ar.offering_id, subject.code, subject.name, offering.section_code
  order by subject.code, offering.section_code;
$$;

create or replace function public.my_attendance_history(p_limit integer default 50, p_offset integer default 0)
returns table (
  id uuid,
  status text,
  session_date date,
  subject_code text,
  subject_name text,
  section_code text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select ar.id, ar.status, session.session_date, subject.code, subject.name, offering.section_code
  from public.attendance_records ar
  join public.attendance_sessions session on session.id = ar.session_id
  join public.student_records sr on sr.id = ar.student_record_id
  join public.course_offerings offering on offering.id = ar.offering_id
  join public.subjects subject on subject.id = offering.subject_id
  where sr.user_id = auth.uid()
  order by session.session_date desc, ar.id
  limit least(greatest(coalesce(p_limit, 50), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

create or replace function public.offering_attendance_by_student(p_offering_id uuid)
returns table (
  student_record_id uuid,
  registration_number text,
  display_name text,
  recorded_sessions bigint,
  present_count bigint,
  absent_count bigint,
  late_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select sr.id, sr.registration_number, profile.display_name,
    pg_catalog.count(ar.id) as recorded_sessions,
    pg_catalog.count(ar.id) filter (where ar.status = 'present') as present_count,
    pg_catalog.count(ar.id) filter (where ar.status = 'absent') as absent_count,
    pg_catalog.count(ar.id) filter (where ar.status = 'late') as late_count
  from public.student_records sr
  join public.profiles profile on profile.id = sr.user_id
  join public.enrolments enrolment on enrolment.student_record_id = sr.id
  left join public.attendance_records ar
    on ar.student_record_id = sr.id and ar.offering_id = enrolment.offering_id
  where enrolment.offering_id = p_offering_id
    and (public.is_admin() or public.is_teacher_of_offering(p_offering_id))
  group by sr.id, sr.registration_number, profile.display_name
  order by sr.registration_number;
$$;

revoke all on function public.my_attendance_summary() from public, anon;
revoke all on function public.scoped_attendance_summary() from public, anon;
revoke all on function public.my_attendance_history(integer, integer) from public, anon;
revoke all on function public.offering_attendance_by_student(uuid) from public, anon;
grant execute on function public.my_attendance_summary() to authenticated;
grant execute on function public.scoped_attendance_summary() to authenticated;
grant execute on function public.my_attendance_history(integer, integer) to authenticated;
grant execute on function public.offering_attendance_by_student(uuid) to authenticated;
