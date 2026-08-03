-- Phase 1A: manual work, internship, research, volunteering, and leadership
-- experience. This migration is forward-only and does not infer or create
-- experience records for existing profiles.

-- ---------------------------------------------------------------------------
-- Experience schema
-- ---------------------------------------------------------------------------

create table public.work_experience (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  experience_kind text not null,
  organization text not null,
  role text not null,
  location text,
  start_year smallint not null,
  start_month smallint,
  end_year smallint,
  end_month smallint,
  is_current boolean not null default false,
  description text,
  created_via text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_confirmed_at timestamptz not null default now(),
  constraint work_experience_user_id_id_key unique (user_id, id),
  constraint work_experience_kind_check check (
    experience_kind in (
      'employment', 'internship', 'research', 'volunteering',
      'student_leadership', 'other'
    )
  ),
  constraint work_experience_organization_check check (
    btrim(organization) <> '' and char_length(organization) <= 200
  ),
  constraint work_experience_role_check check (
    btrim(role) <> '' and char_length(role) <= 160
  ),
  constraint work_experience_location_check check (
    location is null or (btrim(location) <> '' and char_length(location) <= 160)
  ),
  constraint work_experience_description_check check (
    description is null or (btrim(description) <> '' and char_length(description) <= 2000)
  ),
  constraint work_experience_start_year_check check (
    start_year between 1900 and 2100
  ),
  constraint work_experience_start_month_check check (
    start_month is null or start_month between 1 and 12
  ),
  constraint work_experience_end_year_check check (
    end_year is null or end_year between 1900 and 2100
  ),
  constraint work_experience_end_month_check check (
    end_month is null or end_month between 1 and 12
  ),
  constraint work_experience_end_month_requires_year_check check (
    end_month is null or end_year is not null
  ),
  constraint work_experience_current_end_period_check check (
    not is_current or (end_year is null and end_month is null)
  ),
  constraint work_experience_period_order_check check (
    end_year is null
    or end_year > start_year
    or (
      end_year = start_year
      and (start_month is null or end_month is null or end_month >= start_month)
    )
  ),
  constraint work_experience_created_via_check check (
    created_via in ('manual', 'migration')
  )
);

comment on table public.work_experience is
  'Manual professional and extracurricular experience, owned directly through user_id.';
comment on column public.work_experience.start_month is
  'Optional month precision; a missing month means the user did not claim a month.';
comment on column public.work_experience.last_confirmed_at is
  'Last explicit manual experience-content creation or edit.';

create index work_experience_user_chronology_idx
  on public.work_experience (
    user_id,
    is_current desc,
    start_year desc,
    start_month desc,
    created_at desc
  );

-- ---------------------------------------------------------------------------
-- Section state: preserve existing counters and reviews, adding a neutral
-- experience baseline for each existing profile.
-- ---------------------------------------------------------------------------

alter table public.profile_section_revisions
  drop constraint profile_section_revisions_section_key_check,
  add constraint profile_section_revisions_section_key_check
    check (section_key in ('basic_profile', 'education', 'experience'));

alter table public.profile_section_reviews
  drop constraint profile_section_reviews_section_key_check,
  add constraint profile_section_reviews_section_key_check
    check (section_key in ('basic_profile', 'education', 'experience'));

insert into public.profile_section_revisions (user_id, section_key, content_revision)
select user_id, 'experience', 0
from public.profiles
on conflict (user_id, section_key) do nothing;

-- ---------------------------------------------------------------------------
-- Hardened triggers and constrained review RPC
-- ---------------------------------------------------------------------------

create or replace function public.profiles_after_content_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.profile_section_revisions (user_id, section_key, content_revision)
    values
      (new.user_id, 'basic_profile', 0),
      (new.user_id, 'education', 0),
      (new.user_id, 'experience', 0)
    on conflict (user_id, section_key) do nothing;
    perform public.increment_profile_section_revision(new.user_id, 'basic_profile');
  elsif new.preferred_name is distinct from old.preferred_name
     or new.headline is distinct from old.headline then
    perform public.increment_profile_section_revision(new.user_id, 'basic_profile');
  end if;
  return null;
end;
$$;

