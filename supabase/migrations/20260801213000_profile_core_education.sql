-- Phase 1A, first product slice: profile core and primary education.
--
-- This is intentionally forward-only. The Phase 0 profile fields remain in
-- place as deprecated compatibility data until a later, audited cleanup
-- migration can prove they have been manually resolved.

-- ---------------------------------------------------------------------------
-- Schema evolution and safe legacy backfill
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column preferred_name text,
  add column created_via text not null default 'manual',
  add column updated_at timestamptz not null default now(),
  add column last_confirmed_at timestamptz not null default now(),
  add constraint profiles_created_via_check check (created_via in ('manual', 'migration'));

alter table public.education_entries
  add column degree_year smallint,
  add column expected_graduation_month smallint,
  add column expected_graduation_year smallint,
  add column education_status text not null default 'unknown',
  add column is_primary boolean not null default false,
  add column created_via text not null default 'manual',
  add column updated_at timestamptz not null default now(),
  add column last_confirmed_at timestamptz not null default now(),
  add constraint education_entries_degree_year_check check (degree_year is null or degree_year between 1 and 10),
  add constraint education_entries_graduation_month_check check (expected_graduation_month is null or expected_graduation_month between 1 and 12),
  add constraint education_entries_graduation_year_check check (expected_graduation_year is null or expected_graduation_year between 2000 and 2100),
  add constraint education_entries_graduation_pair_check check (
    (expected_graduation_month is null) = (expected_graduation_year is null)
  ),
  add constraint education_entries_status_check check (education_status in ('current', 'completed', 'paused', 'withdrawn', 'unknown')),
  add constraint education_entries_current_end_date_check check (education_status <> 'current' or end_date is null),
  add constraint education_entries_completed_end_date_check check (education_status <> 'completed' or end_date is not null),
  add constraint education_entries_graduation_current_check check (
    expected_graduation_year is null or education_status = 'current'
  ),
  add constraint education_entries_graduation_after_start_check check (
    start_date is null
    or expected_graduation_year is null
    or make_date(expected_graduation_year, expected_graduation_month, 1) >= date_trunc('month', start_date)::date
  ),
  add constraint education_entries_primary_current_check check (not is_primary or education_status = 'current'),
  add constraint education_entries_created_via_check check (created_via in ('manual', 'migration'));

-- The Phase 0 migration allowed blank/overlong text. Do not use NOT VALID
-- text CHECKs: PostgreSQL would then reject unrelated edits to a preserved
-- legacy row. The validation triggers below instead validate every new value
-- and every changed text value, while leaving unchanged legacy data editable.
update public.profiles
set
  created_via = 'migration',
  updated_at = created_at,
  last_confirmed_at = null;

update public.education_entries
set
  created_via = 'migration',
  updated_at = created_at,
  last_confirmed_at = null;

-- Only the degree-year mapping has identical semantics in the target model.
-- A lone legacy education row is not made primary and is not assigned a status.
with profiles_with_one_education as (
  select user_id, (array_agg(id order by id))[1] as education_id
  from public.education_entries
  group by user_id
  having count(*) = 1
)
update public.education_entries as education
set degree_year = profile.degree_year
from public.profiles as profile
join profiles_with_one_education as one_education on one_education.user_id = profile.user_id
where education.id = one_education.education_id
  and profile.degree_year is not null
  and education.degree_year is null;

comment on column public.profiles.degree_program is
  'Deprecated Phase 0 compatibility field. Not authoritative; do not write from the browser or use for completeness.';
comment on column public.profiles.degree_year is
  'Deprecated Phase 0 compatibility field. Safely copied only to a lone existing education row; not authoritative.';
comment on column public.profiles.profile_complete is
  'Deprecated Phase 0 compatibility field. Completeness is derived; this value is not authoritative.';
comment on column public.profiles.created_via is
  'How this current-format profile row entered the system: manual or migration.';
comment on column public.profiles.last_confirmed_at is
  'Last explicit manual profile-content creation or edit; separate from section review.';
comment on column public.education_entries.last_confirmed_at is
  'Last explicit manual education-content creation or edit; separate from section review.';

create unique index education_entries_one_primary_per_user_idx
  on public.education_entries (user_id)
  where is_primary;

-- ---------------------------------------------------------------------------
-- Section state. Existing data starts at a neutral baseline with no review.
-- ---------------------------------------------------------------------------

create table public.profile_section_revisions (
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  section_key text not null check (section_key in ('basic_profile', 'education')),
  content_revision bigint not null default 0 check (content_revision >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, section_key)
);

