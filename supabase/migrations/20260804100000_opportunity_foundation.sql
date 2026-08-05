-- Phase 2A.1: shared opportunity identity/version schema, private manual
-- opportunities, save/hide state, application tracking, and interview-prep
-- notes. See docs/adr/ADR-004, ADR-006, ADR-010, ADR-016, ADR-017, ADR-018
-- and docs/DATA_MODEL.md for the design this migration implements.
--
-- Scope note (Phase 2A.1): with exactly one adapter (Greenhouse) enabled,
-- cross-source deduplication (ADR-010's strong/weak-match linking and
-- potential_duplicate_links) is not implemented here -- there is no second
-- source that could ever produce a match, so the code would be unexercised
-- and untestable. source_listings.opportunity_id is therefore `not null`
-- (one listing maps to exactly one opportunity today). Revisit when a second
-- adapter is proposed, per ADR-010's own scope note.

-- ---------------------------------------------------------------------------
-- Shared, service-role-write opportunity domain
-- ---------------------------------------------------------------------------

create table public.sources (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique,
  adapter_kind text not null,
  display_name text not null,
  base_url text not null,
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sources_source_key_check check (btrim(source_key) <> '' and char_length(source_key) <= 100),
  constraint sources_adapter_kind_check check (adapter_kind in ('greenhouse')),
  constraint sources_display_name_check check (btrim(display_name) <> '' and char_length(display_name) <= 200),
  constraint sources_base_url_check check (base_url ~ '^https://' and char_length(base_url) <= 500)
);

comment on table public.sources is
  'Registry of configured, reviewed ingestion sources (one row per adapter+board). Browser read-only.';
comment on column public.sources.source_key is
  'Unique board identity, e.g. greenhouse:helsing -- distinct from adapter_kind, which is non-unique.';

create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'active',
  first_discovered_at timestamptz not null default now(),
  last_checked_at timestamptz not null default now(),
  current_version_id uuid,
  constraint opportunities_status_check check (status in ('active', 'stale', 'closed', 'unknown'))
);

comment on table public.opportunities is
  'Canonical, real-world opportunity identity and lifecycle only -- no descriptive content lives here (see opportunity_versions).';

create table public.source_listings (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.sources (id) on delete cascade,
  external_id text not null,
  canonical_source_url text not null,
  application_url text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  status text not null default 'active',
  absence_count smallint not null default 0,
  opportunity_id uuid not null,
  constraint source_listings_source_external_key unique (source_id, external_id),
  constraint source_listings_status_check check (status in ('active', 'removed')),
  constraint source_listings_absence_count_check check (absence_count >= 0),
  constraint source_listings_canonical_url_check check (char_length(canonical_source_url) <= 2048),
  constraint source_listings_application_url_check check (application_url is null or char_length(application_url) <= 2048)
);

comment on table public.source_listings is
  'One row per (source, external_id) observation -- what an adapter actually saw. Never holds descriptive content.';

create table public.opportunity_versions (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities (id) on delete cascade,
  source_listing_id uuid not null references public.source_listings (id) on delete cascade,
  version_number integer not null,
  captured_at timestamptz not null default now(),
  title text not null,
  organization text not null,
  description text not null,
  location_text text,
  country text,
  region text,
  city text,
  remote_mode text not null default 'unknown',
  opportunity_kind text not null,
  employment_type text not null,
  application_url text,
  posted_at timestamptz,
  application_deadline timestamptz,
  source_updated_at timestamptz,
  content_hash text not null,
  source_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint opportunity_versions_version_number_check check (version_number > 0),
  constraint opportunity_versions_unique_version unique (opportunity_id, version_number),
  constraint opportunity_versions_title_check check (btrim(title) <> '' and char_length(title) <= 400),
  constraint opportunity_versions_organization_check check (btrim(organization) <> '' and char_length(organization) <= 200),
  -- 50000 (not the private_opportunities 20000 bound) because real Greenhouse
  -- postings are observably much longer -- verified against a live board
  -- during Phase 2A.1 development, where the 95th-percentile sanitized
  -- description was well under this and only one pathological outlier
  -- (~100KB) exceeded it, which is exactly the kind of single record the
  -- per-record error-isolation design in INGESTION_ARCHITECTURE.md #4 exists
  -- to skip without aborting the run.
  constraint opportunity_versions_description_check check (char_length(description) <= 50000),
  constraint opportunity_versions_location_check check (location_text is null or char_length(location_text) <= 200),
  constraint opportunity_versions_remote_mode_check check (remote_mode in ('onsite', 'hybrid', 'remote', 'unknown')),
  constraint opportunity_versions_kind_check check (
    opportunity_kind in (
      'internship', 'working_student', 'graduate_program', 'entry_level',
      'research_assistant', 'phd', 'scholarship', 'hackathon', 'fellowship', 'other'
    )
  ),
  constraint opportunity_versions_employment_type_check check (
    employment_type in ('full_time', 'part_time', 'contract', 'temporary', 'internship', 'volunteer', 'other')
  ),
  constraint opportunity_versions_content_hash_check check (btrim(content_hash) <> ''),
  constraint opportunity_versions_source_metadata_size_check check (octet_length(source_metadata::text) <= 8192)
);