create function public.work_experience_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  content_changed boolean;
begin
  if tg_op = 'INSERT' then
    perform public.raise_profile_content_validation(new.organization, 'organization', 200);
    perform public.raise_profile_content_validation(new.role, 'role', 160);
    perform public.raise_profile_content_validation(new.location, 'location', 160);
    perform public.raise_profile_content_validation(new.description, 'description', 2000);
    return new;
  end if;

  if new.organization is distinct from old.organization then
    perform public.raise_profile_content_validation(new.organization, 'organization', 200);
  end if;
  if new.role is distinct from old.role then
    perform public.raise_profile_content_validation(new.role, 'role', 160);
  end if;
  if new.location is distinct from old.location then
    perform public.raise_profile_content_validation(new.location, 'location', 160);
  end if;
  if new.description is distinct from old.description then
    perform public.raise_profile_content_validation(new.description, 'description', 2000);
  end if;

  content_changed := new.experience_kind is distinct from old.experience_kind
    or new.organization is distinct from old.organization
    or new.role is distinct from old.role
    or new.location is distinct from old.location
    or new.start_year is distinct from old.start_year
    or new.start_month is distinct from old.start_month
    or new.end_year is distinct from old.end_year
    or new.end_month is distinct from old.end_month
    or new.is_current is distinct from old.is_current
    or new.description is distinct from old.description;

  if content_changed then
    new.updated_at := now();
    new.last_confirmed_at := now();
  else
    new.user_id := old.user_id;
    new.created_at := old.created_at;
    new.created_via := old.created_via;
    new.updated_at := old.updated_at;
    new.last_confirmed_at := old.last_confirmed_at;
  end if;
  return new;
end;
$$;

create function public.work_experience_after_content_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid;
begin
  owner_id := case when tg_op = 'DELETE' then old.user_id else new.user_id end;
  if tg_op <> 'UPDATE'
    or new.experience_kind is distinct from old.experience_kind
    or new.organization is distinct from old.organization
    or new.role is distinct from old.role
    or new.location is distinct from old.location
    or new.start_year is distinct from old.start_year
    or new.start_month is distinct from old.start_month
    or new.end_year is distinct from old.end_year
    or new.end_month is distinct from old.end_month
    or new.is_current is distinct from old.is_current
    or new.description is distinct from old.description then
    perform public.increment_profile_section_revision(owner_id, 'experience');
  end if;
  return null;
end;
$$;

create trigger work_experience_before_write
before insert or update on public.work_experience
for each row execute function public.work_experience_before_write();

create trigger work_experience_after_content_change
after insert or update or delete on public.work_experience
for each row execute function public.work_experience_after_content_change();

create or replace function public.review_profile_section(requested_section_key text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  current_revision bigint;
begin
  if caller_id is null then
    raise exception using errcode = '28000', message = 'authentication required';
  end if;
  if requested_section_key not in ('basic_profile', 'education', 'experience') then
    raise exception using errcode = '22023', message = 'unknown profile section';
  end if;

  select content_revision into current_revision
  from public.profile_section_revisions
  where user_id = caller_id and section_key = requested_section_key
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'profile section does not exist';
  end if;

  insert into public.profile_section_reviews (
    user_id, section_key, reviewed_content_revision, reviewed_at, created_at, updated_at
  ) values (caller_id, requested_section_key, current_revision, now(), now(), now())
  on conflict (user_id, section_key) do update
    set reviewed_content_revision = excluded.reviewed_content_revision,
        reviewed_at = excluded.reviewed_at,
        updated_at = excluded.updated_at;
  return current_revision;
end;
$$;

revoke all on function public.work_experience_before_write() from public, anon, authenticated;
revoke all on function public.work_experience_after_content_change() from public, anon, authenticated;
revoke all on function public.review_profile_section(text) from public, anon, authenticated;
grant execute on function public.review_profile_section(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Explicit grants and RLS
-- ---------------------------------------------------------------------------

alter table public.work_experience enable row level security;
revoke all on public.work_experience from anon, authenticated, service_role;
grant select on public.work_experience to authenticated;
grant insert (
  user_id, experience_kind, organization, role, location,
  start_year, start_month, end_year, end_month, is_current, description
) on public.work_experience to authenticated;
grant update (
  experience_kind, organization, role, location,
  start_year, start_month, end_year, end_month, is_current, description
) on public.work_experience to authenticated;
grant delete on public.work_experience to authenticated;
grant select, insert, update, delete on public.work_experience to service_role;

create policy work_experience_select_own on public.work_experience
  for select to authenticated using ((select auth.uid()) = user_id);
create policy work_experience_insert_own on public.work_experience
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy work_experience_update_own on public.work_experience
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy work_experience_delete_own on public.work_experience
  for delete to authenticated using ((select auth.uid()) = user_id);