create table public.profile_section_reviews (
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  section_key text not null check (section_key in ('basic_profile', 'education')),
  reviewed_content_revision bigint not null check (reviewed_content_revision >= 0),
  reviewed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, section_key),
  foreign key (user_id, section_key)
    references public.profile_section_revisions (user_id, section_key)
    on delete cascade
);

insert into public.profile_section_revisions (user_id, section_key, content_revision)
select profiles.user_id, section_keys.section_key, 0
from public.profiles
cross join (values ('basic_profile'::text), ('education'::text)) as section_keys(section_key);

comment on table public.profile_section_revisions is
  'Database-maintained, deletion-safe section content mutation counters.';
comment on table public.profile_section_reviews is
  'Deliberate review recorded against an exact profile-section content revision.';

-- ---------------------------------------------------------------------------
-- Hardened database functions and triggers
-- ---------------------------------------------------------------------------

create function public.raise_profile_content_validation(
  value text,
  field_name text,
  maximum_length integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if value is not null and (btrim(value) = '' or char_length(value) > maximum_length) then
    raise exception using
      errcode = '23514',
      message = 'invalid profile content',
      detail = field_name,
      constraint = 'profile_content_text_check';
  end if;
end;
$$;

create function public.profiles_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.raise_profile_content_validation(new.preferred_name, 'preferred_name', 100);
    perform public.raise_profile_content_validation(new.headline, 'headline', 160);
    return new;
  end if;

  if new.preferred_name is distinct from old.preferred_name then
    perform public.raise_profile_content_validation(new.preferred_name, 'preferred_name', 100);
  end if;
  if new.headline is distinct from old.headline then
    perform public.raise_profile_content_validation(new.headline, 'headline', 160);
  end if;

  if new.preferred_name is distinct from old.preferred_name
    or new.headline is distinct from old.headline then
    new.updated_at := now();
    new.last_confirmed_at := now();
  else
    new.created_at := old.created_at;
    new.created_via := old.created_via;
    new.updated_at := old.updated_at;
    new.last_confirmed_at := old.last_confirmed_at;
  end if;
  return new;
end;
$$;

create function public.education_entries_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  content_changed boolean;
begin
  if tg_op = 'INSERT' then
    perform public.raise_profile_content_validation(new.institution, 'institution', 200);
    perform public.raise_profile_content_validation(new.degree, 'degree', 160);
    perform public.raise_profile_content_validation(new.field, 'field', 160);
    return new;
  end if;

  if new.institution is distinct from old.institution then
    perform public.raise_profile_content_validation(new.institution, 'institution', 200);
  end if;
  if new.degree is distinct from old.degree then
    perform public.raise_profile_content_validation(new.degree, 'degree', 160);
  end if;
  if new.field is distinct from old.field then
    perform public.raise_profile_content_validation(new.field, 'field', 160);
  end if;

  content_changed := new.institution is distinct from old.institution
    or new.degree is distinct from old.degree
    or new.field is distinct from old.field
    or new.degree_year is distinct from old.degree_year
    or new.expected_graduation_month is distinct from old.expected_graduation_month
    or new.expected_graduation_year is distinct from old.expected_graduation_year
    or new.education_status is distinct from old.education_status
    or new.is_primary is distinct from old.is_primary
    or new.start_date is distinct from old.start_date
    or new.end_date is distinct from old.end_date;

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

create function public.increment_profile_section_revision(target_user_id uuid, target_section_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- The profile-existence guard makes a cascading account deletion harmless:
  -- after the parent disappears there is no state left to recreate.
  insert into public.profile_section_revisions (user_id, section_key, content_revision, updated_at)
  select target_user_id, target_section_key, 1, now()
  where exists (select 1 from public.profiles where user_id = target_user_id)
  on conflict (user_id, section_key) do update
    set content_revision = public.profile_section_revisions.content_revision + 1,
        updated_at = excluded.updated_at;
end;
$$;

create function public.profiles_after_content_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.profile_section_revisions (user_id, section_key, content_revision)
    values (new.user_id, 'basic_profile', 0), (new.user_id, 'education', 0)
    on conflict (user_id, section_key) do nothing;
    perform public.increment_profile_section_revision(new.user_id, 'basic_profile');
  elsif new.preferred_name is distinct from old.preferred_name
     or new.headline is distinct from old.headline then
    perform public.increment_profile_section_revision(new.user_id, 'basic_profile');
  end if;
  return null;
end;
$$;

create function public.education_entries_after_content_change()
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
    or new.institution is distinct from old.institution
    or new.degree is distinct from old.degree
    or new.field is distinct from old.field
    or new.degree_year is distinct from old.degree_year
    or new.expected_graduation_month is distinct from old.expected_graduation_month
    or new.expected_graduation_year is distinct from old.expected_graduation_year
    or new.education_status is distinct from old.education_status
    or new.is_primary is distinct from old.is_primary
    or new.start_date is distinct from old.start_date
    or new.end_date is distinct from old.end_date then
    perform public.increment_profile_section_revision(owner_id, 'education');
  end if;
  return null;
end;
$$;

create trigger profiles_before_write
before insert or update on public.profiles
for each row execute function public.profiles_before_write();

create trigger profiles_after_content_change
after insert or update on public.profiles
for each row execute function public.profiles_after_content_change();

create trigger education_entries_before_write
before insert or update on public.education_entries
for each row execute function public.education_entries_before_write();

create trigger education_entries_after_content_change
after insert or update or delete on public.education_entries
for each row execute function public.education_entries_after_content_change();

create function public.review_profile_section(requested_section_key text)
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
  if requested_section_key not in ('basic_profile', 'education') then
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

create function public.set_primary_education(education_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  selected_status text;
begin
  if caller_id is null then
    raise exception using errcode = '28000', message = 'authentication required';
  end if;

  -- Deterministic locking serializes simultaneous primary-selection requests.
  perform 1
  from public.education_entries
  where user_id = caller_id
  order by id
  for update;

  select education_status into selected_status
  from public.education_entries
  where id = education_id and user_id = caller_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'education entry not found';
  end if;
  if selected_status <> 'current' then
    raise exception using errcode = '23514', message = 'primary education must be current';
  end if;

  update public.education_entries
  set is_primary = false
  where user_id = caller_id and is_primary and id <> education_id;

  update public.education_entries
  set is_primary = true
  where user_id = caller_id and id = education_id and not is_primary;
end;
$$;

-- No function starts browser-callable merely because it is created in public.
revoke all on function public.raise_profile_content_validation(text, text, integer) from public, anon, authenticated;
revoke all on function public.profiles_before_write() from public, anon, authenticated;
revoke all on function public.education_entries_before_write() from public, anon, authenticated;
revoke all on function public.increment_profile_section_revision(uuid, text) from public, anon, authenticated;
revoke all on function public.profiles_after_content_change() from public, anon, authenticated;
revoke all on function public.education_entries_after_content_change() from public, anon, authenticated;
revoke all on function public.review_profile_section(text) from public, anon;
revoke all on function public.set_primary_education(uuid) from public, anon;
grant execute on function public.review_profile_section(text) to authenticated;
grant execute on function public.set_primary_education(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Explicit grants and RLS
-- ---------------------------------------------------------------------------

drop policy if exists profiles_delete_own on public.profiles;
revoke all on public.profiles from anon, authenticated, service_role;
grant select on public.profiles to authenticated;
grant insert (user_id, preferred_name, headline) on public.profiles to authenticated;
grant update (preferred_name, headline) on public.profiles to authenticated;
grant select, insert, update, delete on public.profiles to service_role;

revoke all on public.education_entries from anon, authenticated, service_role;
grant select on public.education_entries to authenticated;
grant insert (
  user_id, institution, degree, field, degree_year,
  expected_graduation_month, expected_graduation_year, education_status,
  start_date, end_date
) on public.education_entries to authenticated;
grant update (
  institution, degree, field, degree_year,
  expected_graduation_month, expected_graduation_year, education_status,
  start_date, end_date
) on public.education_entries to authenticated;
grant delete on public.education_entries to authenticated;
grant select, insert, update, delete on public.education_entries to service_role;

alter table public.profile_section_revisions enable row level security;
alter table public.profile_section_reviews enable row level security;
revoke all on public.profile_section_revisions from anon, authenticated, service_role;
revoke all on public.profile_section_reviews from anon, authenticated, service_role;
grant select on public.profile_section_revisions to authenticated;
grant select on public.profile_section_reviews to authenticated;
grant select, insert, update, delete on public.profile_section_revisions to service_role;
grant select, insert, update, delete on public.profile_section_reviews to service_role;

create policy profile_section_revisions_select_own on public.profile_section_revisions
  for select to authenticated using ((select auth.uid()) = user_id);
create policy profile_section_reviews_select_own on public.profile_section_reviews
  for select to authenticated using ((select auth.uid()) = user_id);
