-- Revision counters, privileged RPCs, direct-write denial, and cascade safety.
begin;
select plan(21);

insert into auth.users (id, aud, role, email)
values
  ('33333333-3333-3333-3333-333333333333', 'authenticated', 'authenticated', 'section-a@example.test'),
  ('44444444-4444-4444-4444-444444444444', 'authenticated', 'authenticated', 'section-b@example.test');

reset role;
select set_config('request.jwt.claims', json_build_object('sub', '33333333-3333-3333-3333-333333333333', 'role', 'authenticated')::text, true);
set role authenticated;

select lives_ok(
  $$ insert into public.profiles (user_id, headline) values ('33333333-3333-3333-3333-333333333333', 'Profile A') $$,
  'profile insert succeeds and initializes section state'
);
select is((select content_revision from public.profile_section_revisions where section_key = 'basic_profile'), 1::bigint, 'profile creation advances basic-profile revision');
select is((select content_revision from public.profile_section_revisions where section_key = 'education'), 0::bigint, 'education begins at revision zero');

select lives_ok($$ update public.profiles set headline = 'Profile A updated' $$, 'meaningful profile update succeeds');
select is((select content_revision from public.profile_section_revisions where section_key = 'basic_profile'), 2::bigint, 'meaningful profile update advances its revision');

select lives_ok(
  $$ insert into public.education_entries (user_id, institution, education_status) values ('33333333-3333-3333-3333-333333333333', 'Synthetic University', 'current') $$,
  'owner can create current education'
);
select is((select content_revision from public.profile_section_revisions where section_key = 'education'), 1::bigint, 'education insert advances its revision');

select lives_ok($$ select public.review_profile_section('education') $$, 'owner can record a current education review through RPC');
select is(
  (select reviewed_content_revision from public.profile_section_reviews where section_key = 'education'),
  1::bigint,
  'review stores the locked current revision'
);
select lives_ok($$ update public.education_entries set degree = 'BSc' where institution = 'Synthetic University' $$, 'education update succeeds');
select is((select content_revision from public.profile_section_revisions where section_key = 'education'), 2::bigint, 'education update advances its revision');
select isnt(
  (select reviewed_content_revision from public.profile_section_reviews where section_key = 'education'),
  (select content_revision from public.profile_section_revisions where section_key = 'education'),
  'content mutation makes the prior review stale'
);

select throws_ok(
  $$ insert into public.profile_section_revisions (user_id, section_key, content_revision) values ('33333333-3333-3333-3333-333333333333', 'education', 99) $$,
  '42501'::char(5), null, 'browser cannot directly forge revisions'
);
select throws_ok(
  $$ update public.education_entries set is_primary = true where institution = 'Synthetic University' $$,
  '42501'::char(5), null, 'browser cannot directly set primary education'
);
select lives_ok(
  $$ select public.set_primary_education((select id from public.education_entries where institution = 'Synthetic University')) $$,
  'primary selection RPC succeeds for the owner'
);
select is((select is_primary from public.education_entries where institution = 'Synthetic University'), true, 'selected row is primary');
select is((select content_revision from public.profile_section_revisions where section_key = 'education'), 3::bigint, 'primary selection advances revision');
select lives_ok(
  $$ select public.set_primary_education((select id from public.education_entries where institution = 'Synthetic University')) $$,
  'reselecting the current primary is idempotent'
);
select is((select content_revision from public.profile_section_revisions where section_key = 'education'), 3::bigint, 'idempotent selection does not change revision');
select throws_ok($$ select public.review_profile_section('projects') $$, '22023'::char(5), null, 'unknown review key is rejected');

reset role;
set role service_role;
select lives_ok(
  $$ delete from public.profiles where user_id = '33333333-3333-3333-3333-333333333333' $$,
  'trusted profile deletion with education rows does not break revision triggers'
);

reset role;
select * from finish();
rollback;
