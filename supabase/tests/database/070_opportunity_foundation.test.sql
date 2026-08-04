-- Shared opportunity identity/version domain: structure, grants, RLS, the
-- trusted ingestion RPCs, immutability, and conservative closure. All
-- fixture data is synthetic and this transaction is rolled back.
begin;
select plan(53);

-- Structure -------------------------------------------------------------

select has_table('public', 'sources', 'sources table exists');
select has_table('public', 'source_listings', 'source_listings table exists');
select has_table('public', 'opportunities', 'opportunities table exists');
select has_table('public', 'opportunity_versions', 'opportunity_versions table exists');
select has_table('public', 'ingestion_runs', 'ingestion_runs table exists');
select has_view('public', 'opportunity_search', 'opportunity_search view exists');
select fk_ok('public', 'source_listings', 'source_id', 'public', 'sources', 'id', 'source_listings.source_id references sources');
select fk_ok('public', 'source_listings', 'opportunity_id', 'public', 'opportunities', 'id', 'source_listings.opportunity_id references opportunities');
select fk_ok('public', 'opportunity_versions', 'opportunity_id', 'public', 'opportunities', 'id', 'opportunity_versions.opportunity_id references opportunities');
select fk_ok('public', 'opportunity_versions', 'source_listing_id', 'public', 'source_listings', 'id', 'opportunity_versions.source_listing_id references source_listings');

select is((select relrowsecurity from pg_class where oid = 'public.sources'::regclass), true, 'RLS enabled on sources');
select is((select relrowsecurity from pg_class where oid = 'public.source_listings'::regclass), true, 'RLS enabled on source_listings');
select is((select relrowsecurity from pg_class where oid = 'public.opportunities'::regclass), true, 'RLS enabled on opportunities');
select is((select relrowsecurity from pg_class where oid = 'public.opportunity_versions'::regclass), true, 'RLS enabled on opportunity_versions');
select is((select relrowsecurity from pg_class where oid = 'public.ingestion_runs'::regclass), true, 'RLS enabled on ingestion_runs');

-- Grants ------------------------------------------------------------------

select table_privs_are('public', 'sources', 'authenticated', array['SELECT'], 'authenticated has read-only access to sources');
select table_privs_are('public', 'source_listings', 'authenticated', array['SELECT'], 'authenticated has read-only access to source_listings');
select table_privs_are('public', 'opportunities', 'authenticated', array['SELECT'], 'authenticated has read-only access to opportunities');
select table_privs_are('public', 'opportunity_versions', 'authenticated', array['SELECT'], 'authenticated has read-only access to opportunity_versions');
select table_privs_are('public', 'ingestion_runs', 'authenticated', array['SELECT'], 'authenticated has read-only access to ingestion_runs');
select table_privs_are('public', 'sources', 'anon', array[]::text[], 'anon has no sources grants');
select table_privs_are('public', 'opportunities', 'anon', array[]::text[], 'anon has no opportunities grants');
select table_privs_are('public', 'opportunity_versions', 'service_role', array['SELECT', 'INSERT'], 'opportunity_versions is insert-only, even for service_role -- immutability at the grant level');

-- Seeded reviewed boards ----------------------------------------------------

select is((select count(*)::int from public.sources where enabled = true), 3, 'three reviewed Greenhouse boards are enabled');
select ok(exists (select 1 from public.sources where source_key = 'greenhouse:helsing'), 'helsing is configured');

-- Trusted RPCs are never reachable from the browser --------------------------