comment on table public.opportunity_versions is
  'Immutable, append-only content snapshot per detected change. Insert-only for every role, including service_role -- never updated or deleted.';

alter table public.opportunities
  add constraint opportunities_current_version_fk
  foreign key (current_version_id) references public.opportunity_versions (id);

alter table public.source_listings
  add constraint source_listings_opportunity_fk
  foreign key (opportunity_id) references public.opportunities (id) on delete cascade;

create table public.ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.sources (id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running',
  completeness text,
  dry_run boolean not null default false,
  records_found integer not null default 0,
  records_new integer not null default 0,
  records_updated integer not null default 0,
  records_closed integer not null default 0,
  error_count integer not null default 0,
  error_summary jsonb not null default '[]'::jsonb,
  constraint ingestion_runs_status_check check (status in ('running', 'complete', 'partial', 'failed')),
  constraint ingestion_runs_completeness_check check (completeness is null or completeness in ('complete', 'partial')),
  constraint ingestion_runs_error_summary_check check (
    jsonb_typeof(error_summary) = 'array'
    and jsonb_array_length(error_summary) <= 32
    and octet_length(error_summary::text) <= 8192
  )
);

comment on table public.ingestion_runs is
  'Operational log, one row per CLI invocation. error_summary holds IDs/types/messages only, never description text or raw payloads.';

create index source_listings_opportunity_idx on public.source_listings (opportunity_id);
create index source_listings_source_status_idx on public.source_listings (source_id, status, last_seen_at);
create index opportunity_versions_opportunity_idx on public.opportunity_versions (opportunity_id, version_number desc);
create index opportunities_status_idx on public.opportunities (status);
create index ingestion_runs_source_idx on public.ingestion_runs (source_id, started_at desc);

-- Read model for browsing: one row per opportunity, joined to its current
-- version and provenance. Browser SELECT-only; never written directly.
create view public.opportunity_search
with (security_invoker = true) as
select
  o.id as opportunity_id,
  o.current_version_id as opportunity_version_id,
  o.status as lifecycle_status,
  o.first_discovered_at,
  o.last_checked_at,
  s.id as source_id,
  s.source_key,
  s.display_name as source_display_name,
  sl.id as source_listing_id,
  sl.canonical_source_url,
  ov.title,
  ov.organization,
  ov.description,
  ov.location_text,
  ov.country,
  ov.region,
  ov.city,
  ov.opportunity_kind,
  ov.employment_type,
  ov.remote_mode,
  ov.posted_at,
  ov.application_deadline,
  ov.application_url,
  ov.captured_at as version_captured_at
from public.opportunities o
join public.opportunity_versions ov on ov.id = o.current_version_id
join public.source_listings sl on sl.id = ov.source_listing_id
join public.sources s on s.id = sl.source_id;

comment on view public.opportunity_search is
  'Current-version projection of every shared opportunity, for list/detail browsing and search. Read-only.';

-- ---------------------------------------------------------------------------
-- Trusted ingestion RPCs -- service_role only, never granted to the browser.
-- ---------------------------------------------------------------------------

create function public.begin_ingestion_run(p_source_key text, p_dry_run boolean default false)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source_id uuid;
  v_run_id uuid;
begin
  select id into v_source_id from public.sources where source_key = p_source_key and enabled = true;
  if v_source_id is null then
    raise exception using errcode = 'P0002', message = format('source "%s" is not configured or not enabled', p_source_key);
  end if;

  insert into public.ingestion_runs (source_id, status, dry_run, started_at)
  values (v_source_id, 'running', coalesce(p_dry_run, false), clock_timestamp())
  returning id into v_run_id;

  return v_run_id;
end;
$$;

comment on function public.begin_ingestion_run(text, boolean) is
  'Trusted-only: opens one ingestion_runs row for a configured, enabled source.';

