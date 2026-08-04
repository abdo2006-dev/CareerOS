-- Private manual opportunities, save/hide state, application tracking, and
-- interview-prep notes: structure, grants, RLS, and the core correctness
-- rules from AGENTS.md / docs/adr/ADR-018. All fixture data is synthetic
-- and this transaction is rolled back.
begin;
select plan(55);

-- Structure -----------------------------------------------------------------

select has_table('public', 'private_opportunities', 'private_opportunities table exists');
select has_table('public', 'user_opportunity_state', 'user_opportunity_state table exists');
select has_table('public', 'applications', 'applications table exists');
select has_table('public', 'interview_prep_notes', 'interview_prep_notes table exists');
select fk_ok('public', 'user_opportunity_state', 'opportunity_id', 'public', 'opportunities', 'id', 'user_opportunity_state.opportunity_id references opportunities');
select fk_ok('public', 'applications', 'private_opportunity_id', 'public', 'private_opportunities', 'id', 'applications.private_opportunity_id references private_opportunities');
select fk_ok('public', 'interview_prep_notes', 'application_id', 'public', 'applications', 'id', 'interview_prep_notes.application_id references applications');

select policies_are(
  'public', 'private_opportunities',
  array['private_opportunities_select_own', 'private_opportunities_insert_own', 'private_opportunities_update_own', 'private_opportunities_delete_own'],
  'private_opportunities has exactly the own-row policies'
);
select policies_are(
  'public', 'applications',
  array['applications_select_own', 'applications_insert_own', 'applications_update_own', 'applications_delete_own'],
  'applications has exactly the own-row policies'
);

select is(
  not has_column_privilege('authenticated', 'public.private_opportunities', 'promoted_to_opportunity_id', 'INSERT, UPDATE'),
  true,
  'browser has no write grant on promoted_to_opportunity_id'
);
select is(
  not has_column_privilege('authenticated', 'public.applications', 'opportunity_version_id', 'UPDATE')
    and not has_column_privilege('authenticated', 'public.applications', 'private_opportunity_snapshot', 'UPDATE')
    and not has_column_privilege('authenticated', 'public.applications', 'user_id', 'UPDATE'),
  true,
  'browser cannot rewrite the pinned source, snapshot, or owner of an application'
);

select table_privs_are('public', 'private_opportunities', 'anon', array[]::text[], 'anon has no private_opportunities grants');
select table_privs_are('public', 'applications', 'anon', array[]::text[], 'anon has no applications grants');

-- Fixtures --------------------------------------------------------------

