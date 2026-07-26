-- Phase 0 profile-domain vertical slice: profiles + education_entries.
--
-- Ownership convention: every user-owned table exposes its owner as a column
-- literally named `user_id`. On `profiles`, `user_id` is also the primary key
-- (one profile per auth user). On every child table (starting with
-- `education_entries`), `user_id` is a direct, non-aliased foreign key back to
-- the owning user -- never renamed to something like `profile_id`, so the
-- ownership column is unambiguous at every table without needing to trace a
-- join. See docs/DATA_MODEL.md for the full rationale.
--
-- Grants and RLS are deliberately both explicit and independent:
--   - GRANT determines whether a role can reach the table at all.
--   - RLS policies determine which *rows* of that table a role may see or
--     change once it has reached it.
-- Neither substitutes for the other. `anon` gets no grant at all (so it
-- cannot reach these tables regardless of policy); `authenticated` gets
-- exactly the CRUD it needs, gated by row-owning policies; `service_role`
-- gets an explicit grant too, even though Supabase also configures it to
-- bypass RLS -- the grant is what lets it reach the table in the first
-- place, the RLS bypass is what lets it see every row once there.

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  headline text,
  degree_program text,
  degree_year smallint check (
    degree_year is null or (degree_year >= 1 and degree_year <= 10)
  ),
  profile_complete boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table public.profiles is
  'One row per user. user_id is both the primary key and the ownership column.';

create table public.education_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  institution text not null,
  degree text,
  field text,
  start_date date,
  end_date date,
  created_at timestamptz not null default now(),
  constraint education_entries_date_order check (
    start_date is null or end_date is null or end_date >= start_date
  )
);

comment on table public.education_entries is
  'Owned via user_id (a direct FK to profiles.user_id) -- not profile_id.';

create index education_entries_user_id_idx on public.education_entries (user_id);

-- ---------------------------------------------------------------------------
-- profiles: grants + RLS
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;

-- Revoke everything first (Supabase's default per-schema privileges grant ALL
-- on new public tables to authenticated/service_role, and historically to
-- anon too) so the privilege set actually in effect is exactly what is
-- granted below, not an unreviewed default.
revoke all on public.profiles from anon;
revoke all on public.profiles from authenticated;
revoke all on public.profiles from service_role;

grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.profiles to service_role;

create policy profiles_select_own on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy profiles_insert_own on public.profiles
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy profiles_update_own on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy profiles_delete_own on public.profiles
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- education_entries: grants + RLS
-- ---------------------------------------------------------------------------

alter table public.education_entries enable row level security;

revoke all on public.education_entries from anon;
revoke all on public.education_entries from authenticated;
revoke all on public.education_entries from service_role;

grant select, insert, update, delete on public.education_entries to authenticated;
grant select, insert, update, delete on public.education_entries to service_role;

create policy education_entries_select_own on public.education_entries
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy education_entries_insert_own on public.education_entries
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy education_entries_update_own on public.education_entries
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy education_entries_delete_own on public.education_entries
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);
