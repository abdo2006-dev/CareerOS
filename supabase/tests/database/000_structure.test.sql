-- Structure tests: tables, columns, keys, constraints, RLS enablement,
-- policy existence, and grant existence (including the absence of any
-- grant to anon). No fixture data needed; this only inspects catalogs.
begin;
select plan(29);

-- profiles ------------------------------------------------------------------

select has_table('public', 'profiles', 'profiles table exists');
select has_column('public', 'profiles', 'user_id', 'profiles.user_id exists');
select has_column('public', 'profiles', 'headline', 'profiles.headline exists');
select has_column('public', 'profiles', 'degree_program', 'profiles.degree_program exists');
select has_column('public', 'profiles', 'degree_year', 'profiles.degree_year exists');
select has_column('public', 'profiles', 'profile_complete', 'profiles.profile_complete exists');
select has_column('public', 'profiles', 'created_at', 'profiles.created_at exists');
select col_is_pk('public', 'profiles', 'user_id', 'profiles.user_id is the primary key');
select fk_ok('public', 'profiles', 'user_id', 'auth', 'users', 'id', 'profiles.user_id references auth.users.id');
select has_check('public', 'profiles', 'profiles has a check constraint (degree_year range)');

select is(
  (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass),
  true,
  'RLS is enabled on profiles'
);
select policies_are(
  'public', 'profiles',
  array['profiles_select_own', 'profiles_insert_own', 'profiles_update_own', 'profiles_delete_own'],
  'profiles has exactly the four expected policies'
);
select policy_cmd_is('public', 'profiles', 'profiles_select_own', 'SELECT', 'profiles_select_own applies to SELECT');
select policy_cmd_is('public', 'profiles', 'profiles_insert_own', 'INSERT', 'profiles_insert_own applies to INSERT');
select policy_cmd_is('public', 'profiles', 'profiles_update_own', 'UPDATE', 'profiles_update_own applies to UPDATE');
select policy_cmd_is('public', 'profiles', 'profiles_delete_own', 'DELETE', 'profiles_delete_own applies to DELETE');

select table_privs_are('public', 'profiles', 'authenticated', array['SELECT', 'INSERT', 'UPDATE', 'DELETE'], 'authenticated has exactly SELECT/INSERT/UPDATE/DELETE on profiles');
select table_privs_are('public', 'profiles', 'service_role', array['SELECT', 'INSERT', 'UPDATE', 'DELETE'], 'service_role has exactly SELECT/INSERT/UPDATE/DELETE on profiles');
select table_privs_are('public', 'profiles', 'anon', array[]::text[], 'anon has no grants at all on profiles');

-- education_entries -----------------------------------------------------------

select has_table('public', 'education_entries', 'education_entries table exists');
select has_column('public', 'education_entries', 'user_id', 'education_entries.user_id exists (not profile_id)');
select col_is_pk('public', 'education_entries', 'id', 'education_entries.id is the primary key');
select fk_ok('public', 'education_entries', 'user_id', 'public', 'profiles', 'user_id', 'education_entries.user_id references profiles.user_id');
select has_index('public', 'education_entries', 'education_entries_user_id_idx', 'index on education_entries.user_id exists');
select has_check('public', 'education_entries', 'education_entries has a check constraint (date order)');

select is(
  (select relrowsecurity from pg_class where oid = 'public.education_entries'::regclass),
  true,
  'RLS is enabled on education_entries'
);
select policies_are(
  'public', 'education_entries',
  array['education_entries_select_own', 'education_entries_insert_own', 'education_entries_update_own', 'education_entries_delete_own'],
  'education_entries has exactly the four expected policies'
);

select table_privs_are('public', 'education_entries', 'authenticated', array['SELECT', 'INSERT', 'UPDATE', 'DELETE'], 'authenticated has exactly SELECT/INSERT/UPDATE/DELETE on education_entries');
select table_privs_are('public', 'education_entries', 'anon', array[]::text[], 'anon has no grants at all on education_entries');

select * from finish();
rollback;
