-- RLS tests for public.education_entries: owner behavior, cross-user
-- isolation (including the foreign-key-bypass and ownership-rewrite cases),
-- anonymous rejection, and the deliberate service_role bypass.
begin;
select plan(16);

insert into auth.users (id, aud, role, email)
values
  ('11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'pgtap-user-a@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'pgtap-user-b@example.test');

-- education_entries.user_id references profiles.user_id -- a profile row
-- must exist first. Inserted here as the unrestricted superuser session
-- (before any role switch), purely as fixture setup.
insert into public.profiles (user_id, headline)
values
  ('11111111-1111-1111-1111-111111111111', 'A'),
  ('22222222-2222-2222-2222-222222222222', 'B');

-- ---- As user A: owner insert/select/update ---------------------------------
reset role;
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);
set role authenticated;

select lives_ok(
  $$ insert into public.education_entries (user_id, institution) values ('11111111-1111-1111-1111-111111111111', 'University of A') $$,
  'user A can insert their own education entry'
);
select lives_ok(
  $$ insert into public.education_entries (user_id, institution) values ('11111111-1111-1111-1111-111111111111', 'Second entry, deleted later') $$,
  'user A can insert a second education entry'
);

select is(
  (select institution from public.education_entries where institution = 'University of A'),
  'University of A',
  'user A can select their own education entry'
);

select lives_ok(
  $$ update public.education_entries set institution = 'University of A (renamed)' where institution = 'University of A' $$,
  'user A can update their own education entry'
);
select is(
  (select institution from public.education_entries where institution = 'University of A (renamed)'),
  'University of A (renamed)',
  'user A''s update to their own education entry was applied'
);

-- ---- As user B: owner insert (needed for isolation tests below) -----------
reset role;
select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);
set role authenticated;

select lives_ok(
  $$ insert into public.education_entries (user_id, institution) values ('22222222-2222-2222-2222-222222222222', 'University of B') $$,
  'user B can insert their own education entry'
);

-- ---- Back to user A: cross-user isolation ----------------------------------
reset role;
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);
set role authenticated;

select is_empty(
  $$ select 1 from public.education_entries where user_id = '22222222-2222-2222-2222-222222222222' $$,
  'user A cannot select user B''s education entries'
);

with upd as (
  update public.education_entries set institution = 'hacked' where user_id = '22222222-2222-2222-2222-222222222222'
  returning 1
)
select is(
  (select count(*)::int from upd),
  0,
  'user A cannot update user B''s education entries (0 rows affected)'
);

with del as (
  delete from public.education_entries where user_id = '22222222-2222-2222-2222-222222222222'
  returning 1
)
select is(
  (select count(*)::int from del),
  0,
  'user A cannot delete user B''s education entries (0 rows affected)'
);

-- The foreign-key-bypass test: A must not be able to create a row that
-- names B as the owner, even though the FK target (profiles.user_id = B)
-- legitimately exists.
select throws_ok(
  $$ insert into public.education_entries (user_id, institution) values ('22222222-2222-2222-2222-222222222222', 'forged') $$,
  '42501'::char(5),
  null,
  'user A cannot insert an education entry with user_id = user B (foreign-key-bypass attempt)'
);

-- The ownership-rewrite test: A must not be able to "claim" B's existing
-- entry by rewriting its user_id to A's own id.
select throws_ok(
  $$ update public.education_entries set user_id = '11111111-1111-1111-1111-111111111111' where institution = 'University of B' $$,
  '42501'::char(5),
  null,
  'user A cannot take ownership of an education entry by rewriting user_id'
);

-- ---- Anonymous: insufficient privilege, not merely empty rows -------------
reset role;
select set_config('request.jwt.claims', '', true);
set role anon;

select throws_ok(
  $$ select 1 from public.education_entries $$,
  '42501'::char(5),
  null,
  'anonymous SELECT on education_entries is rejected with insufficient privilege'
);
select throws_ok(
  $$ insert into public.education_entries (user_id, institution) values ('11111111-1111-1111-1111-111111111111', 'anon') $$,
  '42501'::char(5),
  null,
  'anonymous INSERT on education_entries is rejected with insufficient privilege'
);

-- ---- service_role: deliberate trusted-context bypass -----------------------
reset role;
set role service_role;

select is(
  (select count(*)::int from public.education_entries where user_id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222')),
  3,
  'service_role can read every education entry across both users (deliberate RLS bypass, not a leak)'
);

-- ---- Back to user A: owner delete (run last) -------------------------------
reset role;
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);
set role authenticated;

select lives_ok(
  $$ delete from public.education_entries where institution = 'Second entry, deleted later' $$,
  'user A can delete their own education entry'
);

reset role;
select is(
  (select count(*)::int from public.education_entries),
  2,
  'exactly the two remaining entries are left after user A''s delete'
);

reset role;
select * from finish();
rollback;
