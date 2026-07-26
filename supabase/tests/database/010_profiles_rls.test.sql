-- RLS tests for public.profiles: owner behavior, cross-user isolation,
-- anonymous rejection, and the deliberate service_role bypass.
--
-- Fixture users are inserted directly into auth.users (not via the Auth API
-- -- these are throwaway pgTAP fixtures, kept separate from the local
-- password-login users created by supabase/scripts/setup-local-users.mjs)
-- and rolled back at the end of this transaction.
begin;
select plan(13);

insert into auth.users (id, aud, role, email)
values
  ('11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'pgtap-user-a@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'pgtap-user-b@example.test');

-- ---- As user A: owner insert/select/update ---------------------------------
reset role;
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);
set role authenticated;

select lives_ok(
  $$ insert into public.profiles (user_id, headline) values ('11111111-1111-1111-1111-111111111111', 'A original headline') $$,
  'user A can insert their own profile'
);

select is(
  (select headline from public.profiles where user_id = '11111111-1111-1111-1111-111111111111'),
  'A original headline',
  'user A can select their own profile'
);

select lives_ok(
  $$ update public.profiles set headline = 'A updated headline' where user_id = '11111111-1111-1111-1111-111111111111' $$,
  'user A can update their own profile'
);
select is(
  (select headline from public.profiles where user_id = '11111111-1111-1111-1111-111111111111'),
  'A updated headline',
  'user A''s update to their own profile was applied'
);

-- ---- As user B: owner insert (needed for isolation tests below) -----------
reset role;
select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);
set role authenticated;

select lives_ok(
  $$ insert into public.profiles (user_id, headline) values ('22222222-2222-2222-2222-222222222222', 'B original headline') $$,
  'user B can insert their own profile'
);

-- ---- Back to user A: cross-user isolation ----------------------------------
reset role;
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);
set role authenticated;

select is_empty(
  $$ select 1 from public.profiles where user_id = '22222222-2222-2222-2222-222222222222' $$,
  'user A cannot select user B''s profile'
);

with upd as (
  update public.profiles set headline = 'hacked' where user_id = '22222222-2222-2222-2222-222222222222'
  returning 1
)
select is(
  (select count(*)::int from upd),
  0,
  'user A cannot update user B''s profile (0 rows affected)'
);

with del as (
  delete from public.profiles where user_id = '22222222-2222-2222-2222-222222222222'
  returning 1
)
select is(
  (select count(*)::int from del),
  0,
  'user A cannot delete user B''s profile (0 rows affected)'
);

select throws_ok(
  $$ insert into public.profiles (user_id, headline) values ('22222222-2222-2222-2222-222222222222', 'forged') $$,
  '42501'::char(5),
  null,
  'user A cannot insert a profile row owned by user B'
);

-- ---- Anonymous: insufficient privilege, not merely empty rows -------------
reset role;
select set_config('request.jwt.claims', '', true);
set role anon;

select throws_ok(
  $$ select 1 from public.profiles $$,
  '42501'::char(5),
  null,
  'anonymous SELECT on profiles is rejected with insufficient privilege'
);
select throws_ok(
  $$ insert into public.profiles (user_id, headline) values ('11111111-1111-1111-1111-111111111111', 'anon') $$,
  '42501'::char(5),
  null,
  'anonymous INSERT on profiles is rejected with insufficient privilege'
);

-- ---- service_role: deliberate trusted-context bypass -----------------------
reset role;
set role service_role;

select is(
  (select count(*)::int from public.profiles where user_id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222')),
  2,
  'service_role can read both users'' profiles (deliberate RLS bypass, not a leak)'
);

-- ---- Back to user A: owner delete (run last; mutates state other tests rely on) --
reset role;
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);
set role authenticated;

select lives_ok(
  $$ delete from public.profiles where user_id = '11111111-1111-1111-1111-111111111111' $$,
  'user A can delete their own profile'
);

reset role;
select * from finish();
rollback;