create function public.apply_source_listing(
  p_source_key text,
  p_external_id text,
  p_canonical_source_url text,
  p_application_url text,
  p_title text,
  p_organization text,
  p_description text,
  p_location_text text,
  p_country text,
  p_region text,
  p_city text,
  p_remote_mode text,
  p_opportunity_kind text,
  p_employment_type text,
  p_posted_at timestamptz,
  p_application_deadline timestamptz,
  p_source_updated_at timestamptz,
  p_content_hash text,
  p_source_metadata jsonb
)
returns table (outcome text, opportunity_id uuid, source_listing_id uuid, opportunity_version_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source_id uuid;
  v_listing record;
  v_opportunity_id uuid;
  v_listing_id uuid;
  v_current_hash text;
  v_next_version_number integer;
  v_new_version_id uuid;
begin
  select id into v_source_id from public.sources where source_key = p_source_key and enabled = true;
  if v_source_id is null then
    raise exception using errcode = 'P0002', message = format('source "%s" is not configured or not enabled', p_source_key);
  end if;

  select sl.id, sl.opportunity_id, o.current_version_id as opp_current_version_id
    into v_listing
  from public.source_listings sl
  join public.opportunities o on o.id = sl.opportunity_id
  where sl.source_id = v_source_id and sl.external_id = p_external_id
  for update of sl;

  if not found then
    insert into public.opportunities (status) values ('active') returning id into v_opportunity_id;

    insert into public.source_listings (
      source_id, external_id, canonical_source_url, application_url,
      first_seen_at, last_seen_at, status, absence_count, opportunity_id
    ) values (
      v_source_id, p_external_id, p_canonical_source_url, p_application_url,
      clock_timestamp(), clock_timestamp(), 'active', 0, v_opportunity_id
    ) returning id into v_listing_id;

    insert into public.opportunity_versions (
      opportunity_id, source_listing_id, version_number, title, organization, description,
      location_text, country, region, city, remote_mode, opportunity_kind, employment_type,
      application_url, posted_at, application_deadline, source_updated_at, content_hash, source_metadata
    ) values (
      v_opportunity_id, v_listing_id, 1, p_title, p_organization, p_description,
      p_location_text, p_country, p_region, p_city, p_remote_mode, p_opportunity_kind, p_employment_type,
      p_application_url, p_posted_at, p_application_deadline, p_source_updated_at, p_content_hash, p_source_metadata
    ) returning id into v_new_version_id;

    update public.opportunities set current_version_id = v_new_version_id, last_checked_at = clock_timestamp()
      where id = v_opportunity_id;

    return query select 'created'::text, v_opportunity_id, v_listing_id, v_new_version_id;
    return;
  end if;

  v_opportunity_id := v_listing.opportunity_id;

  select content_hash into v_current_hash
  from public.opportunity_versions where id = v_listing.opp_current_version_id;

  update public.source_listings
    set last_seen_at = clock_timestamp(), status = 'active', absence_count = 0
    where id = v_listing.id;

  update public.opportunities
    set last_checked_at = clock_timestamp(),
        status = case when status in ('stale', 'closed', 'unknown') then 'active' else status end
    where id = v_opportunity_id;

  if v_current_hash is distinct from p_content_hash then
    select coalesce(max(ov.version_number), 0) + 1 into v_next_version_number
    from public.opportunity_versions ov where ov.opportunity_id = v_opportunity_id;

    insert into public.opportunity_versions (
      opportunity_id, source_listing_id, version_number, title, organization, description,
      location_text, country, region, city, remote_mode, opportunity_kind, employment_type,
      application_url, posted_at, application_deadline, source_updated_at, content_hash, source_metadata
    ) values (
      v_opportunity_id, v_listing.id, v_next_version_number, p_title, p_organization, p_description,
      p_location_text, p_country, p_region, p_city, p_remote_mode, p_opportunity_kind, p_employment_type,
      p_application_url, p_posted_at, p_application_deadline, p_source_updated_at, p_content_hash, p_source_metadata
    ) returning id into v_new_version_id;

    update public.opportunities set current_version_id = v_new_version_id where id = v_opportunity_id;

    return query select 'updated'::text, v_opportunity_id, v_listing.id, v_new_version_id;
    return;
  end if;

  return query select 'unchanged'::text, v_opportunity_id, v_listing.id, v_listing.opp_current_version_id;
end;
$$;

comment on function public.apply_source_listing(
  text, text, text, text, text, text, text, text, text, text, text, text, text, text,
  timestamptz, timestamptz, timestamptz, text, jsonb
) is
  'Trusted-only: atomically resolves/creates one source_listing + opportunity, and creates a new opportunity_version only when content_hash changed. Never partially applied.';

create function public.finalize_ingestion_run(
  p_run_id uuid,
  p_status text,
  p_records_found integer,
  p_records_new integer,
  p_records_updated integer,
  p_error_count integer,
  p_error_summary jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source_id uuid;
  v_started_at timestamptz;
  v_completeness text;
  v_closed_count integer := 0;
begin
  if p_status not in ('complete', 'partial', 'failed') then
    raise exception using errcode = '22023', message = 'invalid ingestion run status';
  end if;
  v_completeness := case when p_status = 'complete' then 'complete' when p_status = 'partial' then 'partial' else null end;

  update public.ingestion_runs
    set finished_at = clock_timestamp(), status = p_status, completeness = v_completeness,
        records_found = coalesce(p_records_found, 0), records_new = coalesce(p_records_new, 0),
        records_updated = coalesce(p_records_updated, 0), error_count = coalesce(p_error_count, 0),
        error_summary = coalesce(p_error_summary, '[]'::jsonb)
    where id = p_run_id
    returning source_id, started_at into v_source_id, v_started_at;

  if not found then
    raise exception using errcode = 'P0002', message = 'ingestion run not found';
  end if;

  -- Conservative closure: only a run known to be complete may close anything,
  -- and only after two consecutive complete-run absences (see
  -- docs/INGESTION_ARCHITECTURE.md #8). A partial or failed run closes nothing.
  if p_status = 'complete' then
    update public.source_listings
      set absence_count = absence_count + 1
      where source_id = v_source_id and status = 'active' and last_seen_at < v_started_at;

    -- Two separate statements, not a chained CTE: a data-modifying CTE and
    -- its parent statement share one snapshot, so a NOT EXISTS check in the
    -- parent would not see the CTE's own write. Running them as sequential
    -- statements lets the second one see the first's committed effect.
    update public.source_listings
      set status = 'removed'
      where source_id = v_source_id and status = 'active' and absence_count >= 2;

    update public.opportunities o
      set status = 'closed'
      where o.status <> 'closed'
        and exists (select 1 from public.source_listings sl where sl.opportunity_id = o.id and sl.source_id = v_source_id)
        and not exists (
          select 1 from public.source_listings sl where sl.opportunity_id = o.id and sl.status = 'active'
        );

    get diagnostics v_closed_count = row_count;
    update public.ingestion_runs set records_closed = v_closed_count where id = p_run_id;
  end if;
end;
$$;

comment on function public.finalize_ingestion_run(uuid, text, integer, integer, integer, integer, jsonb) is
  'Trusted-only: closes out one ingestion_runs row and, only for a complete run, applies the two-consecutive-absence conservative closure rule.';

revoke all on function public.begin_ingestion_run(text, boolean) from public, anon, authenticated;
revoke all on function public.apply_source_listing(
  text, text, text, text, text, text, text, text, text, text, text, text, text, text,
  timestamptz, timestamptz, timestamptz, text, jsonb
) from public, anon, authenticated;
revoke all on function public.finalize_ingestion_run(uuid, text, integer, integer, integer, integer, jsonb) from public, anon, authenticated;
grant execute on function public.begin_ingestion_run(text, boolean) to service_role;
grant execute on function public.apply_source_listing(
  text, text, text, text, text, text, text, text, text, text, text, text, text, text,
  timestamptz, timestamptz, timestamptz, text, jsonb
) to service_role;
grant execute on function public.finalize_ingestion_run(uuid, text, integer, integer, integer, integer, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- Shared-table grants and RLS: authenticated read-only, service_role full
-- (except opportunity_versions, which is insert-only for every role).
-- ---------------------------------------------------------------------------

alter table public.sources enable row level security;
revoke all on public.sources from anon, authenticated, service_role;
grant select on public.sources to authenticated;
grant select, insert, update, delete on public.sources to service_role;
create policy sources_select_all on public.sources for select to authenticated using (true);

alter table public.opportunities enable row level security;
revoke all on public.opportunities from anon, authenticated, service_role;
grant select on public.opportunities to authenticated;
grant select, insert, update, delete on public.opportunities to service_role;
create policy opportunities_select_all on public.opportunities for select to authenticated using (true);

alter table public.source_listings enable row level security;
revoke all on public.source_listings from anon, authenticated, service_role;
grant select on public.source_listings to authenticated;
grant select, insert, update, delete on public.source_listings to service_role;
create policy source_listings_select_all on public.source_listings for select to authenticated using (true);

alter table public.opportunity_versions enable row level security;
revoke all on public.opportunity_versions from anon, authenticated, service_role;
grant select on public.opportunity_versions to authenticated;
grant select, insert on public.opportunity_versions to service_role;
create policy opportunity_versions_select_all on public.opportunity_versions for select to authenticated using (true);

alter table public.ingestion_runs enable row level security;
revoke all on public.ingestion_runs from anon, authenticated, service_role;
grant select on public.ingestion_runs to authenticated;
grant select, insert, update on public.ingestion_runs to service_role;
create policy ingestion_runs_select_all on public.ingestion_runs for select to authenticated using (true);

grant select on public.opportunity_search to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Private manual opportunities (ADR-018) -- ordinary mutable CRUD, owner-only.
-- ---------------------------------------------------------------------------

create table public.private_opportunities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  source_url text not null,
  title text not null,
  organization_name text not null,
  location_text text not null,
  opportunity_kind text not null,
  employment_type text not null,
  remote_mode text not null default 'unknown',
  description_text text,
  posted_at timestamptz,
  application_deadline timestamptz,
  application_url text,
  dismissed_at timestamptz,
  promoted_to_opportunity_id uuid references public.opportunities (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_confirmed_at timestamptz not null default now(),
  constraint private_opportunities_user_id_id_key unique (user_id, id),
  constraint private_opportunities_source_url_check check (source_url ~ '^https://' and char_length(source_url) <= 2048),
  constraint private_opportunities_title_check check (btrim(title) <> '' and char_length(title) <= 400),
  constraint private_opportunities_organization_check check (btrim(organization_name) <> '' and char_length(organization_name) <= 200),
  constraint private_opportunities_location_check check (btrim(location_text) <> '' and char_length(location_text) <= 200),
  constraint private_opportunities_kind_check check (
    opportunity_kind in (
      'internship', 'working_student', 'graduate_program', 'entry_level',
      'research_assistant', 'phd', 'scholarship', 'hackathon', 'fellowship', 'other'
    )
  ),
  constraint private_opportunities_employment_type_check check (
    employment_type in ('full_time', 'part_time', 'contract', 'temporary', 'internship', 'volunteer', 'other')
  ),
  constraint private_opportunities_remote_mode_check check (remote_mode in ('onsite', 'hybrid', 'remote', 'unknown')),
  constraint private_opportunities_description_check check (description_text is null or char_length(description_text) <= 20000),
  constraint private_opportunities_application_url_check check (
    application_url is null or (application_url ~ '^https://' and char_length(application_url) <= 2048)
  )
);

comment on table public.private_opportunities is
  'Manually entered opportunities: user-owned, private by default, ordinary mutable CRUD -- structurally separate from the shared identity domain (ADR-018).';
comment on column public.private_opportunities.dismissed_at is
  'The private-entry equivalent of "hide". A private row is implicitly saved from the moment it exists -- there is no separate saved state.';
comment on column public.private_opportunities.promoted_to_opportunity_id is
  'Reserved for a future, trusted-only promotion link. No promotion logic exists yet; browser has no write grant on this column.';

create index private_opportunities_user_idx on public.private_opportunities (user_id, created_at desc);

create function public.private_opportunities_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  content_changed boolean;
begin
  if tg_op = 'INSERT' then
    new.created_at := clock_timestamp();
    new.updated_at := clock_timestamp();
    new.last_confirmed_at := clock_timestamp();
    return new;
  end if;

  new.user_id := old.user_id;
  new.created_at := old.created_at;
  new.promoted_to_opportunity_id := old.promoted_to_opportunity_id;

  -- source_url is ordinary mutable owner-corrected metadata (e.g. the board
  -- moved, or the user pasted the wrong link) -- editing it never touches
  -- an already-captured applications.private_opportunity_snapshot, which is
  -- a one-time copy taken at application creation and never re-read live.
  content_changed :=
    new.source_url is distinct from old.source_url
    or new.title is distinct from old.title
    or new.organization_name is distinct from old.organization_name
    or new.location_text is distinct from old.location_text
    or new.opportunity_kind is distinct from old.opportunity_kind
    or new.employment_type is distinct from old.employment_type
    or new.remote_mode is distinct from old.remote_mode
    or new.description_text is distinct from old.description_text
    or new.posted_at is distinct from old.posted_at
    or new.application_deadline is distinct from old.application_deadline
    or new.application_url is distinct from old.application_url;

  if content_changed then
    new.updated_at := clock_timestamp();
    new.last_confirmed_at := clock_timestamp();
  elsif new.dismissed_at is distinct from old.dismissed_at then
    new.updated_at := clock_timestamp();
    new.last_confirmed_at := old.last_confirmed_at;
  else
    new.updated_at := old.updated_at;
    new.last_confirmed_at := old.last_confirmed_at;
  end if;
  return new;
end;
$$;

create trigger private_opportunities_before_write
before insert or update on public.private_opportunities
for each row execute function public.private_opportunities_before_write();

revoke all on function public.private_opportunities_before_write() from public, anon, authenticated;

alter table public.private_opportunities enable row level security;
revoke all on public.private_opportunities from anon, authenticated, service_role;
grant select on public.private_opportunities to authenticated;
grant insert (
  user_id, source_url, title, organization_name, location_text, opportunity_kind,
  employment_type, remote_mode, description_text, posted_at, application_deadline, application_url
) on public.private_opportunities to authenticated;
grant update (
  source_url, title, organization_name, location_text, opportunity_kind, employment_type,
  remote_mode, description_text, posted_at, application_deadline, application_url, dismissed_at
) on public.private_opportunities to authenticated;
grant delete on public.private_opportunities to authenticated;
grant select, insert, update, delete on public.private_opportunities to service_role;

create policy private_opportunities_select_own on public.private_opportunities
  for select to authenticated using ((select auth.uid()) = user_id);
create policy private_opportunities_insert_own on public.private_opportunities
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy private_opportunities_update_own on public.private_opportunities
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy private_opportunities_delete_own on public.private_opportunities
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Save/hide state for shared opportunities only (private rows use dismissed_at).
-- ---------------------------------------------------------------------------

create table public.user_opportunity_state (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  opportunity_id uuid not null references public.opportunities (id) on delete cascade,
  saved_at timestamptz,
  saved_opportunity_version_id uuid references public.opportunity_versions (id),
  hidden_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_opportunity_state_user_opportunity_key unique (user_id, opportunity_id),
  constraint user_opportunity_state_saved_pair_check check ((saved_at is null) = (saved_opportunity_version_id is null)),
  constraint user_opportunity_state_active_check check (saved_at is not null or hidden_at is not null),
  constraint user_opportunity_state_notes_check check (notes is null or char_length(notes) <= 4000)
);

comment on table public.user_opportunity_state is
  'Save/hide state for shared opportunities, one row per (user, opportunity). A "neither" state has no row -- unsave+unhide deletes it.';
comment on column public.user_opportunity_state.saved_opportunity_version_id is
  'Pins the exact version visible at save time (ADR-006); never silently repointed when the source listing changes later.';

create index user_opportunity_state_user_idx on public.user_opportunity_state (user_id, updated_at desc);

create function public.user_opportunity_state_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.saved_opportunity_version_id is not null then
    if not exists (
      select 1 from public.opportunity_versions v
      where v.id = new.saved_opportunity_version_id and v.opportunity_id = new.opportunity_id
    ) then
      raise exception using errcode = '23514', message = 'saved_opportunity_version_id must belong to the same opportunity';
    end if;
  end if;

  if tg_op = 'INSERT' then
    new.created_at := clock_timestamp();
    new.updated_at := clock_timestamp();
    return new;
  end if;

  new.user_id := old.user_id;
  new.opportunity_id := old.opportunity_id;
  new.created_at := old.created_at;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

create trigger user_opportunity_state_before_write
before insert or update on public.user_opportunity_state
for each row execute function public.user_opportunity_state_before_write();

revoke all on function public.user_opportunity_state_before_write() from public, anon, authenticated;

alter table public.user_opportunity_state enable row level security;
revoke all on public.user_opportunity_state from anon, authenticated, service_role;
grant select on public.user_opportunity_state to authenticated;
grant insert (
  user_id, opportunity_id, saved_at, saved_opportunity_version_id, hidden_at, notes
) on public.user_opportunity_state to authenticated;
grant update (
  saved_at, saved_opportunity_version_id, hidden_at, notes
) on public.user_opportunity_state to authenticated;
grant delete on public.user_opportunity_state to authenticated;
grant select, insert, update, delete on public.user_opportunity_state to service_role;

create policy user_opportunity_state_select_own on public.user_opportunity_state
  for select to authenticated using ((select auth.uid()) = user_id);
create policy user_opportunity_state_insert_own on public.user_opportunity_state
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy user_opportunity_state_update_own on public.user_opportunity_state
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy user_opportunity_state_delete_own on public.user_opportunity_state
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Application tracking. Exactly one of a pinned shared version or an
-- immutable manual snapshot -- never both, never neither.
-- ---------------------------------------------------------------------------

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  -- Stable identity for a shared application: survives new opportunity_versions
  -- created by re-ingestion, unlike opportunity_version_id which pins the exact
  -- content shown at application time. Always server-derived from
  -- opportunity_version_id in applications_before_write -- the browser has no
  -- write grant on this column at all.
  shared_opportunity_id uuid references public.opportunities (id),
  opportunity_version_id uuid references public.opportunity_versions (id),
  private_opportunity_id uuid references public.private_opportunities (id) on delete set null,
  private_opportunity_snapshot jsonb,
  status text not null default 'preparing',
  applied_at timestamptz,
  status_updated_at timestamptz not null default now(),
  next_action text,
  next_action_due_at timestamptz,
  notes text,
  contact_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint applications_source_check check (
    (opportunity_version_id is not null and shared_opportunity_id is not null and private_opportunity_id is null and private_opportunity_snapshot is null)
    or
    (opportunity_version_id is null and shared_opportunity_id is null and private_opportunity_snapshot is not null)
  ),
  constraint applications_status_check check (
    status in (
      'preparing', 'applied', 'awaiting_response', 'interview_scheduled', 'interview_complete',
      'offer', 'accepted', 'rejected', 'withdrawn', 'closed'
    )
  ),
  constraint applications_next_action_check check (next_action is null or char_length(next_action) <= 400),
  constraint applications_notes_check check (notes is null or char_length(notes) <= 8000),
  constraint applications_contact_note_check check (contact_note is null or char_length(contact_note) <= 4000)
);

comment on table public.applications is
  'One row per application. opportunity_version_id (shared) or private_opportunity_snapshot (manual) is pinned at creation and never rewritten.';
comment on column public.applications.contact_note is
  'General recruiter/contact notes for this application. Interview-specific observations belong on interview_prep_notes instead.';
comment on column public.applications.private_opportunity_snapshot is
  'Captured once at creation from private_opportunities. Never updated afterward, even if the source private_opportunities row is later edited or deleted.';
comment on column public.applications.shared_opportunity_id is
  'Stable shared-opportunity identity, derived server-side from opportunity_version_id and immutable thereafter. Lets a shared application remain associated with its opportunity (and keep showing as Applied) even after re-ingestion pins a new current_version_id -- unlike opportunity_version_id, which intentionally still points at the exact content shown when the user applied.';

create index applications_user_idx on public.applications (user_id, status_updated_at desc);
create index applications_opportunity_version_idx on public.applications (opportunity_version_id);
create index applications_private_opportunity_idx on public.applications (private_opportunity_id);

-- MVP behavior: at most one application tracker per user per listing. A
-- second "start application" for the same shared opportunity or the same
-- existing manual opportunity is rejected by this constraint; the UI is
-- expected to look up and navigate to the existing application instead of
-- attempting a duplicate insert. No application-attempt history/event
-- sourcing is in scope.
create unique index applications_user_shared_opportunity_uidx
  on public.applications (user_id, shared_opportunity_id)
  where shared_opportunity_id is not null;
create unique index applications_user_private_opportunity_uidx
  on public.applications (user_id, private_opportunity_id)
  where private_opportunity_id is not null;

create function public.applications_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_private_owner uuid;
  v_snapshot jsonb;
  v_shared_opportunity_id uuid;
begin
  if tg_op = 'INSERT' then
    if (new.opportunity_version_id is not null) = (new.private_opportunity_id is not null) then
      raise exception using errcode = '23514',
        message = 'application must reference exactly one of opportunity_version_id or private_opportunity_id';
    end if;

    if new.opportunity_version_id is not null then
      -- Never trust a browser-supplied shared_opportunity_id (there is no
      -- write grant on it anyway) -- always derive the stable identity from
      -- the pinned version itself.
      select ov.opportunity_id into v_shared_opportunity_id
      from public.opportunity_versions ov where ov.id = new.opportunity_version_id;
      if v_shared_opportunity_id is null then
        raise exception using errcode = 'P0002', message = 'unknown opportunity version';
      end if;
      new.shared_opportunity_id := v_shared_opportunity_id;
    else
      new.shared_opportunity_id := null;
    end if;

    if new.private_opportunity_id is not null then
      select po.user_id, jsonb_build_object(
        'source_url', po.source_url,
        'title', po.title,
        'organization_name', po.organization_name,
        'location_text', po.location_text,
        'opportunity_kind', po.opportunity_kind,
        'employment_type', po.employment_type,
        'remote_mode', po.remote_mode,
        'description_text', po.description_text,
        'posted_at', po.posted_at,
        'application_deadline', po.application_deadline,
        'application_url', po.application_url
      ) into v_private_owner, v_snapshot
      from public.private_opportunities po where po.id = new.private_opportunity_id;

      if v_private_owner is null then
        raise exception using errcode = 'P0002', message = 'unknown private opportunity';
      end if;
      if v_private_owner is distinct from new.user_id then
        raise exception using errcode = '42501', message = 'cannot create an application for another user''s manual opportunity';
      end if;
      new.private_opportunity_snapshot := v_snapshot;
    else
      new.private_opportunity_id := null;
      new.private_opportunity_snapshot := null;
    end if;

    new.status := coalesce(new.status, 'preparing');
    new.status_updated_at := clock_timestamp();
    if new.status <> 'preparing' and new.applied_at is null then
      new.applied_at := clock_timestamp();
    end if;
    new.created_at := clock_timestamp();
    new.updated_at := clock_timestamp();
    return new;
  end if;

  -- UPDATE: pinned source, snapshot, owner, and creation time are immutable.
  new.user_id := old.user_id;
  new.created_at := old.created_at;
  new.opportunity_version_id := old.opportunity_version_id;
  new.shared_opportunity_id := old.shared_opportunity_id;
  new.private_opportunity_snapshot := old.private_opportunity_snapshot;

  if new.private_opportunity_id is distinct from old.private_opportunity_id and new.private_opportunity_id is not null then
    raise exception using errcode = '42501', message = 'cannot repoint or attach a private opportunity after creation';
  end if;

  if new.status is distinct from old.status then
    new.status_updated_at := clock_timestamp();
    if new.status <> 'preparing' and new.applied_at is null then
      new.applied_at := clock_timestamp();
    end if;
  else
    new.status_updated_at := old.status_updated_at;
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

create trigger applications_before_write
before insert or update on public.applications
for each row execute function public.applications_before_write();

revoke all on function public.applications_before_write() from public, anon, authenticated;

alter table public.applications enable row level security;
revoke all on public.applications from anon, authenticated, service_role;
grant select on public.applications to authenticated;
grant insert (
  user_id, opportunity_version_id, private_opportunity_id, status, applied_at,
  next_action, next_action_due_at, notes, contact_note
) on public.applications to authenticated;
grant update (
  status, applied_at, next_action, next_action_due_at, notes, contact_note
) on public.applications to authenticated;
grant delete on public.applications to authenticated;
grant select, insert, update, delete on public.applications to service_role;

create policy applications_select_own on public.applications
  for select to authenticated using ((select auth.uid()) = user_id);
create policy applications_insert_own on public.applications
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy applications_update_own on public.applications
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy applications_delete_own on public.applications
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Interview preparation notes: one row per application.
-- ---------------------------------------------------------------------------

create table public.interview_prep_notes (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null unique references public.applications (id) on delete cascade,
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  responsibilities_to_discuss text,
  required_technologies text,
  topics_to_revise text,
  likely_questions text,
  questions_to_ask text,
  interview_date timestamptz,
  interview_format text,
  reflections text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint interview_prep_notes_format_check check (interview_format is null or char_length(interview_format) <= 100),
  constraint interview_prep_notes_text_lengths_check check (
    (responsibilities_to_discuss is null or char_length(responsibilities_to_discuss) <= 4000)
    and (required_technologies is null or char_length(required_technologies) <= 4000)
    and (topics_to_revise is null or char_length(topics_to_revise) <= 4000)
    and (likely_questions is null or char_length(likely_questions) <= 4000)
    and (questions_to_ask is null or char_length(questions_to_ask) <= 4000)
    and (reflections is null or char_length(reflections) <= 4000)
  )
);

comment on table public.interview_prep_notes is
  'One editable interview-prep area per application. Recruiter/contact notes live on applications.contact_note instead.';

create function public.interview_prep_notes_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  if tg_op = 'INSERT' then
    select user_id into v_owner from public.applications where id = new.application_id;
    if v_owner is null then
      raise exception using errcode = 'P0002', message = 'unknown application';
    end if;
    new.user_id := v_owner;
    new.created_at := clock_timestamp();
    new.updated_at := clock_timestamp();
    return new;
  end if;

  new.user_id := old.user_id;
  new.application_id := old.application_id;
  new.created_at := old.created_at;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

create trigger interview_prep_notes_before_write
before insert or update on public.interview_prep_notes
for each row execute function public.interview_prep_notes_before_write();

revoke all on function public.interview_prep_notes_before_write() from public, anon, authenticated;

alter table public.interview_prep_notes enable row level security;
revoke all on public.interview_prep_notes from anon, authenticated, service_role;
grant select on public.interview_prep_notes to authenticated;
grant insert (
  application_id, responsibilities_to_discuss, required_technologies, topics_to_revise,
  likely_questions, questions_to_ask, interview_date, interview_format, reflections
) on public.interview_prep_notes to authenticated;
grant update (
  responsibilities_to_discuss, required_technologies, topics_to_revise,
  likely_questions, questions_to_ask, interview_date, interview_format, reflections
) on public.interview_prep_notes to authenticated;
grant delete on public.interview_prep_notes to authenticated;
grant select, insert, update, delete on public.interview_prep_notes to service_role;

create policy interview_prep_notes_select_own on public.interview_prep_notes
  for select to authenticated using ((select auth.uid()) = user_id);
create policy interview_prep_notes_insert_own on public.interview_prep_notes
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy interview_prep_notes_update_own on public.interview_prep_notes
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy interview_prep_notes_delete_own on public.interview_prep_notes
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Reviewed source registry seed (docs/DATA_SOURCES_AND_COMPLIANCE.md #3).
-- All three boards were reviewed during Phase 2A.0 research; this task is
-- the repository owner's explicit authorization to enable them for real
-- ingestion (INGESTION_ARCHITECTURE.md #10 checklist item 13).
-- ---------------------------------------------------------------------------

insert into public.sources (source_key, adapter_kind, display_name, base_url, enabled) values
  ('greenhouse:helsing', 'greenhouse', 'Helsing (Greenhouse)', 'https://boards-api.greenhouse.io/v1/boards/helsing/jobs', true),
  ('greenhouse:marvelfusion', 'greenhouse', 'Marvel Fusion (Greenhouse)', 'https://boards-api.greenhouse.io/v1/boards/marvelfusion/jobs', true),
  ('greenhouse:konux', 'greenhouse', 'KONUX (Greenhouse)', 'https://boards-api.greenhouse.io/v1/boards/konux/jobs', true);
