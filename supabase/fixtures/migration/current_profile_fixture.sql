-- Synthetic current-main data inserted after resetting through the merged
-- profile-core/education migration. It exercises preservation of both current
-- and stale section reviews before the experience migration is applied.
do $$
begin
  insert into auth.users (id, aud, role, email) values
    ('70000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'current-a@example.test'),
    ('70000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'current-b@example.test');

  insert into public.profiles (user_id, headline) values
    ('70000000-0000-0000-0000-000000000001', 'Current fixture A'),
    ('70000000-0000-0000-0000-000000000002', 'Current fixture B');

  update public.profiles
  set headline = 'Current fixture A revised'
  where user_id = '70000000-0000-0000-0000-000000000001';

  insert into public.education_entries (user_id, institution, education_status)
  values ('70000000-0000-0000-0000-000000000001', 'Current Fixture University', 'current');

  insert into public.profile_section_reviews (
    user_id, section_key, reviewed_content_revision, reviewed_at, created_at, updated_at
  ) values
    ('70000000-0000-0000-0000-000000000001', 'basic_profile', 2, now(), now(), now()),
    ('70000000-0000-0000-0000-000000000001', 'education', 1, now(), now(), now()),
    ('70000000-0000-0000-0000-000000000002', 'education', 0, now(), now(), now());

  update public.education_entries
  set degree = 'BSc'
  where user_id = '70000000-0000-0000-0000-000000000001';
end;
$$;
