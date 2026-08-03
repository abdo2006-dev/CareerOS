do $$
declare
  future_user_id uuid := '70000000-0000-0000-0000-000000000003';
begin
  if (select headline from public.profiles where user_id = '70000000-0000-0000-0000-000000000001') <> 'Current fixture A revised' then
    raise exception 'existing profile data changed';
  end if;
  if (select degree from public.education_entries where user_id = '70000000-0000-0000-0000-000000000001') <> 'BSc' then
    raise exception 'existing education data changed';
  end if;
  if (select content_revision from public.profile_section_revisions where user_id = '70000000-0000-0000-0000-000000000001' and section_key = 'basic_profile') <> 2 then
    raise exception 'basic-profile revision changed';
  end if;
  if (select content_revision from public.profile_section_revisions where user_id = '70000000-0000-0000-0000-000000000001' and section_key = 'education') <> 2 then
    raise exception 'education revision changed';
  end if;
  if (select reviewed_content_revision from public.profile_section_reviews where user_id = '70000000-0000-0000-0000-000000000001' and section_key = 'basic_profile') <> 2 then
    raise exception 'current basic-profile review changed';
  end if;
  if (select reviewed_content_revision from public.profile_section_reviews where user_id = '70000000-0000-0000-0000-000000000001' and section_key = 'education') <> 1 then
    raise exception 'stale education review changed';
  end if;
  if (select count(*) from public.profile_section_revisions where section_key = 'experience') <> 2 then
    raise exception 'existing profiles do not have exactly one experience baseline';
  end if;
  if exists (select 1 from public.profile_section_revisions where section_key = 'experience' and content_revision <> 0) then
    raise exception 'experience baseline was not neutral';
  end if;
  if exists (select 1 from public.profile_section_reviews where section_key = 'experience') then
    raise exception 'migration created experience reviews';
  end if;
  if exists (select 1 from public.work_experience) then
    raise exception 'migration invented experience records';
  end if;

  insert into auth.users (id, aud, role, email)
  values (future_user_id, 'authenticated', 'authenticated', 'future-profile@example.test');
  insert into public.profiles (user_id, headline)
  values (future_user_id, 'Future profile');

  if (select count(*) from public.profile_section_revisions where user_id = future_user_id) <> 3 then
    raise exception 'new profile did not initialize all three section revisions';
  end if;
  if (select content_revision from public.profile_section_revisions where user_id = future_user_id and section_key = 'basic_profile') <> 1 then
    raise exception 'new profile basic revision is not advanced';
  end if;
  if exists (
    select 1 from public.profile_section_revisions
    where user_id = future_user_id and section_key in ('education', 'experience') and content_revision <> 0
  ) then
    raise exception 'new profile non-basic revisions are not neutral';
  end if;
end;
$$;
