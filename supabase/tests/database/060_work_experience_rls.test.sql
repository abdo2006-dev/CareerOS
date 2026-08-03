-- Work-experience structure, validation, RLS, review freshness, and cascade
-- safety. All fixture data is synthetic and this transaction is rolled back.
begin;
select plan(58);

-- Structure -----------------------------------------------------------------

select has_table('public', 'work_experience', 'work_experience table exists');
select is(
  (
    select array_agg(attname || ':' || format_type(atttypid, atttypmod) order by attnum)
    from pg_attribute
    where attrelid = 'public.work_experience'::regclass and attnum > 0 and not attisdropped
  ),
  array[
    'id:uuid', 'user_id:uuid', 'experience_kind:text', 'organization:text',
    'role:text', 'location:text', 'start_year:smallint', 'start_month:smallint',
    'end_year:smallint', 'end_month:smallint', 'is_current:boolean',
    'description:text', 'created_via:text', 'created_at:timestamp with time zone',
    'updated_at:timestamp with time zone', 'last_confirmed_at:timestamp with time zone'
  ],
  'work_experience has exactly the documented columns and types'
);
select col_is_pk('public', 'work_experience', 'id', 'work_experience.id is the primary key');
select fk_ok('public', 'work_experience', 'user_id', 'public', 'profiles', 'user_id', 'work_experience.user_id directly references profiles.user_id');
select ok(
  exists (select 1 from pg_constraint where conname = 'work_experience_user_id_id_key'),
  'work_experience has the future-safe (user_id, id) unique constraint'
);
select has_index('public', 'work_experience', 'work_experience_user_chronology_idx', 'owner chronology index exists');
select is((select relrowsecurity from pg_class where oid = 'public.work_experience'::regclass), true, 'RLS is enabled on work_experience');
select policies_are(
  'public', 'work_experience',
  array['work_experience_select_own', 'work_experience_insert_own', 'work_experience_update_own', 'work_experience_delete_own'],
  'work_experience has exactly the own-row policies'
);
select is(
  has_table_privilege('authenticated', 'public.work_experience', 'SELECT, DELETE')
    and has_column_privilege('authenticated', 'public.work_experience', 'organization', 'INSERT, UPDATE')
    and not has_column_privilege('authenticated', 'public.work_experience', 'user_id', 'UPDATE'),
  true,
  'authenticated has intended content privileges without ownership rewrite access'
);
select is(
  not has_column_privilege('authenticated', 'public.work_experience', 'created_via', 'INSERT, UPDATE')
    and not has_column_privilege('authenticated', 'public.work_experience', 'updated_at', 'INSERT, UPDATE')
    and not has_column_privilege('authenticated', 'public.work_experience', 'last_confirmed_at', 'INSERT, UPDATE'),
  true,
  'authenticated cannot forge provenance or timestamps'
);
select table_privs_are('public', 'work_experience', 'service_role', array['SELECT', 'INSERT', 'UPDATE', 'DELETE'], 'service_role has explicit maintenance access');
select table_privs_are('public', 'work_experience', 'anon', array[]::text[], 'anon has no work_experience grants');
select ok(exists (select 1 from pg_trigger where tgrelid = 'public.work_experience'::regclass and tgname = 'work_experience_before_write'), 'before-write trigger exists');
select ok(exists (select 1 from pg_trigger where tgrelid = 'public.work_experience'::regclass and tgname = 'work_experience_after_content_change'), 'revision trigger exists');

-- Fixtures ------------------------------------------------------------------

