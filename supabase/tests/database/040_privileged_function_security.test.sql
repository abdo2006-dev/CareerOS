-- Every Phase 1A function is deliberately SECURITY DEFINER with an empty
-- search_path. Browser roles may execute only the two constrained RPCs.
begin;
select plan(50);

with functions(signature, label, browser_callable) as (
  values
    ('public.raise_profile_content_validation(text,text,integer)', 'raise_profile_content_validation', false),
    ('public.profiles_before_write()', 'profiles_before_write', false),
    ('public.education_entries_before_write()', 'education_entries_before_write', false),
    ('public.increment_profile_section_revision(uuid,text)', 'increment_profile_section_revision', false),
    ('public.profiles_after_content_change()', 'profiles_after_content_change', false),
    ('public.education_entries_after_content_change()', 'education_entries_after_content_change', false),
    ('public.work_experience_before_write()', 'work_experience_before_write', false),
    ('public.work_experience_after_content_change()', 'work_experience_after_content_change', false),
    ('public.review_profile_section(text)', 'review_profile_section', true),
    ('public.set_primary_education(uuid)', 'set_primary_education', true)
)
select ok(to_regprocedure(signature) is not null, label || ' exists') from functions;

with functions(signature, label) as (
  values
    ('public.raise_profile_content_validation(text,text,integer)', 'raise_profile_content_validation'),
    ('public.profiles_before_write()', 'profiles_before_write'),
    ('public.education_entries_before_write()', 'education_entries_before_write'),
    ('public.increment_profile_section_revision(uuid,text)', 'increment_profile_section_revision'),
    ('public.profiles_after_content_change()', 'profiles_after_content_change'),
    ('public.education_entries_after_content_change()', 'education_entries_after_content_change'),
    ('public.work_experience_before_write()', 'work_experience_before_write'),
    ('public.work_experience_after_content_change()', 'work_experience_after_content_change'),
    ('public.review_profile_section(text)', 'review_profile_section'),
    ('public.set_primary_education(uuid)', 'set_primary_education')
)
select ok(
  (select prosecdef from pg_proc where oid = to_regprocedure(signature)),
  label || ' is SECURITY DEFINER'
) from functions;

with functions(signature, label) as (
  values
    ('public.raise_profile_content_validation(text,text,integer)', 'raise_profile_content_validation'),
    ('public.profiles_before_write()', 'profiles_before_write'),
    ('public.education_entries_before_write()', 'education_entries_before_write'),
    ('public.increment_profile_section_revision(uuid,text)', 'increment_profile_section_revision'),
    ('public.profiles_after_content_change()', 'profiles_after_content_change'),
    ('public.education_entries_after_content_change()', 'education_entries_after_content_change'),
    ('public.work_experience_before_write()', 'work_experience_before_write'),
    ('public.work_experience_after_content_change()', 'work_experience_after_content_change'),
    ('public.review_profile_section(text)', 'review_profile_section'),
    ('public.set_primary_education(uuid)', 'set_primary_education')
)
select ok(
  exists (
    select 1 from pg_proc
    where oid = to_regprocedure(signature)
      and coalesce(proconfig, array[]::text[]) @> array['search_path=""']
  ),
  label || ' has an empty hardened search_path'
) from functions;

with functions(signature, label) as (
  values
    ('public.raise_profile_content_validation(text,text,integer)', 'raise_profile_content_validation'),
    ('public.profiles_before_write()', 'profiles_before_write'),
    ('public.education_entries_before_write()', 'education_entries_before_write'),
    ('public.increment_profile_section_revision(uuid,text)', 'increment_profile_section_revision'),
    ('public.profiles_after_content_change()', 'profiles_after_content_change'),
    ('public.education_entries_after_content_change()', 'education_entries_after_content_change'),
    ('public.work_experience_before_write()', 'work_experience_before_write'),
    ('public.work_experience_after_content_change()', 'work_experience_after_content_change'),
    ('public.review_profile_section(text)', 'review_profile_section'),
    ('public.set_primary_education(uuid)', 'set_primary_education')
)
select ok(
  not has_function_privilege('public', signature, 'EXECUTE')
    and not has_function_privilege('anon', signature, 'EXECUTE'),
  label || ' is not executable by PUBLIC or anon'
) from functions;

with functions(signature, label, browser_callable) as (
  values
    ('public.raise_profile_content_validation(text,text,integer)', 'raise_profile_content_validation', false),
    ('public.profiles_before_write()', 'profiles_before_write', false),
    ('public.education_entries_before_write()', 'education_entries_before_write', false),
    ('public.increment_profile_section_revision(uuid,text)', 'increment_profile_section_revision', false),
    ('public.profiles_after_content_change()', 'profiles_after_content_change', false),
    ('public.education_entries_after_content_change()', 'education_entries_after_content_change', false),
    ('public.work_experience_before_write()', 'work_experience_before_write', false),
    ('public.work_experience_after_content_change()', 'work_experience_after_content_change', false),
    ('public.review_profile_section(text)', 'review_profile_section', true),
    ('public.set_primary_education(uuid)', 'set_primary_education', true)
)
select ok(
  has_function_privilege('authenticated', signature, 'EXECUTE') = browser_callable
    and not has_function_privilege('service_role', signature, 'EXECUTE'),
  label || ' has the documented authenticated and service-role execute privileges'
) from functions;

select * from finish();
rollback;
