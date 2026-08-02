-- Focused browser-role behavior for review freshness, primary selection, and
-- cascade safety. All fixture identities are synthetic and rolled back.
begin;
select plan(20);

insert into auth.users (id, aud, role, email)
values
  ('55555555-5555-5555-5555-555555555555', 'authenticated', 'authenticated', 'behavior-a@example.test'),
  ('66666666-6666-6666-6666-666666666666', 'authenticated', 'authenticated', 'behavior-b@example.test');
insert into public.profiles (user_id, headline)
values
  ('55555555-5555-5555-5555-555555555555', 'A'),
  ('66666666-6666-6666-6666-666666666666', 'B');

reset role;
set role anon;
select throws_ok($$ select public.review_profile_section('education') $$, '42501'::char(5), null, 'anonymous callers cannot execute the review RPC');
select throws_ok($$ select public.set_primary_education('00000000-0000-0000-0000-000000000000') $$, '42501'::char(5), null, 'anonymous callers cannot execute the primary RPC');

reset role;
select set_config('request.jwt.claims', json_build_object('sub', '55555555-5555-5555-5555-555555555555', 'role', 'authenticated')::text, true);
set role authenticated;
select lives_ok($$ insert into public.education_entries (user_id, institution, education_status, end_date) values ('55555555-5555-5555-5555-555555555555', 'First', 'current', null), ('55555555-5555-5555-5555-555555555555', 'Second', 'current', null), ('55555555-5555-5555-5555-555555555555', 'Finished', 'completed', '2025-01-01') $$, 'owner can create two current and one completed entry');
select lives_ok($$ select public.set_primary_education((select id from public.education_entries where institution = 'First')) $$, 'owner can select the first current entry');
select is((select count(*)::int from public.education_entries where is_primary), 1, 'exactly one entry is primary after first selection');
select is((select institution from public.education_entries where is_primary), 'First', 'the first selected row is primary');
select lives_ok($$ select public.set_primary_education((select id from public.education_entries where institution = 'Second')) $$, 'owner can switch to the second current entry');
select is((select count(*)::int from public.education_entries where is_primary), 1, 'switching still leaves exactly one primary');
select is((select institution from public.education_entries where is_primary), 'Second', 'the second selected row becomes primary');
select lives_ok($$ select public.set_primary_education((select id from public.education_entries where institution = 'Second')) $$, 'reselecting the current primary is idempotent');
select throws_ok($$ select public.set_primary_education((select id from public.education_entries where institution = 'Finished')) $$, '23514'::char(5), null, 'a non-current entry cannot become primary');
select lives_ok($$ select public.review_profile_section('education') $$, 'owner can review education');
select lives_ok($$ delete from public.education_entries where institution = 'Second' $$, 'owner can delete the selected primary');
select is((select count(*)::int from public.education_entries where is_primary), 0, 'deleting a primary does not promote another row');
select isnt((select reviewed_content_revision from public.profile_section_reviews where section_key = 'education'), (select content_revision from public.profile_section_revisions where section_key = 'education'), 'education review becomes stale after deletion');
select throws_ok($$ insert into public.profile_section_reviews (user_id, section_key, reviewed_content_revision) values ('55555555-5555-5555-5555-555555555555', 'education', 99) $$, '42501'::char(5), null, 'browser cannot directly write review rows');
select throws_ok($$ delete from public.profiles where user_id = '55555555-5555-5555-5555-555555555555' $$, '42501'::char(5), null, 'profile owner DELETE remains denied');

reset role;
set role service_role;
select lives_ok($$ delete from public.profiles where user_id = '55555555-5555-5555-5555-555555555555' $$, 'trusted deletion cascades safely');
select is((select count(*)::int from public.profile_section_revisions where user_id = '55555555-5555-5555-5555-555555555555'), 0, 'cascade deletion removes revision rows');
select is((select count(*)::int from public.profile_section_reviews where user_id = '55555555-5555-5555-5555-555555555555'), 0, 'cascade deletion removes review rows');

reset role;
select * from finish();
rollback;
