-- Phase 1: identity, roles, audit
create extension if not exists "pgcrypto";

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 120),
  contact_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('student', 'teacher', 'admin', 'driver', 'finance')),
  scope text,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references auth.users(id),
  unique (user_id, role, scope)
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_events_actor_idx on public.audit_events (actor_id, created_at desc);
create index audit_events_entity_idx on public.audit_events (entity_type, entity_id, created_at desc);

-- RLS
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.audit_events enable row level security;

-- Profiles: own row only
create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

-- Client writes are intentionally limited to the controlled RPC below.
revoke insert, update, delete on public.profiles from anon, authenticated;
revoke insert, update, delete on public.user_roles from anon, authenticated;
revoke insert, update, delete on public.audit_events from anon, authenticated;

-- Roles: own rows only, read-only from client
create policy "user_roles_select_own"
  on public.user_roles for select
  to authenticated
  using (auth.uid() = user_id);

-- Audit: no direct client policies. Controlled function only.

-- Controlled audit write (security definer)
create or replace function public.record_audit_event(
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  insert into public.audit_events (actor_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), p_action, p_entity_type, p_entity_id, p_metadata);
end;
$$;

revoke all on function public.record_audit_event(text, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.record_audit_event(text, text, uuid, jsonb) to postgres;

-- Controlled profile update + audit in one transaction
create or replace function public.update_my_display_name(p_display_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;
  if p_display_name is null or char_length(trim(p_display_name)) = 0 then
    raise exception 'Display name is required';
  end if;
  if char_length(trim(p_display_name)) > 120 then
    raise exception 'Display name must be 120 characters or fewer';
  end if;

  update public.profiles
  set display_name = trim(p_display_name),
      updated_at = now()
  where id = v_user_id;

  if not found then
    raise exception 'Profile not found';
  end if;

  perform public.record_audit_event(
    'profile.display_name.updated',
    'profile',
    v_user_id,
    jsonb_build_object('display_name', trim(p_display_name))
  );
end;
$$;

revoke all on function public.update_my_display_name(text) from public;
grant execute on function public.update_my_display_name(text) to authenticated;

-- Prevent application roles from updating/deleting audit rows
revoke insert, update, delete on public.audit_events from authenticated, anon;
