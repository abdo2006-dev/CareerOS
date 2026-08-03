-- Structure tests: tables, columns, keys, constraints, RLS enablement,
-- policy existence, and grant existence (including the absence of any
-- grant to anon). No fixture data needed; this only inspects catalogs.
begin;
select plan(63);

-- profiles ------------------------------------------------------------------

select has_table('public', 'profiles', 'profiles table exists');
select has_column('public', 'profiles', 'user_id', 'profiles.user_id exists');
select has_column('public', 'profiles', 'headline', 'profiles.headline exists');
select has_column('public', 'profiles', 'preferred_name', 'profiles.preferred_name exists');
select has_column('public', 'profiles', 'degree_program', 'profiles.degree_program exists');
select has_column('public', 'profiles', 'degree_year', 'profiles.degree_year exists');
select has_column('public', 'profiles', 'profile_complete', 'profiles.profile_complete exists');
select has_column('public', 'profiles', 'created_at', 'profiles.created_at exists');
select has_column('public', 'profiles', 'created_via', 'profiles.created_via exists');
select has_column('public', 'profiles', 'updated_at', 'profiles.updated_at exists');
select has_column('public', 'profiles', 'last_confirmed_at', 'profiles.last_confirmed_at exists');
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
  array['profiles_select_own', 'profiles_insert_own', 'profiles_update_own'],
  'profiles has exactly the three expected policies'
);
select policy_cmd_is('public', 'profiles', 'profiles_select_own', 'SELECT', 'profiles_select_own applies to SELECT');
select policy_cmd_is('public', 'profiles', 'profiles_insert_own', 'INSERT', 'profiles_insert_own applies to INSERT');
select policy_cmd_is('public', 'profiles', 'profiles_update_own', 'UPDATE', 'profiles_update_own applies to UPDATE');
select is(
  has_table_privilege('authenticated', 'public.profiles', 'SELECT')
    and has_column_privilege('authenticated', 'public.profiles', 'user_id', 'INSERT')
    and has_column_privilege('authenticated', 'public.profiles', 'headline', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.profiles', 'DELETE'),
  true,
  'authenticated has the intended profiles table and column privileges'
);
select table_privs_are('public', 'profiles', 'service_role', array['SELECT', 'INSERT', 'UPDATE', 'DELETE'], 'service_role has exactly SELECT/INSERT/UPDATE/DELETE on profiles');
select table_privs_are('public', 'profiles', 'anon', array[]::text[], 'anon has no grants at all on profiles');

-- education_entries -----------------------------------------------------------

select has_table('public', 'education_entries', 'education_entries table exists');
select has_column('public', 'education_entries', 'user_id', 'education_entries.user_id exists (not profile_id)');
select has_column('public', 'education_entries', 'degree_year', 'education_entries.degree_year exists');
select has_column('public', 'education_entries', 'expected_graduation_month', 'education_entries.expected_graduation_month exists');
select has_column('public', 'education_entries', 'expected_graduation_year', 'education_entries.expected_graduation_year exists');
select has_column('public', 'education_entries', 'education_status', 'education_entries.education_status exists');
select has_column('public', 'education_entries', 'is_primary', 'education_entries.is_primary exists');
select has_column('public', 'education_entries', 'created_via', 'education_entries.created_via exists');
select has_column('public', 'education_entries', 'updated_at', 'education_entries.updated_at exists');
select has_column('public', 'education_entries', 'last_confirmed_at', 'education_entries.last_confirmed_at exists');
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

select is(
  has_table_privilege('authenticated', 'public.education_entries', 'SELECT, DELETE')
    and has_column_privilege('authenticated', 'public.education_entries', 'institution', 'INSERT, UPDATE')
    and not has_column_privilege('authenticated', 'public.education_entries', 'is_primary', 'UPDATE'),
  true,
  'authenticated has intended editable education columns but cannot change is_primary directly'
);
select table_privs_are('public', 'education_entries', 'anon', array[]::text[], 'anon has no grants at all on education_entries');

-- section freshness state ----------------------------------------------------

select has_table('public', 'profile_section_revisions', 'profile_section_revisions table exists');
select has_table('public', 'profile_section_reviews', 'profile_section_reviews table exists');
select has_column('public', 'profile_section_revisions', 'user_id', 'revisions own directly via user_id');
select has_column('public', 'profile_section_revisions', 'content_revision', 'revisions counter exists');
select has_column('public', 'profile_section_reviews', 'reviewed_content_revision', 'reviews record observed revision');
select col_is_pk('public', 'profile_section_revisions', array['user_id', 'section_key'], 'revisions have composite identity');
select col_is_pk('public', 'profile_section_reviews', array['user_id', 'section_key'], 'reviews have composite identity');
select is((select relrowsecurity from pg_class where oid = 'public.profile_section_revisions'::regclass), true, 'RLS is enabled on revisions');
select is((select relrowsecurity from pg_class where oid = 'public.profile_section_reviews'::regclass), true, 'RLS is enabled on reviews');
select policies_are('public', 'profile_section_revisions', array['profile_section_revisions_select_own'], 'revisions have only the select-own policy');
select policies_are('public', 'profile_section_reviews', array['profile_section_reviews_select_own'], 'reviews have only the select-own policy');
select table_privs_are('public', 'profile_section_revisions', 'authenticated', array['SELECT'], 'authenticated can only select revisions');
select table_privs_are('public', 'profile_section_reviews', 'authenticated', array['SELECT'], 'authenticated can only select reviews');
select table_privs_are('public', 'profile_section_revisions', 'anon', array[]::text[], 'anon has no revisions grants');
select table_privs_are('public', 'profile_section_reviews', 'anon', array[]::text[], 'anon has no reviews grants');
select has_index('public', 'education_entries', 'education_entries_one_primary_per_user_idx', 'partial primary education index exists');
select has_function('public', 'review_profile_section', array['text'], 'review RPC exists');
select has_function('public', 'set_primary_education', array['uuid'], 'primary selection RPC exists');
select has_table('public', 'work_experience', 'work_experience table exists');
select has_column('public', 'work_experience', 'user_id', 'work_experience owns directly through user_id');
select col_is_pk('public', 'work_experience', 'id', 'work_experience.id is the primary key');
select fk_ok('public', 'work_experience', 'user_id', 'public', 'profiles', 'user_id', 'work_experience.user_id references profiles.user_id');
select has_index('public', 'work_experience', 'work_experience_user_chronology_idx', 'experience chronology index exists');

select * from finish();
rollback;