reset role;
select set_config('request.jwt.claims', json_build_object('sub', '82000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
set role authenticated;
select throws_ok($$ select public.begin_ingestion_run('greenhouse:helsing', false) $$, '42501'::char(5), null, 'browser cannot call begin_ingestion_run');
select throws_ok(
  $$ select public.apply_source_listing('greenhouse:helsing','x','https://x','https://x','t','o','d',null,null,null,null,'onsite','internship','internship',null,null,null,'h','{}'::jsonb) $$,
  '42501'::char(5), null, 'browser cannot call apply_source_listing'
);
select throws_ok($$ select public.finalize_ingestion_run(gen_random_uuid(), 'complete', 0, 0, 0, 0, '[]'::jsonb) $$, '42501'::char(5), null, 'browser cannot call finalize_ingestion_run');
select throws_ok($$ insert into public.opportunities (status) values ('active') $$, '42501'::char(5), null, 'browser cannot insert opportunities directly');
select throws_ok($$ update public.sources set enabled = false where source_key = 'greenhouse:helsing' $$, '42501'::char(5), null, 'browser cannot write sources directly');

reset role;
set role anon;
select throws_ok($$ select 1 from public.sources $$, '42501'::char(5), null, 'anonymous sources SELECT is denied at grants');
select throws_ok($$ select 1 from public.opportunity_search $$, '42501'::char(5), null, 'anonymous opportunity_search SELECT is denied at grants');

-- Functional: create / unchanged / updated, and view projection -------------

reset role;
set role service_role;
select public.begin_ingestion_run('greenhouse:helsing', false) as run_id \gset
select outcome, opportunity_id, opportunity_version_id from public.apply_source_listing(
  'greenhouse:helsing', 'job-1', 'https://job-boards.greenhouse.io/helsing/jobs/1', 'https://job-boards.greenhouse.io/helsing/jobs/1',
  'Software Engineer Intern', 'Helsing', 'Description one.', 'Munich, Germany', 'Germany', 'Bavaria', 'Munich',
  'onsite', 'internship', 'internship', clock_timestamp(), null, clock_timestamp(), 'hash-1', '{}'::jsonb
) \gset first_

select is(:'first_outcome'::text, 'created'::text, 'first observation of a listing creates a new opportunity');
select is((select count(*)::int from public.opportunity_versions where opportunity_id = :'first_opportunity_id'), 1, 'exactly one version exists after the first observation');

select outcome from public.apply_source_listing(
  'greenhouse:helsing', 'job-1', 'https://job-boards.greenhouse.io/helsing/jobs/1', 'https://job-boards.greenhouse.io/helsing/jobs/1',
  'Software Engineer Intern', 'Helsing', 'Description one.', 'Munich, Germany', 'Germany', 'Bavaria', 'Munich',
  'onsite', 'internship', 'internship', clock_timestamp(), null, clock_timestamp(), 'hash-1', '{}'::jsonb
) \gset rerun_
select is(:'rerun_outcome'::text, 'unchanged'::text, 'an identical rerun creates no new version');
select is((select count(*)::int from public.opportunity_versions where opportunity_id = :'first_opportunity_id'), 1, 'version count is unchanged after an identical rerun');

select outcome, opportunity_version_id from public.apply_source_listing(
  'greenhouse:helsing', 'job-1', 'https://job-boards.greenhouse.io/helsing/jobs/1', 'https://job-boards.greenhouse.io/helsing/jobs/1',
  'Software Engineer Intern', 'Helsing', 'Description one, revised.', 'Munich, Germany', 'Germany', 'Bavaria', 'Munich',
  'onsite', 'internship', 'internship', clock_timestamp(), null, clock_timestamp(), 'hash-2', '{}'::jsonb
) \gset changed_
select is(:'changed_outcome'::text, 'updated'::text, 'changed content creates exactly one new version');
select is((select count(*)::int from public.opportunity_versions where opportunity_id = :'first_opportunity_id'), 2, 'version count is two after one content change');
select is((select current_version_id from public.opportunities where id = :'first_opportunity_id'), :'changed_opportunity_version_id'::uuid, 'current_version_id points at the newest version');

select is(
  (select title from public.opportunity_search where opportunity_id = :'first_opportunity_id'),
  'Software Engineer Intern',
  'opportunity_search reflects the current version'
);

-- Immutability: no role, including service_role, may update or delete a version
select throws_ok(
  $$ update public.opportunity_versions set title = 'Hacked' $$,
  '42501'::char(5), null, 'service_role cannot update an opportunity_version -- insert-only by grant'
);
select throws_ok(
  $$ delete from public.opportunity_versions $$,
  '42501'::char(5), null, 'service_role cannot delete an opportunity_version -- insert-only by grant'
);

-- Malformed record isolation: a single bad record is rejected without
-- corrupting the ones already applied.
select throws_ok(
  $$ select public.apply_source_listing('greenhouse:helsing','job-2','https://x','https://x','t','o','d',null,null,null,null,'onsite','not_a_real_kind','internship',null,null,null,'h2','{}'::jsonb) $$,
  '23514'::char(5), null, 'a malformed record (invalid opportunity_kind) is rejected'
);
select is((select count(*)::int from public.opportunities), 1, 'the malformed record did not create a stray opportunity, and the earlier valid one is untouched');

-- Conservative closure: a partial run closes nothing; a complete run closes
-- only after two consecutive absences.
select public.finalize_ingestion_run(:'run_id', 'complete', 1, 1, 1, 0, '[]'::jsonb);

select public.begin_ingestion_run('greenhouse:helsing', false) as partial_run_id \gset
select public.finalize_ingestion_run(:'partial_run_id', 'partial', 0, 0, 0, 1, '[{"type":"timeout","message":"boom"}]'::jsonb);
select is((select absence_count from public.source_listings where external_id = 'job-1'), 0::smallint, 'a partial run does not increment the absence counter');
select is((select status from public.source_listings where external_id = 'job-1'), 'active', 'a partial run closes nothing');

select public.begin_ingestion_run('greenhouse:helsing', false) as complete_run_id_1 \gset
select public.finalize_ingestion_run(:'complete_run_id_1', 'complete', 0, 0, 0, 0, '[]'::jsonb);
select is((select absence_count from public.source_listings where external_id = 'job-1'), 1::smallint, 'first complete-run absence increments the counter to one');
select is((select status from public.source_listings where external_id = 'job-1'), 'active', 'a single complete-run absence does not yet close the listing');

select public.begin_ingestion_run('greenhouse:helsing', false) as complete_run_id_2 \gset
select public.finalize_ingestion_run(:'complete_run_id_2', 'complete', 0, 0, 0, 0, '[]'::jsonb);
select is((select status from public.source_listings where external_id = 'job-1'), 'removed', 'two consecutive complete-run absences close the listing');
select is((select status from public.opportunities where id = :'first_opportunity_id'), 'closed', 'the canonical opportunity closes once its only listing is closed');

-- Reappearance resets the absence counter and reopens the listing/opportunity.
select outcome from public.apply_source_listing(
  'greenhouse:helsing', 'job-1', 'https://job-boards.greenhouse.io/helsing/jobs/1', 'https://job-boards.greenhouse.io/helsing/jobs/1',
  'Software Engineer Intern', 'Helsing', 'Description one, revised.', 'Munich, Germany', 'Germany', 'Bavaria', 'Munich',
  'onsite', 'internship', 'internship', clock_timestamp(), null, clock_timestamp(), 'hash-2', '{}'::jsonb
);
select is((select absence_count from public.source_listings where external_id = 'job-1'), 0::smallint, 'reappearance resets the absence counter');
select is((select status from public.source_listings where external_id = 'job-1'), 'active', 'reappearance reopens the listing');
select is((select status from public.opportunities where id = :'first_opportunity_id'), 'active', 'reappearance reopens the opportunity');

reset role;
select * from finish();
rollback;