insert into auth.users (id, aud, role, email) values
  ('81000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'experience-a@example.test'),
  ('81000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'experience-b@example.test'),
  ('81000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'experience-c@example.test'),
  ('81000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'experience-d@example.test');

insert into public.profiles (user_id, headline) values
  ('81000000-0000-0000-0000-000000000001', 'Experience A'),
  ('81000000-0000-0000-0000-000000000002', 'Experience B'),
  ('81000000-0000-0000-0000-000000000003', 'Experience C');

-- Owner CRUD and validation -------------------------------------------------

reset role;
select set_config('request.jwt.claims', json_build_object('sub', '81000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
set role authenticated;

select lives_ok(
  $$ insert into public.work_experience (user_id, experience_kind, organization, role, start_year) values ('81000000-0000-0000-0000-000000000001', 'internship', 'Synthetic Labs', 'Engineering Intern', 2025) $$,
  'owner can insert a year-only experience'
);
select is(
  (select start_month from public.work_experience where organization = 'Synthetic Labs'),
  null::smallint,
  'year-only experience preserves absent month precision'
);
select lives_ok(
  $$ insert into public.work_experience (user_id, experience_kind, organization, role, start_year, end_year, end_month) values ('81000000-0000-0000-0000-000000000001', 'research', 'Synthetic Research Group', 'Student Researcher', 2025, 2025, 1) $$,
  'same-year partial dates with an unknown start month are accepted'
);
select lives_ok(
  $$ update public.work_experience set role = 'Research Assistant' where organization = 'Synthetic Research Group' $$,
  'owner can update content'
);

reset role;
select set_config('request.jwt.claims', json_build_object('sub', '81000000-0000-0000-0000-000000000002', 'role', 'authenticated')::text, true);
set role authenticated;
select lives_ok(
  $$ insert into public.work_experience (user_id, experience_kind, organization, role, start_year) values ('81000000-0000-0000-0000-000000000002', 'volunteering', 'Synthetic B Organization', 'Volunteer', 2024) $$,
  'second owner can insert their own experience'
);

reset role;
select set_config('request.jwt.claims', json_build_object('sub', '81000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
set role authenticated;

select is_empty(
  $$ select 1 from public.work_experience where user_id = '81000000-0000-0000-0000-000000000002' $$,
  'owner cannot select another user''s experience'
);
with updated as (
  update public.work_experience set role = 'Hacked' where user_id = '81000000-0000-0000-0000-000000000002' returning 1
)
select is((select count(*)::int from updated), 0, 'owner cannot update another user''s experience');
with deleted as (
  delete from public.work_experience where user_id = '81000000-0000-0000-0000-000000000002' returning 1
)
select is((select count(*)::int from deleted), 0, 'owner cannot delete another user''s experience');
select throws_ok(
  $$ insert into public.work_experience (user_id, experience_kind, organization, role, start_year) values ('81000000-0000-0000-0000-000000000002', 'employment', 'Forged', 'Forged', 2025) $$,
  '42501'::char(5), null, 'owner cannot insert another user''s experience'
);
select throws_ok(
  $$ update public.work_experience set user_id = '81000000-0000-0000-0000-000000000002' where organization = 'Synthetic Labs' $$,
  '42501'::char(5), null, 'owner cannot rewrite experience ownership'
);
select throws_ok(
  $$ update public.work_experience set created_via = 'migration' where organization = 'Synthetic Labs' $$,
  '42501'::char(5), null, 'owner cannot rewrite provenance'
);
select throws_ok(
  $$ update public.work_experience set updated_at = now() where organization = 'Synthetic Labs' $$,
  '42501'::char(5), null, 'owner cannot rewrite timestamps'
);

select throws_ok(
  $$ insert into public.work_experience (user_id, experience_kind, organization, role, start_year) values ('81000000-0000-0000-0000-000000000001', 'unsupported', 'Kind Check', 'Role', 2025) $$,
  '23514'::char(5), null, 'unsupported experience kind is rejected'
);
select throws_ok(
  $$ insert into public.work_experience (user_id, experience_kind, organization, role, start_year) values ('81000000-0000-0000-0000-000000000001', 'employment', ' ', 'Role', 2025) $$,
  '23514'::char(5), null, 'blank organization is rejected'
);
select throws_ok(
  $$ insert into public.work_experience (user_id, experience_kind, organization, role, start_year) values ('81000000-0000-0000-0000-000000000001', 'employment', 'Organization', ' ', 2025) $$,
  '23514'::char(5), null, 'blank role is rejected'
);
select throws_ok(
  $$ insert into public.work_experience (user_id, experience_kind, organization, role, start_year) values ('81000000-0000-0000-0000-000000000001', 'employment', repeat('x', 201), 'Role', 2025) $$,
  '23514'::char(5), null, 'overlength organization is rejected'
);
select throws_ok(
  $$ insert into public.work_experience (user_id, experience_kind, organization, role, start_year, description) values ('81000000-0000-0000-0000-000000000001', 'employment', 'Organization', 'Role', 2025, repeat('x', 2001)) $$,
  '23514'::char(5), null, 'overlength description is rejected'
);
select throws_ok(
  $$ insert into public.work_experience (user_id, experience_kind, organization, role, start_year, start_month) values ('81000000-0000-0000-0000-000000000001', 'employment', 'Organization', 'Role', 2025, 13) $$,
  '23514'::char(5), null, 'invalid month is rejected'
);
select throws_ok(
  $$ insert into public.work_experience (user_id, experience_kind, organization, role, start_year) values ('81000000-0000-0000-0000-000000000001', 'employment', 'Organization', 'Role', 1800) $$,
  '23514'::char(5), null, 'invalid year is rejected'
);
select throws_ok(
  $$ insert into public.work_experience (user_id, experience_kind, organization, role, start_year, end_month) values ('81000000-0000-0000-0000-000000000001', 'employment', 'Organization', 'Role', 2025, 1) $$,
  '23514'::char(5), null, 'end month without end year is rejected'
);
select throws_ok(
  $$ insert into public.work_experience (user_id, experience_kind, organization, role, start_year, end_year, is_current) values ('81000000-0000-0000-0000-000000000001', 'employment', 'Organization', 'Role', 2025, 2026, true) $$,
  '23514'::char(5), null, 'current experience cannot have an end period'
);
select throws_ok(
  $$ insert into public.work_experience (user_id, experience_kind, organization, role, start_year, end_year) values ('81000000-0000-0000-0000-000000000001', 'employment', 'Organization', 'Role', 2025, 2024) $$,
  '23514'::char(5), null, 'end year before start year is rejected'
);
select throws_ok(
  $$ insert into public.work_experience (user_id, experience_kind, organization, role, start_year, start_month, end_year, end_month) values ('81000000-0000-0000-0000-000000000001', 'employment', 'Organization', 'Role', 2025, 7, 2025, 6) $$,
  '23514'::char(5), null, 'same-year known months out of order are rejected'
);

-- Revision and review state -------------------------------------------------

select ok(
  (select content_revision from public.profile_section_revisions where user_id = '81000000-0000-0000-0000-000000000001' and section_key = 'experience') > 0,
  'experience inserts advance the experience revision'
);
select lives_ok($$ select public.review_profile_section('experience') $$, 'owner can review experience at its current revision');
select is(
  (select reviewed_content_revision from public.profile_section_reviews where user_id = '81000000-0000-0000-0000-000000000001' and section_key = 'experience'),
  (select content_revision from public.profile_section_revisions where user_id = '81000000-0000-0000-0000-000000000001' and section_key = 'experience'),
  'experience review records the current revision'
);
select lives_ok(
  $$ update public.work_experience set location = 'Bremen' where organization = 'Synthetic Labs' $$,
  'meaningful experience update succeeds'
);
select isnt(
  (select reviewed_content_revision from public.profile_section_reviews where user_id = '81000000-0000-0000-0000-000000000001' and section_key = 'experience'),
  (select content_revision from public.profile_section_revisions where user_id = '81000000-0000-0000-0000-000000000001' and section_key = 'experience'),
  'meaningful experience update makes the review stale'
);
select lives_ok(
  $$ delete from public.work_experience where organization = 'Synthetic Research Group' $$,
  'owner can delete their experience'
);
select isnt(
  (select reviewed_content_revision from public.profile_section_reviews where user_id = '81000000-0000-0000-0000-000000000001' and section_key = 'experience'),
  (select content_revision from public.profile_section_revisions where user_id = '81000000-0000-0000-0000-000000000001' and section_key = 'experience'),
  'experience deletion keeps the prior review stale'
);

reset role;
set role service_role;
select set_config(
  'test.experience_revision_before_metadata',
  (
    select content_revision::text from public.profile_section_revisions
    where user_id = '81000000-0000-0000-0000-000000000001' and section_key = 'experience'
  ),
  true
);
select lives_ok(
  $$ update public.work_experience set created_via = 'migration' where organization = 'Synthetic Labs' $$,
  'service-role metadata update is harmlessly accepted'
);
select is(
  (select content_revision from public.profile_section_revisions where user_id = '81000000-0000-0000-0000-000000000001' and section_key = 'experience'),
  current_setting('test.experience_revision_before_metadata')::bigint,
  'metadata-only update does not advance the revision'
);

reset role;
select set_config('request.jwt.claims', json_build_object('sub', '81000000-0000-0000-0000-000000000003', 'role', 'authenticated')::text, true);
set role authenticated;
select lives_ok($$ select public.review_profile_section('experience') $$, 'an empty experience section can be reviewed');
select is(
  (select reviewed_content_revision from public.profile_section_reviews where user_id = '81000000-0000-0000-0000-000000000003' and section_key = 'experience'),
  0::bigint,
  'empty experience review is current at baseline revision zero'
);

reset role;
select set_config('request.jwt.claims', json_build_object('sub', '81000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
set role authenticated;
select throws_ok($$ select public.review_profile_section('projects') $$, '22023'::char(5), null, 'unknown review section is rejected');
reset role;
select set_config('request.jwt.claims', '', true);
set role authenticated;
select throws_ok($$ select public.review_profile_section('experience') $$, '28000'::char(5), null, 'review requires an authenticated caller identity');

reset role;
select set_config('request.jwt.claims', json_build_object('sub', '81000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
set role authenticated;
select throws_ok(
  $$ insert into public.profile_section_revisions (user_id, section_key, content_revision) values ('81000000-0000-0000-0000-000000000001', 'experience', 99) $$,
  '42501'::char(5), null, 'browser cannot forge experience revisions'
);
select throws_ok(
  $$ insert into public.profile_section_reviews (user_id, section_key, reviewed_content_revision) values ('81000000-0000-0000-0000-000000000001', 'experience', 99) $$,
  '42501'::char(5), null, 'browser cannot forge experience reviews'
);

reset role;
set role anon;
select throws_ok($$ select 1 from public.work_experience $$, '42501'::char(5), null, 'anonymous experience SELECT is denied at grants');
select throws_ok(
  $$ insert into public.work_experience (user_id, experience_kind, organization, role, start_year) values ('81000000-0000-0000-0000-000000000001', 'employment', 'Anon', 'Anon', 2025) $$,
  '42501'::char(5), null, 'anonymous experience INSERT is denied at grants'
);

reset role;
set role service_role;
select is(
  (select count(*)::int from public.work_experience where user_id in ('81000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000002')),
  2,
  'service-role can read trusted maintenance rows'
);
select lives_ok(
  $$ delete from public.profiles where user_id = '81000000-0000-0000-0000-000000000002' $$,
  'trusted profile deletion remains cascade-safe with experience rows'
);
select lives_ok(
  $$ insert into public.profiles (user_id, headline) values ('81000000-0000-0000-0000-000000000004', 'Experience D') $$,
  'new profile creation succeeds after the experience migration'
);
select is(
  (select content_revision from public.profile_section_revisions where user_id = '81000000-0000-0000-0000-000000000004' and section_key = 'experience'),
  0::bigint,
  'new profiles initialize experience at revision zero'
);

reset role;
select * from finish();
rollback;