insert into auth.users (id, aud, role, email) values
  ('83000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'opp-a@example.test'),
  ('83000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'opp-b@example.test');
insert into public.profiles (user_id, headline) values
  ('83000000-0000-0000-0000-000000000001', 'A'),
  ('83000000-0000-0000-0000-000000000002', 'B');

set role service_role;
select public.begin_ingestion_run('greenhouse:helsing', false) as run_id \gset
select opportunity_id, opportunity_version_id from public.apply_source_listing(
  'greenhouse:helsing', 'job-shared-1', 'https://job-boards.greenhouse.io/helsing/jobs/1', 'https://job-boards.greenhouse.io/helsing/jobs/1',
  'Software Engineer Intern', 'Helsing', 'Description.', 'Munich, Germany', 'Germany', 'Bavaria', 'Munich',
  'onsite', 'internship', 'internship', clock_timestamp(), null, clock_timestamp(), 'hash-1', '{}'::jsonb
) \gset shared_
select public.finalize_ingestion_run(:'run_id', 'complete', 1, 1, 0, 0, '[]'::jsonb);

-- Owner CRUD, save/hide, and manual opportunities ----------------------------

reset role;
select set_config('request.jwt.claims', json_build_object('sub', '83000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
set role authenticated;

select lives_ok(
  $$ insert into public.private_opportunities (user_id, source_url, title, organization_name, location_text, opportunity_kind, employment_type)
     values ('83000000-0000-0000-0000-000000000001', 'https://example.test/job', 'Research Assistant', 'Fraunhofer IWES', 'Bremen, Germany', 'research_assistant', 'part_time') $$,
  'owner can create a manual opportunity'
);
select throws_ok(
  $$ insert into public.private_opportunities (user_id, source_url, title, organization_name, location_text, opportunity_kind, employment_type)
     values ('83000000-0000-0000-0000-000000000002', 'https://example.test/forged', 'x', 'x', 'x', 'other', 'other') $$,
  '42501'::char(5), null, 'a forged user_id on insert is rejected'
);
select throws_ok(
  $$ update public.private_opportunities set promoted_to_opportunity_id = gen_random_uuid() where organization_name = 'Fraunhofer IWES' $$,
  '42501'::char(5), null, 'browser cannot write promoted_to_opportunity_id'
);
select lives_ok(
  $$ update public.private_opportunities set dismissed_at = clock_timestamp() where organization_name = 'Fraunhofer IWES' $$,
  'owner can hide (dismiss) a manual opportunity'
);
select lives_ok(
  $$ update public.private_opportunities set dismissed_at = null where organization_name = 'Fraunhofer IWES' $$,
  'owner can unhide a manual opportunity'
);

select lives_ok(
  $$ insert into public.user_opportunity_state (user_id, opportunity_id, saved_at, saved_opportunity_version_id)
     values ('83000000-0000-0000-0000-000000000001', $$ || quote_literal(:'shared_opportunity_id') || $$, clock_timestamp(), $$ || quote_literal(:'shared_opportunity_version_id') || $$) $$,
  'owner can save a shared opportunity, pinning the current version'
);
select is(
  (select saved_opportunity_version_id from public.user_opportunity_state where opportunity_id = :'shared_opportunity_id'::uuid),
  :'shared_opportunity_version_id'::uuid,
  'the saved state pins the exact version visible at save time'
);
select throws_ok(
  format(
    $$ insert into public.user_opportunity_state (user_id, opportunity_id, hidden_at) values ('83000000-0000-0000-0000-000000000001', %L, clock_timestamp()) $$,
    gen_random_uuid()
  ),
  '23503'::char(5), null, 'hiding (or saving) requires a real opportunity_id'
);
select lives_ok(
  $$ update public.user_opportunity_state set hidden_at = clock_timestamp() where opportunity_id = $$ || quote_literal(:'shared_opportunity_id') || $$::uuid $$,
  'owner can additionally hide a saved opportunity'
);
select throws_ok(
  $$ insert into public.user_opportunity_state (user_id, opportunity_id) values ('83000000-0000-0000-0000-000000000001', gen_random_uuid()) $$,
  '23514'::char(5), null, 'a state row with neither saved_at nor hidden_at is rejected'
);

-- Applications: exactly one source, pinning, and snapshot capture -----------

select throws_ok(
  $$ insert into public.applications (user_id) values ('83000000-0000-0000-0000-000000000001') $$,
  '23514'::char(5), null, 'an application with neither a shared version nor a manual opportunity is rejected'
);
select throws_ok(
  format(
    $$ insert into public.applications (user_id, opportunity_version_id, private_opportunity_id) values ('83000000-0000-0000-0000-000000000001', %L, (select id from public.private_opportunities where organization_name = 'Fraunhofer IWES')) $$,
    :'shared_opportunity_version_id'
  ),
  '23514'::char(5), null, 'an application referencing both a shared version and a manual opportunity is rejected'
);

select lives_ok(
  format($$ insert into public.applications (user_id, opportunity_version_id) values ('83000000-0000-0000-0000-000000000001', %L) $$, :'shared_opportunity_version_id'),
  'owner can start a shared application, pinning the current version'
);
select is(
  (select status from public.applications where opportunity_version_id = :'shared_opportunity_version_id'::uuid),
  'preparing', 'a new shared application defaults to preparing'
);
select is(
  (select applied_at from public.applications where opportunity_version_id = :'shared_opportunity_version_id'::uuid),
  null::timestamptz, 'preparing has no applied_at yet'
);

select lives_ok(
  $$ insert into public.applications (user_id, private_opportunity_id, status)
     values ('83000000-0000-0000-0000-000000000001', (select id from public.private_opportunities where organization_name = 'Fraunhofer IWES'), 'applied') $$,
  'owner can start a manual application'
);
select is(
  (select private_opportunity_snapshot ->> 'organization_name' from public.applications where private_opportunity_id = (select id from public.private_opportunities where organization_name = 'Fraunhofer IWES')),
  'Fraunhofer IWES', 'the manual application captures a snapshot of the relevant listing fields'
);
select is(
  (select applied_at is not null from public.applications where private_opportunity_id = (select id from public.private_opportunities where organization_name = 'Fraunhofer IWES')),
  true, 'starting directly at a non-preparing status sets applied_at automatically'
);

select throws_ok(
  format(
    $$ insert into public.applications (user_id, private_opportunity_id) values ('83000000-0000-0000-0000-000000000001', %L) $$,
    gen_random_uuid()
  ),
  'P0002'::char(5), null, 'referencing a nonexistent private opportunity fails (caught by the trigger before the FK constraint)'
);

-- Editing the manual opportunity afterward must not alter the captured snapshot.
update public.private_opportunities set title = 'Research Assistant (Renamed)' where organization_name = 'Fraunhofer IWES';
select is(
  (select private_opportunity_snapshot ->> 'title' from public.applications where private_opportunity_id = (select id from public.private_opportunities where organization_name = 'Fraunhofer IWES')),
  'Research Assistant', 'the application snapshot is immutable even after the private opportunity is edited'
);

select throws_ok(
  format($$ update public.applications set opportunity_version_id = %L where opportunity_version_id = %L $$, :'shared_opportunity_version_id', :'shared_opportunity_version_id'),
  '42501'::char(5), null, 'the browser cannot rewrite the pinned opportunity_version_id'
);

-- Status/applied_at/status_updated_at behavior -------------------------------

select status_updated_at as t0 from public.applications where opportunity_version_id = :'shared_opportunity_version_id'::uuid \gset shared_app_
select lives_ok(
  format($$ update public.applications set notes = 'talked to recruiter' where opportunity_version_id = %L $$, :'shared_opportunity_version_id'),
  'owner can add notes'
);
select is(
  (select status_updated_at from public.applications where opportunity_version_id = :'shared_opportunity_version_id'::uuid),
  :'shared_app_t0'::timestamptz, 'an ordinary note edit does not advance status_updated_at'
);
select lives_ok(
  format($$ update public.applications set status = 'applied' where opportunity_version_id = %L $$, :'shared_opportunity_version_id'),
  'owner can change status'
);
select isnt(
  (select status_updated_at from public.applications where opportunity_version_id = :'shared_opportunity_version_id'::uuid),
  :'shared_app_t0'::timestamptz, 'a real status change advances status_updated_at'
);
select is(
  (select applied_at is not null from public.applications where opportunity_version_id = :'shared_opportunity_version_id'::uuid),
  true, 'transitioning out of preparing sets applied_at'
);
select throws_ok(
  format($$ update public.applications set status = 'not_a_real_status' where opportunity_version_id = %L $$, :'shared_opportunity_version_id'),
  '23514'::char(5), null, 'an invalid status is rejected'
);

-- Interview prep notes --------------------------------------------------

select lives_ok(
  format(
    $$ insert into public.interview_prep_notes (application_id, likely_questions) values ((select id from public.applications where opportunity_version_id = %L), 'Tell me about a project you shipped.') $$,
    :'shared_opportunity_version_id'
  ),
  'owner can add interview prep notes'
);
select is(
  (select user_id from public.interview_prep_notes where application_id = (select id from public.applications where opportunity_version_id = :'shared_opportunity_version_id'::uuid)),
  '83000000-0000-0000-0000-000000000001'::uuid, 'interview_prep_notes.user_id is derived from the application owner, not client-supplied'
);
select lives_ok(
  format(
    $$ update public.interview_prep_notes set reflections = 'went well' where application_id = (select id from public.applications where opportunity_version_id = %L) $$,
    :'shared_opportunity_version_id'
  ),
  'owner can update interview prep notes'
);

-- Cross-user isolation --------------------------------------------------

reset role;
select set_config('request.jwt.claims', json_build_object('sub', '83000000-0000-0000-0000-000000000002', 'role', 'authenticated')::text, true);
set role authenticated;

select is_empty(
  $$ select 1 from public.private_opportunities where user_id = '83000000-0000-0000-0000-000000000001' $$,
  'a second user cannot see the first user''s manual opportunities'
);
select is_empty(
  $$ select 1 from public.applications where user_id = '83000000-0000-0000-0000-000000000001' $$,
  'a second user cannot see the first user''s applications'
);
select is_empty(
  $$ select 1 from public.interview_prep_notes where user_id = '83000000-0000-0000-0000-000000000001' $$,
  'a second user cannot see the first user''s interview prep notes'
);
with attempted as (
  update public.applications set status = 'rejected'
  where user_id = '83000000-0000-0000-0000-000000000001'
  returning 1
)
select is((select count(*)::int from attempted), 0, 'a second user cannot update the first user''s applications');
select throws_ok(
  format(
    $$ insert into public.interview_prep_notes (application_id) values ((select id from public.applications where opportunity_version_id = %L)) $$,
    :'shared_opportunity_version_id'
  ),
  'P0002'::char(5), null, 'a second user cannot attach interview prep notes to the first user''s application (RLS hides it entirely, so it looks unknown rather than forbidden)'
);
select throws_ok(
  $$ insert into public.applications (user_id, private_opportunity_id) values ('83000000-0000-0000-0000-000000000002', (select id from public.private_opportunities where organization_name = 'Research Assistant (Renamed)')) $$,
  '23514'::char(5), null, 'a second user cannot start an application against the first user''s manual opportunity (RLS hides it, so the id resolves to null and fails the source-check instead)'
);

-- Deleting a referenced manual opportunity preserves the application snapshot.
reset role;
select set_config('request.jwt.claims', json_build_object('sub', '83000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
set role authenticated;
delete from public.private_opportunities where organization_name = 'Fraunhofer IWES';
select is(
  (select private_opportunity_id from public.applications where private_opportunity_snapshot ->> 'organization_name' = 'Fraunhofer IWES'),
  null::uuid, 'the application''s private_opportunity_id becomes null once the source record is deleted'
);
select is(
  (select private_opportunity_snapshot ->> 'organization_name' from public.applications where private_opportunity_snapshot ->> 'organization_name' = 'Fraunhofer IWES'),
  'Fraunhofer IWES', 'the application''s snapshot survives deletion of the source manual opportunity'
);

reset role;
set role anon;
select throws_ok($$ select 1 from public.private_opportunities $$, '42501'::char(5), null, 'anonymous private_opportunities SELECT is denied at grants');
select throws_ok($$ select 1 from public.applications $$, '42501'::char(5), null, 'anonymous applications SELECT is denied at grants');
select throws_ok($$ select 1 from public.interview_prep_notes $$, '42501'::char(5), null, 'anonymous interview_prep_notes SELECT is denied at grants');
select throws_ok($$ select 1 from public.user_opportunity_state $$, '42501'::char(5), null, 'anonymous user_opportunity_state SELECT is denied at grants');

reset role;
select * from finish();
rollback;
